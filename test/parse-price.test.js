import assert from "node:assert/strict";
import { parsePrice, parseAmount, learnFromSample, normalizeWhitespace } from "../src/shared/parse-price.js";
import { detectCurrency } from "../src/shared/currencies.js";

const cases = [
  { input: "$29.99", amount: 29.99, currency: "USD" },
  { input: "$1,299.99", amount: 1299.99, currency: "USD" },
  { input: "US$ 2,000", amount: 2000, currency: "USD" },
  { input: "2000 USD", amount: 2000, currency: "USD" },
  { input: "USD 2000", amount: 2000, currency: "USD" },
  { input: "€1.234,56", amount: 1234.56, currency: "EUR" },
  { input: "1.234,56 €", amount: 1234.56, currency: "EUR" },
  { input: "EUR 29,99", amount: 29.99, currency: "EUR" },
  { input: "£1,000", amount: 1000, currency: "GBP" },
  { input: "GBP 1,000.00", amount: 1000, currency: "GBP" },
  { input: "27,03 TL", amount: 27.03, currency: "TRY" },
  { input: "₺1.299,99", amount: 1299.99, currency: "TRY" },
  { input: "($49.00)", amount: 49, currency: "USD" },
  { input: "- $10.00", amount: 10, currency: "USD" },
];

let passed = 0;
for (const { input, amount, currency } of cases) {
  const result = parsePrice(input);
  assert.ok(result, `parse failed: ${input}`);
  assert.equal(result.currency, currency, `${input} currency`);
  assert.ok(Math.abs(result.amount - amount) < 0.001, `${input} amount: got ${result.amount}`);
  passed++;
}

const amountCases = [
  ["2000", {}, 2000],
  ["2,000", { thousandSeparator: "," }, 2000],
  ["2 000", { thousandSeparator: " " }, 2000],
  ["2'000", { thousandSeparator: "'" }, 2000],
  ["1,299.99", { thousandSeparator: ",", decimalSeparator: "." }, 1299.99],
];

for (const [raw, hints, expected] of amountCases) {
  const n = parseAmount(raw, hints);
  assert.equal(n, expected, `parseAmount ${raw}`);
  passed++;
}

const learned = learnFromSample("$1,299.99");
assert.equal(learned.currency, "USD");
assert.equal(learned.thousandSeparator, ",");
passed++;

assert.equal(normalizeWhitespace(" 2\u00A0000 "), "2 000");
passed++;

assert.equal(detectCurrency("US$ 100")?.code, "USD");
passed++;

console.log(`All ${passed} parse-price checks passed.`);
