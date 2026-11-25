# Merchandise checkout

Customers pick items and sizes on the homepage, then pay on `/preorder` by card, Apple Pay, or Google Pay. Stripe shows the wallets on eligible devices.

[Pluto](https://pluto.afterhours.foundation/sales) runs the sale. Pluto reads each item's price from the sale catalog, creates the Stripe Checkout Session, records the paid order and tracks pickup. This store holds only the key of the sale's storefront app. It never creates or prices a Checkout Session itself.

## Request flow

1. Pages read `GET /api/v1/catalogs/merch/prices` and show each item's price. The store keeps the catalog for five minutes.
2. `/api/checkout` validates the cart, then sends `POST /api/v1/payment-sessions` with the key and the browser's attempt as `Idempotency-Key`. Each store item is a Pluto SKU and each size is its variant. Items without sizes use `one-size`.
3. Pluto recalculates the total from Stripe. If a price changed, it answers 409 and the buyer reviews the cart. A closed sale also answers 409. Pluto explains each refusal in an RFC 9457 problem document, and the store shows its `detail` sentence.
4. Pluto returns the Checkout form's client secret and publishable key. The browser mounts Stripe's form and confirms the payment.
5. The buyer returns to `/preorder?session_id=…`. The page reads `GET /api/v1/payment-sessions/{id}` and shows the paid items and total.

A retry with the same attempt returns the same Checkout Session. A changed cart gets a new attempt. Pluto keeps its answer to an attempt for 24 hours, so the browser also starts a new attempt after Pluto refuses an order. A retry while Pluto still starts the same session answers 503, and the next try receives the stored session.

## Deployment settings

Set these variables on the Vercel `merch` project. Production uses the production Pluto deployment and the live sale. Preview and local development use a test-mode Pluto deployment and its test sale. Checkout rejects a Checkout Session from the wrong environment.

| Variable | Production | Preview or local |
| --- | --- | --- |
| `PLUTO_API_URL` | `https://pluto.afterhours.foundation` | Test-mode Pluto origin |
| `PLUTO_API_KEY` | Live sale storefront app key (`pluto_sk_live_…`) | Test sale storefront app key (`pluto_sk_test_…`) |
| `PLUTO_WEBHOOK_SECRET` | Signing secret (`whsec_…`) of the live storefront app's endpoint | Optional test signing secret |
| `PLUTO_PROTECTION_BYPASS` | Omit | Vercel protection bypass secret, if the Pluto preview is protected |
| `STRIPE_RESTRICTED_KEY` or `STRIPE_SECRET_KEY` | Live read-only key for the confirmation email | Optional sandbox key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the live Stripe endpoint, until the Pluto webhook replaces it | Optional sandbox signing secret |
| `RESEND_API_KEY` | Sending key for `mail.afterhours.foundation` | Omit |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store for confirmation markers | Omit |
| `NOTION_TOKEN`, `NOTION_DATABASE_ID` | "Notify me" sign-up list | Optional |

A Pluto super admin creates the storefront app on the sale's **Integration** tab with **Create storefront app**. The app serves only that sale and holds `storefront.catalog:read`, `storefront.checkout:write` and `storefront.checkout:read`. Its key lasts 365 days, and Pluto shows it once. Production accepts only a `pluto_sk_live_` key, and preview and local development accept only a `pluto_sk_test_` key. The former `pluto_site_` installation key works until Pluto revokes it.

To rotate the key before it expires, select **Roll key** on the app in Pluto with an overlap such as 24 hours. Set the new key, redeploy, and place a test order before the overlap ends. The Stripe key only needs read access to Checkout Sessions and their line items. Keep keys and webhook secrets in sensitive environment variables, and redeploy after you add or rotate them.

Live checkout stays closed until the Pluto key, the Stripe read key, a webhook secret (Pluto or Stripe) and the Resend key are present, so every paid order receives its confirmation. Register each checkout hostname in Stripe's payment method domains for that environment.

## Pluto sale

A Pluto super admin creates one merchandise sale for each environment at `/sales/new` with:

| Field | Value |
| --- | --- |
| Kind | `merch` |
| Return target | `purdue-hackers-merch` (the store sends this value) |
| Success URL | `https://merch.purduehackers.com/preorder?session_id={CHECKOUT_SESSION_ID}` |
| Cancel URL (storefront URL) | `https://merch.purduehackers.com/` |

Bind every SKU and variant to its Stripe price: `shirt` in `XS` through `XXXL`, `socks` in `S` through `XL`, and `tote` and `keychain` as `one-size`. Pluto uses the success URL when a payment method redirects. A test sale needs HTTPS return URLs, such as a stable preview alias.

## Orders and receipts

Paid orders appear on the sale in Pluto. Staff search by pickup name, check the payment, and record pickup there.

Add an endpoint to the storefront app in Pluto for `https://merch.purduehackers.com/api/pluto-webhook` with the `payment_session.completed` event. Pluto shows the signing secret once; set it as `PLUTO_WEBHOOK_SECRET`. Pluto sends the event only for this store's sale, after Stripe confirms the payment. The webhook checks the [Standard Webhooks](https://www.standardwebhooks.com) signature, refuses a delivery more than 5 minutes old and checks the payment environment. It then asks Pluto whether the session is paid, reads the buyer and the lines from Stripe, and sends the confirmation email. The sandbox sends nothing. During a secret roll, Pluto signs with both secrets for 24 hours; set the new secret within that time.

`/api/stripe-webhook` does the same work from Stripe's `checkout.session.completed` and `checkout.session.async_payment_succeeded` events. It asks Pluto whether the paid session belongs to this store's sale, so sessions from other sales send nothing. Both webhooks share the delivery claims below, so a buyer receives one email. After Pluto delivers its first `payment_session.completed` event here, remove the Stripe endpoint and `STRIPE_WEBHOOK_SECRET`.

New live orders receive an Afterhours confirmation from `store@mail.afterhours.foundation`. Replies go to `help@afterhours.foundation`. The email shows a photo for each purchased product, sizes, quantities, line amounts and the total paid. Stripe supplies the amounts recorded at checkout, and the Pluto catalog maps each Stripe price to its item. Stripe can also send a separate receipt if **Successful payments** is enabled in the account's [email settings](https://docs.stripe.com/receipts).

Each webhook uses the Checkout Session to deduplicate sends. Resend accepts repeated requests with the same [idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys) for 24 hours. A permanent completion marker in Vercel Blob prevents later webhook retries from resending a receipt. If the webhook reports an unresolved delivery after the retry window, check the recipient and order time in the [Resend email log](https://resend.com/emails) and locate `order-confirmations/<SHA-256 of session ID>/` in Blob. If Resend accepted the email, add a `complete` marker. If Resend confirms it never accepted the email, remove the `sending` marker. Then select **Redeliver** on the delivery in Pluto, or replay the Stripe event.

Orders placed before the Pluto switch stay in the Notion pickup list and in Stripe. Their webhook events no longer write to Notion.

## Products and tax

Classify the shirt and socks as Clothing & Footwear, the tote as Purses and Handbags, and the keychain as General – Tangible Goods. Ordinary merchandise purchases receive payment receipts. Afterhours uses a separate product for charitable contributions.

Automatic Tax is off for the direct Indiana pickup fundraiser. Track tangible-goods sales across Afterhours against Indiana's $100,000 current-or-previous-calendar-year threshold. Keep the order ledger, refund and payout records, use of proceeds for exempt purposes, and records of volunteer labor. Reassess collection before expanding to shipping or reaching the threshold. File any sales-tax returns assigned in INTIME, including periods when no tax is due. [Indiana DOR Bulletin 10](https://www.in.gov/dor/files/sib10.pdf) · [Indiana sales-tax return instructions](https://www.in.gov/dor/files/st-103inst.pdf) · [IRS volunteer labor exclusion](https://www.irs.gov/charities-non-profits/volunteer-labor-exclusion-from-unrelated-trade-or-business)

Use Pluto's paid order list to email buyers the date and location of the spring 2027 Hack Night. Handle cancellations within 30 days of purchase, refund orders Afterhours cannot fulfill, and offer a later pickup or refund if the window slips. Pluto checks refunds and disputes in Stripe before it records a pickup.

## Verification

Run `npm ci`, `npm test`, and `npm run build` on Node 24. In a configured preview, test a successful payment, decline, authentication challenge, and return to an old confirmation after adding new items. Confirm the paid order appears on the test sale in Pluto, and verify signed webhook delivery in the intended environment. Select **Send test event** on the Pluto endpoint to check the signing secret: the store answers a `ping` with 204. [Stripe test payments](https://docs.stripe.com/testing)
