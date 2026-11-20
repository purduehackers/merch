import { BlobNotFoundError, del, head, put } from "@vercel/blob";
import type Stripe from "stripe";
import { ResendEmailRejection, sendOrderEmail } from "./resend-email";
import { prepareOrderEmail } from "./order-email";
import type { ProductIds } from "./stripe-products";

async function findMarker(path: string) {
  try {
    return await head(path);
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
    return null;
  }
}

export async function confirmOrderByEmail(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  productIds: ProductIds,
  apiKey: string | undefined,
) {
  // The store also hosts public artwork. Keep buyer data and Stripe session IDs out of it.
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session.id));
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  const path = `order-confirmations/${digest}`;
  if (await findMarker(`${path}/complete`)) return;
  if (!apiKey) throw new Error("Order email is not configured");

  const email = await prepareOrderEmail(stripe, session, productIds);
  const sending = `${path}/sending`;
  const previous = await findMarker(sending);
  const now = Date.now();
  if (previous) {
    const age = now - previous.uploadedAt.getTime();
    if (age < 60_000) throw new Error("Order email is in progress");
    // Resend retains idempotency keys for 24 hours. Keep one hour for clock skew and requests in flight.
    if (!Number.isFinite(age) || age >= 23 * 60 * 60_000) {
      console.error("Reconcile order confirmation with the email provider", { sessionId: session.id });
      throw new Error("Reconcile the previous order email before resending");
    }
  }
  const claim = previous ? null : await put(sending, String(now), { access: "public", allowOverwrite: false });
  let messageId: string;
  try {
    messageId = await sendOrderEmail(email, apiKey, `merch-preorder/${digest}`);
  } catch (error) {
    // Only release a new, explicitly rejected request before a replay can have started.
    if (claim && error instanceof ResendEmailRejection && Date.now() - now < 30_000) {
      await del(sending, { ifMatch: claim.etag });
    }
    throw error;
  }
  console.info("Merch confirmation queued", { sessionId: session.id, messageId });
  await put(`${path}/complete`, "queued", { access: "public", allowOverwrite: true });
}
