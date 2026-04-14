import { Decimal } from "decimal.js";
import {
  type ExchangeRateProvider,
  InMemoryExchangeRateProvider,
} from "./exchange-rate.js";

// Configure Decimal.js: 20 significant digits, banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type { ExchangeRateProvider } from "./exchange-rate.js";
export { InMemoryExchangeRateProvider } from "./exchange-rate.js";

// ============ Tokenizer ============

/** Token types for the calculator lexer. */
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

/** A lexical token with its type and raw value. */
export type Token = {
  type: TokenType;
  value: string;
};

/** Mapping of operator characters to token types. */
const OPERATOR_TOKENS: Record<string, TokenType> = {
  "+": TokenType.Plus,
  "-": TokenType.Minus,
  "*": TokenType.Star,
  "/": TokenType.Slash,
  "%": TokenType.Percent,
  "^": TokenType.Caret,
  "(": TokenType.LParen,
  ")": TokenType.RParen,
};

/**
 * Tokenize a math expression string into a stream of tokens.
 * @param input - The raw expression string
 */
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
      const num = readNumber(input, i);
      tokens.push({ type: TokenType.Number, value: num.value });
      i = num.endIndex;
      continue;
    }

    const tokenType = OPERATOR_TOKENS[ch];
    if (tokenType !== undefined) {
      tokens.push({ type: tokenType, value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }

  tokens.push({ type: TokenType.EOF, value: "" });
  return tokens;
}

/**
 * Read a numeric literal from the input starting at position `start`.
 * @returns The parsed number string and the index after the last digit.
 */
function readNumber(
  input: string,
  start: number,
): { value: string; endIndex: number } {
  let i = start;
  let num = "";
  while (i < input.length && /[0-9.]/.test(input[i])) {
    num += input[i];
    i++;
  }
  return { value: num, endIndex: i };
}

// ============ Recursive Descent Parser ============

// Grammar:
//   expr   = term (('+' | '-') term)*
//   term   = power (('*' | '/' | '%') power)*
//   power  = unary ('^' power)?
//   unary  = ('-')? primary
//   primary = NUMBER | '(' expr ')'

/**
 * Recursive descent parser for math expressions.
 * Produces Decimal.js results with arbitrary precision.
 */
class Parser {
  private tokens: Token[];
  private pos = 0;

  /** @param tokens - The token stream to parse. */
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /** Peek at the current token without consuming it. */
  private peek(): Token {
    return this.tokens[this.pos];
  }

  /**
   * Consume the next token, throwing if it doesn't match the expected type.
   * @param expected - The token type to expect
   */
  private consume(expected: TokenType): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== expected) {
      throw new Error(
        `Expected ${TokenType[expected]}, got ${TokenType[tok.type]} ('${tok.value}')`,
      );
    }
    this.pos++;
    return tok;
  }

  /** Parse the full expression and return the result. */
  parse(): Decimal {
    const result = this.expr();
    if (this.peek().type !== TokenType.EOF) {
      throw new Error(
        `Unexpected token after expression: '${this.peek().value}'`,
      );
    }
    return result;
  }

  /** expr = term (('+' | '-') term)* */
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

  /** term = power (('*' | '/' | '%') power)* */
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

  /** power = unary ('^' power)? */
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

  /** unary = ('+' | '-')? primary */
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

  /** primary = NUMBER | '(' expr ')' */
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

    throw new Error(
      `Unexpected token: '${tok.value}' (type: ${TokenType[tok.type]})`,
    );
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

/** Options for currency conversion. */
type ConvertCurrencyOptions = {
  amount: number | string | Decimal;
  from: string;
  to: string;
  provider?: ExchangeRateProvider;
};

/**
 * Convert currency using an exchange rate provider.
 * @param options - Conversion parameters
 */
export async function convertCurrency(
  options: ConvertCurrencyOptions,
): Promise<string> {
  const { amount, from, to } = options;
  const provider = options.provider ?? new InMemoryExchangeRateProvider();

  const upperFrom = from.toUpperCase();
  const upperTo = to.toUpperCase();

  if (upperFrom === upperTo) return new Decimal(amount).toString();

  const rate = await provider.getRate(upperFrom, upperTo);
  const result = new Decimal(amount).times(rate);

  // Format to 2 decimal places for currency
  return result.toDecimalPlaces(2).toString();
}
