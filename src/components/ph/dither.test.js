import assert from "node:assert/strict";
import test from "node:test";
import { pixelOrder } from "./dither.js";

test("pixelOrder is a deterministic permutation", () => {
  const order = pixelOrder(50);
  assert.deepEqual(order, pixelOrder(50));
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i));
});
