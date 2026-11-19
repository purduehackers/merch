import Stripe from "stripe";
import type { ProductId } from "./preorder-items-data";

export type ProductIds = Record<ProductId, string>;
type ReadEnv = (name: string) => string | undefined;

const LIVE_PRODUCTS: ProductIds = {
  shirt: "prod_Vaulcr0fm8NYr0",
  tote: "prod_VawBkIacKQkGEs",
  socks: "prod_VawdBlwiG3Z01d",
  keychain: "prod_VawdPvdJRso8o7",
};

const SANDBOX_PRODUCTS: ProductIds = {
  shirt: "prod_VawnYbd6WxNEpa",
  tote: "prod_VawnUNaH8qJvTA",
  socks: "prod_VawnrDC9JO1L9e",
  keychain: "prod_VawnV1qVOQVJqN",
};

export function stripeConfig(get: ReadEnv) {
  const live = get("VERCEL_ENV") === "production";
  const mode = live ? "live" : "test";
  const secretKey = (!live && get("STRIPE_SECRET_TEST_KEY")) || get("STRIPE_RESTRICTED_KEY") || get("STRIPE_SECRET_KEY") || "";
  const publicKey = (!live && get("PUBLIC_STRIPE_TEST_KEY")) || get("PUBLIC_STRIPE_PUBLISHABLE_KEY") || "";
  const webhookSecret = (!live && get("STRIPE_WEBHOOK_TEST_SECRET")) || get("STRIPE_WEBHOOK_SECRET");
  const validSecret = secretKey.startsWith(`rk_${mode}_`) || secretKey.startsWith(`sk_${mode}_`);

  return {
    live,
    stripe: validSecret ? new Stripe(secretKey, { maxNetworkRetries: 2 }) : null,
    publishableKey: publicKey.startsWith(`pk_${mode}_`) ? publicKey : null,
    webhookSecret: webhookSecret?.startsWith("whsec_") ? webhookSecret : null,
    productIds: live ? LIVE_PRODUCTS : SANDBOX_PRODUCTS,
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
