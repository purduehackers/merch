# Merchandise checkout

Customers pick items and sizes on the homepage, then pay on `/preorder` by card, Apple Pay, or Google Pay. Stripe shows the wallets on eligible devices. The server uses each Stripe product’s active one-time USD price. A price change between the cart and checkout sends the buyer back to review the total.

## Deployment settings

Set these variables on the Vercel `merch` project. Production uses the Afterhours live account. Preview and local development use the Afterhours sandbox. `VERCEL_ENV` selects the catalog, and checkout rejects credentials for the wrong environment.

| Variable | Production | Preview or local |
| --- | --- | --- |
| `STRIPE_RESTRICTED_KEY` or `STRIPE_SECRET_KEY` | Live server key | Sandbox server key |
| `STRIPE_PUBLISHABLE_KEY` (Vercel integration) or `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Live publishable key | Sandbox publishable key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the live merch endpoint | Signing secret for the sandbox endpoint or local CLI listener |
| `RESEND_API_KEY` | Sending key for `mail.afterhours.foundation` | Omit |
| `NOTION_TOKEN` | Integration with access to the pickup database | Only needed for a sandbox pickup database |
| `NOTION_ORDERS_DATABASE_ID` | Merch items/pickup form | Use `NOTION_TEST_ORDERS_DATABASE_ID` for test orders |

A restricted server key needs to read Products, Prices and PaymentIntents, and create and read Checkout Sessions and their line items. Keep server keys and webhook secrets in sensitive environment variables. Redeploy the intended environment after adding or rotating values. Register each checkout hostname in Stripe’s payment method domains for that environment.

## Orders and receipts

Register `/api/stripe-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Verify the deployment serves the route before enabling its Stripe destination. Local development can receive signed test events with `stripe listen --forward-to localhost:4321/api/stripe-webhook`.

The webhook checks the signature, account mode, integration and paid status before writing to the pickup list. The Stripe Session ID ties the payment to its Notion order. Failed writes return an error so Stripe can retry. The optional `NOTION_TOTALS_DATABASE_ID` configures daily totals. Sandbox orders only use the explicitly configured `NOTION_TEST_ORDERS_DATABASE_ID` and optional `NOTION_TEST_TOTALS_DATABASE_ID`. A sandbox without a pickup database acknowledges paid events without writing to Notion.

New live orders receive an Afterhours confirmation from `store@mail.afterhours.foundation`. Replies go to `help@afterhours.foundation`. The email shows a photo for each purchased product, sizes, quantities, line amounts and the total paid. Stripe supplies the amounts recorded at checkout. Sandbox orders do not send customer email. Stripe can also send a separate receipt if **Successful payments** is enabled in the account’s [email settings](https://docs.stripe.com/receipts).

The signed webhook records pickup and sends the confirmation independently. Resend handles delivery. The product photos and wordmark use public image URLs so mail clients can load them without signing in.

The webhook uses the Checkout Session to deduplicate sends. Resend accepts repeated requests with the same [idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys) for 24 hours. A permanent completion marker in Vercel Blob prevents later Stripe retries from resending a receipt. If the webhook reports an unresolved delivery after the retry window, check the recipient and order time in the [Resend email log](https://resend.com/emails) and locate `order-confirmations/<SHA-256 of session ID>/` in Blob. If Resend accepted the email, add a `complete` marker. If Resend confirms it never accepted the email, remove the `sending` marker. Then replay the Stripe event.

## Products and tax

Classify the shirt and socks as Clothing & Footwear, the tote as Purses and Handbags, and the keychain as General – Tangible Goods. Ordinary merchandise purchases receive payment receipts. Afterhours uses a separate product for charitable contributions.

Automatic Tax is off for the direct Indiana pickup fundraiser. Track tangible-goods sales across Afterhours against Indiana’s $100,000 current-or-previous-calendar-year threshold. Keep the order ledger, refund and payout records, use of proceeds for exempt purposes, and records of volunteer labor. Reassess collection before expanding to shipping or reaching the threshold. File any sales-tax returns assigned in INTIME, including periods when no tax is due. [Indiana DOR Bulletin 10](https://www.in.gov/dor/files/sib10.pdf) · [Indiana sales-tax return instructions](https://www.in.gov/dor/files/st-103inst.pdf) · [IRS volunteer labor exclusion](https://www.irs.gov/charities-non-profits/volunteer-labor-exclusion-from-unrelated-trade-or-business)

Use the paid pickup list to email buyers the date and location of the spring 2027 Hack Night. Handle cancellations within 30 days of purchase, refund orders Afterhours cannot fulfill, and offer a later pickup or refund if the window slips. Reconcile refunds in Stripe against the pickup list before handing out merchandise.

## Verification

Run `npm ci`, `npm test`, and `npm run build` on Node 24. In a configured preview, test a successful payment, decline, authentication challenge, and return to an old confirmation after adding new items. Verify signed webhook delivery and pickup records in the intended environment. [Stripe test payments](https://docs.stripe.com/testing)
