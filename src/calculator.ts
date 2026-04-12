import { Decimal } from "decimal.js";
import { ExchangeRateProvider, InMemoryExchangeRateProvider } from "./exchange-rate.js";

// Configure Decimal.js: 20 significant digits, banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type { ExchangeRateProvider } from "./exchange-rate.js";
export { InMemoryExchangeRateProvider } from "./exchange-rate.js";

// ============ Tokenizer ============

export enum TokenType {
  Number,
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  Caret,
  LParen,
  RParen,
  EOF,
}

export interface Token {
  type: TokenType;
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i++];
      }
      tokens.push({ type: TokenType.Number, value: num });
      continue;
    }

    switch (ch) {
      case "+": tokens.push({ type: TokenType.Plus, value: ch }); break;
      case "-": tokens.push({ type: TokenType.Minus, value: ch }); break;
      case "*": tokens.push({ type: TokenType.Star, value: ch }); break;
      case "/": tokens.push({ type: TokenType.Slash, value: ch }); break;
      case "%": tokens.push({ type: TokenType.Percent, value: ch }); break;
      case "^": tokens.push({ type: TokenType.Caret, value: ch }); break;
      case "(": tokens.push({ type: TokenType.LParen, value: ch }); break;
      case ")": tokens.push({ type: TokenType.RParen, value: ch }); break;
      default:
        throw new Error(`Unexpected character: '${ch}' at position ${i}`);
    }
    i++;
  }

  tokens.push({ type: TokenType.EOF, value: "" });
  return tokens;
}

// ============ Recursive Descent Parser ============

// Grammar:
//   expr   = term (('+' | '-') term)*
//   term   = power (('*' | '/' | '%') power)*
//   power  = unary ('^' power)?
//   unary  = ('-')? primary
//   primary = NUMBER | '(' expr ')'

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(expected: TokenType): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== expected) {
      throw new Error(`Expected ${TokenType[expected]}, got ${TokenType[tok.type]} ('${tok.value}')`);
    }
    this.pos++;
    return tok;
  }

  parse(): Decimal {
    const result = this.expr();
    if (this.peek().type !== TokenType.EOF) {
      throw new Error(`Unexpected token after expression: '${this.peek().value}'`);
    }
    return result;
  }

  private expr(): Decimal {
    let left = this.term();

    while (true) {
      const tok = this.peek();
      if (tok.type === TokenType.Plus) {
        this.pos++;
        left = left.plus(this.term());
      } else if (tok.type === TokenType.Minus) {
        this.pos++;
        left = left.minus(this.term());
      } else {
        break;
      }
    }

    return left;
  }

  private term(): Decimal {
    let left = this.power();

    while (true) {
      const tok = this.peek();
      if (tok.type === TokenType.Star) {
        this.pos++;
        left = left.times(this.power());
      } else if (tok.type === TokenType.Slash) {
        this.pos++;
        const right = this.power();
        if (right.isZero()) throw new Error("Division by zero");
        left = left.div(right);
      } else if (tok.type === TokenType.Percent) {
        this.pos++;
        const right = this.power();
        if (right.isZero()) throw new Error("Modulo by zero");
        left = left.mod(right);
      } else {
        break;
      }
    }

    return left;
  }

  private power(): Decimal {
    const base = this.unary();
    const tok = this.peek();
    if (tok.type === TokenType.Caret) {
      this.pos++;
      const exp = this.power(); // right-associative
      return base.pow(exp);
    }
    return base;
  }

  private unary(): Decimal {
    const tok = this.peek();
    if (tok.type === TokenType.Minus) {
      this.pos++;
      return this.unary().neg();
    }
    if (tok.type === TokenType.Plus) {
      this.pos++;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Decimal {
    const tok = this.peek();

    if (tok.type === TokenType.Number) {
      this.pos++;
      return new Decimal(tok.value);
    }

    if (tok.type === TokenType.LParen) {
      this.pos++;
      const result = this.expr();
      this.consume(TokenType.RParen);
      return result;
    }

    throw new Error(`Unexpected token: '${tok.value}' (type: ${TokenType[tok.type]})`);
  }
}

// ============ Public API ============

/**
 * Evaluate a math expression string.
 * Uses Decimal.js for precise arithmetic (20 significant digits).
 */
export function evaluate(expression: string): string {
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  const result = parser.parse();
  return result.toString();
}

/**
 * Convert currency using an exchange rate provider.
 * @param amount - Amount to convert (number, string, or Decimal)
 * @param from - Source currency code (e.g. "USD")
 * @param to - Target currency code (e.g. "CNY")
 * @param provider - Exchange rate provider (defaults to in-memory rates)
 */
export async function convertCurrency(
  amount: number | string | Decimal,
  from: string,
  to: string,
  provider?: ExchangeRateProvider
): Promise<string> {
  if (!provider) {
    provider = new InMemoryExchangeRateProvider();
  }

  from = from.toUpperCase();
  to = to.toUpperCase();

  if (from === to) return new Decimal(amount).toString();

  const rate = await provider.getRate(from, to);
  const result = new Decimal(amount).times(rate);

  // Format to 2 decimal places for currency
  return result.toDecimalPlaces(2).toString();
}
