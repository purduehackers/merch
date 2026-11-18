// Stripe embedded payment form for /preorder.
// Stripe.js always comes from js.stripe.com (never bundled: PCI requirement). It's ~300 KB, so
// only checkout pages load it, starting as soon as one opens rather than in every page's head.

import { clearCart, readCart } from "./cart";

type CheckoutForm = {
  mount: (selector: string) => void;
  unmount?: () => void;
  destroy?: () => void;
  on: (event: "confirm", handler: (event: unknown) => void) => void;
};
type CheckoutFormSdk = {
  createForm: (options: { layout: "expanded" }) => CheckoutForm;
  loadActions: () => Promise<
    | { type: "success"; actions: { confirm: (options: { formConfirmEvent: unknown }) => Promise<unknown> } }
    | { type: "error"; error: { message: string } }
  >;
};
type StripeInstance = {
  initCheckoutFormSdk: (options: { clientSecret: Promise<string>; appearance: object; fonts?: object[] }) => CheckoutFormSdk;
};
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

// Matches preorder.css: black page, square inputs, PolySans, cream button like "next",
// yellow (#ffcd38) selection accent like the item cards.
// The form SDK only accepts theme/labels/inputs/variables (no `rules`), and typed text,
// headings and address suggestions all take colorText. So the inputs are dark with white
// text: white inputs made everything typed into them white on white.
const FONT_BASE = "https://f3ibyzhjurhjiwis.public.blob.vercel-storage.com";
const fonts = [
  { family: "PolySans Neutral", src: `url(${FONT_BASE}/PolySans-Neutral.woff2)`, weight: "400" },
  { family: "PolySans Slim", src: `url(${FONT_BASE}/PolySans-Slim.woff2)`, weight: "400" },
];

const appearance = {
  theme: "night",
  labels: "above",
  inputs: "spaced",
  variables: {
    fontFamily: '"PolySans Neutral", Arial, sans-serif',
    fontSizeBase: "16px",
    fontWeightNormal: "400",
    fontWeightMedium: "400",
    fontWeightBold: "400",
    spacingUnit: "4px",
    borderRadius: "0px",
    colorPrimary: "#ffcd38",
    colorBackground: "#000000",
    colorText: "#ffffff",
    colorTextSecondary: "rgba(255, 255, 255, 0.7)",
    colorTextPlaceholder: "rgba(255, 255, 255, 0.4)",
    colorDanger: "#ff8a8a",
    colorSuccess: "#ffcd38",
    iconColor: "#ffffff",
    labelColorText: "#ffffff",
    labelSpacing: "6px",
    inputColorBorder: "rgba(255, 255, 255, 0.5)",
    inputFocusColorBorder: "#ffffff",
    inputBoxShadow: "none",
    focusOutline: "2px solid #ffffff",
    focusBoxShadow: "none",
    buttonBorderRadius: "0px",
    buttonColorBackground: "#fffdf7",
    buttonColorText: "#000000",
    buttonBoxShadow: "none",
    buttonFontWeight: "400",
  },
};

const STRIPE_JS = "https://js.stripe.com/dahlia/stripe.js";
let stripeJs: Promise<NonNullable<Window["Stripe"]>> | null = null;

const loadStripeJs = () => {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  stripeJs ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = STRIPE_JS;
    script.async = true;
    script.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error("Stripe.js loaded without Stripe")));
    script.onerror = () => reject(new Error("Stripe.js didn't load"));
    document.head.append(script);
  });
  // a failed load (offline, blocked) can be tried again on the next "next"
  stripeJs.catch(() => (stripeJs = null));
  return stripeJs;
};

