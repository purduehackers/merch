import type Stripe from "stripe";
import { lineKey, MAX_QTY } from "./cart.ts";
import { COLUMNS, itemsText, type OrderLine } from "./order-notion.ts";
import type { ProductIds } from "./stripe-products.ts";

const MERCH_INTEGRATION = "purdue_hackers_merch";
const UUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseOrder(input: unknown) {
  if (!isObject(input)) return "Invalid order";
  const { attempt, expected_total: expectedTotal } = input;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) return "Enter a pickup name";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  if (typeof attempt !== "string" || !UUID.test(attempt)) return "Invalid checkout attempt";
  if (typeof expectedTotal !== "number" || !Number.isSafeInteger(expectedTotal) || expectedTotal <= 0)
    return "Invalid order total";

  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 20) return "Select 1–20 items";
  const merged = new Map<string, OrderLine>();
  for (const line of input.lines) {
    if (!isObject(line)) return "Invalid cart item";
    const product = COLUMNS.find(({ item }) => item === line.item);
    if (!product) return "Unknown item";
    const size = line.size ?? null;
    if (product.sizes.length) {
      if (typeof size !== "string" || !product.sizes.includes(size)) return `Pick a size for the ${product.item}`;
    } else if (size !== null) {
      return `The ${product.item} has one size`;
    }
    if (typeof line.qty !== "number" || !Number.isInteger(line.qty) || line.qty < 1) return "Invalid quantity";
    const key = lineKey({ item: product.item, size });
    const qty = (merged.get(key)?.qty ?? 0) + line.qty;
    if (qty > MAX_QTY) return `Quantity must be 1–${MAX_QTY}`;
    merged.set(key, { item: product.item, size, qty });
  }
  const lines = [...merged.values()];
  const metadata = {
    integration: MERCH_INTEGRATION,
    name,
    items: itemsText(lines),
    lines: lines.map(({ item, size, qty }) => `${item}:${size ?? ""}:${qty}`).join(","),
  };
  return { attempt, expectedTotal, email, lines, metadata };
}

export function paymentState(session: Stripe.Checkout.Session) {
  if (session.payment_status === "paid") return "paid";
  if (session.status === "expired") return "expired";
  if (session.status !== "complete") return "open";
  const intent = session.payment_intent;
  if (intent && typeof intent !== "string" &&
      (intent.status === "requires_payment_method" || intent.status === "canceled")) return "failed";
  return "pending";
}

/** Verify older, untagged sessions by their Stripe product IDs before reading them or fulfilling them. */
export async function isMerchSession(session: Stripe.Checkout.Session, live: boolean, products: ProductIds, stripe: Stripe) {
  if (session.livemode !== live || session.mode !== "payment" || session.currency !== "usd") return false;
  if (session.metadata?.integration) return session.metadata.integration === MERCH_INTEGRATION;
  if (!session.metadata?.items) return false;
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  const allowed = Object.values(products);
  return items.data.length > 0 && !items.has_more && items.data.every(({ price }) =>
    typeof price?.product === "string" && allowed.includes(price.product));
}
