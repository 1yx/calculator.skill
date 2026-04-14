import { Decimal } from "decimal.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { type ExchangeRateProvider } from "../exchange-rate.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

dayjs.extend(utc);
dayjs.extend(timezone);

// Project root (dist/providers/ → dist/ → project root)
const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(moduleDir));

// Currency name → ISO code mapping (Chinese names from BOC page)
const CN_NAME_TO_ISO: Record<string, string> = {
  美元: "USD",
  港币: "HKD",
  澳大利亚元: "AUD",
  欧元: "EUR",
  日元: "JPY",
  英镑: "GBP",
  加拿大元: "CAD",
  新加坡元: "SGD",
  新西兰元: "NZD",
  韩国元: "KRW",
  泰国铢: "THB",
  瑞士法郎: "CHF",
  瑞典克朗: "SEK",
  丹麦克朗: "DKK",
  挪威克朗: "NOK",
  澳门元: "MOP",
  卢布: "RUB",
  印尼卢比: "IDR",
  马来西亚林吉特: "MYR",
  菲律宾比索: "PHP",
  新台币: "TWD",
  阿联酋迪拉姆: "AED",
  文莱元: "BND",
  巴西雷亚尔: "BRL",
  南非兰特: "ZAR",
  沙特里亚尔: "SAR",
  土耳其里拉: "TRY",
};

/** A single exchange rate entry from BOC. */
export type BOCRateEntry = {
  iso: string;
  cnName: string;
  ratePer100: string; // 中行折算价 per 100 units of foreign currency
  publishTimeISO: string;
  fetchedAtISO: string;
};

/** Cache structure for BOC rates. */
export type BOCRateCache = {
  entries: BOCRateEntry[];
};

/**
 * Type guard to validate a parsed JSON object as BOCRateCache.
 */
function isBOCRateCache(value: unknown): value is BOCRateCache {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.has(value, "entries") &&
    Array.isArray(Reflect.get(value, "entries"))
  );
}

/**
 * BOC exchange rate provider.
 * Fetches live rates from https://www.boc.cn/sourcedb/whpj/.
 */
export class BOCExchangeRateProvider implements ExchangeRateProvider {
  private cachePath: string;

  /** @param options - Optional cache path override. */
  constructor(options?: { cachePath?: string }) {
    this.cachePath =
      options?.cachePath ?? join(projectRoot, "cache", "boc-rates.json");
  }

  /**
   * Get exchange rate between two currencies via BOC cached rates.
   * @param from - Source currency code (e.g. "USD")
   * @param to - Target currency code (e.g. "CNY")
   */
  getRate(from: string, to: string): Promise<Decimal> {
    from = from.toUpperCase();
    to = to.toUpperCase();

    if (from === to) return Promise.resolve(new Decimal(1));

    const cache = this.fetchRates();

    // Build rate map: ISO → CNY rate (per 1 unit)
    const rateMap = new Map<string, Decimal>();
    for (const entry of cache.entries) {
      // BOC rates are per 100 units of foreign currency
      rateMap.set(entry.iso, new Decimal(entry.ratePer100).div(100));
    }
    // CNY itself
    rateMap.set("CNY", new Decimal(1));

    const fromToCNY = rateMap.get(from);
    if (!fromToCNY) {
      throw new Error(`BOC: 不支持的货币 ${from}`);
    }

    const toToCNY = rateMap.get(to);
    if (!toToCNY) {
      throw new Error(`BOC: 不支持的货币 ${to}`);
    }

    return Promise.resolve(fromToCNY.div(toToCNY));
  }

  /**
   * Read cached rates. Cache is updated daily by boc-warm.timer.
   */
  fetchRates(): BOCRateCache {
    if (!existsSync(this.cachePath)) {
      throw new Error(
        "BOC rate cache not found. Run 'boc-warm' or wait for the daily timer (10:40).",
      );
    }

    const text = readFileSync(this.cachePath, "utf-8");
    const parsed: unknown = JSON.parse(text);

    if (!isBOCRateCache(parsed)) {
      throw new Error("BOC rate cache has invalid format");
    }

    return parsed;
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
    writeFileSync(
      this.cachePath,
      JSON.stringify({ entries }, null, 2),
      "utf-8",
    );

    return { entries };
  }

  /**
   * Fetch the BOC exchange rate HTML page.
   */
  private async fetchBOCPage(): Promise<string> {
    const url = "https://www.boc.cn/sourcedb/whpj/";
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0",
        Accept: "text/html,application/xhtml+xml",
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
    const now = dayjs().utc().toISOString();

    // Match each <tr data-currency='...'>...</tr> block
    const trRegex = /<tr\s+data-currency='([^']+)'\s*>([\s\S]*?)<\/tr>/g;
    let match: RegExpExecArray | null;

    while ((match = trRegex.exec(html)) !== null) {
      const cnName = match[1];
      const cells = match[2];
      const iso = CN_NAME_TO_ISO[cnName];

      const parsed = this.parseRow(cells, iso);
      if (!parsed) continue;

      entries.push({
        iso,
        cnName,
        ratePer100: parsed.bocRate,
        publishTimeISO: parsed.publishTimeISO,
        fetchedAtISO: now,
      });
    }

    if (entries.length === 0) {
      throw new Error(
        "BOC page parse error: no rates found. Page structure may have changed.",
      );
    }

    return entries;
  }

  /**
   * Extract rate and publish time from a table row's cells.
   * @param cells - Inner HTML of a <tr> element
   * @param iso - ISO currency code (null if not in mapping)
   */
  private parseRow(
    cells: string,
    iso: string | undefined,
  ): { bocRate: string; publishTimeISO: string } | null {
    // Extract all <td> contents
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const tdValues: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(cells)) !== null) {
      tdValues.push(tdMatch[1].trim());
    }

    // tdValues: [名称, 现汇买入, 现钞买入, 现汇卖出, 现钞卖出, 中行折算价, 发布日期时间, 发布时间]
    // Index 5 = 中行折算价
    const bocRate = tdValues[5];

    if (!bocRate || !iso) return null;

    // Parse "2026/04/14 07:37:58" (Beijing time) → ISO 8601 (UTC)
    const rawPublish = tdValues[6] || "";
    const parsed = dayjs
      .tz(rawPublish.replace(/\//g, "-"), "Asia/Shanghai")
      .utc();
    const publishTimeISO = parsed.isValid() ? parsed.toISOString() : rawPublish;

    return { bocRate, publishTimeISO };
  }
}
