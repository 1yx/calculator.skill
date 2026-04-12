import { Decimal } from "decimal.js";
import { ExchangeRateProvider } from "./exchange-rate.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Project root (dist/ → project root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

// Currency name → ISO code mapping (Chinese names from BOC page)
const CN_NAME_TO_ISO: Record<string, string> = {
  "美元": "USD",
  "港币": "HKD",
  "澳大利亚元": "AUD",
  "欧元": "EUR",
  "日元": "JPY",
  "英镑": "GBP",
  "加拿大元": "CAD",
  "新加坡元": "SGD",
  "新西兰元": "NZD",
  "韩国元": "KRW",
  "泰国铢": "THB",
  "瑞士法郎": "CHF",
  "瑞典克朗": "SEK",
  "丹麦克朗": "DKK",
  "挪威克朗": "NOK",
  "澳门元": "MOP",
  "卢布": "RUB",
  "印尼卢比": "IDR",
  "马来西亚林吉特": "MYR",
  "菲律宾比索": "PHP",
  "新台币": "TWD",
  "阿联酋迪拉姆": "AED",
  "文莱元": "BND",
  "巴西雷亚尔": "BRL",
  "南非兰特": "ZAR",
  "沙特里亚尔": "SAR",
  "土耳其里拉": "TRY",
};

export interface BOCRateEntry {
  iso: string;
  cnName: string;
  ratePer100: string; // 中行折算价 per 100 units of foreign currency
  publishTime: string;
  fetchedAt: string;
}

export interface BOCRateCache {
  entries: BOCRateEntry[];
}

export class BOCExchangeRateProvider implements ExchangeRateProvider {
  private cachePath: string;

  constructor(options?: { cachePath?: string }) {
    this.cachePath = options?.cachePath ?? join(projectRoot, "cache", "boc-rates.json");
  }

  async getRate(from: string, to: string): Promise<Decimal> {
    from = from.toUpperCase();
    to = to.toUpperCase();

    if (from === to) return new Decimal(1);

    const cache = await this.fetchRates();

    // Build rate map: ISO → CNY rate (per 1 unit)
    const rateMap = new Map<string, Decimal>();
    for (const entry of cache.entries) {
      // BOC rates are per 100 units of foreign currency
      rateMap.set(entry.iso, new Decimal(entry.ratePer100).div(100));
    }
    // CNY itself
    rateMap.set("CNY", new Decimal(1));

    if (!rateMap.has(from)) throw new Error(`BOC: 不支持的货币 ${from}`);
    if (!rateMap.has(to)) throw new Error(`BOC: 不支持的货币 ${to}`);

    // Convert: from → CNY → to
    const fromToCNY = rateMap.get(from)!;
    const toToCNY = rateMap.get(to)!;

    return fromToCNY.div(toToCNY);
  }

  /**
   * Read cached rates. Cache is updated daily by boc-warm.timer.
   */
  async fetchRates(): Promise<BOCRateCache> {
    if (!existsSync(this.cachePath)) {
      throw new Error(
        "BOC rate cache not found. Run 'boc-warm' or wait for the daily timer (10:40)."
      );
    }

    return JSON.parse(readFileSync(this.cachePath, "utf-8")) as BOCRateCache;
  }

  /**
   * Fetch fresh rates from BOC page and save to cache.
   */
  async refreshRates(): Promise<BOCRateCache> {
    const html = await this.fetchBOCPage();
    const entries = this.parseBOCPage(html);

    // Save cache
    const cacheDir = dirname(this.cachePath);
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify({ entries }, null, 2), "utf-8");

    return { entries };
  }

  /**
   * Fetch the BOC exchange rate HTML page.
   */
  private async fetchBOCPage(): Promise<string> {
    const url = "https://www.boc.cn/sourcedb/whpj/";
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`BOC page fetch failed: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Parse the BOC HTML table into rate entries.
   */
  private parseBOCPage(html: string): BOCRateEntry[] {
    const entries: BOCRateEntry[] = [];
    const now = new Date().toISOString();

    // Match each <tr data-currency='...'>...</tr> block
    const trRegex = /<tr\s+data-currency='([^']+)'\s*>([\s\S]*?)<\/tr>/g;
    let match: RegExpExecArray | null;

    while ((match = trRegex.exec(html)) !== null) {
      const cnName = match[1];
      const cells = match[2];
      const iso = CN_NAME_TO_ISO[cnName];

      // Extract all <td> contents
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const tdValues: string[] = [];
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRegex.exec(cells)) !== null) {
        tdValues.push(tdMatch[1].trim());
      }

      // tdValues: [名称, 现汇买入, 现钞买入, 现汇卖出, 现钞卖出, 中行折算价, 发布日期时间, 发布时间]
      // Index 5 = 中行折算价
      const bocRate = tdValues[5]; // 中行折算价

      if (!bocRate || !iso) continue;

      entries.push({
        iso,
        cnName,
        ratePer100: bocRate,
        publishTime: tdValues[6] || "",
        fetchedAt: now,
      });
    }

    if (entries.length === 0) {
      throw new Error("BOC page parse error: no rates found. Page structure may have changed.");
    }

    return entries;
  }
}
