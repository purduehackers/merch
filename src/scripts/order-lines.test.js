import assert from "node:assert/strict";
import test from "node:test";
import { orderLines } from "./order-lines.ts";

test("orderLines reads the compact lines metadata that Pluto writes", () => {
  assert.deepEqual(orderLines({ lines: "shirt:M:2,tote::1" }), [
    { item: "shirt", size: "M", qty: 2 },
    { item: "tote", size: null, qty: 1 },
  ]);
});

test("orderLines skips malformed entries and missing metadata", () => {
  assert.deepEqual(orderLines({ lines: "shirt:M:0,shirt:M,socks:L:x,:M:1,keychain::3" }), [
    { item: "keychain", size: null, qty: 3 },
  ]);
  assert.deepEqual(orderLines(null), []);
  assert.deepEqual(orderLines({}), []);
});
