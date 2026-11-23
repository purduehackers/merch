import { getSecret } from "astro:env/server";
import { plutoConnection, readCatalog } from "./pluto";

/** Pages display dollars. Checkout sends the integer cents that Pluto returned. */
export async function getPriceAmounts(): Promise<Record<string, number>> {
  const connection = plutoConnection(getSecret);
  if (!connection) return {};
  try {
    const prices = await readCatalog(connection);
    return Object.fromEntries(prices.map(({ sku, amount }) => [sku, amount / 100]));
  } catch {
    console.error("Could not load merchandise prices from Pluto");
    return {};
  }
}
