// Writes paid orders into the pickup database in Notion, and keeps a per-day totals database
// in step with it. Server-only: NOTION_TOKEN must never reach the browser. Same API version as
// /api/notify (the sign-up list), which is a different database again.
import { ORDER_SCHEMA, TOTALS_SCHEMA, dayTotals, orderDay, orderProperties, totalsProperties } from "./order-notion";

const NOTION_VERSION = "2022-06-28";

type Session = Parameters<typeof orderProperties>[0];
type Page = { id: string; properties: Parameters<typeof dayTotals>[0][number]["properties"] };

const notion = async <T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  const token = import.meta.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set");
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`Notion ${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
};

// Per database, looked up once per server instance: its title column, after adding any of our
// columns it's missing (existing columns are never removed or changed).
const prepared = new Map<string, Promise<string>>();

const prepare = (databaseId: string, schema: Record<string, unknown>) => {
  let title = prepared.get(databaseId);
  if (!title) {
    title = (async () => {
      const database = await notion<{ properties: Record<string, { type: string }> }>(`databases/${databaseId}`);
      const missing = Object.fromEntries(Object.entries(schema).filter(([name]) => !(name in database.properties)));
      if (Object.keys(missing).length) {
        await notion(`databases/${databaseId}`, { method: "PATCH", body: { properties: missing } });
      }
      return Object.entries(database.properties).find(([, p]) => p.type === "title")?.[0] ?? "Name";
    })();
    title.catch(() => prepared.delete(databaseId)); // try again next time
    prepared.set(databaseId, title);
  }
  return title;
};

/** every row matching a filter (Notion returns at most 100 per request) */
const queryAll = async (databaseId: string, filter: unknown) => {
  const rows: Page[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion<{ results: Page[]; has_more: boolean; next_cursor: string | null }>(
      `databases/${databaseId}/query`,
      { method: "POST", body: { filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } },
    );
    rows.push(...page.results);
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return rows;
};

const ordersDatabase = () => {
  const id = import.meta.env.NOTION_ORDERS_DATABASE_ID;
  if (!id) throw new Error("NOTION_ORDERS_DATABASE_ID is not set");
  return id;
};

/**
 * Adds the order to the pickup database unless it's already there. Stripe can send the same
 * event more than once, so the Stripe session ID is checked first. Returns false for a repeat.
 */
export const recordOrder = async (session: Session) => {
  const databaseId = ordersDatabase();
  const title = await prepare(databaseId, ORDER_SCHEMA);

  const existing = await notion<{ results: unknown[] }>(`databases/${databaseId}/query`, {
    method: "POST",
    body: { filter: { property: "Stripe session", rich_text: { equals: session.id } }, page_size: 1 },
  });
  if (existing.results.length) return false;

  await notion("pages", {
    method: "POST",
    body: { parent: { database_id: databaseId }, properties: orderProperties(session, title) },
  });
  return true;
};

/**
 * Recounts the order's day from the pickup database and writes it to that day's row in the
 * totals database (making the row if it's the day's first order). Recounting rather than
 * adding on means a retried event or two orders at once can't throw the numbers off; the
 * latest order's day is always exact. Does nothing if NOTION_TOTALS_DATABASE_ID isn't set.
 */
export const updateDayTotals = async (session: Session) => {
  const totalsId = import.meta.env.NOTION_TOTALS_DATABASE_ID;
  if (!totalsId) return;
  const day = orderDay(session);

  const [orders, title] = await Promise.all([
    queryAll(ordersDatabase(), { property: "Ordered", date: { equals: day } }),
    prepare(totalsId, TOTALS_SCHEMA),
  ]);
  const properties = totalsProperties(day, dayTotals(orders, session), title);

  const [row] = await queryAll(totalsId, { property: title, title: { equals: day } });
  if (row) await notion(`pages/${row.id}`, { method: "PATCH", body: { properties } });
  else await notion("pages", { method: "POST", body: { parent: { database_id: totalsId }, properties } });
};
