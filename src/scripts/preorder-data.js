// Prices come from Stripe: pages render them with <PriceData> and scripts read them here.

/** @returns {Record<string, number>} item id → price in dollars */
export function readPrices(doc = document) {
  try {
    return JSON.parse(doc.getElementById("item-prices")?.textContent || "{}");
  } catch {
    return {};
  }
}
