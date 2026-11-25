// Pluto owns this store's checkout. It reads prices from the sale catalog, creates the Stripe
// Checkout Session, records the paid order and tracks pickup. Every request uses the key of the
// sale's storefront app from the server; the browser never sees it.

type ReadEnv = (name: string) => string | undefined;

/** A storefront app key: its environment, 40 random characters and a 6-character checksum. */
const APP_KEYS = {
  live: /^pluto_sk_live_[0-9A-Za-z]{46}$/,
  test: /^pluto_sk_test_[0-9A-Za-z]{46}$/,
};

/**
 * Accept a storefront app key of this deployment's environment, or the former sale key.
 * Production accepts only live keys, so a test key cannot open checkout there. Pluto checks the checksum.
 * Remove the `pluto_site_` branch after Pluto revokes the former sale keys.
 */
export const acceptedKey = (key: string, live: boolean) =>
  key.startsWith("pluto_site_") || APP_KEYS[live ? "live" : "test"].test(key);

/** The Pluto sale for this store uses this return target. Pluto rejects checkouts that name another. */
export const RETURN_TARGET = "purdue-hackers-merch";

/** Pluto tags the Checkout Sessions it creates for merchandise sales with this integration. */
export const PLUTO_MERCH_INTEGRATION = "pluto_merch";

/** Items without a size use this Pluto variant. */
export const ONE_SIZE = "one-size";

export type PlutoConnection = { origin: string; key: string; bypass?: string };
export type CatalogPrice = { sku: string; variants: string[]; priceId: string; amount: number };
export type CheckoutLine = { sku: string; variant: string; quantity: number };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Production must use HTTPS. Other environments can also reach a Pluto server on this machine. */
export function plutoConnection(get: ReadEnv): PlutoConnection | null {
  const live = get("VERCEL_ENV") === "production";
  const key = get("PLUTO_API_KEY") ?? "";
  let base: URL;
  try {
    base = new URL(get("PLUTO_API_URL") ?? "");
  } catch {
    return null;
  }
  const local = base.protocol === "http:" && /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(base.hostname);
  if (!(base.protocol === "https:" || (!live && local)) || base.username || base.password) return null;
  if (!acceptedKey(key, live)) return null;
  return { origin: base.origin, key, bypass: get("PLUTO_PROTECTION_BYPASS") || undefined };
}

/** Only production may receive live Checkout Sessions. */
export const matchesEnvironment = (sessionId: string, live: boolean) =>
  sessionId.startsWith(live ? "cs_live_" : "cs_test_");

export function plutoFetch(connection: PlutoConnection, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${connection.key}`);
  if (connection.bypass) headers.set("x-vercel-protection-bypass", connection.bypass);
  return fetch(new URL(path, connection.origin), {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

export type PlutoProblem = { code: string; message: string; requestId: string };

/**
 * Read a rejected Pluto request: its code and its sentence, such as a closed sale or a changed price.
 * Pluto sends an RFC 9457 problem document with `code` and `detail`. Its former API sent
 * `{ error: { code, message } }`. An unreadable body gives an empty code and sentence.
 */
export async function plutoProblem(response: Response): Promise<PlutoProblem> {
  const requestId = response.headers.get("pluto-request-id") ?? "";
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { code: "", message: "", requestId };
  }
  const source = isObject(body) && isObject(body.error) ? body.error : body;
  const code = isObject(source) && typeof source.code === "string" ? source.code : "";
  const text = isObject(source) ? (source.detail ?? source.message) : undefined;
  return { code, message: typeof text === "string" ? text.slice(0, 300) : "", requestId };
}

function catalogPrice(value: unknown): CatalogPrice | null {
  if (!isObject(value) || value.currency !== "USD") return null;
  const { sku, price_id: priceId, amount_minor: amount } = value;
  const variants = Array.isArray(value.variants) ? value.variants.filter((v) => typeof v === "string") : [];
  if (typeof sku !== "string" || typeof priceId !== "string" || !isCount(amount) || amount <= 0) return null;
  return { sku, variants, priceId, amount };
}

async function fetchCatalog(connection: PlutoConnection) {
  const prices: CatalogPrice[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await plutoFetch(connection, `/api/v1/catalogs/merch/prices?${query}`);
    if (!response.ok) throw new Error(`Pluto catalog request failed (HTTP ${response.status})`);
    const page: unknown = await response.json();
    if (!isObject(page) || !Array.isArray(page.data)) throw new Error("Pluto returned an invalid catalog");
    for (const entry of page.data) {
      const price = catalogPrice(entry);
      if (!price) throw new Error("Pluto returned an invalid catalog price");
      prices.push(price);
    }
    cursor = typeof page.next_cursor === "string" ? page.next_cursor : null;
  } while (cursor);
  return prices;
}

const CACHE_MS = 5 * 60 * 1000;
let cache: { expires: number; key: string; prices: Promise<CatalogPrice[]> } | undefined;

/** Pages and webhooks share one catalog read for five minutes. Pluto still checks every checkout total. */
export function readCatalog(connection: PlutoConnection) {
  const key = `${connection.origin}\n${connection.key}`;
  if (cache && cache.expires > Date.now() && cache.key === key) return cache.prices;
  const prices = fetchCatalog(connection);
  cache = { expires: Date.now() + CACHE_MS, key, prices };
  prices.catch(() => {
    if (cache?.prices === prices) cache = undefined;
  });
  return prices;
}

/** Read the lines Pluto returns for a merchandise checkout. Unknown shapes produce no lines. */
export function checkoutLines(value: unknown): CheckoutLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) =>
    isObject(line) && typeof line.sku === "string" && typeof line.variant === "string" &&
    isCount(line.quantity) && line.quantity > 0
      ? [{ sku: line.sku, variant: line.variant, quantity: line.quantity }]
      : [],
  );
}
