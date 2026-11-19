// Homepage cart. Each detail panel has a quantity stepper and an add button; adding puts that
// many of the item (in the picked size) into the cart, on top of any already there. The cart
// button in the shop header opens a drawer to change quantities or remove lines, and the main
// button becomes checkout once there's something in it. /preorder picks the cart up.
import { CART_EVENT, MAX_QTY, addToCart, cartTotal, itemCount, lineQty, money, readCart, writeCart, type Cart } from "./cart";
import { renderCartLines } from "./cart-view";
import { readPrices } from "./preorder-data.js";

const SIZED = new Set(["shirt", "socks"]);

const init = () => {
  const shop = document.querySelector<HTMLElement>("[data-shop]");
  if (!shop || shop.dataset.cartReady) return;
  shop.dataset.cartReady = "true";

  const prices: Record<string, number> = readPrices();
  const main = shop.querySelector<HTMLAnchorElement>("a.home__preorder");
  const checkout = main?.querySelector<HTMLElement>(".ph-dither-btn__label");
  const count = shop.querySelector<HTMLElement>("[data-cart-count]");
  const drawer = shop.querySelector<HTMLDialogElement>("[data-cart-drawer]");
  const lines = shop.querySelector<HTMLElement>("[data-cart-lines]");
  const empty = shop.querySelector<HTMLElement>("[data-cart-empty]");
  const foot = shop.querySelector<HTMLElement>("[data-cart-foot]");
  const total = shop.querySelector<HTMLOutputElement>("[data-cart-total]");
  let cart: Cart = readCart();
  const pending = new Map<string, number>(); // the stepper's count, per item
  const flash = new Map<string, number>(); // "added" timers, per item

  const sizeInputs = (item: string) => [...shop.querySelectorAll<HTMLInputElement>(`[data-size-for="${item}"]`)];
  const chosenSize = (item: string) => sizeInputs(item).find((input) => input.checked)?.value;
  const setError = (item: string, text: string) => {
    const error = shop.querySelector<HTMLElement>(`[data-add-error="${item}"]`);
    if (error) error.textContent = text;
  };

  // how many more of this item (in the picked size) the cart can take
  const room = (item: string) => MAX_QTY - lineQty(cart, item, chosenSize(item));

  const renderBuy = (item: string) => {
    const qty = pending.get(item) ?? 1;
    const group = shop.querySelector<HTMLElement>(`[data-qty-for="${item}"]`);
    const value = group?.querySelector<HTMLOutputElement>("[data-qty-value]");
    if (value) value.value = String(qty);
    const [fewer, more] = group?.querySelectorAll<HTMLButtonElement>("[data-step]") ?? [];
    if (fewer) fewer.disabled = qty <= 1;
    if (more) more.disabled = qty >= Math.max(1, room(item));

    const button = shop.querySelector<HTMLButtonElement>(`[data-add="${item}"]`);
    if (!button || flash.has(item)) return;
    const price = prices[item];
    button.textContent = price != null ? `add to cart · ${money(price * qty)}` : "add to cart";
    button.classList.remove("is-added");
  };

  const render = () => {
    const items = itemCount(cart);
    for (const button of shop.querySelectorAll<HTMLButtonElement>("[data-add]")) renderBuy(button.dataset.add!);
    for (const state of shop.querySelectorAll<HTMLElement>("[data-cart-state]")) {
      const n = itemCount(cart, state.dataset.cartState);
      state.textContent = n ? `${n} in cart` : "";
    }
    if (count) count.textContent = String(items);
    if (checkout) checkout.textContent = items ? `CHECKOUT (${items})` : "ADD AN ITEM TO PREORDER";
    // nothing to preorder yet: the button goes nowhere (an <a> without href, marked disabled)
    if (main) {
      if (items) {
        main.href = "/preorder";
        main.removeAttribute("aria-disabled");
        main.removeAttribute("role");
      } else {
        main.removeAttribute("href");
        main.setAttribute("role", "link");
        main.setAttribute("aria-disabled", "true");
        main.classList.remove("is-lit");
      }
    }

    if (lines) renderCartLines(lines, cart, prices, (next) => writeCart(next));
    if (empty) empty.hidden = items > 0;
    if (foot) foot.hidden = items === 0;
    const subtotal = cartTotal(cart, prices);
    if (total) total.value = subtotal === null ? "price unavailable" : money(subtotal);
  };

  // any change to the cart (here, in the drawer, or another tab) lands here
  const controller = new AbortController();
  const { signal } = controller;
  window.addEventListener(CART_EVENT, (event) => {
    cart = (event as CustomEvent<Cart>).detail;
    render();
  }, { signal });
  window.addEventListener("storage", () => {
    cart = readCart();
    render();
  }, { signal });
  // back from /preorder through history: the cart may have changed there
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    cart = readCart();
    render();
  }, { signal });
  document.addEventListener("astro:before-swap", () => {
    controller.abort();
    for (const timer of flash.values()) clearTimeout(timer);
  }, { once: true });

  shop.addEventListener("click", (event) => {
    const target = event.target as Element;

    const step = target.closest<HTMLButtonElement>("[data-qty-for] [data-step]");
    if (step) {
      const item = step.closest<HTMLElement>("[data-qty-for]")!.dataset.qtyFor!;
      const next = (pending.get(item) ?? 1) + Number(step.dataset.step);
      pending.set(item, Math.min(Math.max(1, room(item)), Math.max(1, next)));
      renderBuy(item);
      return;
    }

    const add = target.closest<HTMLButtonElement>("[data-add]");
    if (add) {
      const item = add.dataset.add!;
      const size = SIZED.has(item) ? chosenSize(item) : undefined;
      if (SIZED.has(item) && !size) {
        setError(item, "pick a size first");
        sizeInputs(item)[0]?.focus();
        return;
      }
      if (room(item) <= 0) {
        setError(item, `that's the most we can take per order (${MAX_QTY})`);
        return;
      }
      const qty = Math.min(pending.get(item) ?? 1, room(item));
      setError(item, "");
      pending.set(item, 1);

      clearTimeout(flash.get(item));
      add.textContent = `added ${qty}`;
      add.classList.add("is-added");
      flash.set(item, window.setTimeout(() => {
        flash.delete(item);
        renderBuy(item);
      }, 1400));

      writeCart(addToCart(cart, item, size, qty));
      return;
    }

    if (target.closest("[data-cart-open]")) {
      drawer?.showModal();
      return;
    }
    if (target.closest("[data-cart-close]") || target === drawer) drawer?.close();
  });

  // a new size can have a different amount already in the cart
  shop.addEventListener("change", (event) => {
    const item = (event.target as HTMLInputElement).dataset.sizeFor;
    if (!item) return;
    setError(item, "");
    pending.set(item, Math.min(pending.get(item) ?? 1, Math.max(1, room(item))));
    renderBuy(item);
  });

  render();
};

document.addEventListener("astro:page-load", init);
init();
