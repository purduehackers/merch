import assert from "node:assert/strict";
import test from "node:test";
import { ORDER_SCHEMA, TOTALS_SCHEMA, dayTotals, itemsText, orderDay, orderLines, orderProperties, quantityColumns, totalsProperties } from "./order-notion.ts";

test("orderLines reads the compact lines metadata", () => {
  assert.deepEqual(orderLines({ lines: "shirt:M:2,shirt:L:1,tote::3" }), [
    { item: "shirt", size: "M", qty: 2 },
    { item: "shirt", size: "L", qty: 1 },
    { item: "tote", size: null, qty: 3 },
  ]);
});

test("orderLines falls back to the readable items summary", () => {
  assert.deepEqual(orderLines({ items: "2× shirt (M), 1× tote, 4× socks (XL)" }), [
    { item: "shirt", size: "M", qty: 2 },
    { item: "tote", size: null, qty: 1 },
    { item: "socks", size: "XL", qty: 4 },
  ]);
  assert.deepEqual(orderLines(null), []);
});

test("every quantity column is in the schema as a number", () => {
  assert.equal(quantityColumns.length, 13);
  for (const column of quantityColumns) assert.deepEqual(ORDER_SCHEMA[column], { number: { format: "number" } });
});

test("orderProperties fills the row for one order", () => {
  const props = orderProperties(
    {
      id: "cs_test_123",
      created: Date.UTC(2026, 10, 17, 3, 30) / 1000, // 22:30 on the 16th in Indiana
      amount_total: 6500,
      metadata: { lines: "shirt:M:2,keychain::3", name: "Wack Hacker" },
      customer_details: { name: "Card Holder", email: "wack@example.com" },
    },
    "Name",
  );
  assert.deepEqual(props.Name, { title: [{ text: { content: "Wack Hacker" } }] });
  assert.deepEqual(props.Email, { email: "wack@example.com" });
  assert.equal(props.Items.rich_text[0].text.content, "2× shirt (M), 3× keychain");
  assert.equal(props["Shirt M"].number, 2);
  assert.equal(props["Shirt L"].number, 0);
  assert.equal(props.Keychain.number, 3);
  assert.equal(props.Total.number, 65);
  assert.deepEqual(props.Ordered, { date: { start: "2026-11-16" } });
  assert.deepEqual(props["Picked up"], { checkbox: false });
  assert.equal(props["Stripe session"].rich_text[0].text.content, "cs_test_123");
  // every property written exists in the schema (or is the title)
  for (const key of Object.keys(props)) assert.ok(key === "Name" || key in ORDER_SCHEMA, key);
});

test("billing name is the fallback when the form name is missing", () => {
  const props = orderProperties({ id: "cs_1", created: 0, amount_total: 500, metadata: { lines: "tote::1" }, customer_details: { name: "Card Holder" } }, "Order");
  assert.equal(props.Order.title[0].text.content, "Card Holder");
  assert.equal(itemsText([{ item: "tote", size: null, qty: 1 }]), "1× tote");
});

// a pickup-database row as Notion returns it
const row = (session, counts, total) => ({
  properties: {
    "Stripe session": { type: "rich_text", rich_text: [{ plain_text: session }] },
    Total: { type: "number", number: total },
    ...Object.fromEntries(quantityColumns.map((c) => [c, { type: "number", number: counts[c] ?? 0 }])),
  },
});

test("dayTotals adds the day's rows to the order that just came in", () => {
  const latest = { id: "cs_new", amount_total: 3500, metadata: { lines: "shirt:M:1,keychain::2" } };
  const totals = dayTotals([row("cs_a", { "Shirt M": 2, Tote: 1 }, 65), row("cs_b", { "Socks L": 3 }, 30)], latest);
  assert.equal(totals.orders, 3);
  assert.equal(totals.quantities["Shirt M"], 3);
  assert.equal(totals.quantities.Tote, 1);
  assert.equal(totals.quantities["Socks L"], 3);
  assert.equal(totals.quantities.Keychain, 2);
  assert.equal(totals.revenue, 130);
});

test("dayTotals doesn't count the new order twice when the query already returns its row", () => {
  const latest = { id: "cs_new", amount_total: 2500, metadata: { lines: "shirt:S:1" } };
  const totals = dayTotals([row("cs_new", { "Shirt S": 1 }, 25)], latest);
  assert.equal(totals.orders, 1);
  assert.equal(totals.quantities["Shirt S"], 1);
  assert.equal(totals.revenue, 25);
});

test("dayTotals counts a duplicated order once, and rows without a session each once", () => {
  const latest = { id: "cs_new", amount_total: 500, metadata: { lines: "keychain::1" } };
  const dupe = row("cs_a", { "Shirt L": 1 }, 25);
  const byHand = row("", { Tote: 1 }, 15);
  const totals = dayTotals([dupe, dupe, dupe, byHand, byHand], latest);
  assert.equal(totals.orders, 4);
  assert.equal(totals.quantities["Shirt L"], 1);
  assert.equal(totals.quantities.Tote, 2);
  assert.equal(totals.revenue, 60);
});

test("totalsProperties writes one day's row", () => {
  const props = totalsProperties("2026-11-16", { orders: 2, quantities: Object.fromEntries(quantityColumns.map((c) => [c, c === "Tote" ? 4 : 0])), revenue: 60.004 }, "Day");
  assert.deepEqual(props.Day, { title: [{ text: { content: "2026-11-16" } }] });
  assert.deepEqual(props.Date, { date: { start: "2026-11-16" } });
  assert.equal(props.Orders.number, 2);
  assert.equal(props.Tote.number, 4);
  assert.equal(props.Revenue.number, 60);
  for (const key of Object.keys(props)) assert.ok(key === "Day" || key in TOTALS_SCHEMA, key);
  assert.equal(orderDay({ created: Date.UTC(2026, 10, 17, 3, 30) / 1000 }), "2026-11-16");
});
