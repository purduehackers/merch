// Writes paid orders into the pickup database in Notion, and keeps a per-day totals database
// in step with it. Server-only: NOTION_TOKEN must never reach the browser. Same API version as
// /api/notify (the sign-up list), which is a different database again.
import { getSecret } from "astro:env/server";
import { ORDER_SCHEMA, TOTALS_SCHEMA, dayTotals, orderDay, orderProperties, totalsProperties } from "./order-notion";

const NOTION_VERSION = "2022-06-28";

type Session = Parameters<typeof orderProperties>[0];
type Page = { id: string; created_time: string; properties: Parameters<typeof dayTotals>[0][number]["properties"] };

const notion = async <T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  const token = getSecret("NOTION_TOKEN");
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
  if (!response.ok) throw new Error(`Notion ${init.method ?? "GET"} ${path}: ${response.status}`);
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

/**
 * Rows that should be one row (the same order, or the same day's totals) but were written
 * twice at the same moment, e.g. by two server instances: keeps the oldest and moves the rest
 * to Notion's trash. Oldest by creation time, then ID, so every writer keeps the same row.
 */
const keepOldest = async (rows: Page[]) => {
  const [keep, ...extra] = [...rows].sort(
    (a, b) => a.created_time.localeCompare(b.created_time) || a.id.localeCompare(b.id),
  );
  await Promise.all(extra.map((row) => notion(`pages/${row.id}`, { method: "PATCH", body: { archived: true } })));
  return keep;
};

// One order at a time per server instance. Stripe can deliver an event twice at once, and two
// orders can land together; run side by side, each would miss the other's rows and write a
// duplicate. keepOldest covers the same race across instances.
let queue: Promise<unknown> = Promise.resolve();
const oneAtATime = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

/**
 * Adds the order to the pickup database unless it's already there. Stripe can send the same
 * event more than once, so the Stripe session ID is checked first. Returns false for a repeat.
 */
const recordOrder = async (session: Session, databaseId: string) => {
  const title = await prepare(databaseId, ORDER_SCHEMA);
  const bySession = { property: "Stripe session", rich_text: { equals: session.id } };

  const existing = await queryAll(databaseId, bySession);
  if (existing.length) {
    if (existing.length > 1) await keepOldest(existing);
    return false;
  }

  await notion("pages", {
    method: "POST",
    body: { parent: { database_id: databaseId }, properties: orderProperties(session, title) },
  });
  // the same event may have been written at this moment on another server instance
  const rows = await queryAll(databaseId, bySession);
  if (rows.length > 1) await keepOldest(rows);
  return true;
};

/** Recompute a day's totals from pickup rows, including the latest paid order during indexing delays. */
const updateDayTotals = async (session: Session, databaseId: string, totalsId: string) => {
  const day = orderDay(session);

  const [orders, title] = await Promise.all([
    queryAll(databaseId, { property: "Ordered", date: { equals: day } }),
    prepare(totalsId, TOTALS_SCHEMA),
  ]);
  const properties = totalsProperties(day, dayTotals(orders, session), title);

  const byDay = { property: title, title: { equals: day } };
  const rows = await queryAll(totalsId, byDay);
  if (rows.length) {
    const row = await keepOldest(rows);
    await notion(`pages/${row.id}`, { method: "PATCH", body: { properties } });
    return;
  }
  await notion("pages", { method: "POST", body: { parent: { database_id: totalsId }, properties } });
  // the day's first two orders may have come in together on two server instances
  const made = await queryAll(totalsId, byDay);
  if (made.length > 1) {
    const row = await keepOldest(made);
    await notion(`pages/${row.id}`, { method: "PATCH", body: { properties } });
  }
};

/**
 * Records a paid order in the pickup database (unless it's already there) and recounts its
 * day in the totals database. Returns false for an order that was already recorded; its day is
 * recounted anyway, so a retry finishes totals that failed the first time.
 */
export const recordPaidOrder = (session: Session, databaseId: string, totalsId?: string) =>
  oneAtATime(async () => {
    const added = await recordOrder(session, databaseId);
    if (totalsId) await updateDayTotals(session, databaseId, totalsId);
    return added;
  });
