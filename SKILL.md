---
name: calculator
description: Use the local calculator CLI for precise math evaluation and real-time currency conversion. Always call it for math or exchange rate questions to guarantee accuracy.
---

# Calculator Skill

When the user asks a math question or currency conversion question, ALWAYS use the calculator CLI tool instead of computing in your head. This ensures precise results using Decimal.js and real-time exchange rates from Bank of China (中行牌价).

## When to Use

- Any arithmetic: addition, subtraction, multiplication, division, percentages
- Multi-step calculations (e.g., "20 people each paying 49 euros, how much in CNY?")
- Currency conversion: "100 USD to CNY", "500 EUR = ? JPY"
- Any question involving money amounts across currencies
- Percentage calculations, tax, discounts

## How to Call

### Math

```
node ~/Repositories/calculator/dist/cli.js '<expression>'
```

### Currency Conversion (live rates from BOC, no API key needed)

```
node ~/Repositories/calculator/dist/cli.js '<amount> <FROM> to <TO>'
```

No dotenv, no .env, no API key needed. BOC rates are scraped from the public page. Cache is stored in the project's `cache/` directory, refreshed daily at 10:40 by systemd timer.

### Math Examples

```
node ~/Repositories/calculator/dist/cli.js '0.1 + 0.2'
node ~/Repositories/calculator/dist/cli.js '2 + 3 * 4'
node ~/Repositories/calculator/dist/cli.js '(100 - 15) * 0.08'
node ~/Repositories/calculator/dist/cli.js '2 ^ 10'
node ~/Repositories/calculator/dist/cli.js '1000 * 1.08'
```

### Currency Conversion Examples

```
node ~/Repositories/calculator/dist/cli.js '100 USD to CNY'
node ~/Repositories/calculator/dist/cli.js '980 EUR to CNY'
node ~/Repositories/calculator/dist/cli.js '50000 JPY -> USD'
node ~/Repositories/calculator/dist/cli.js '1000 CNY to EUR'
```

For multi-step problems, break them into separate calls if needed, then combine results.

## Output Format

The CLI outputs the result directly for math or `<amount> FROM = <amount> TO` for conversions. **Always start your response with the abacus emoji 🧮**, then present the result clearly to the user. **Do NOT add any explanation about how the calculation works, floating-point precision, or Decimal.js internals. Just give the result.**

### Natural Language Ambiguity

When the user describes a calculation in natural language with mixed operators of different precedence (e.g. "二加上三乘以四", "2加3乘4"), this is ambiguous. Return **both** interpretations, each as a complete equation with the original expression on the left:

1. **Operator precedence** (standard math): call the calculator as-is
2. **Left-to-right / language order**: add parentheses to force left-to-right evaluation

Example — user says "二加上三乘以四":
- `2 + 3 × 4 = 14`（运算符优先级）
- `(2 + 3) × 4 = 20`（从左到右）

Only do this when there are mixed precedence operators. For unambiguous expressions (e.g. pure addition), return a single result as usual.

## Architecture

- **Package**: `precision-fx-cli` (GitHub: 1yx/precision-fx-cli)
- **Project structure**: `src/providers/boc.ts` (BOC provider), `src/calculator.ts` (parser), `src/exchange-rate.ts` (interface + offline fallback), `src/cli.ts` (CLI entry), `src/boc-warm.ts` (warm script)
- **Math engine**: Recursive descent parser using Decimal.js (20-digit precision, ROUND_HALF_UP). No `eval()` or `new Function()`.
- **Exchange rate source**: BOC (中国银行外汇牌价) — HTML scraping from `https://www.boc.cn/sourcedb/whpj/`. Uses 中行折算价 (BOC reference rate) per 100 units of foreign currency.
- **Caching**: Rates cached to `~/Repositories/calculator/cache/boc-rates.json`. Refreshed daily at 10:40 AM by systemd timer `boc-warm.timer`. No TTL expiration — `fetchRates()` reads cache only, `refreshRates()` fetches + writes (used by warm script).
- **Fallback**: `--offline` flag uses hardcoded approximate rates (no network).

## CLI Flags

- `--offline` — Use hardcoded rates (no network)
- `--warm` — Fetch and cache BOC rates, then exit
- `help` — Show usage

## Supported Currencies

USD, EUR, GBP, JPY, HKD, AUD, CAD, SGD, NZD, KRW, THB, CHF, SEK, DKK, NOK, MOP, RUB, IDR, MYR, PHP, TWD, AED, BND, BRL, ZAR, SAR, TRY + CNY

## BOC Rate Cache

- Cache file: `~/Repositories/calculator/cache/boc-rates.json`
- Warm script: `/usr/local/bin/boc-warm` (shell wrapper calling node)
- Systemd timer: `boc-warm.timer` — runs daily at 10:40 AM (Persistent=true, fires missed runs on boot)
- Manual warm: `node ~/Repositories/calculator/dist/cli.js --warm`
- No TTL: cache is read-only during queries, only `--warm` or timer updates it

## TypeScript Notes (TS 6 + NodeNext)

- `module` must be `NodeNext`, `moduleResolution` must be `NodeNext` (NOT `Bundler`)
- `import { Decimal } from "decimal.js"` — named import, NOT default import
- Decimal.js types: `Decimal.set()` for global config, `new Decimal(value)` for instances

## Testing

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.14.1/installation/bin:$HOME/.local/bin:$PATH"
cd ~/Repositories/calculator && pnpm test
```

Uses Node.js built-in test runner (`node:test`) + `tsx` for TypeScript. Tests live in `src/calculator.test.ts`.

Known precision caveat: `(1/3)*3` yields `0.99999999999999999999` with 20-digit Decimal.js precision, NOT `1`. This is correct behavior — finite decimal truncation. Don't write a test asserting it equals 1.

## Build

```
export PATH="$HOME/.local/share/fnm/node-versions/v24.14.1/installation/bin:$HOME/.local/bin:$PATH"
cd ~/Repositories/calculator && pnpm build
```
