import { getSecret } from "astro:env/server";
import type Stripe from "stripe";
import { stripeConfig, type ProductIds } from "./stripe-products";

type StripePrice = { id: string; amount: number };
type PriceList = Record<string, StripePrice>;

const CACHE_MS = 5 * 60 * 1000;
let cache: { expires: number; prices: Promise<PriceList>; products: ProductIds } | undefined;

export function getStripePrices(stripe: Stripe, products: ProductIds): Promise<PriceList> {
  if (cache && cache.expires > Date.now() && cache.products === products) return cache.prices;

  const prices = Promise.all(Object.entries(products).map(async ([item, id]) => {
    const product = await stripe.products.retrieve(id, { expand: ["default_price"] });
    const price = product.default_price;
    if (!product.active || !price || typeof price === "string" || !price.active ||
        price.type !== "one_time" || price.currency !== "usd" || price.unit_amount == null ||
        !Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0 ||
        Number(price.unit_amount_decimal ?? price.unit_amount) !== price.unit_amount) {
      throw new Error(`Invalid one-time USD price for ${item}`);
    }
    return [item, { id: price.id, amount: price.unit_amount }] as const;
  })).then((entries) => Object.fromEntries(entries));
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
