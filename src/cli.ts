#!/usr/bin/env node

import { evaluate, convertCurrency } from "./calculator.js";
import { BOCExchangeRateProvider } from "./providers/boc.js";
import { InMemoryExchangeRateProvider } from "./exchange-rate.js";

/**
 * Print CLI usage information.
 */
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

/** Options for currency conversion. */
type CurrencyConvertOptions = {
  amount: number;
  from: string;
  to: string;
  offline: boolean;
};

/**
 * Parse a currency conversion input string.
 * @param input - Raw input string (e.g. "100 USD to CNY")
 * @param offline - Whether to use offline mode
 */
function parseCurrencyInput(
  input: string,
  offline: boolean,
): CurrencyConvertOptions | null {
  const currencyMatch = input.match(
    /^([\d.]+)\s+([A-Za-z]{3})\s+(?:to|->)\s+([A-Za-z]{3})$/i,
  );

  if (!currencyMatch) return null;

  return {
    amount: parseFloat(currencyMatch[1]),
    from: currencyMatch[2],
    to: currencyMatch[3],
    offline,
  };
}

/**
 * Run currency conversion with the parsed options.
 */
async function runConversion(opts: CurrencyConvertOptions): Promise<void> {
  const provider = opts.offline
    ? new InMemoryExchangeRateProvider()
    : new BOCExchangeRateProvider();

  const result = await convertCurrency({
    amount: opts.amount,
    from: opts.from,
    to: opts.to,
    provider,
  });
  console.log(
    `${opts.amount} ${opts.from.toUpperCase()} = ${result} ${opts.to.toUpperCase()}`,
  );
}

/**
 * Fetch and cache BOC rates, then exit.
 */
async function warmCache(): Promise<void> {
  const provider = new BOCExchangeRateProvider();
  try {
    const cache = await provider.refreshRates();
    console.log(`Cached ${cache.entries.length} currencies from BOC`);
  } catch (err) {
    console.error(`Failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

/**
 * Check if the user is asking for help.
 */
function isHelpRequest(arg: string | undefined): boolean {
  return arg === "help" || arg === "--help" || arg === "-h";
}

/**
 * Main CLI entry point.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || isHelpRequest(args[0])) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--warm")) {
    await warmCache();
    return;
  }

  const offline = args.includes("--offline");
  const input = args.filter((a) => !a.startsWith("--")).join(" ");

  if (!input.trim()) {
    printUsage();
    process.exit(1);
  }

  // Detect currency conversion pattern
  const currencyOpts = parseCurrencyInput(input, offline);
  if (currencyOpts) {
    await runConversion(currencyOpts);
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

void main();
