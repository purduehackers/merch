export type OrderEmail = { to: string; html: string; text: string };

/** Resend rejected this request before queueing a message. */
export class ResendEmailRejection extends Error {}

export async function sendOrderEmail(email: OrderEmail, apiKey: string, idempotencyKey: string): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: "Afterhours <store@mail.afterhours.foundation>",
      reply_to: "help@afterhours.foundation",
      subject: "Your Afterhours preorder",
      ...email,
    }),
  });
  const result = await response.json();
  if (response.ok && typeof result?.id === "string" && result.id) return result.id;
  if ([400, 401, 403, 422, 429].includes(response.status) && typeof result?.message === "string" && result.message) {
    throw new ResendEmailRejection(`Resend rejected the order email (HTTP ${response.status})`);
  }
  throw new Error(`Order email outcome unknown (HTTP ${response.status})`);
}
