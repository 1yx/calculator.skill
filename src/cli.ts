#!/usr/bin/env node

import { evaluate, convertCurrency } from "./calculator.js";
import { BOCExchangeRateProvider } from "./providers/boc.js";
import { InMemoryExchangeRateProvider } from "./exchange-rate.js";

function printUsage() {
  console.log("Usage: calculator '<expression>'");
  console.log("");
  console.log("Math examples:");
  console.log("  calculator '2 + 3 * 4'          → 14");
  console.log("  calculator '(1 + 2) * 3'         → 9");
  console.log("  calculator '2 ^ 10'              → 1024");
  console.log("  calculator '100 % 7'             → 2");
  console.log("  calculator '0.1 + 0.2'           → 0.3");
  console.log("");
  console.log("Currency examples (live rates from Bank of China):");
  console.log("  calculator '100 USD to CNY'      → 686.54 CNY");
  console.log("  calculator '1000 CNY to JPY'     → 23339.03 JPY");
  console.log("  calculator '50 EUR to USD'       → 58.63 USD");
  console.log("");
  console.log("Options:");
  console.log("  --offline    Use hardcoded rates (no network)");
  console.log("  --warm       Fetch and cache BOC rates");
  console.log("  help         Show this help");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  // --warm: just cache rates and exit
  if (args.includes("--warm")) {
    const provider = new BOCExchangeRateProvider();
    try {
      const cache = await provider.refreshRates();
      console.log(`Cached ${cache.entries.length} currencies from BOC`);
    } catch (err) {
      console.error(`Failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    return;
  }

  const offline = args.includes("--offline");
  const input = args.filter(a => !a.startsWith("--")).join(" ");

  if (!input.trim()) {
    printUsage();
    process.exit(1);
  }

  // Detect currency conversion pattern: "<amount> <CURRENCY> to|-> <CURRENCY>"
  const currencyMatch = input.match(
    /^([\d.]+)\s+([A-Za-z]{3})\s+(?:to|->)\s+([A-Za-z]{3})$/i
  );

  if (currencyMatch) {
    const amount = parseFloat(currencyMatch[1]);
    const from = currencyMatch[2];
    const to = currencyMatch[3];
    const provider = offline
      ? new InMemoryExchangeRateProvider()
      : new BOCExchangeRateProvider();

    const result = await convertCurrency(amount, from, to, provider);
    console.log(`${amount} ${from.toUpperCase()} = ${result} ${to.toUpperCase()}`);
    return;
  }

  // Math expression evaluation
  try {
    const result = evaluate(input);
    console.log(result);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
