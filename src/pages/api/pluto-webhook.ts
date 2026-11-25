import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import { emailPaidOrder } from "../../scripts/paid-order";
import { plutoConnection } from "../../scripts/pluto";
import { parsePlutoEvent, plutoWebhookSecret, verifyPlutoWebhook } from "../../scripts/pluto-webhook";
import { stripeConfig } from "../../scripts/store-config";

export const prerender = false;

/** Pluto's thin events are far smaller than this. */
const maxBodyBytes = 65_536;

/**
 * Pluto delivers `payment_session.completed` only for this store's sale, after Stripe confirms the
 * payment. The event holds no buyer data, so the store reads the buyer and the lines from Stripe.
 * Any 2xx answer ends the delivery. Another answer makes Pluto retry for up to 3 days.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = plutoWebhookSecret(getSecret);
  const { stripe, live } = stripeConfig(getSecret);
  const pluto = plutoConnection(getSecret);
  if (!secret || !stripe || !pluto) return new Response("Webhook is not configured", { status: 503 });
  if (Number(request.headers.get("content-length")) > maxBodyBytes)
    return new Response("Event too large", { status: 413 });

  const body = await request.text();
  if (body.length > maxBodyBytes) return new Response("Event too large", { status: 413 });
  if (!(await verifyPlutoWebhook(secret, request.headers, body)))
    return new Response("Invalid signature", { status: 400 });
  const event = parsePlutoEvent(body);
  if (!event) return new Response("Invalid event", { status: 400 });
  if (event.environment !== (live ? "live" : "test"))
    return new Response("Incorrect payment environment", { status: 400 });
  if (event.type !== "payment_session.completed") return new Response(null, { status: 204 });
  if (!event.sessionId) return new Response("Invalid event", { status: 400 });
  // Sandbox orders do not send customer email.
  if (!live) return new Response(null, { status: 204 });

  try {
    const session = await stripe.checkout.sessions.retrieve(event.sessionId);
    await emailPaidOrder(pluto, stripe, session, getSecret("RESEND_API_KEY"));
    return new Response(null, { status: 204 });
  } catch {
    console.error("Could not send merchandise confirmation", { eventId: event.id, sessionId: event.sessionId });
    return new Response("Could not send confirmation", { status: 500 });
  }
};
