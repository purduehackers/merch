import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { test } from "node:test";
import { confirmOrderByEmail } from "./order-confirmation.ts";
import { prepareOrderEmail } from "./order-email.tsx";
import { ResendEmailRejection, sendOrderEmail } from "./resend-email.ts";

const session = {
  id: "cs_fixture", payment_status: "paid", currency: "usd", amount_total: 5100,
  customer_email: "buyer@example.com", metadata: { name: "<Buyer>", lines: "shirt:M:1,shirt:L:1,tote::1" },
};
const stripe = {
  checkout: { sessions: { listLineItems: async () => ({
    has_more: false,
    data: [
      { price: { product: "shirt_id" }, amount_total: 4000, currency: "usd", quantity: 2 },
      { price: { product: "tote_id" }, amount_total: 1100, currency: "usd", quantity: 1 },
    ],
  }) } },
};

test("renders purchased prices, variants, pickup and seller in HTML and text", async () => {
  const mail = await prepareOrderEmail(stripe, session, { shirt: "shirt_id", tote: "tote_id" });
  assert.equal(mail.to, session.customer_email);
  for (const expected of ["ASCII TEE", "M × 1, L × 1", "SHIP IT TOTE", "$40.00", "$11.00", "$51.00", "Afterhours Foundation", "spring 2027 Hack Night", "30 days of purchase", "help@afterhours.foundation"]) {
    assert.ok(mail.html.includes(expected), expected);
    assert.ok(mail.text.includes(expected), expected);
  }
  assert.doesNotMatch(mail.html + mail.text, /purdue hackers|phackers@|purduehackers\./i);
  assert.match(mail.html, /alt="Afterhours"/);
  assert.match(mail.html, /href="mailto:help@afterhours\.foundation"/);
  assert.doesNotMatch(mail.text, /\.png/);
  assert.ok(mail.html.includes("&lt;Buyer&gt;"));
  assert.ok(!mail.html.includes(session.id));
  await assert.rejects(prepareOrderEmail(stripe, { ...session, payment_status: "unpaid" }, {}));
});

test("shows the matching photograph for each purchased product", async () => {
  const ids = { shirt: "shirt_id", socks: "socks_id", tote: "tote_id", keychain: "keychain_id" };
  const data = Object.values(ids).map((product) => ({ price: { product }, amount_total: 500, currency: "usd", quantity: 1 }));
  const allProducts = { checkout: { sessions: { listLineItems: async () => ({ has_more: false, data }) } } };
  const mail = await prepareOrderEmail(allProducts, { ...session, amount_total: 2000,
    metadata: { lines: "shirt:XXL:1,socks:L:1,tote::1,keychain::1" } }, ids);
  assert.match(mail.text, /XXL/);
  assert.doesNotMatch(mail.html + mail.text, /(?:XXL|L) × 1/);
  const imageNames = Array.from(mail.html.matchAll(/<img [^>]*?src="https:\/\/[^"]+\/([^/"]+\.png)"/g), (match) => match[1]);
  assert.deepEqual(imageNames, ["afterhours.png", "shirt.png", "socks.png", "tote.png", "keychain.png"]);
});

// The SDK uses this unsigned fixture only for the loopback Blob server.
process.env.VERCEL_OIDC_TOKEN_FILE = "";
process.env.VERCEL_OIDC_TOKEN = `fixture.${Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString("base64url")}.fixture`;
const email = { to: "buyer@example.com", html: "<p>Paid</p>", text: "Paid" };
const queued = () => Response.json({ id: "message-fixture" });

test("submits the Afterhours sender, reply address and idempotency key to Resend", async (t) => {
  const send = t.mock.method(globalThis, "fetch", queued);
  assert.equal(await sendOrderEmail(email, "test-key", "preorder/fixture"), "message-fixture");
  const [url, init] = send.mock.calls[0].arguments;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.headers.Authorization, "Bearer test-key");
  assert.equal(init.headers["Idempotency-Key"], "preorder/fixture");
  assert.equal(init.redirect, "error");
  assert.deepEqual(JSON.parse(init.body), { ...email, from: "Afterhours <store@mail.afterhours.foundation>",
    subject: "Your Afterhours preorder", reply_to: "help@afterhours.foundation" });
});

test("only a documented pre-acceptance Resend rejection can release a fresh claim", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async () => Response.json({ name: "rate_limit_exceeded", message: "rate limited" }, { status: 429 }));
  await assert.rejects(sendOrderEmail(email, "key", "fixture"), ResendEmailRejection);
  send.mock.mockImplementation(async () => Response.json({ message: "The sender domain is not verified" }, { status: 400 }));
  await assert.rejects(sendOrderEmail(email, "key", "fixture"), ResendEmailRejection);
  for (const response of [
    Response.json({ name: "concurrent_idempotent_requests", message: "in progress" }, { status: 409 }),
    Response.json({ name: "invalid_idempotent_request", message: "different payload" }, { status: 409 }),
    Response.json({}),
    new Response("Bad gateway", { status: 502 }),
  ]) {
    send.mock.mockImplementation(async () => response);
    await assert.rejects(sendOrderEmail(email, "key", "fixture"), (e) => !(e instanceof ResendEmailRejection));
  }
});

