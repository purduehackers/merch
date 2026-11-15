// Server-only: each item's default Price from Stripe, for the current mode.
// Stripe is the source of truth for what items cost; set the price on the
// product in the Dashboard (Product → default price).
import Stripe from 'stripe';
import { stripeConfig } from './stripe-products';

export type StripePrice = { id: string; amount: number; currency: string };

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; prices: Promise<Record<string, StripePrice>> } | null = null;

async function fetchPrices(): Promise<Record<string, StripePrice>> {
  const config = stripeConfig();
  if (!config.secretKey) throw new Error('Stripe is not configured');
  const stripe = new Stripe(config.secretKey, { apiVersion: '2026-10-28.endive' });

  const entries = await Promise.all(
    Object.entries(config.productIds).map(async ([item, productId]) => {
      const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
      const price = product.default_price;
      if (!price || typeof price === 'string' || price.unit_amount == null) {
        throw new Error(`Stripe product ${productId} (${item}) has no default price`);
      }
      return [item, { id: price.id, amount: price.unit_amount / 100, currency: price.currency }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Item id → default Stripe price, cached for a few minutes. Rejects if any item has no price. */
export function getStripePrices(): Promise<Record<string, StripePrice>> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const prices = fetchPrices();
    cache = { at: Date.now(), prices };
    // don't keep a failed lookup around; retry on the next request
    prices.catch(() => {
      if (cache?.prices === prices) cache = null;
    });
  }
  return cache.prices;
}

/** Item id → price in dollars, or {} if Stripe can't be reached (the page renders without prices). */
export async function getPriceAmounts(): Promise<Record<string, number>> {
  try {
    const prices = await getStripePrices();
    return Object.fromEntries(Object.entries(prices).map(([item, price]) => [item, price.amount]));
  } catch (error) {
    console.error('Could not load Stripe prices:', error);
    return {};
  }
}
