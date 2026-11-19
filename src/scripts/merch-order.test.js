import assert from "node:assert/strict";
import test from "node:test";
import { isMerchSession, parseOrder, paymentState } from "./merch-order.ts";
import { orderLines } from "./order-notion.ts";
import { stripeConfig, isStoreOrigin } from "./stripe-products.ts";

const read = (values) => (key) => values[key];
const order = {
  name: " Pickup name ", email: " buyer@example.org ", attempt: "9ac95935-4375-4024-aac7-a205d8cec795",
  expected_total: 5000, lines: [{ item: "shirt", size: "M", qty: 1 }, { item: "shirt", size: "M", qty: 1 }],
};

test("creates one merged pickup line while retaining name and size", () => {
  const parsed = parseOrder(order);
  assert.equal(parsed.email, "buyer@example.org");
  assert.deepEqual(parsed.lines, [{ item: "shirt", size: "M", qty: 2 }]);
  assert.deepEqual(parsed.metadata, {
    integration: "purdue_hackers_merch", name: "Pickup name", items: "2× shirt (M)", lines: "shirt:M:2",
  });
});

test("rejects invalid shapes, tampered quantities, unknown items and missing sizes", () => {
  for (const input of [null, [], { ...order, attempt: "" }, { ...order, email: "bad" },
    { ...order, expected_total: 12.5 }, { ...order, lines: [null] }, { ...order, lines: [{ item: "unknown", qty: 1 }] },
    { ...order, lines: [{ item: "shirt", qty: 1 }] }, { ...order, lines: [{ item: "tote", size: "L", qty: 1 }] },
    { ...order, lines: [{ item: "tote", qty: 6 }, { item: "tote", qty: 5 }] },
  ]) assert.equal(typeof parseOrder(input), "string");
});

test("deployment selects and validates keys and sandbox ignores an attempted live override", () => {
  const live = { STRIPE_MODE: "live", STRIPE_SECRET_KEY: "rk_live_example", PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example" };
  for (const VERCEL_ENV of ["preview", "development", undefined]) {
    const config = stripeConfig(read({ ...live, VERCEL_ENV }));
    assert.equal(config.live, false);
    assert.equal(config.stripe, null);
    assert.equal(config.publishableKey, null);
  }
  const sandbox = stripeConfig(read({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "rk_test_example", PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example" }));
  assert.ok(sandbox.stripe);
  assert.equal(sandbox.publishableKey, "pk_test_example");
  const production = stripeConfig(read({ ...live, VERCEL_ENV: "production", STRIPE_MODE: "test" }));
  assert.ok(production.stripe);
  assert.equal(production.live, true);
  assert.notDeepEqual(production.productIds, sandbox.productIds);
  assert.equal(stripeConfig(read({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_test_example" })).stripe, null);
});

test("only trusted deployment or local origins can start a session", () => {
  assert.ok(isStoreOrigin("http://localhost:4321", read({})));
  assert.ok(isStoreOrigin("https://drops.purduehackers.com", read({ VERCEL_ENV: "production" })));
  const preview = read({ VERCEL_ENV: "preview", VERCEL_URL: "merch-preview.vercel.app" });
  assert.ok(isStoreOrigin("https://merch-preview.vercel.app", preview));
  assert.equal(isStoreOrigin("http://localhost:4321", preview), false);
  assert.equal(isStoreOrigin("https://merch-preview.vercel.app.example.org", preview), false);
});

test("separates paid, pending, terminal failure, and expiration", () => {
  const complete = { status: "complete", payment_status: "unpaid" };
  assert.equal(paymentState(complete), "pending");
  assert.equal(paymentState({ ...complete, payment_status: "paid" }), "paid");
  assert.equal(paymentState({ ...complete, payment_intent: { status: "requires_payment_method" } }), "failed");
  assert.equal(paymentState({ ...complete, status: "expired" }), "expired");
});

test("shared-account webhook checks mode, integration and actual catalog on older orders", async () => {
  const session = { livemode: false, mode: "payment", currency: "usd", metadata: { integration: "afterhours_contributions" } };
  const products = { tote: "prod_merch" };
  const matches = async (s, product) => isMerchSession(s, false, products, {
    checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { product } }], has_more: false }) } },
  });
  assert.equal(await matches(session, products.tote), false);
  const tagged = { ...session, metadata: { integration: "purdue_hackers_merch" } };
  assert.equal(await matches(tagged), true);
  assert.equal(await matches({ ...tagged, livemode: true }), false);
  const legacy = { ...session, metadata: { items: "shirt (M), tote" } };
  assert.equal(await matches(legacy, products.tote), true);
  assert.equal(await matches(legacy, "prod_donation"), false);
  assert.deepEqual(orderLines(legacy.metadata), [{ item: "shirt", size: "M", qty: 1 }, { item: "tote", size: null, qty: 1 }]);
});