const initCheckout = () => {
  const form = document.querySelector<HTMLFormElement>(".preorder__form");
  const checkout = document.querySelector<HTMLElement>(".preorder__checkout");
  if (!form || !checkout) return;
  // fetch it while the buyer fills in their name and email
  loadStripeJs().catch(() => {});

  const error = form.querySelector<HTMLElement>("[data-preorder-error]");
  const message = checkout.querySelector<HTMLElement>("[data-checkout-message]");
  const back = checkout.querySelector<HTMLButtonElement>("[data-checkout-back]");
  let mounted: CheckoutForm | null = null;

  const showForm = () => {
    mounted?.unmount?.();
    mounted?.destroy?.();
    mounted = null;
    checkout.hidden = true;
    form.hidden = false;
  };

  const showCheckout = (text = "") => {
    if (message) message.textContent = text;
    form.hidden = true;
    checkout.hidden = false;
  };

  const fail = (text: string) => {
    showForm();
    if (error) error.textContent = text;
  };

  back?.addEventListener("click", showForm);

  // one checkout start at a time: a double click on "next" used to create two Stripe
  // sessions and mount two payment forms
  let starting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (starting) return;
    starting = true;
    form.setAttribute("aria-busy", "true");
    try {
      await startCheckout();
    } finally {
      starting = false;
      form.removeAttribute("aria-busy");
    }
  });

  const startCheckout = async () => {
    if (error) error.textContent = "";
    if (!form.reportValidity()) return;

    // /preorder checks out the cart (with quantities); the lab pages still send one of each
    // checked item, with sizes, as form fields.
    const data = new FormData(form);
    const items = data.getAll("items").map(String);
    const lines = items.length ? [] : readCart().lines;
    if (!items.length && !lines.length) {
      if (error) error.textContent = "your cart is empty";
      return;
    }
    const order = items.length
      ? { items, shirt_size: data.get("shirt_size"), sock_size: data.get("sock_size") }
      : { lines };

    let Stripe: NonNullable<Window["Stripe"]>;
    try {
      Stripe = await loadStripeJs();
    } catch (loadError) {
      console.error("Stripe.js error:", loadError);
      fail("checkout isn't available right now");
      return;
    }

    // The server picks test or live mode and returns the matching publishable key.
    let session: { client_secret: string; publishable_key: string };
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...order,
          name: data.get("name"),
          email: data.get("email"),
          return_path: location.pathname,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      session = await response.json();
    } catch (startError) {
      console.error("Checkout start error:", startError);
      fail("couldn't start checkout, try again");
      return;
    }

    showCheckout();
    let loaded: Awaited<ReturnType<CheckoutFormSdk["loadActions"]>>;
    try {
      const sdk = Stripe(session.publishable_key).initCheckoutFormSdk({
        clientSecret: Promise.resolve(session.client_secret),
        appearance,
        fonts,
      });
      mounted = sdk.createForm({ layout: "expanded" });
      mounted.mount("#checkout-form");
      loaded = await sdk.loadActions();
    } catch (setupError) {
      console.error("Checkout setup error:", setupError);
      fail("couldn't start checkout, try again");
      return;
    }
    if (loaded.type !== "success") {
      fail("couldn't start checkout, try again");
      return;
    }
    mounted.on("confirm", async (confirmEvent) => {
      try {
        await loaded.actions.confirm({ formConfirmEvent: confirmEvent });
      } catch (confirmError) {
        console.error("Payment confirmation error:", confirmError);
      }
    });
  };

  // Back from Stripe's return_url: show the result of the session.
  const sessionId = new URLSearchParams(location.search).get("session_id");
  if (sessionId) {
    if (back) back.hidden = true;
    showCheckout("checking your payment…");
    fetch(`/api/checkout?session_id=${encodeURIComponent(sessionId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(({ status }: { status: string }) => {
        if (status === "complete") {
          clearCart();
          showCheckout("thanks! your preorder is in. a receipt is on its way to your email.");
        } else {
          if (back) back.hidden = false;
          showCheckout("your payment didn't go through. go back and try again.");
        }
      })
      .catch(() => fail("couldn't confirm your payment. check your email for a receipt."));
  }
};

document.addEventListener("astro:page-load", initCheckout);

export {};
