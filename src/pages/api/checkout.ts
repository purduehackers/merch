import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { getStripePrices } from '../../scripts/stripe-prices';
import { LIVE_PRODUCT_IDS, stripeConfig } from '../../scripts/stripe-products';

export const prerender = false;

const SIZES: Record<string, Set<string>> = {
  shirt: new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']),
  socks: new Set(['S', 'M', 'L', 'XL']),
};
const RETURN_PATHS = new Set(['/preorder', '/preorder-lab', '/preorder-items']);
/** per line (item + size); matches MAX_QTY in scripts/cart.ts */
const MAX_QTY = 10;
const MAX_LINES = 20;

type OrderLine = { item: string; size: string | null; qty: number };

// The order as lines of item + size + quantity, merged by item + size. /preorder sends `lines`;
// the lab pages send `items` (one of each) with optional shirt_size / sock_size. Returns an
// error message for anything malformed.
const orderLines = (body: { lines?: unknown; items?: unknown; shirt_size?: unknown; sock_size?: unknown }) => {
  const raw: { item: unknown; size: unknown; qty: unknown; legacy?: true }[] = Array.isArray(body.lines)
    ? body.lines.map((line) => ({ item: line?.item, size: line?.size ?? null, qty: line?.qty }))
    : Array.isArray(body.items)
      ? [...new Set(body.items)].map((item) => ({
          item,
          size: item === 'shirt' ? body.shirt_size : item === 'socks' ? body.sock_size : null,
          qty: 1,
          legacy: true as const,
        }))
      : [];
  if (raw.length > MAX_LINES) return 'Too many lines in one order';

  const merged = new Map<string, OrderLine>();
  for (const line of raw) {
    const { item, qty } = line;
    if (typeof item !== 'string' || !Object.hasOwn(LIVE_PRODUCT_IDS, item)) {
      // the lab pages' old checkbox lists could carry junk; those were always ignored
      if (line.legacy) continue;
      return 'Unknown item';
    }
    if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > MAX_QTY) {
      return `Quantity must be 1–${MAX_QTY}`;
    }
    const sizes = SIZES[item];
    let size: string | null = null;
    if (sizes) {
      if (typeof line.size === 'string' && sizes.has(line.size)) size = line.size;
      // the lab pages never required a size; anything else must pick one
      else if (!line.legacy) return `Pick a size for the ${item}`;
    }
    const key = `${item}:${size ?? ''}`;
    const total = (merged.get(key)?.qty ?? 0) + (qty as number);
    if (total > MAX_QTY) return `Quantity must be 1–${MAX_QTY}`;
    merged.set(key, { item, size, qty: total });
  }
  return [...merged.values()];
};

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

  let body: {
    lines?: unknown;
    name?: unknown;
    items?: unknown;
    email?: unknown;
    shirt_size?: unknown;
    sock_size?: unknown;
    return_path?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid request', { status: 400 });
  }

  const lines = orderLines(body);
  if (typeof lines === 'string') return new Response(lines, { status: 400 });
  if (!lines.length) return new Response('Select at least one item', { status: 400 });

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const returnPath =
    typeof body.return_path === 'string' && RETURN_PATHS.has(body.return_path) ? body.return_path : '/preorder';

  // e.g. "2× shirt (M), 1× shirt (L), 1× tote", for the Dashboard and the fulfilment list
  const orderSummary = lines
    .map(({ item, size, qty }) => `${qty}× ${item}${size ? ` (${size})` : ''}`)
    .join(', ')
    .slice(0, 500); // Stripe metadata values max out at 500 characters
  // name: from the /preorder form, for the pickup list in Notion (Stripe's billing name may
  // be someone else's card). lines: "shirt:M:2,tote::1", what the Notion webhook reads.
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const metadata = {
    items: orderSummary,
    lines: lines.map(({ item, size, qty }) => `${item}:${size ?? ''}:${qty}`).join(','),
    ...(name ? { name } : {}),
  };

  // Stripe gets one line per product; sizes ride along in the metadata above.
  const quantities = new Map<string, number>();
  for (const { item, qty } of lines) quantities.set(item, (quantities.get(item) ?? 0) + qty);

  // TODO(stripe): set mode to "subscription" if selling recurring products
  // (and then add payment_method_collection: 'always').
  const mode = 'payment';

  try {
    const prices = await getStripePrices();
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'form',
      mode,
      line_items: [...quantities].map(([item, quantity]) => ({ price: prices[item].id, quantity })),
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
