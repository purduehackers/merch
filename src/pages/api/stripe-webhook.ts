import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { recordOrder, updateDayTotals } from '../../scripts/notion';
import { stripeConfig } from '../../scripts/stripe-products';

export const prerender = false;

// Stripe calls this when a Checkout Session finishes; paid orders go into the Notion pickup
// database. Register it in the Stripe Dashboard (Developers → Webhooks) for each mode, with
// the events checkout.session.completed and checkout.session.async_payment_succeeded.
//
// Errors answer 500 so Stripe retries (for up to 3 days); recordOrder skips orders already in
// Notion, so a retry never adds a second row.
const config = stripeConfig();

export const POST: APIRoute = async ({ request }) => {
  if (!config.secretKey || !config.webhookSecret) return new Response('Webhook is not configured', { status: 503 });
  const stripe = new Stripe(config.secretKey, { apiVersion: '2026-10-28.endive' });

  // the signature is over the raw body, so read it as text before anything parses it
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, config.webhookSecret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  // completed: card payments are already paid. Bank debits and some wallets finish later and
  // send async_payment_succeeded instead, so only paid sessions are recorded.
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return new Response('Ignored', { status: 200 });
  }
  const session = event.data.object;
  if (session.payment_status !== 'paid') return new Response('Not paid yet', { status: 200 });

  try {
    const added = await recordOrder(session);
    // also on a repeat: if the totals failed last time, Stripe's retry finishes them now
    await updateDayTotals(session);
    return new Response(added ? 'Recorded' : 'Already recorded', { status: 200 });
  } catch (error) {
    console.error('Notion order error:', error);
    return new Response('Could not record order', { status: 500 });
  }
};
