import Stripe from "stripe";

type ReadEnv = (name: string) => string | undefined;

/**
 * Stripe access for the confirmation-email webhook. Pluto creates and reads checkouts, so this key
 * only needs to read Checkout Sessions and their line items.
 */
export function stripeConfig(get: ReadEnv) {
  const live = get("VERCEL_ENV") === "production";
  const mode = live ? "live" : "test";
  const secretKey = (!live && get("STRIPE_SECRET_TEST_KEY")) || get("STRIPE_RESTRICTED_KEY") || get("STRIPE_SECRET_KEY") || "";
  const webhookSecret = (!live && get("STRIPE_WEBHOOK_TEST_SECRET")) || get("STRIPE_WEBHOOK_SECRET");
  const validSecret = secretKey.startsWith(`rk_${mode}_`) || secretKey.startsWith(`sk_${mode}_`);

  return {
    live,
    stripe: validSecret ? new Stripe(secretKey, { maxNetworkRetries: 2 }) : null,
    webhookSecret: webhookSecret?.startsWith("whsec_") ? webhookSecret : null,
  };
}

export function isStoreOrigin(origin: string, get: ReadEnv) {
  if (origin === get("APP_ORIGIN")) return true;

  const environment = get("VERCEL_ENV");
  const hosts = [get("VERCEL_URL"), get("VERCEL_BRANCH_URL")];
  if (environment === "production") {
    hosts.push("merch.purduehackers.com", "drops.purduehackers.com", get("VERCEL_PROJECT_PRODUCTION_URL"));
  }
  if (hosts.some((host) => host && origin === `https://${host}`)) return true;
  if (environment && environment !== "development") return false;
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}
