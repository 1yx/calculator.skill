import { it } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./calculator.js";

// 1. 浮点精度：0.1 + 0.2 必须等于 0.3（不能是 0.30000000000000004）
void it("0.1 + 0.2 = 0.3 (no floating-point error)", () => {
  assert.equal(evaluate("0.1 + 0.2"), "0.3");
});

// 2. 乘除混合：大数乘法精度
void it("0.999 + 0.001 = 1 (adjacent precision)", () => {
  assert.equal(evaluate("0.999 + 0.001"), "1");
});

// 3. 运算符优先级：2 + 3 * 4 = 14（不是 20）
void it("2 + 3 * 4 = 14 (operator precedence)", () => {
  assert.equal(evaluate("2 + 3 * 4"), "14");
});

// 4. 幂运算与取模
void it("2 ^ 10 % 1000 = 24", () => {
  assert.equal(evaluate("2 ^ 10 % 1000"), "24");
});

// 5. 除零报错
void it("division by zero throws", () => {
  assert.throws(() => evaluate("1 / 0"), /Division by zero/);
});
