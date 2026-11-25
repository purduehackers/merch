import type Stripe from "stripe";
import { confirmOrderByEmail } from "./order-confirmation";
import { PLUTO_MERCH_INTEGRATION, plutoFetch, readCatalog, type PlutoConnection } from "./pluto";

/**
 * Email the confirmation of one paid checkout, but only when Pluto confirms that it belongs to this
 * store's sale. The Stripe account serves other Pluto sales, and the store's key reads only the
 * sessions of its own sale. Both webhooks call this, and the delivery claims send at most one email.
 * Returns false when there is nothing to send. Throws when the webhook must ask for a retry.
 */
export async function emailPaidOrder(
  pluto: PlutoConnection,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  resendKey: string | undefined,
) {
  if (session.payment_status !== "paid" || session.metadata?.integration !== PLUTO_MERCH_INTEGRATION) return false;
  const owned = await plutoFetch(pluto, `/api/v1/payment-sessions/${encodeURIComponent(session.id)}`);
  if (owned.status === 404) return false;
  if (!owned.ok) throw new Error(`Pluto session lookup failed (HTTP ${owned.status})`);
  const status: unknown = await owned.json();
  if (!status || typeof status !== "object" || !("payment_status" in status) || status.payment_status !== "paid")
    return false;
  const catalog = await readCatalog(pluto);
  await confirmOrderByEmail(stripe, session, catalog, resendKey);
  return true;
}
