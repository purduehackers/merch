import { getSecret } from "astro:env/server";
import {
  ORDER_SCHEMA, TOTALS_SCHEMA, dayTotals, orderDay, orderProperties, totalsProperties,
  type OrderSession, type PickupRow,
} from "./order-notion";

const NOTION_VERSION = "2022-06-28";

type Page = PickupRow & { id: string; created_time: string };

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

async function prepareSchema(databaseId: string, schema: Record<string, unknown>) {
  const path = `databases/${databaseId}`;
  const { properties } = await notion<{ properties: Record<string, { type: string }> }>(path);
  const missing = Object.fromEntries(Object.entries(schema).filter(([name]) => !(name in properties)));
  if (Object.keys(missing).length) await notion(path, { method: "PATCH", body: { properties: missing } });

  return Object.keys(properties).find((name) => properties[name].type === "title") ?? "Name";
}

// Share pending schema setup across requests. A failed setup may be retried.
const titleColumns = new Map<string, Promise<string>>();

function prepare(databaseId: string, schema: Record<string, unknown>) {
  const cached = titleColumns.get(databaseId);
  if (cached) return cached;
  const title = prepareSchema(databaseId, schema);
  titleColumns.set(databaseId, title);
  title.catch(() => titleColumns.delete(databaseId));
  return title;
}

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

/** Concurrent instances keep the same row by breaking creation-time ties with the page ID. */
const keepOldest = async (rows: Page[]) => {
  const [keep, ...extra] = [...rows].sort(
    (a, b) => a.created_time.localeCompare(b.created_time) || a.id.localeCompare(b.id),
  );
  await Promise.all(extra.map((row) => notion(`pages/${row.id}`, { method: "PATCH", body: { archived: true } })));
  return keep;
};

const recordOrder = async (session: OrderSession, databaseId: string) => {
  const title = await prepare(databaseId, ORDER_SCHEMA);
  const bySession = { property: "Stripe session", rich_text: { equals: session.id } };

  let rows = await queryAll(databaseId, bySession);
  if (!rows.length) {
    await notion("pages", {
      method: "POST",
      body: { parent: { database_id: databaseId }, properties: orderProperties(session, title) },
    });
    rows = await queryAll(databaseId, bySession);
  }
  if (rows.length > 1) await keepOldest(rows);
};

/** Recompute a day's totals from pickup rows, including the latest paid order during indexing delays. */
const updateDayTotals = async (session: OrderSession, databaseId: string, totalsId: string) => {
  const day = orderDay(session);

  const [orders, title] = await Promise.all([
    queryAll(databaseId, { property: "Ordered", date: { equals: day } }),
    prepare(totalsId, TOTALS_SCHEMA),
  ]);
  const properties = totalsProperties(day, dayTotals(orders, session), title);

  const byDay = { property: title, title: { equals: day } };
  let rows = await queryAll(totalsId, byDay);
  if (!rows.length) {
    await notion("pages", { method: "POST", body: { parent: { database_id: totalsId }, properties } });
    rows = await queryAll(totalsId, byDay);
    if (rows.length < 2) return;
  }
  const row = await keepOldest(rows);
  await notion(`pages/${row.id}`, { method: "PATCH", body: { properties } });
};

let queue = Promise.resolve();

/** A failed write is retriable. A repeated order still recounts totals if a previous attempt stopped there. */
export function recordPaidOrder(session: OrderSession, databaseId: string, totalsId?: string) {
  const write = queue.then(async () => {
    await recordOrder(session, databaseId);
    if (totalsId) await updateDayTotals(session, databaseId, totalsId);
  });
  queue = write.catch(() => {});
  return write;
}
