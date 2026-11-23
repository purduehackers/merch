import { render, toPlainText } from "@react-email/render";
import type Stripe from "stripe";
import type { OrderEmail } from "./resend-email";
import { orderLines } from "./order-lines.ts";
import type { CatalogPrice } from "./pluto.ts";
import { products, type ProductId } from "./preorder-items-data.ts";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const price = (cents: number) => dollars.format(cents / 100);

const images = "https://f3ibyzhjurhjiwis.public.blob.vercel-storage.com/receipts/afterhours-w26-v1";

type ReceiptLine = { productId?: ProductId; item: string; sizes: string; quantity: number; cents: number };
type Receipt = { lines: ReceiptLine[]; total: number; pickupName: string };

function Confirmation({ lines, total, pickupName }: Receipt) {
  const accent = "#4dabf4";
  const rule = "1px solid #353535";
  const mono = "'Courier New', Courier, monospace";
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </head>
      <body style={{ margin: 0, backgroundColor: "#000", color: "#fff", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: "#000" }}>
          <tbody><tr><td align="center">
            <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: 560, backgroundColor: "#000", textAlign: "left" }}>
              <tbody>
                <tr><td style={{ padding: "28px 20px", borderBottom: rule }}>
                  <img width="202" height="32" src={`${images}/afterhours.png`} alt="Afterhours" style={{ display: "block", color: "#fff", fontSize: 24 }} />
                </td></tr>
                <tr><td style={{ padding: "28px 20px 0" }}>
                  <h1 style={{ margin: "0 0 28px", color: "#fff", fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: "-2px" }}>Preorder confirmed.</h1>
                  <table aria-label="Purchased items" width="100%" cellSpacing="0" cellPadding="0" style={{ color: "#fff", borderCollapse: "collapse" }}>
                    <thead><tr style={{ color: "#aaa", font: `12px ${mono}` }}>
                      <th scope="col" colSpan={2} align="left" style={{ paddingBottom: 8 }}>Item</th>
                      <th scope="col" align="center" style={{ paddingBottom: 8 }}>Qty</th>
                      <th scope="col" align="right" style={{ paddingBottom: 8 }}>Amount</th>
                    </tr></thead>
                    <tbody>{lines.map((line, index) => (
                      <tr key={index}>
                        <td width="66" style={{ padding: "10px 0", borderTop: rule }}>
                          {line.productId && <img width="56" height="56" src={`${images}/${line.productId}.png`} alt="" style={{ display: "block", border: 0 }} />}
                        </td>
                        <td style={{ padding: "10px 6px 10px 0", borderTop: rule, fontWeight: 600, fontSize: 15 }}>
                          {line.item}{line.sizes && <><br /><small style={{ color: "#aaa", fontSize: 13, fontWeight: 400 }}>{line.sizes}</small></>}
                        </td>
                        <td align="center" style={{ padding: "0 4px", borderTop: rule, fontFamily: mono, fontSize: 14 }}>{line.quantity}</td>
                        <td align="right" style={{ borderTop: rule, fontFamily: mono, fontSize: 15 }}>{price(line.cents)}</td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr>
                      <th scope="row" colSpan={3} align="left" style={{ padding: "16px 0", borderTop: rule, fontWeight: 500 }}>Total paid (USD)</th>
                      <td align="right" style={{ padding: "16px 0", borderTop: rule, color: accent, fontSize: 22, fontWeight: 600 }}>{price(total)}</td>
                    </tr></tfoot>
                  </table>
                  <p style={{ lineHeight: 1.5, color: "#ddd", margin: "12px 0 28px" }}>Pick up at a spring 2027 Hack Night at Purdue{pickupName && <> under <strong>{pickupName}</strong></>}. We’ll email the date and location.
                    {" "}To cancel within 30 days of purchase or get help, email <a href="mailto:help@afterhours.foundation" style={{ color: accent }}>help@afterhours.foundation</a>.</p>
                </td></tr>
                <tr><td style={{ borderTop: rule, padding: "16px 20px 28px", color: "#aaa", fontSize: 12, lineHeight: 1.5 }}>
                  Sold by The Afterhours Foundation, Inc.
                </td></tr>
              </tbody>
            </table>
          </td></tr></tbody>
        </table>
      </body>
    </html>
  );
}

/**
 * Use the price paid on Stripe. Catalog prices can change between checkout and webhook delivery.
 * Pluto's sale catalog maps each Stripe price to the store item it sells.
 */
export async function prepareOrderEmail(stripe: Stripe, session: Stripe.Checkout.Session, catalog: CatalogPrice[]): Promise<OrderEmail> {
  const to = session.customer_details?.email || session.customer_email;
  if (session.payment_status !== "paid" || session.currency !== "usd" || session.amount_total == null || !to)
    throw new Error("A paid USD order with a customer email is required for confirmation");

  const purchased = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  if (purchased.has_more || !purchased.data.length) throw new Error("Incomplete Stripe order details");
  const variants = orderLines(session.metadata);
  const lines = purchased.data.map((line) => {
    const sku = catalog.find((price) => price.priceId === line.price?.id)?.sku;
    const product = products.find((p) => p.id === sku);
    const sizes = variants.filter((v) => v.item === product?.id && v.size);
    if (line.currency !== "usd" || line.quantity == null) throw new Error("Invalid Stripe order item");
    return {
      productId: product?.id,
      item: product?.title.join(" ") || "Merchandise",
      sizes: sizes.length === 1 ? (sizes[0].size ?? "") : sizes.map((v) => `${v.size} × ${v.qty}`).join(", "),
      quantity: line.quantity,
      cents: line.amount_total,
    };
  });
  const pickupName = session.metadata?.name || session.customer_details?.name || "";
  const html = await render(<Confirmation lines={lines} total={session.amount_total} pickupName={pickupName} />);
  const text = toPlainText(html, { selectors: [{ selector: "img", format: "skip" }, { selector: 'table[aria-label="Purchased items"]', format: "dataTable" }] });
  return { to, html, text };
}
