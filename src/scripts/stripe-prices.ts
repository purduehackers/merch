import { getSecret } from "astro:env/server";
import type Stripe from "stripe";
import { stripeConfig, type ProductIds } from "./stripe-products";

type PriceList = Record<string, { id: string; amount: number }>;

const CACHE_MS = 5 * 60 * 1000;
let cache: { expires: number; prices: Promise<PriceList>; products: ProductIds } | undefined;

function usdUnitPrice(product: Stripe.Product) {
  const price = product.default_price;
  if (!product.active || !price || typeof price === "string" || !price.active) return null;
  if (price.type !== "one_time" || price.currency !== "usd") return null;

  const amount = price.unit_amount;
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0) return null;
  if (Number(price.unit_amount_decimal ?? amount) !== amount) return null;
  return { id: price.id, amount };
}

export function getStripePrices(stripe: Stripe, products: ProductIds): Promise<PriceList> {
  if (cache && cache.expires > Date.now() && cache.products === products) return cache.prices;

  const prices = Promise.all(Object.entries(products).map(async ([item, id]) => {
    const product = await stripe.products.retrieve(id, { expand: ["default_price"] });
    const price = usdUnitPrice(product);
    if (!price) throw new Error(`Invalid one-time USD price for ${item}`);
    return [item, price] as const;
  })).then(Object.fromEntries);
  cache = { expires: Date.now() + CACHE_MS, prices, products };
  prices.catch(() => { if (cache?.prices === prices) cache = undefined; });
  return prices;
}

/** Pages display dollars. Checkout compares and charges the integer cents returned by Stripe. */
export async function getPriceAmounts(): Promise<Record<string, number>> {
  const { stripe, productIds } = stripeConfig(getSecret);
  if (!stripe) return {};
  try {
    const prices = await getStripePrices(stripe, productIds);
    return Object.fromEntries(Object.entries(prices).map(([item, price]) => [item, price.amount / 100]));
  } catch {
    console.error("Could not load merchandise prices");
    return {};
  }
}
