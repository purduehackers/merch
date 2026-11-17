// Turns a paid Stripe Checkout Session into a row for the pickup database in Notion.
// Pure functions only (no imports), so they're easy to test; notion.ts does the requests.

/** product → its sizes, in the order the site shows them. No sizes: one column. */
export const COLUMNS: { item: string; label: string; sizes: string[] }[] = [
  { item: "shirt", label: "Shirt", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
  { item: "tote", label: "Tote", sizes: [] },
  { item: "socks", label: "Socks", sizes: ["S", "M", "L", "XL"] },
  { item: "keychain", label: "Keychain", sizes: [] },
];

/** one column per product + size: "Shirt M", "Tote", … */
export const quantityColumns = () =>
  COLUMNS.flatMap(({ label, sizes }) => (sizes.length ? sizes.map((size) => `${label} ${size}`) : [label]));

const columnFor = (item: string, size: string | null) => {
  const product = COLUMNS.find((c) => c.item === item);
  if (!product) return null;
  if (!product.sizes.length) return product.label;
  return size && product.sizes.includes(size) ? `${product.label} ${size}` : null;
};

/** The database's columns besides its title (the buyer's name), as Notion property schemas. */
export const ORDER_SCHEMA: Record<string, unknown> = {
  Email: { email: {} },
  Items: { rich_text: {} },
  ...Object.fromEntries(quantityColumns().map((name) => [name, { number: { format: "number" } }])),
  Total: { number: { format: "dollar" } },
  Ordered: { date: {} },
  "Picked up": { checkbox: {} },
  "Stripe session": { rich_text: {} },
};

export type OrderLine = { item: string; size: string | null; qty: number };

/**
 * The order's lines from the session metadata. `lines` ("shirt:M:2,tote::1") is what
 * /api/checkout writes; `items` ("2× shirt (M), 1× tote") is the readable summary, used for
 * sessions made before `lines` existed.
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
    .map((part) => part.trim().match(/^(\d+)× ([a-z ]+?)(?: \(([A-Z]+)\))?$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, qty, item, size]) => ({ item, size: size ?? null, qty: Number(qty) }));
};

/** the readable summary for the Items column */
export const itemsText = (lines: OrderLine[]) =>
  lines.map(({ qty, item, size }) => `${qty}× ${item}${size ? ` (${size})` : ""}`).join(", ");

type Session = {
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
export const orderDay = (session: Pick<Session, "created">, timeZone = TIME_ZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(session.created * 1000),
  );

/** how many of each column one order holds, plus its total in dollars */
export const orderCounts = (session: Pick<Session, "metadata" | "amount_total">) => {
  const quantities: Record<string, number> = Object.fromEntries(quantityColumns().map((name) => [name, 0]));
  for (const line of orderLines(session.metadata)) {
    const column = columnFor(line.item, line.size);
    if (column) quantities[column] += line.qty;
  }
  return { quantities, total: session.amount_total != null ? session.amount_total / 100 : 0 };
};

/** Notion page properties for one order. `titleProperty` is whatever the database calls its title. */
export const orderProperties = (session: Session, titleProperty: string, timeZone = TIME_ZONE) => {
  const lines = orderLines(session.metadata);
  const { quantities } = orderCounts(session);
  const name = session.metadata?.name || session.customer_details?.name || "(no name)";
  const email = session.customer_details?.email || session.customer_email || null;
  // Notion groups rows by this day, and the totals database keys on it
  const ordered = orderDay(session, timeZone);

  return {
    [titleProperty]: { title: [{ text: { content: name.slice(0, 2000) } }] },
    Email: { email },
    Items: text(itemsText(lines)),
    ...Object.fromEntries(Object.entries(quantities).map(([column, qty]) => [column, { number: qty }])),
    Total: { number: session.amount_total != null ? session.amount_total / 100 : null },
    Ordered: { date: { start: ordered } },
    "Picked up": { checkbox: false },
    "Stripe session": text(session.id),
  };
};

// ---------- the totals database: one row per day ----------

/** The totals database's columns besides its title (the day, as YYYY-MM-DD). */
export const TOTALS_SCHEMA: Record<string, unknown> = {
  Date: { date: {} },
  Orders: { number: { format: "number" } },
  ...Object.fromEntries(quantityColumns().map((name) => [name, { number: { format: "number" } }])),
  Revenue: { number: { format: "dollar" } },
};

export type DayTotals = { orders: number; quantities: Record<string, number>; revenue: number };

type NotionProperty = { type: string; number?: number | null };

/**
 * Adds up a day's orders, given their rows in the pickup database (as Notion returns them)
 * and the order that just came in. The new order is counted from the session rather than its
 * row, since Notion's query can lag a moment behind a page it just created; its row, if the
 * query did return it, is skipped by session ID so it isn't counted twice.
 */
export const dayTotals = (
  rows: { properties: Record<string, NotionProperty & { rich_text?: { plain_text: string }[] }> }[],
  latest: Pick<Session, "id" | "metadata" | "amount_total">,
): DayTotals => {
  const own = orderCounts(latest);
  const totals: DayTotals = { orders: 1, quantities: { ...own.quantities }, revenue: own.total };
  for (const row of rows) {
    const session = row.properties["Stripe session"]?.rich_text?.map((t) => t.plain_text).join("") ?? "";
    if (session === latest.id) continue;
    totals.orders += 1;
    for (const column of quantityColumns()) totals.quantities[column] += row.properties[column]?.number ?? 0;
    totals.revenue += row.properties.Total?.number ?? 0;
  }
  return totals;
};

/** Notion page properties for a day's row in the totals database */
export const totalsProperties = (day: string, totals: DayTotals, titleProperty: string) => ({
  [titleProperty]: { title: [{ text: { content: day } }] },
  Date: { date: { start: day } },
  Orders: { number: totals.orders },
  ...Object.fromEntries(Object.entries(totals.quantities).map(([column, qty]) => [column, { number: qty }])),
  Revenue: { number: Math.round(totals.revenue * 100) / 100 },
});
