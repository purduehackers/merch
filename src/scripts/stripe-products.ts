// Stripe config per mode. Products and keys exist separately in live and test mode.
// Mode: STRIPE_MODE ("test" | "live") if set, otherwise test on the dev server
// and live in production builds. Each product's default Price in Stripe is what
// the site shows and charges (see stripe-prices.ts).

export const LIVE_PRODUCT_IDS: Record<string, string> = {
  shirt: 'prod_Vaulcr0fm8NYr0',
  tote: 'prod_VawBkIacKQkGEs',
  socks: 'prod_VawdBlwiG3Z01d',
  keychain: 'prod_VawdPvdJRso8o7',
};

export const TEST_PRODUCT_IDS: Record<string, string> = {
  shirt: 'prod_VawnYbd6WxNEpa',
  tote: 'prod_VawnUNaH8qJvTA',
  socks: 'prod_VawnrDC9JO1L9e',
  keychain: 'prod_VawnV1qVOQVJqN',
};

export type StripeMode = 'test' | 'live';

export const stripeMode = (): StripeMode => {
  const mode = import.meta.env.STRIPE_MODE;
  if (mode === 'test' || mode === 'live') return mode;
  return import.meta.env.DEV ? 'test' : 'live';
};

export const stripeConfig = (mode: StripeMode = stripeMode()) =>
  mode === 'test'
    ? {
        mode,
        secretKey: import.meta.env.STRIPE_SECRET_TEST_KEY as string | undefined,
        publishableKey: import.meta.env.PUBLIC_STRIPE_TEST_KEY as string | undefined,
        productIds: TEST_PRODUCT_IDS,
      }
    : {
        mode,
        secretKey: import.meta.env.STRIPE_SECRET_KEY as string | undefined,
        publishableKey: import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined,
        productIds: LIVE_PRODUCT_IDS,
      };
