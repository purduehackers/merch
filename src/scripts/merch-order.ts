import { lineKey, MAX_QTY } from "./cart.ts";
import { COLUMNS, type OrderLine } from "./order-lines.ts";
import { ONE_SIZE, RETURN_TARGET, type CheckoutLine } from "./pluto.ts";

const UUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export type Order = { attempt: string; expectedTotal: number; name: string; email: string; lines: OrderLine[] };

export function parseOrder(input: unknown): Order | string {
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
  return { attempt, expectedTotal, name, email, lines: [...merged.values()] };
}

/** Pluto's payment session request. Each store item is a sale SKU, and each size is its variant. */
export const paymentSession = (order: Order) => ({
  kind: "merch" as const,
  return_target: RETURN_TARGET,
  cart: {
    lines: order.lines.map(({ item, size, qty }) => ({ sku: item, variant: size ?? ONE_SIZE, quantity: qty })),
    expected_total_minor: order.expectedTotal,
    currency: "USD" as const,
    pickup_name: order.name,
    email: order.email,
  },
});

/** Convert Pluto's checkout lines back to the store's item and size. */
export const storeLines = (lines: CheckoutLine[]): OrderLine[] =>
  lines.map(({ sku, variant, quantity }) => ({
    item: sku,
    size: variant === ONE_SIZE ? null : variant,
    qty: quantity,
  }));

type CheckoutStatus = { session_status?: unknown; payment_status?: unknown };

/** Card checkouts stay open after a decline, so a complete but unpaid session is still processing. */
export function paymentState(status: CheckoutStatus) {
  if (status.payment_status === "paid") return "paid";
  if (status.session_status === "expired") return "expired";
  if (status.session_status !== "complete") return "open";
  return "pending";
}
