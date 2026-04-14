import { Decimal } from "decimal.js";

/** Interface for exchange rate providers. */
export type ExchangeRateProvider = {
  getRate(from: string, to: string): Promise<Decimal>;
};

/**
 * In-memory exchange rate provider with hardcoded rates.
 * Used as fallback when no API is available.
 */
export class InMemoryExchangeRateProvider implements ExchangeRateProvider {
  private rates: Record<string, Decimal> = {
    // Base: USD
    "USD-CNY": new Decimal("7.25"),
    "USD-EUR": new Decimal("0.92"),
    "USD-GBP": new Decimal("0.79"),
    "USD-JPY": new Decimal("149.50"),
    "USD-KRW": new Decimal("1350.00"),
    "USD-HKD": new Decimal("7.82"),
    "USD-TWD": new Decimal("32.50"),
    "USD-SGD": new Decimal("1.34"),
    "USD-AUD": new Decimal("1.53"),
    "USD-CAD": new Decimal("1.37"),
    "USD-CHF": new Decimal("0.88"),
    "CNY-USD": new Decimal("0.1379"),
    "EUR-USD": new Decimal("1.0870"),
    "GBP-USD": new Decimal("1.2658"),
    "JPY-USD": new Decimal("0.006689"),
    "KRW-USD": new Decimal("0.000741"),
  };

  /**
   * Look up an exchange rate between two currencies.
   * Tries direct, reverse, then cross via USD.
   */
  getRate(from: string, to: string): Promise<Decimal> {
    from = from.toUpperCase();
    to = to.toUpperCase();

    if (from === to) return Promise.resolve(new Decimal(1));

    const direct = `${from}-${to}`;
    if (direct in this.rates) return Promise.resolve(this.rates[direct]);

    // Try reverse
    const reverse = `${to}-${from}`;
    if (reverse in this.rates) {
      const r = this.rates[reverse];
      return Promise.resolve(new Decimal(1).div(r));
    }

    // Try cross via USD
    const fromUSD = `USD-${from}`;
    const toUSD = `USD-${to}`;
    if (fromUSD in this.rates && toUSD in this.rates) {
      return Promise.resolve(this.rates[toUSD].div(this.rates[fromUSD]));
    }

    throw new Error(`No exchange rate found for ${from} → ${to}`);
  }
}
