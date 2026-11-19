# Merchandise checkout

Customers pick items and sizes on the homepage, then pay on `/preorder`. The server uses each Stripe product’s active one-time USD price. A price change between the cart and checkout sends the buyer back to review the total.

## Deployment settings

Set these variables on the Vercel `merch` project. Production uses the Afterhours live account. Preview and local development use the Afterhours sandbox. `VERCEL_ENV` selects the catalog, and checkout rejects credentials for the wrong environment.

| Variable | Production | Preview or local |
| --- | --- | --- |
| `STRIPE_RESTRICTED_KEY` or `STRIPE_SECRET_KEY` | Live server key | Sandbox server key |
| `STRIPE_PUBLISHABLE_KEY` (Vercel integration) or `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Live publishable key | Sandbox publishable key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the live merch endpoint | Signing secret for the sandbox endpoint or local CLI listener |
| `NOTION_TOKEN` | Integration with access to the pickup database | Only needed for a sandbox pickup database |
| `NOTION_ORDERS_DATABASE_ID` | Merch items/pickup form | Use `NOTION_TEST_ORDERS_DATABASE_ID` for test orders |

A restricted server key needs to read Products, Prices and PaymentIntents, and create and read Checkout Sessions and their line items. Keep server keys and webhook secrets in sensitive environment variables. Redeploy the intended environment after adding or rotating values. Register each checkout hostname in Stripe’s payment method domains for that environment.

## Orders and receipts

Register `/api/stripe-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Verify the deployment serves the route before enabling its Stripe destination. Local development can receive signed test events with `stripe listen --forward-to localhost:4321/api/stripe-webhook`.

The webhook checks the signature, account mode, integration and paid status before writing to the pickup list. The Stripe Session ID ties the payment to its Notion order. Failed writes return an error so Stripe can retry. The optional `NOTION_TOTALS_DATABASE_ID` configures daily totals. Sandbox orders only use the explicitly configured `NOTION_TEST_ORDERS_DATABASE_ID` and optional `NOTION_TEST_TOTALS_DATABASE_ID`. A sandbox without a pickup database acknowledges paid events without writing to Notion.

The app requests a payment receipt for the buyer’s email. The return page distinguishes paid, pending, failed and expired orders. Staff should check the payment in Stripe before issuing a refund or fulfilling an uncertain order. Refund email notifications are an account-wide setting in Stripe, separate from payment receipts.

## Products and tax

Classify the shirt and socks as Clothing & Footwear, the tote as Purses and Handbags, and the keychain as General – Tangible Goods. Ordinary merchandise purchases receive payment receipts. Afterhours uses a separate product for charitable contributions.

Automatic Tax is off for the current direct Indiana pickup fundraiser. Reassess collection if sales approach Indiana’s threshold, the fundraiser changes, or shipping expands. Consult [Indiana DOR Bulletin 10](https://www.in.gov/dor/files/sib10.pdf) and [Stripe’s tax codes](https://docs.stripe.com/tax/tax-codes).

## Verification

Run `npm ci`, `npm test`, and `npm run build` on Node 24. In a configured preview, test a successful payment, decline, authentication challenge, and return to an old confirmation after adding new items. Verify signed webhook delivery and pickup records in the intended environment. [Stripe test payments](https://docs.stripe.com/testing)
