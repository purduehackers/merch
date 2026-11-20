import { SHIRT_SIZES, SOCK_SIZES } from "./preorder-lab/body.ts";

/** product → its sizes, in the order the site shows them. No sizes: one column. */
export const COLUMNS: { item: string; label: string; sizes: string[] }[] = [
  { item: "shirt", label: "Shirt", sizes: SHIRT_SIZES },
  { item: "tote", label: "Tote", sizes: [] },
  { item: "socks", label: "Socks", sizes: SOCK_SIZES },
  { item: "keychain", label: "Keychain", sizes: [] },
];

/** one column per product + size: "Shirt M", "Tote", … */
export const quantityColumns = COLUMNS.flatMap(({ label, sizes }) =>
  sizes.length ? sizes.map((size) => `${label} ${size}`) : [label],
);

const quantitySchema = Object.fromEntries(
  quantityColumns.map((name) => [name, { number: { format: "number" } }]),
);

/** The database's columns besides its title (the buyer's name), as Notion property schemas. */
export const ORDER_SCHEMA: Record<string, unknown> = {
  Email: { email: {} },
  Items: { rich_text: {} },
  ...quantitySchema,
  Total: { number: { format: "dollar" } },
  Ordered: { date: {} },
  "Picked up": { checkbox: {} },
  "Stripe session": { rich_text: {} },
};

export type OrderLine = { item: string; size: string | null; qty: number };

/**
 * The order's lines from the session metadata. `lines` ("shirt:M:2,tote::1") is what
 * /api/checkout writes; `items` ("2× shirt (M), 1× tote") is the readable summary, used for
 * older sessions, including single-unit orders that did not include a quantity.
 */
export const orderLines = (metadata: Record<string, string> | null | undefined): OrderLine[] => {
  if (metadata?.lines) {
    return metadata.lines
      .split(",")
      .map((part) => part.split(":"))
      .filter((bits) => bits.length === 3)
      .map(([item, size, qty]) => ({ item, size: size || null, qty: Number(qty) }))
      .filter((line) => line.item && Number.isInteger(line.qty) && line.qty > 0);
  }
  return (metadata?.items ?? "")
    .split(",")
    .map((part) => part.trim().match(/^(?:(\d+)× )?([a-z]+)(?: \(([A-Z]+)\))?$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, qty = "1", item, size]) => ({ item, size: size ?? null, qty: Number(qty) }));
};

/** the readable summary for the Items column */
export const itemsText = (lines: OrderLine[]) =>
  lines.map(({ qty, item, size }) => `${qty}× ${item}${size ? ` (${size})` : ""}`).join(", ");

export type OrderSession = {
  id: string;
  created: number;
  amount_total: number | null;
  metadata?: Record<string, string> | null;
  customer_details?: { name?: string | null; email?: string | null } | null;
  customer_email?: string | null;
};

const text = (content: string) => ({ rich_text: content ? [{ text: { content: content.slice(0, 2000) } }] : [] });

const TIME_ZONE = "America/Indiana/Indianapolis";

/** the day the order was placed (YYYY-MM-DD), on Purdue's clock */
export const orderDay = (session: Pick<OrderSession, "created">, timeZone = TIME_ZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(session.created * 1000),
  );

function countQuantities(lines: OrderLine[]) {
  const quantities: Record<string, number> = Object.fromEntries(quantityColumns.map((name) => [name, 0]));
  for (const { item, size, qty } of lines) {
    const product = COLUMNS.find((p) => p.item === item);
    if (!product) continue;
    if (!product.sizes.length) quantities[product.label] += qty;
    else if (size && product.sizes.includes(size)) quantities[`${product.label} ${size}`] += qty;
  }
  return quantities;
}

const quantityProperties = (quantities: Record<string, number>) =>
  Object.fromEntries(Object.entries(quantities).map(([column, qty]) => [column, { number: qty }]));

/** Notion page properties for one order. `titleProperty` is whatever the database calls its title. */
export const orderProperties = (session: OrderSession, titleProperty: string, timeZone = TIME_ZONE) => {
  const lines = orderLines(session.metadata);
  const name = session.metadata?.name || session.customer_details?.name || "(no name)";
  const email = session.customer_details?.email || session.customer_email || null;

  return {
    [titleProperty]: { title: [{ text: { content: name.slice(0, 2000) } }] },
    Email: { email },
    Items: text(itemsText(lines)),
    ...quantityProperties(countQuantities(lines)),
    Total: { number: session.amount_total != null ? session.amount_total / 100 : null },
    Ordered: { date: { start: orderDay(session, timeZone) } },
    "Picked up": { checkbox: false },
    "Stripe session": text(session.id),
  };
};

/** The totals database's columns besides its title (the day, as YYYY-MM-DD). */
export const TOTALS_SCHEMA: Record<string, unknown> = {
  Date: { date: {} },
  Orders: { number: { format: "number" } },
  ...quantitySchema,
  Revenue: { number: { format: "dollar" } },
};

type DayTotals = { orders: number; quantities: Record<string, number>; revenue: number };

export type PickupRow = {
  properties: Record<string, { number?: number | null; rich_text?: { plain_text: string }[] }>;
};

/** Include the incoming order even if Notion has not indexed it yet. Count each Stripe session once. */
export const dayTotals = (
  rows: PickupRow[],
  latest: Pick<OrderSession, "id" | "metadata" | "amount_total">,
): DayTotals => {
  const totals = {
    orders: 1,
    quantities: countQuantities(orderLines(latest.metadata)),
    revenue: (latest.amount_total ?? 0) / 100,
  };
  const counted = new Set([latest.id]);
  for (const row of rows) {
    const session = row.properties["Stripe session"]?.rich_text?.map((t) => t.plain_text).join("") ?? "";
    // rows added by hand have no session: each is its own order
    if (session && counted.has(session)) continue;
    if (session) counted.add(session);
    totals.orders += 1;
    for (const column of quantityColumns) totals.quantities[column] += row.properties[column]?.number ?? 0;
    totals.revenue += row.properties.Total?.number ?? 0;
  }
  return totals;
};

/** Notion page properties for a day's row in the totals database */
export const totalsProperties = (day: string, totals: DayTotals, titleProperty: string) => ({
  [titleProperty]: { title: [{ text: { content: day } }] },
  Date: { date: { start: day } },
  Orders: { number: totals.orders },
  ...quantityProperties(totals.quantities),
  Revenue: { number: Math.round(totals.revenue * 100) / 100 },
});
