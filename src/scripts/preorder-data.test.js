import assert from "node:assert/strict";
import test from "node:test";
import { cartTotal } from "./cart.ts";
import { readPrices } from "./preorder-data.js";

const prices = { shirt: 25, tote: 12, socks: 10, keychain: 5 };

test("readPrices parses the page's price data and tolerates it missing", () => {
  const doc = (text) => ({ getElementById: () => (text == null ? null : { textContent: text }) });
  assert.deepEqual(readPrices(doc(JSON.stringify(prices))), prices);
  assert.deepEqual(readPrices(doc(null)), {});
  assert.deepEqual(readPrices(doc("not json")), {});
});

test("a cart with a missing price has no payable total", () => {
  const cart = { lines: [{ item: "shirt", size: "M", qty: 2 }, { item: "tote", qty: 1 }] };
  assert.equal(cartTotal(cart, prices), 62);
  assert.equal(cartTotal(cart, { shirt: 25 }), null);
});