// Exercise the Blob SDK's conditional writes and deletes without using a store or an email account.
test("paid order email delivery claims", async (t) => {
  const objects = new Map();
  let lastClaim;
  let revision = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET") {
      const blob = objects.get(url.searchParams.get("url"));
      return blob ? reply(200, blob) : reply(404, { error: { code: "not_found" } });
    }
    if (req.method === "PUT") {
      const path = url.searchParams.get("pathname");
      const content = await text(req);
      if (objects.has(path) && req.headers["x-allow-overwrite"] === "0") {
        return reply(400, { error: { code: "bad_request", message: "This pathname already exists" } });
      }
      if (req.headers["x-if-match"] && req.headers["x-if-match"] !== objects.get(path)?.etag) {
        return reply(412, { error: { code: "precondition_failed" } });
      }
      const blob = { pathname: path, etag: `"revision-${++revision}"`, content, uploadedAt: new Date() };
      if (path.endsWith("/sending")) lastClaim = blob;
      objects.set(path, blob);
      return reply(200, blob);
    }
    if (req.method === "POST" && url.pathname === "/delete") {
      const { urls: [path] } = JSON.parse(await text(req));
      if (req.headers["x-if-match"] !== objects.get(path)?.etag) {
        return reply(412, { error: { code: "precondition_failed" } });
      }
      objects.delete(path);
      return reply(200, {});
    }
    reply(400, { error: { code: "bad_request" } });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const env = {
    VERCEL_BLOB_API_URL: `http://127.0.0.1:${server.address().port}`,
    VERCEL_BLOB_RETRIES: "0",
    BLOB_STORE_ID: "store_fixture",
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }

  const confirm = (id) => confirmOrderByEmail(stripe, { ...session, id }, { shirt: "shirt_id", tote: "tote_id" }, "fixture-key");

  await t.test("only one concurrent delivery runs, and a completed order is skipped on replay", { timeout: 5000 }, async (t) => {
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    const send = t.mock.method(globalThis, "fetch", async () => {
      started.resolve();
      await finish.promise;
      return queued();
    });
    const first = confirm("cs_concurrent");
    try {
      await Promise.race([started.promise, first]);
      await assert.rejects(confirm("cs_concurrent"), /in progress/);
    } finally {
      finish.resolve();
      await first;
    }
    await confirm("cs_concurrent");
    assert.equal(send.mock.callCount(), 1);
  });

  await t.test("an explicit rejection releases its own claim for the next delivery", async (t) => {
    const send = t.mock.method(globalThis, "fetch", async () => Response.json(
      { name: "rate_limit_exceeded", message: "test rate limit" }, { status: 429 },
    ));
    await assert.rejects(confirm("cs_retry"), ResendEmailRejection);
    send.mock.mockImplementation(queued);
    await confirm("cs_retry");
    await confirm("cs_retry");
    assert.equal(send.mock.callCount(), 2);
  });

  await t.test("a timeout can replay with the same Resend key and message, then skips future deliveries", async (t) => {
    const send = t.mock.method(globalThis, "fetch", async () => { throw new DOMException("timed out", "TimeoutError"); });
    await assert.rejects(confirm("cs_timeout"), { name: "TimeoutError" });
    lastClaim.uploadedAt = new Date(Date.now() - 60_000);
    send.mock.mockImplementation(queued);
    await confirm("cs_timeout");
    await confirm("cs_timeout");
    assert.equal(send.mock.callCount(), 2);
    const [first, retry] = send.mock.calls.map((call) => call.arguments[1]);
    assert.match(first.headers["Idempotency-Key"], /^merch-preorder\/[0-9a-f]{64}$/);
    assert.equal(first.headers["Idempotency-Key"], retry.headers["Idempotency-Key"]);
    assert.equal(first.body, retry.body);
  });

  await t.test("a replay after an ambiguous send keeps the original retry deadline", async (t) => {
    const send = t.mock.method(globalThis, "fetch", async () => { throw new DOMException("timed out", "TimeoutError"); });
    await assert.rejects(confirm("cs_expired"), { name: "TimeoutError" });
    const firstAttempt = Date.now() - 22 * 60 * 60_000;
    lastClaim.uploadedAt = new Date(firstAttempt);
    send.mock.mockImplementation(async () => Response.json({ name: "validation_error", message: "unauthorized" }, { status: 401 }));
    await assert.rejects(confirm("cs_expired"), ResendEmailRejection);
    assert.equal(lastClaim.uploadedAt.getTime(), firstAttempt);
    const expired = Date.now() - 24 * 60 * 60_000;
    lastClaim.uploadedAt = new Date(expired);
    await assert.rejects(confirm("cs_expired"), /Reconcile/);
    assert.equal(send.mock.callCount(), 2);
  });
});
