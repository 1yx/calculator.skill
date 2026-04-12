#!/usr/bin/env node

/**
 * boc-warm.ts — Warm up the BOC exchange rate cache.
 * Run via: node dist/boc-warm.js
 *
 * Fetches live rates from https://www.boc.cn/sourcedb/whpj/
 * and saves to ~/.cache/calculator/boc-rates.json
 */

import { BOCExchangeRateProvider } from "./boc-provider.js";

async function main() {
  const provider = new BOCExchangeRateProvider();

  try {
    const cache = await provider.fetchRates();
    console.log(`✅ BOC rates cached: ${cache.entries.length} currencies`);
    console.log(`   Updated: ${cache.entries[0]?.fetchedAt}`);
    // Show a few sample rates
    const samples = cache.entries.filter(e => ["USD", "EUR", "JPY", "GBP"].includes(e.iso));
    for (const s of samples) {
      const rate = (parseFloat(s.ratePer100) / 100).toFixed(4);
      console.log(`   1 ${s.iso} = ${rate} CNY (中行折算价)`);
    }
  } catch (err) {
    console.error(`❌ Failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
