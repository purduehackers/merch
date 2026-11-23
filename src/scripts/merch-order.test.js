import assert from "node:assert/strict";
import test from "node:test";
import { parseOrder, paymentSession, paymentState, storeLines } from "./merch-order.ts";
import { checkoutLines, matchesEnvironment, plutoConnection } from "./pluto.ts";
import { isStoreOrigin, stripeConfig } from "./store-config.ts";

const read = (values) => (key) => values[key];
const order = {
  name: " Pickup name ", email: " buyer@example.org ", attempt: "9ac95935-4375-4024-aac7-a205d8cec795",
  expected_total: 5000, lines: [{ item: "shirt", size: "M", qty: 1 }, { item: "shirt", size: "M", qty: 1 }],
};

test("creates one merged pickup line while retaining name and size", () => {
  const parsed = parseOrder(order);
  assert.equal(parsed.email, "buyer@example.org");
  assert.equal(parsed.name, "Pickup name");
  assert.deepEqual(parsed.lines, [{ item: "shirt", size: "M", qty: 2 }]);
});

test("rejects invalid shapes, tampered quantities, unknown items and missing sizes", () => {
  for (const input of [null, [], { ...order, attempt: "" }, { ...order, email: "bad" },
    { ...order, expected_total: 12.5 }, { ...order, lines: [null] }, { ...order, lines: [{ item: "unknown", qty: 1 }] },
    { ...order, lines: [{ item: "shirt", qty: 1 }] }, { ...order, lines: [{ item: "tote", size: "L", qty: 1 }] },
    { ...order, lines: [{ item: "tote", qty: 6 }, { item: "tote", qty: 5 }] },
  ]) assert.equal(typeof parseOrder(input), "string");
});

test("asks Pluto for the store's sale with each size as a variant", () => {
  const parsed = parseOrder({ ...order, lines: [...order.lines, { item: "tote", qty: 1 }] });
  assert.deepEqual(paymentSession(parsed), {
    kind: "merch",
    return_target: "purdue-hackers-merch",
    cart: {
      lines: [{ sku: "shirt", variant: "M", quantity: 2 }, { sku: "tote", variant: "one-size", quantity: 1 }],
      expected_total_minor: 5000,
      currency: "USD",
      pickup_name: "Pickup name",
      email: "buyer@example.org",
    },
  });
  assert.deepEqual(storeLines(checkoutLines(paymentSession(parsed).cart.lines)), parsed.lines);
  assert.deepEqual(checkoutLines([{ sku: "shirt", variant: "M", quantity: 0 }, null, "tote"]), []);
});

test("connects to Pluto only with a sale key, and production only over HTTPS", () => {
  const key = "pluto_site_example";
  assert.deepEqual(plutoConnection(read({ PLUTO_API_URL: "https://pluto.example.org/x", PLUTO_API_KEY: key })),
    { origin: "https://pluto.example.org", key, bypass: undefined });
  assert.ok(plutoConnection(read({ VERCEL_ENV: "development", PLUTO_API_URL: "http://localhost:3001", PLUTO_API_KEY: key })));
  for (const values of [
    { PLUTO_API_URL: "https://pluto.example.org", PLUTO_API_KEY: "pluto_personal_example" },
    { PLUTO_API_URL: "not a url", PLUTO_API_KEY: key },
    { VERCEL_ENV: "production", PLUTO_API_URL: "http://localhost:3001", PLUTO_API_KEY: key },
    { VERCEL_ENV: "preview", PLUTO_API_URL: "http://pluto.example.org", PLUTO_API_KEY: key },
    { PLUTO_API_URL: "https://user:pass@pluto.example.org", PLUTO_API_KEY: key },
  ]) assert.equal(plutoConnection(read(values)), null);
  assert.equal(plutoConnection(read({ PLUTO_API_URL: "https://pluto.example.org", PLUTO_API_KEY: key,
    PLUTO_PROTECTION_BYPASS: "bypass" })).bypass, "bypass");
});

test("only production accepts live Checkout Sessions", () => {
  assert.ok(matchesEnvironment("cs_live_example", true));
  assert.ok(matchesEnvironment("cs_test_example", false));
  assert.equal(matchesEnvironment("cs_test_example", true), false);
  assert.equal(matchesEnvironment("cs_live_example", false), false);
});

test("the confirmation webhook selects Stripe keys for its own environment", () => {
  const live = { STRIPE_SECRET_KEY: "rk_live_example", STRIPE_WEBHOOK_SECRET: "whsec_live" };
  for (const VERCEL_ENV of ["preview", "development", undefined]) {
    const config = stripeConfig(read({ ...live, VERCEL_ENV }));
    assert.equal(config.live, false);
    assert.equal(config.stripe, null);
  }
  const sandbox = stripeConfig(read({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "rk_test_example", STRIPE_WEBHOOK_SECRET: "whsec_test" }));
  assert.ok(sandbox.stripe);
  assert.equal(sandbox.webhookSecret, "whsec_test");
  const production = stripeConfig(read({ ...live, VERCEL_ENV: "production" }));
  assert.ok(production.stripe);
  assert.equal(production.live, true);
  assert.equal(stripeConfig(read({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_test_example" })).stripe, null);
  assert.equal(stripeConfig(read({ STRIPE_WEBHOOK_SECRET: "not-a-secret" })).webhookSecret, null);
});

test("only trusted deployment or local origins can start a session", () => {
  assert.ok(isStoreOrigin("http://localhost:4321", read({})));
  assert.ok(isStoreOrigin("https://drops.purduehackers.com", read({ VERCEL_ENV: "production" })));
  const preview = read({ VERCEL_ENV: "preview", VERCEL_URL: "merch-preview.vercel.app" });
  assert.ok(isStoreOrigin("https://merch-preview.vercel.app", preview));
  assert.equal(isStoreOrigin("http://localhost:4321", preview), false);
  assert.equal(isStoreOrigin("https://merch-preview.vercel.app.example.org", preview), false);
});

test("separates paid, processing, open, and expired checkouts", () => {
  const complete = { session_status: "complete", payment_status: "unpaid" };
  assert.equal(paymentState(complete), "pending");
  assert.equal(paymentState({ ...complete, payment_status: "paid" }), "paid");
  assert.equal(paymentState({ ...complete, session_status: "open" }), "open");
  assert.equal(paymentState({ ...complete, session_status: "expired" }), "expired");
});
