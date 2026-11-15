import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { getStripePrices } from '../../scripts/stripe-prices';
import { LIVE_PRODUCT_IDS, stripeConfig } from '../../scripts/stripe-products';

export const prerender = false;

const SHIRT_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
const SOCK_SIZES = new Set(['S', 'M', 'L', 'XL']);
const RETURN_PATHS = new Set(['/preorder', '/preorder-lab', '/preorder-items']);

// Test or live, per STRIPE_MODE (default: test in dev, live in production).
const config = stripeConfig();
const stripeClient = () =>
  config.secretKey ? new Stripe(config.secretKey, { apiVersion: '2026-10-28.endive' }) : null;

// Creates a Checkout Session for the selected items and returns its client secret
// for the embedded payment form on /preorder.
export const POST: APIRoute = async ({ request, url }) => {
  const stripe = stripeClient();
  if (!stripe || !config.publishableKey) return new Response('Stripe is not configured', { status: 503 });

  const PRODUCT_IDS = config.productIds;
  if (Object.values(PRODUCT_IDS).some((id) => !id.startsWith('prod_') || id === 'prod_...')) {
    return new Response('Stripe product IDs are not set for this mode', { status: 503 });
  }

  let body: { items?: unknown; email?: unknown; shirt_size?: unknown; sock_size?: unknown; return_path?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid request', { status: 400 });
  }

  const items = Array.isArray(body.items)
    ? [...new Set(body.items.filter((item): item is string => typeof item === 'string' && Object.hasOwn(LIVE_PRODUCT_IDS, item)))]
    : [];
  if (!items.length) return new Response('Select at least one item', { status: 400 });

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  // Optional (sent by /preorder-lab): shirt/sock sizes, and which page Stripe returns to.
  const shirtSize =
    items.includes('shirt') && typeof body.shirt_size === 'string' && SHIRT_SIZES.has(body.shirt_size)
      ? body.shirt_size
      : null;
  const sockSize =
    items.includes('socks') && typeof body.sock_size === 'string' && SOCK_SIZES.has(body.sock_size)
      ? body.sock_size
      : null;
  const returnPath =
    typeof body.return_path === 'string' && RETURN_PATHS.has(body.return_path) ? body.return_path : '/preorder';
  const sized = (item: string) =>
    item === 'shirt' && shirtSize ? `shirt (${shirtSize})` : item === 'socks' && sockSize ? `socks (${sockSize})` : item;
  const orderSummary = items.map(sized).join(', ');
  const metadata = {
    items: orderSummary,
    ...(shirtSize ? { shirt_size: shirtSize } : {}),
    ...(sockSize ? { sock_size: sockSize } : {}),
  };

  // TODO(stripe): set mode to "subscription" if selling recurring products
  // (and then add payment_method_collection: 'always').
  const mode = 'payment';

  try {
    const prices = await getStripePrices();
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'form',
      mode,
      line_items: items.map((item) => ({ price: prices[item].id, quantity: 1 })),
      billing_address_collection: 'required',
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      submit_type: 'auto',
      integration_identifier: 'custom_embedded_web_0001',
      ...(/^\S+@\S+\.\S+$/.test(email) ? { customer_email: email } : {}),
      metadata,
      payment_intent_data: { description: orderSummary, metadata },
      return_url: `${url.origin}${returnPath}?session_id={CHECKOUT_SESSION_ID}`,
    });
    return Response.json({ client_secret: session.client_secret, publishable_key: config.publishableKey });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    return new Response('Unable to start checkout', { status: 502 });
  }
};

// Lets /preorder show the result after Stripe redirects back to return_url.
export const GET: APIRoute = async ({ url }) => {
  const stripe = stripeClient();
  if (!stripe) return new Response('Stripe is not configured', { status: 503 });

  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) return new Response('session_id is required', { status: 400 });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return Response.json({ status: session.status, payment_status: session.payment_status });
  } catch {
    return new Response('Unknown session', { status: 404 });
  }
};
