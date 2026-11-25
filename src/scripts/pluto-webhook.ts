// Pluto sends this store a signed `payment_session.completed` event when Stripe confirms a paid
// checkout of the store's sale. Pluto signs each delivery with the Standard Webhooks scheme:
// https://www.standardwebhooks.com. The event is thin: IDs, status and amounts only.

type ReadEnv = (name: string) => string | undefined;

/** Pluto and the Standard Webhooks libraries refuse a delivery more than 5 minutes from now. */
const TOLERANCE_SECONDS = 5 * 60;
const SECRET_PREFIX = "whsec_";
const SESSION_ID = /^cs_(?:live|test)_[a-zA-Z0-9]{10,240}$/;

export type PlutoEvent = {
  id: string;
  type: string;
  environment: "live" | "test";
  /** The Checkout Session of a `payment_session.*` event. Other events have none. */
  sessionId: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The signing secret of this store's endpoint on its Pluto storefront app. Pluto shows it once. */
export function plutoWebhookSecret(get: ReadEnv) {
  const secret = get("PLUTO_WEBHOOK_SECRET") ?? "";
  return /^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret) ? secret : null;
}

/** Decode standard base64. Invalid text gives null. */
function fromBase64(text: string) {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Check the signature of one Pluto delivery against its raw body, before the body is parsed.
 * During a secret roll the header holds one `v1,` signature for each secret, and one match is
 * enough. A timestamp outside the tolerance fails, so a captured delivery cannot replay later.
 * Web Crypto compares the HMAC in constant time.
 */
export async function verifyPlutoWebhook(secret: string, headers: Headers, body: string, now = Date.now()) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp") ?? "";
  const signatures = headers.get("webhook-signature");
  if (!id || !signatures || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const secretBytes = fromBase64(secret.slice(SECRET_PREFIX.length));
  if (!secretBytes?.length) return false;
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma < 0 || entry.slice(0, comma) !== "v1") continue;
    const given = fromBase64(entry.slice(comma + 1));
    if (given && (await crypto.subtle.verify("HMAC", key, given, signed))) return true;
  }
  return false;
}

/** Read the envelope of a verified delivery. An unknown shape gives null. */
export function parsePlutoEvent(body: string): PlutoEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(value) || value.object !== "event" || typeof value.id !== "string" || typeof value.type !== "string")
    return null;
  const { environment } = value;
  if (environment !== "live" && environment !== "test") return null;
  const data = isObject(value.data) ? value.data : undefined;
  const sessionId =
    data?.object === "payment_session" && typeof data.id === "string" && SESSION_ID.test(data.id) ? data.id : null;
  return { id: value.id, type: value.type, environment, sessionId };
}
