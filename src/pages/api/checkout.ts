import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import Stripe from "stripe";
import { isMerchSession, parseOrder, paymentState } from "../../scripts/merch-order";
import { orderLines } from "../../scripts/order-notion";
import { getStripePrices } from "../../scripts/stripe-prices";
import { isStoreOrigin, stripeConfig } from "../../scripts/stripe-products";

export const prerender = false;

const noStore = { "Cache-Control": "no-store" };
const maxRequestBytes = 8_192;

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

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get("origin") !== url.origin || !isStoreOrigin(url.origin, getSecret))
    return new Response("Submit the order from the store", { status: 403 });

  const order = await readOrder(request);
  if (order instanceof Response) return order;
  const { stripe, productIds, publishableKey, webhookSecret, live } = stripeConfig(getSecret);
  const canFulfill = !live || (webhookSecret && getSecret("NOTION_TOKEN") &&
    getSecret("NOTION_ORDERS_DATABASE_ID") && getSecret("RESEND_API_KEY"));
  if (!stripe || !publishableKey || !canFulfill) return new Response("Checkout is unavailable", { status: 503 });

  try {
    const prices = await getStripePrices(stripe, productIds);
    const quantities = new Map<string, number>();
    let total = 0;
    for (const { item, qty } of order.lines) {
      const { id, amount } = prices[item];
      quantities.set(id, (quantities.get(id) ?? 0) + qty);
      total += amount * qty;
    }
    if (total !== order.expectedTotal) return new Response("Prices changed. Reload your cart.", { status: 409 });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "form",
      allowed_payment_method_types: ["card"],
      wallet_options: { link: { display: "never" } },
      line_items: [...quantities].map(([price, quantity]) => ({ price, quantity })),
      billing_address_collection: "required",
      automatic_tax: { enabled: false },
      customer_email: order.email,
      metadata: live ? { ...order.metadata, confirmation: "merch_email" } : order.metadata,
      payment_intent_data: {
        description: order.metadata.items,
        metadata: order.metadata,
      },
      return_url: `${url.origin}/preorder?session_id={CHECKOUT_SESSION_ID}`,
    }, { idempotencyKey: `merch:${order.attempt}` });
    if (!session.client_secret) return new Response("Checkout is unavailable", { status: 502 });
    return Response.json({ id: session.id, client_secret: session.client_secret, publishable_key: publishableKey }, { headers: noStore });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeIdempotencyError)
      return new Response("Checkout changed. Reload your cart.", { status: 409 });
    console.error("Could not start merchandise checkout", error instanceof Stripe.errors.StripeError ? error.requestId : undefined);
    return new Response("Could not start checkout", { status: 502 });
  }
};

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("session_id") ?? "";
  if (!/^cs_(?:live|test)_[a-zA-Z0-9]{10,240}$/.test(id)) return new Response("Invalid session", { status: 400, headers: noStore });
  const { stripe, live, productIds } = stripeConfig(getSecret);
  if (!stripe) return new Response("Checkout is unavailable", { status: 503, headers: noStore });
  try {
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ["payment_intent"] });
    if (!await isMerchSession(session, live, productIds, stripe))
      return new Response("Unknown order", { status: 404, headers: noStore });
    const state = paymentState(session);
    const order = state === "paid"
      ? { lines: orderLines(session.metadata), total: session.amount_total, currency: session.currency }
      : undefined;
    return Response.json({ state, status: session.status, payment_status: session.payment_status, order }, { headers: noStore });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === "resource_missing")
      return new Response("Unknown order", { status: 404, headers: noStore });
    return new Response("Could not confirm payment", { status: 502, headers: noStore });
  }
};
