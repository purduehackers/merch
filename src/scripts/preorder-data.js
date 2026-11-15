// Prices come from Stripe: pages render them with <PriceData> and scripts read them here.
export function readPrices(doc = document) {
  try {
    return JSON.parse(doc.getElementById("item-prices")?.textContent || "{}");
  } catch {
    return {};
  }
}

export function selectedItems(values, prices) {
  return values
    .filter((value) => Object.hasOwn(prices, value))
    .map((name) => ({ name, price: prices[name] }));
}
