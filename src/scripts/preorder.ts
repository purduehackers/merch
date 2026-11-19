// /preorder: shows the cart filled on the homepage (thumbnail, name, size, quantity, price)
// above the total. Quantities can be changed and lines removed here too; checkout reads the
// cart itself (see preorder-checkout.ts).
import { cartTotal, onCartChange, readCart, type Cart } from "./cart";
import { renderCartLines } from "./cart-view";
import { initCheckout } from "./preorder-checkout";
import { readPrices } from "./preorder-data.js";

const init = () => {
  const form = document.querySelector<HTMLFormElement>(".preorder__form");
  const checkout = document.querySelector<HTMLElement>(".preorder__checkout");
  const list = form?.querySelector<HTMLElement>("[data-cart-lines]");
  if (!form || !list || !checkout || form.dataset.cartReady) return;
  form.dataset.cartReady = "true";

  const total = form.querySelector<HTMLOutputElement>("[data-preorder-total]");
  const empty = form.querySelector<HTMLElement>("[data-cart-empty]");
  const next = form.querySelector<HTMLButtonElement>(".preorder__next");
  const prices: Record<string, number> = readPrices();

  const render = (cart: Cart) => {
    renderCartLines(list, cart, prices);
    if (empty) empty.hidden = cart.lines.length > 0;
    const subtotal = cartTotal(cart, prices);
    if (next) next.disabled = cart.lines.length === 0 || subtotal === null;
    if (total) total.value = subtotal === null ? "price unavailable · reload to retry" : subtotal.toFixed(2);
  };

  const controller = new AbortController();
  onCartChange(render, controller.signal);
  document.addEventListener("astro:before-swap", () => controller.abort(), { once: true });

  render(readCart());
  initCheckout(form, checkout, prices, controller.signal);
};

document.addEventListener("astro:page-load", init);
init();
