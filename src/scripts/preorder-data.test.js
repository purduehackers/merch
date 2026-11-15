import assert from "node:assert/strict";
import test from "node:test";
import { readPrices, selectedItems } from "./preorder-data.js";

const prices = { shirt: 25, tote: 12, socks: 10, keychain: 5 };

test("selectedItems returns named, priced products and ignores unknown values", () => {
  assert.deepEqual(selectedItems(["shirt", "socks", "unknown"], prices), [
    { name: "shirt", price: 25 },
    { name: "socks", price: 10 },
  ]);
});

test("selectedItems drops items with no price", () => {
  assert.deepEqual(selectedItems(["shirt"], {}), []);
});

test("readPrices parses the page's price data and tolerates it missing", () => {
  const doc = (text) => ({ getElementById: () => (text == null ? null : { textContent: text }) });
  assert.deepEqual(readPrices(doc(JSON.stringify(prices))), prices);
  assert.deepEqual(readPrices(doc(null)), {});
  assert.deepEqual(readPrices(doc("not json")), {});
});
