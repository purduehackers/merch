import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import { parseOrder, paymentSession, paymentState, storeLines } from "../../scripts/merch-order";
import { checkoutLines, matchesEnvironment, plutoConnection, plutoFetch, plutoMessage } from "../../scripts/pluto";
import { isStoreOrigin, stripeConfig } from "../../scripts/store-config";

export const prerender = false;

const noStore = { "Cache-Control": "no-store" };
const maxRequestBytes = 8_192;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

async function readOrder(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return new Response("Expected JSON", { status: 415 });
  if (Number(request.headers.get("content-length")) > maxRequestBytes)
    return new Response("Order too large", { status: 413 });
  if (!request.body) return new Response("Missing order", { status: 400 });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let json = "";
  let length = 0;
  try {
    for await (const chunk of request.body) {
      length += chunk.byteLength;
      if (length > maxRequestBytes) return new Response("Order too large", { status: 413 });
      json += decoder.decode(chunk, { stream: true });
    }
    const order = parseOrder(JSON.parse(json + decoder.decode()));
    if (typeof order === "string") return new Response(order, { status: 400 });
    return order;
  } catch {
    return new Response("Invalid order", { status: 400 });
  }
}

/** Live orders open only when the webhook can send the confirmation email. */
function canConfirm(live: boolean) {
  if (!live) return true;
  const { stripe, webhookSecret } = stripeConfig(getSecret);
  return Boolean(stripe && webhookSecret && getSecret("RESEND_API_KEY"));
}

/** Pluto's rejection, phrased for the buyer. Configuration problems stay private. */
async function rejected(response: Response) {
  const message = await plutoMessage(response);
  if (response.status === 409)
    return new Response(message || "Your order changed. Reload your cart to review the prices.", { status: 409 });
  if (response.status === 400)
    return new Response(message || "Check your cart and try again.", { status: 400 });
  if (response.status === 429)
    return new Response("Too many checkout attempts. Wait a minute and try again.", { status: 429 });
  if ([401, 403, 404].includes(response.status)) {
    console.error("Pluto refused the store's checkout key", { status: response.status });
    return new Response("Checkout is unavailable", { status: 503 });
  }
  return new Response("Could not start checkout", { status: 502 });
}

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get("origin") !== url.origin || !isStoreOrigin(url.origin, getSecret))
    return new Response("Submit the order from the store", { status: 403 });

  const order = await readOrder(request);
  if (order instanceof Response) return order;
  const live = getSecret("VERCEL_ENV") === "production";
  const pluto = plutoConnection(getSecret);
  if (!pluto || !canConfirm(live)) return new Response("Checkout is unavailable", { status: 503 });

  try {
    // Pluto recalculates the total from the sale's Stripe prices and answers 409 when it changed.
    // The browser keeps one attempt per order, so a retry returns the same Checkout Session.
    const response = await plutoFetch(pluto, "/api/v1/payment-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": order.attempt },
      body: JSON.stringify(paymentSession(order)),
    });
    if (response.status !== 201) return await rejected(response);
    const session: unknown = await response.json();
    const checkout = isObject(session) && isObject(session.checkout) ? session.checkout : undefined;
    if (
      !isObject(session) || typeof session.id !== "string" || !matchesEnvironment(session.id, live) ||
      checkout?.type !== "form" || typeof checkout.client_secret !== "string" ||
      typeof checkout.publishable_key !== "string" ||
      !checkout.publishable_key.startsWith(live ? "pk_live_" : "pk_test_")
    ) {
      console.error("Pluto returned an unexpected merchandise checkout");
      return new Response("Checkout is unavailable", { status: 502 });
    }
    return Response.json(
      { id: session.id, client_secret: checkout.client_secret, publishable_key: checkout.publishable_key },
      { headers: noStore },
    );
  } catch {
    console.error("Could not start merchandise checkout through Pluto");
    return new Response("Could not start checkout", { status: 502 });
  }
};

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("session_id") ?? "";
  const live = getSecret("VERCEL_ENV") === "production";
  if (!/^cs_(?:live|test)_[a-zA-Z0-9]{10,240}$/.test(id)) return new Response("Invalid session", { status: 400, headers: noStore });
  if (!matchesEnvironment(id, live)) return new Response("Unknown order", { status: 404, headers: noStore });
  const pluto = plutoConnection(getSecret);
  if (!pluto) return new Response("Checkout is unavailable", { status: 503, headers: noStore });
  try {
    const response = await plutoFetch(pluto, `/api/v1/payment-sessions/${encodeURIComponent(id)}`);
    if (response.status === 404) return new Response("Unknown order", { status: 404, headers: noStore });
    if (!response.ok) return new Response("Could not confirm payment", { status: 502, headers: noStore });
    const session: unknown = await response.json();
    if (!isObject(session) || session.id !== id) return new Response("Could not confirm payment", { status: 502, headers: noStore });
    const state = paymentState(session);
    const order = state === "paid"
      ? { lines: storeLines(checkoutLines(session.lines)), total: session.amount_minor, currency: "usd" }
      : undefined;
    return Response.json({ state, status: session.session_status, payment_status: session.payment_status, order }, { headers: noStore });
  } catch {
    return new Response("Could not confirm payment", { status: 502, headers: noStore });
  }
};
