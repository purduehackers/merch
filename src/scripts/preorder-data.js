// Prices come from Stripe: pages render them with <PriceData> and scripts read them here.

/** @returns {Record<string, number>} item id → price in dollars */
export function readPrices(doc = document) {
  try {
    return JSON.parse(doc.getElementById("item-prices")?.textContent || "{}");
  } catch {
    return {};
  }
}

/**
 * @template {string} T
 * @param {T[]} values item ids
 * @param {Partial<Record<string, number>>} prices
 * @returns {{ name: T; price: number }[]} the ones that have a price
 */
export function selectedItems(values, prices) {
  return values
    .filter((value) => prices[value] != null)
    .map((name) => ({ name, price: /** @type {number} */ (prices[name]) }));
}
