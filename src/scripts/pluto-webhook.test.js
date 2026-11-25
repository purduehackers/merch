import assert from "node:assert/strict";
import test from "node:test";
import { emailPaidOrder } from "./paid-order.ts";
import { acceptedKey, plutoConnection, plutoProblem } from "./pluto.ts";
import { parsePlutoEvent, plutoWebhookSecret, verifyPlutoWebhook } from "./pluto-webhook.ts";

// Pluto signed this delivery with the `standardwebhooks` library (1.3.0) that it uses in production.
const secret = "whsec_bWVyY2gtc3RvcmUtd2ViaG9vay10ZXN0LXNlY3JldCE=";
const rolledSecret = `whsec_${Buffer.from("rolled-merch-store-webhook-key!!").toString("base64")}`;
const id = "evt_01JDZQ7Y3V9M2S5R8T4K6N1P0A";
const timestamp = 1_795_000_000;
const now = timestamp * 1000;
const body = '{"id":"evt_01JDZQ7Y3V9M2S5R8T4K6N1P0A","object":"event","type":"payment_session.completed","created":"2026-11-18T11:06:40.000Z","environment":"live","data":{"object":"payment_session","id":"cs_live_a1B2c3D4e5F6g7H8i9J0","status":"complete","amount_minor":5000,"currency":"USD","sale_id":"0b6c2f52-7a63-4d8e-9f1a-2c3b4d5e6f70"}}';
const signature = "v1,lLAVgsVlbnhPKklWmtVlhWnvbl+nQ+ZxG6DsfIF57bY=";
const rolledSignature = "v1,lGIeKHCmARX6Pm3kPPS8TRru67Ag7yhwVp3Mw5FLEQ4=";

const headers = (changes = {}) =>
  new Headers({ "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": signature, ...changes });
const read = (values) => (key) => values[key];
// A storefront app key with a wrong checksum. The template keeps a scanner-shaped key out of this file.
const appKey = (environment) => `pluto_sk_${environment}_${"0".repeat(40)}AAAAAA`;

test("accepts a delivery that Pluto signed, including both signatures of a secret roll", async () => {
  assert.ok(await verifyPlutoWebhook(secret, headers(), body, now));
  assert.ok(await verifyPlutoWebhook(secret, headers({ "webhook-signature": `${rolledSignature} ${signature}` }), body, now));
  assert.ok(await verifyPlutoWebhook(rolledSecret, headers({ "webhook-signature": `${rolledSignature} ${signature}` }), body, now));
  assert.ok(await verifyPlutoWebhook(secret, headers(), body, now + 299_000));
});

test("refuses a changed, foreign, stale or malformed delivery", async () => {
  assert.equal(await verifyPlutoWebhook(secret, headers(), body.replace("5000", "5001"), now), false);
  assert.equal(await verifyPlutoWebhook(rolledSecret, headers(), body, now), false);
  assert.equal(await verifyPlutoWebhook(secret, headers({ "webhook-id": "evt_other" }), body, now), false);
  assert.equal(await verifyPlutoWebhook(secret, headers(), body, now + 301_000), false);
  assert.equal(await verifyPlutoWebhook(secret, headers(), body, now - 301_000), false);
  assert.equal(await verifyPlutoWebhook(secret, headers({ "webhook-signature": signature.replace("v1,", "v2,") }), body, now), false);
  assert.equal(await verifyPlutoWebhook(secret, headers({ "webhook-signature": signature.slice(3) }), body, now), false);
  assert.equal(await verifyPlutoWebhook(secret, headers({ "webhook-signature": "v1,AAAA" }), body, now), false);
  assert.equal(await verifyPlutoWebhook(secret, headers({ "webhook-timestamp": "1795000000.5" }), body, now), false);
  const unsigned = headers();
  unsigned.delete("webhook-signature");
  assert.equal(await verifyPlutoWebhook(secret, unsigned, body, now), false);
});

test("reads only a Standard Webhooks secret", () => {
  assert.equal(plutoWebhookSecret(read({ PLUTO_WEBHOOK_SECRET: secret })), secret);
  for (const value of [undefined, "", "whsec_", "secret", "whsec_not base64", "sk_live_example"])
    assert.equal(plutoWebhookSecret(read({ PLUTO_WEBHOOK_SECRET: value })), null);
});

