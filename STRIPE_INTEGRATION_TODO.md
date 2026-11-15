# Stripe integration TODO

Stripe Checkout (embedded payment form, `ui_mode: "form"`) is wired into the `/preorder` page. This file lists everything left to do before it can take real payments.

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [src/scripts/stripe-products.ts](src/scripts/stripe-products.ts)
- [.env](.env)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| mode | payment | Set to "payment" for one-time charges or "subscription" for recurring billing. Merch preorders are one-time, so "payment" is likely correct. If you switch to "subscription", also add `payment_method_collection: 'always'`. |
| STRIPE_SECRET_KEY / PUBLIC_STRIPE_PUBLISHABLE_KEY | set (live) | Live keys, used in live mode. |
| STRIPE_SECRET_TEST_KEY / PUBLIC_STRIPE_TEST_KEY | set (test) | Test keys, used in test mode. |
| STRIPE_MODE | *(unset)* | Optional, `test` or `live`. When it's unset, the dev server uses test mode and production builds use live mode. |

Prices live in Stripe. Each product's **default Price** (Dashboard → product → default price), for the mode in use, is what the site shows and what checkout charges. [src/scripts/stripe-prices.ts](src/scripts/stripe-prices.ts) looks them up from the Product IDs (`LIVE_PRODUCT_IDS` or `TEST_PRODUCT_IDS`) and caches them for 5 minutes. Pages render them into the page with `<PriceData>`, and scripts read them with `readPrices()` from [src/scripts/preorder-data.js](src/scripts/preorder-data.js). To change a price, set a new default price on the product. The site picks it up within 5 minutes.

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [src/pages/api/checkout.ts](src/pages/api/checkout.ts)
- [src/scripts/preorder-checkout.ts](src/scripts/preorder-checkout.ts) (appearance)

| Parameter | Value |
|-----------|-------|
| ui_mode | form |
| billing_address_collection | required |
| phone_number_collection | { enabled: false } |
| automatic_tax | { enabled: false } |
| payment_method_collection | always (only applies in "subscription" mode, so it's omitted while mode is "payment") |
| submit_type | auto |
| integration_identifier | custom_embedded_web_0001 |
| appearance | theme "night", labels "auto", inputs "spaced", plus the configured variables |

Also set in code:
- `customer_email`, prefilled from the email field on the preorder form.
- `return_url`, which points back to `/preorder?session_id={CHECKOUT_SESSION_ID}`.
- The API version is `2026-10-28.endive`, the default for `stripe@23.1.0` and later than Dahlia, as `ui_mode: "form"` requires.

## Setup

1. **Keys and mode.** `.env` holds both key pairs. `src/scripts/stripe-products.ts` picks one: `STRIPE_MODE` if it's set, otherwise test on `astro dev` and live in production builds. The server sends the matching publishable key to the browser, so the client needs no configuration. Never give a secret key a `PUBLIC_` prefix.
2. **Products.** Live IDs are in `LIVE_PRODUCT_IDS` and test IDs in `TEST_PRODUCT_IDS`. Both are filled in.
3. **Vercel.** Add all four key variables in Project Settings → Environment Variables. To keep preview deploys from charging real cards, also set `STRIPE_MODE=test` for Preview. Then redeploy.
4. **Dependencies.** `stripe@^23.1.0` is installed. Stripe.js loads from `https://js.stripe.com/dahlia/stripe.js` in `src/components/layout.astro`. Don't bundle or self-host it; that's a PCI requirement.

## New and changed files

```
src/scripts/stripe-products.ts     new: live and test Product IDs
src/pages/api/checkout.ts          new: POST creates the Checkout Session; GET reads its status after the return redirect
src/scripts/preorder-checkout.ts   new: mounts Stripe's embedded payment form and handles confirm and return
src/pages/preorder.astro           checkout container, back button, error line
src/components/layout.astro        loads Stripe.js
src/styles/preorder.css            checkout step styles
.env                               placeholder Stripe variables
```

## How it works

1. The customer fills in name and email, selects items, and presses **next**.
2. `preorder-checkout.ts` sends the selected items and email to `POST /api/checkout`.
3. The server checks the items against `PRODUCT_IDS`, prices them from `preorder-data.js`, creates a Checkout Session and returns `{ client_secret }`.
4. The browser starts `stripe.initCheckoutFormSdk({ clientSecret, appearance })` and mounts the form into `#checkout-form`, replacing the preorder form. **back** returns to the item selection.
5. When the customer confirms, `actions.confirm()` takes the payment. Stripe then sends the customer to `return_url`.
6. On return, `/preorder?session_id=…` calls `GET /api/checkout`, which shows a thank-you message if the session is `complete` or a retry message otherwise.

## Testing

- Use test-mode keys.
- Card `4242 4242 4242 4242`, any future expiry, any CVC and any postal code, succeeds.
- `4000 0025 0000 3155` requires 3D Secure authentication.
- `4000 0000 0000 9995` is declined (insufficient funds).
- More test cards: https://docs.stripe.com/testing

## Next steps

- **Fulfillment.** No webhook exists yet. To record orders automatically, for example into the Notion database already used by `/api/notify`, add a `checkout.session.completed` webhook. Set `STRIPE_WEBHOOK_SECRET` (https://dashboard.stripe.com/workbench/webhooks) and verify signatures with `stripe.webhooks.constructEvent`. Until then, orders show up in the Dashboard under Payments.
- **Customer name.** The name field isn't sent to Stripe yet. Pass it as session `metadata` if you need it on the order.
- **Quantities and sizes.** Each item is quantity 1. `/preorder-lab` sends the shirt size. It's stored as Checkout Session and PaymentIntent `metadata` (`items`, for example "shirt (M), socks", plus `shirt_size`), and the payment description lists the items, so it shows in the Payments list and CSV export. `/preorder` doesn't ask for a size yet.
- **Tax.** `automatic_tax` is off. If you need to collect sales tax, enable Stripe Tax and set it in Checkout Studio.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
