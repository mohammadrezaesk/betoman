import assert from "node:assert/strict";
import { parseNavasanResponse } from "../src/background/navasan.js";

const sample = {
  usd_sell: { value: "112900", change: -500, timestamp: 1568212950 },
  eur: { value: "121500", change: 200, timestamp: 1568212950 },
  gbp: { value: "142000", change: 0, timestamp: 1568212950 },
  try: { value: "3200", change: 10, timestamp: 1568212950 },
};

const rates = parseNavasanResponse(sample);
assert.equal(rates.USD, 112900);
assert.equal(rates.EUR, 121500);
assert.equal(rates.GBP, 142000);
assert.equal(rates.TRY, 3200);

let threw = false;
try {
  parseNavasanResponse({ foo: { value: "0" } });
} catch (err) {
  threw = err.message.includes("No currency rates");
}
assert.ok(threw, "empty useful rates should throw");

console.log("All navasan parse checks passed.");
