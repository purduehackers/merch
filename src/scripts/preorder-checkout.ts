import { loadStripe } from "@stripe/stripe-js/pure";
import type { Appearance, StripeCheckoutForm } from "@stripe/stripe-js";
import { cartTotal, clearPaidCart, readCart, rememberCheckout } from "./cart";
import { productName } from "./cart-view";

const FONT_BASE = "https://f3ibyzhjurhjiwis.public.blob.vercel-storage.com";
const fonts = [
  { family: "PolySans Neutral", src: `url(${FONT_BASE}/PolySans-Neutral.woff2)`, weight: "400" },
  { family: "PolySans Slim", src: `url(${FONT_BASE}/PolySans-Slim.woff2)`, weight: "400" },
];

const appearance: Appearance = {
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

type PaidOrder = {
  lines: { item: string; size: string | null; qty: number }[];
  total: number | null;
  currency: string | null;
};

function showPaidOrder(checkout: HTMLElement, order?: PaidOrder) {
  const receipt = checkout.querySelector<HTMLElement>("[data-paid-order]")!;
  const list = receipt.querySelector<HTMLUListElement>("[data-paid-lines]")!;
  if (order?.lines?.length) {
    for (const { item, size, qty } of order.lines) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = size ? `${productName(item)} · ${size}` : productName(item);
      const quantity = document.createElement("span");
      quantity.textContent = `× ${qty}`;
      row.append(name, quantity);
      list.append(row);
    }
    list.hidden = false;
  }
  if (order?.currency === "usd" && typeof order.total === "number") {
    const total = receipt.querySelector<HTMLElement>("[data-paid-total]")!;
    total.querySelector("strong")!.textContent = `$${(order.total / 100).toFixed(2)} USD`;
    total.hidden = false;
  }
  receipt.hidden = false;
  receipt.querySelector("h1")!.focus({ preventScroll: true });
}

async function showPaymentStatus(sessionId: string, checkout: HTMLElement, signal: AbortSignal) {
  const message = checkout.querySelector<HTMLElement>("[data-checkout-message]")!;
  const check = checkout.querySelector<HTMLAnchorElement>("[data-checkout-check]")!;
  check.href = location.href;
  try {
    const query = new URLSearchParams({ session_id: sessionId });
    const response = await fetch(`/api/checkout?${query}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error();
    const { state, order } = await response.json();
    if (signal.aborted) return;
    switch (state) {
      case "paid":
        message.textContent = "";
        clearPaidCart(sessionId);
        showPaidOrder(checkout, order);
        return;
      case "pending":
        message.textContent = "Your payment is processing. Check its status before placing another order.";
        break;
      case "expired":
      case "open":
        message.textContent = "You haven’t paid for this order.";
        check.textContent = "Return to your cart";
        check.href = "/preorder";
        break;
      default:
        throw new Error();
    }
  } catch {
    if (signal.aborted) return;
    message.textContent = "We couldn’t check your payment. Try again or email help@afterhours.foundation before placing another order.";
  }
  check.hidden = false;
}

export function initCheckout(
  form: HTMLFormElement,
  checkout: HTMLElement,
  prices: Record<string, number>,
  signal: AbortSignal,
) {
  const sessionId = new URLSearchParams(location.search).get("session_id");
  if (sessionId !== null) {
    void showPaymentStatus(sessionId, checkout, signal);
    return;
  }

  const error = form.querySelector<HTMLElement>("[data-preorder-error]")!;
  const message = checkout.querySelector<HTMLElement>("[data-checkout-message]")!;
  const back = checkout.querySelector<HTMLButtonElement>("[data-checkout-back]")!;
  let mounted: StripeCheckoutForm | undefined;
  let attempt = "";
  let previousOrder = "";
  signal.addEventListener("abort", () => mounted?.destroy(), { once: true });

  function showCart() {
    mounted?.destroy();
    mounted = undefined;
    checkout.hidden = true;
    form.hidden = false;
  }

  back.addEventListener("click", () => {
    showCart();
    form.querySelector<HTMLInputElement>('[name="name"]')?.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.inert || mounted || !form.reportValidity()) return;
    const cart = readCart();
    const total = cartTotal(cart, prices);
    if (!cart.lines.length || total === null) {
      error.textContent = "Reload your cart to check prices.";
      return;
    }

    const data = new FormData(form);
    const order = {
      lines: cart.lines,
      name: data.get("name"),
      email: data.get("email"),
      expected_total: Math.round(total * 100),
    };
    const orderKey = JSON.stringify(order);
    if (orderKey !== previousOrder) {
      previousOrder = orderKey;
      attempt = crypto.randomUUID();
    }

    form.inert = true;
    form.setAttribute("aria-busy", "true");
    error.textContent = "";
    message.textContent = "";
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...order, attempt }),
        signal,
      });
      if (!response.ok) {
        // Pluto explains a closed sale, a changed price or a catalog limit in one sentence.
        if ([400, 409, 429].includes(response.status)) error.textContent = await response.text();
        throw new Error();
      }
      const session = await response.json();
      const stripe = await loadStripe(session.publishable_key);
      if (signal.aborted) return;
      if (!stripe) throw new Error();
      const sdk = stripe.initCheckoutFormSdk({ clientSecret: session.client_secret, appearance, fonts });
      const loaded = await sdk.loadActions();
      if (signal.aborted) return;
      if (loaded.type !== "success") throw new Error();

      rememberCheckout(session.id, cart);
      const returnUrl = new URL("/preorder", location.origin);
      returnUrl.searchParams.set("session_id", session.id);
      form.hidden = true;
      checkout.hidden = false;
      mounted = sdk.createForm({ layout: "expanded" });
      mounted.on("confirm", async (formConfirmEvent) => {
        if (back.disabled || signal.aborted) return;
        back.disabled = true;
        message.textContent = "";
        try {
          const result = await loaded.actions.confirm({ formConfirmEvent });
          if (signal.aborted) return;
          if (result.type === "error") {
            message.textContent = result.error.message;
            back.disabled = false;
            return;
          }
        } catch {
          // Stripe may have accepted payment even if the browser lost its response.
        }
        if (!signal.aborted) location.assign(returnUrl.href);
      });
      mounted.mount("#checkout-form");
      checkout.querySelector<HTMLElement>("h1")?.focus();
    } catch {
      if (signal.aborted) return;
      showCart();
      error.textContent ||= "Couldn’t open checkout. Try again.";
    } finally {
      form.inert = false;
      form.removeAttribute("aria-busy");
    }
  });
}
