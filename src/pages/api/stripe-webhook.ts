import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import type Stripe from "stripe";
import { isMerchSession } from "../../scripts/merch-order";
import { recordPaidOrder } from "../../scripts/notion";
import { confirmOrderByEmail } from "../../scripts/order-confirmation";
import { stripeConfig } from "../../scripts/stripe-products";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { stripe, live, productIds, webhookSecret } = stripeConfig(getSecret);
  if (!stripe || !webhookSecret) return new Response("Webhook is not configured", { status: 503 });

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
  if (session.payment_status !== "paid") return new Response(null, { status: 200 });

  try {
    if (!await isMerchSession(session, live, productIds, stripe)) return new Response(null, { status: 200 });
    const databaseId = getSecret(live ? "NOTION_ORDERS_DATABASE_ID" : "NOTION_TEST_ORDERS_DATABASE_ID");
    const totalsId = getSecret(live ? "NOTION_TOTALS_DATABASE_ID" : "NOTION_TEST_TOTALS_DATABASE_ID");
    if (!live && !databaseId) return new Response("Sandbox order", { status: 200 });
    const [pickup, confirmation] = await Promise.allSettled([
      databaseId ? recordPaidOrder(session, databaseId, totalsId) : Promise.reject(new Error("Missing pickup database")),
      live && session.metadata?.confirmation === "merch_email" ? confirmOrderByEmail(stripe, session, productIds, getSecret("RESEND_API_KEY")) : undefined,
    ]);
    if (pickup.status === "rejected" || confirmation.status === "rejected") {
      console.error("Merchandise fulfillment incomplete", {
        eventId: event.id, sessionId: session.id, pickup: pickup.status, confirmation: confirmation.status,
      });
      return new Response("Could not fulfill order", { status: 500 });
    }
    return new Response(null, { status: 200 });
  } catch {
    console.error("Could not fulfill merchandise order", { eventId: event.id, sessionId: session.id });
    return new Response("Could not fulfill order", { status: 500 });
  }
};
