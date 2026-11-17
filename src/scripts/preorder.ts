// /preorder: shows the cart filled on the homepage (thumbnail, name, size, quantity, price)
// above the total. Quantities can be changed and lines removed here too; checkout reads the
// cart itself (see preorder-checkout.ts).
import { CART_EVENT, cartTotal, readCart, writeCart, type Cart } from "./cart";
import { renderCartLines } from "./cart-view";
import { readPrices } from "./preorder-data.js";

const init = () => {
  const form = document.querySelector<HTMLFormElement>(".preorder__form");
  const list = form?.querySelector<HTMLElement>("[data-cart-lines]");
  if (!form || !list || form.dataset.cartReady) return;
  form.dataset.cartReady = "true";

  const total = form.querySelector<HTMLOutputElement>("[data-preorder-total]");
  const empty = form.querySelector<HTMLElement>("[data-cart-empty]");
  const next = form.querySelector<HTMLButtonElement>(".preorder__next");
  const prices: Record<string, number> = readPrices();

  const render = (cart: Cart) => {
    renderCartLines(list, cart, prices, (updated) => writeCart(updated));
    if (empty) empty.hidden = cart.lines.length > 0;
    // no preordering an empty cart
    if (next) next.disabled = cart.lines.length === 0;
    if (total) total.value = cartTotal(cart, prices).toFixed(2);
  };

  const controller = new AbortController();
  window.addEventListener(CART_EVENT, (event) => render((event as CustomEvent<Cart>).detail), {
    signal: controller.signal,
  });
  window.addEventListener("storage", () => render(readCart()), { signal: controller.signal });
  document.addEventListener("astro:before-swap", () => controller.abort(), { once: true });

  render(readCart());
};

document.addEventListener("astro:page-load", init);
init();
