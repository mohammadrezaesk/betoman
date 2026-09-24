import assert from "node:assert/strict";
import {
  parsePrice,
  parseAmount,
  learnFromSample,
  normalizeWhitespace,
  locatePrice,
  hasSingleNumber,
} from "../src/shared/parse-price.js";
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
  // Codes glued to digits
  { input: "USD29.99", amount: 29.99, currency: "USD" },
  { input: "29.99USD", amount: 29.99, currency: "USD" },
  { input: "27,03TL", amount: 27.03, currency: "TRY" },
  // The number next to the symbol, not the first number in the text
  { input: "2 for $10", amount: 10, currency: "USD" },
  { input: "AMD Ryzen 7 - $299", amount: 299, currency: "USD" },
  { input: "Try it for $5", amount: 5, currency: "USD" },
  // Dollar variants aren't USD
  { input: "C$ 20", amount: 20, currency: "CAD" },
  { input: "CA$20", amount: 20, currency: "CAD" },
  { input: "HK$ 1,200", amount: 1200, currency: "HKD" },
  { input: "S$12.50", amount: 12.5, currency: "SGD" },
  { input: "R$ 49,90", amount: 49.9, currency: "BRL" },
  // Decimal comma with one digit, Swiss apostrophe, Arabic-Indic digits
  { input: "1,5 €", amount: 1.5, currency: "EUR" },
  { input: "CHF 1’299.–", amount: 1299, currency: "CHF" },
  { input: "۱۲۹٫۹۹ د.إ", amount: 129.99, currency: "AED" },
  { input: "$ 1 299,99", amount: 1299.99, currency: "USD" },
  { input: "299 kr", amount: 299, currency: "SEK" },
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
  // Learned from "€1.234" (thousands ".") — "29,99" must still be 29.99, not 2999
  ["29,99", { thousandSeparator: ".", decimalSeparator: null }, 29.99],
  ["1,299", {}, 1299],
  ["1.299", { decimalSeparator: "." }, 1.299],
  ["0.500", {}, 0.5],
  ["1.234.567", {}, 1234567],
];

for (const [raw, hints, expected] of amountCases) {
  const n = parseAmount(raw, hints);
  assert.equal(n, expected, `parseAmount ${raw}`);
  passed++;
}

const learned = learnFromSample("$1,299.99");
assert.equal(learned.currency, "USD");
assert.equal(learned.thousandSeparator, ",");
assert.equal(learned.decimalSeparator, ".");
passed++;

// Bare numbers only count with a currency hint, and words never do
assert.equal(parsePrice("29.99"), null);
assert.equal(parsePrice("29.99", { currency: "EUR" })?.amount, 29.99);
assert.equal(parsePrice("4.5 stars", { currency: "USD" }), null);
assert.equal(parsePrice("Save 20%", { currency: "USD" }), null);
assert.equal(learnFromSample("12.50", "EUR")?.currency, "EUR");
// A "$" preferred as CAD by the learned pattern
assert.equal(parsePrice("$20", { currency: "CAD" })?.currency, "CAD");
passed += 6;

assert.deepEqual(locatePrice("From $29.99 / mo"), { start: 5, end: 11 });
assert.equal(hasSingleNumber("$29.99"), true);
assert.equal(hasSingleNumber("Was $39.99 Now $29.99"), false);
passed += 3;

assert.equal(normalizeWhitespace(" 2\u00A0000 "), "2 000");
passed++;

assert.equal(detectCurrency("US$ 100")?.code, "USD");
assert.equal(detectCurrency("The best try"), null, "lowercase words aren't codes");
passed += 2;

console.log(`All ${passed} parse-price checks passed.`);
