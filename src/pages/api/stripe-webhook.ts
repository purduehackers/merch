import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import type Stripe from "stripe";
import { confirmOrderByEmail } from "../../scripts/order-confirmation";
import { PLUTO_MERCH_INTEGRATION, plutoConnection, plutoFetch, readCatalog } from "../../scripts/pluto";
import { stripeConfig } from "../../scripts/store-config";

export const prerender = false;

/**
 * Pluto records paid orders and pickup. This webhook only emails the buyer's confirmation, and only
 * for paid sessions that Pluto confirms belong to this store's sale.
 */
export const POST: APIRoute = async ({ request }) => {
  const { stripe, live, webhookSecret } = stripeConfig(getSecret);
  const pluto = plutoConnection(getSecret);
  if (!stripe || !webhookSecret || !pluto) return new Response("Webhook is not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode !== live) return new Response("Incorrect payment environment", { status: 400 });
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded")
    return new Response(null, { status: 200 });
  const session = event.data.object;
  if (session.payment_status !== "paid" || session.metadata?.integration !== PLUTO_MERCH_INTEGRATION)
    return new Response(null, { status: 200 });
  // Sandbox orders do not send customer email.
  if (!live) return new Response(null, { status: 200 });

  try {
    // The Stripe account serves other Pluto sales. Only this store's key can read its own sessions.
    const owned = await plutoFetch(pluto, `/api/v1/payment-sessions/${encodeURIComponent(session.id)}`);
    if (owned.status === 404) return new Response(null, { status: 200 });
    if (!owned.ok) throw new Error(`Pluto session lookup failed (HTTP ${owned.status})`);
    const status: unknown = await owned.json();
    if (!status || typeof status !== "object" || !("payment_status" in status) || status.payment_status !== "paid")
      return new Response(null, { status: 200 });
    const catalog = await readCatalog(pluto);
    await confirmOrderByEmail(stripe, session, catalog, getSecret("RESEND_API_KEY"));
    return new Response(null, { status: 200 });
  } catch {
    console.error("Could not send merchandise confirmation", { eventId: event.id, sessionId: session.id });
    return new Response("Could not send confirmation", { status: 500 });
  }
};