test("reads the thin event envelope", () => {
  assert.deepEqual(parsePlutoEvent(body), {
    id, type: "payment_session.completed", environment: "live", sessionId: "cs_live_a1B2c3D4e5F6g7H8i9J0",
  });
  const ping = { id: "evt_ping", object: "event", type: "ping", environment: "test", data: { object: "webhook_endpoint", id: "we_1" } };
  assert.deepEqual(parsePlutoEvent(JSON.stringify(ping)), { id: "evt_ping", type: "ping", environment: "test", sessionId: null });
  const event = JSON.parse(body);
  assert.equal(parsePlutoEvent(JSON.stringify({ ...event, data: { ...event.data, id: "pi_123" } })).sessionId, null);
  for (const value of ["not json", "[]", JSON.stringify({ ...event, environment: "staging" }),
    JSON.stringify({ ...event, object: "list" }), JSON.stringify({ ...event, type: 1 })])
    assert.equal(parsePlutoEvent(value), null);
});

test("accepts a storefront app key only in its own environment, and the former sale key anywhere", () => {
  assert.ok(acceptedKey(appKey("live"), true));
  assert.ok(acceptedKey(appKey("test"), false));
  assert.equal(acceptedKey(appKey("test"), true), false);
  assert.equal(acceptedKey(appKey("live"), false), false);
  assert.ok(acceptedKey("pluto_site_example", true));
  assert.ok(acceptedKey("pluto_site_example", false));
  for (const key of ["pluto_sk_test_short", `${appKey("test")}A`, `${appKey("test").slice(0, -1)}-`, "pluto_personal_example"])
    assert.equal(acceptedKey(key, false), false);
  const url = "https://pluto.example.org";
  assert.ok(plutoConnection(read({ VERCEL_ENV: "production", PLUTO_API_URL: url, PLUTO_API_KEY: appKey("live") })));
  assert.equal(plutoConnection(read({ VERCEL_ENV: "production", PLUTO_API_URL: url, PLUTO_API_KEY: appKey("test") })), null);
  assert.ok(plutoConnection(read({ VERCEL_ENV: "preview", PLUTO_API_URL: url, PLUTO_API_KEY: appKey("test") })));
  assert.ok(plutoConnection(read({ PLUTO_API_URL: "http://localhost:3001", PLUTO_API_KEY: appKey("test") })));
});

test("reads Pluto problem documents and the former error body", async () => {
  const problem = Response.json(
    { type: "https://pluto.example.org/docs/errors/conflict", title: "Conflict", status: 409, code: "conflict",
      detail: "This sale is closed.", request_id: "req_1" },
    { status: 409, headers: { "content-type": "application/problem+json", "pluto-request-id": "req_1" } },
  );
  assert.deepEqual(await plutoProblem(problem), { code: "conflict", message: "This sale is closed.", requestId: "req_1" });
  const former = Response.json({ error: { code: "conflict", message: "A price changed." } }, { status: 409 });
  assert.deepEqual(await plutoProblem(former), { code: "conflict", message: "A price changed.", requestId: "" });
  assert.deepEqual(await plutoProblem(new Response("<html>", { status: 502 })), { code: "", message: "", requestId: "" });
  const long = Response.json({ code: "validation_failed", detail: "x".repeat(400) }, { status: 422 });
  assert.equal((await plutoProblem(long)).message.length, 300);
});

test("sends nothing for a session that is unpaid, foreign to Pluto or outside this sale", async (t) => {
  const pluto = { origin: "https://pluto.example.org", key: appKey("live") };
  const stripe = {};
  const paid = { id: "cs_live_a1B2c3D4e5F6g7H8i9J0", payment_status: "paid", metadata: { integration: "pluto_merch" } };
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ code: "not_found" }, { status: 404 }));
  assert.equal(await emailPaidOrder(pluto, stripe, { ...paid, payment_status: "unpaid" }, "re_key"), false);
  assert.equal(await emailPaidOrder(pluto, stripe, { ...paid, metadata: { integration: "other" } }, "re_key"), false);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(await emailPaidOrder(pluto, stripe, paid, "re_key"), false);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(String(url), `https://pluto.example.org/api/v1/payment-sessions/${paid.id}`);
  assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${appKey("live")}`);
  fetch.mock.mockImplementation(async () => Response.json({ id: paid.id, payment_status: "unpaid" }));
  assert.equal(await emailPaidOrder(pluto, stripe, paid, "re_key"), false);
  fetch.mock.mockImplementation(async () => Response.json({ code: "provider_unavailable" }, { status: 503 }));
  await assert.rejects(emailPaidOrder(pluto, stripe, paid, "re_key"), /HTTP 503/);
});
