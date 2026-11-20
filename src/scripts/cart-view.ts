// Draws cart lines (thumbnail, name + size, quantity stepper, price, trash button) into a list.
// Used by the homepage cart drawer and /preorder; each styles .cart-line for its own page.
// A line never goes below 1 with "−" (the trash button removes it), and the last line in the
// cart can't be removed, so these controls never empty the cart.
import { MAX_QTY, lineKey, money, setLineQty, writeCart, type Cart } from "./cart";
import { products } from "./preorder-items-data";

export const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

const TRASH_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`;

/** a − n + stepper. The buttons carry data-step; the caller handles clicks. */
export const qtyStepper = (value: number, label: string, focusKey = "") => {
  const group = document.createElement("div");
  group.className = "qty";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `quantity, ${label}`);

  const step = (delta: -1 | 1) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qty__step";
    button.dataset.step = String(delta);
    if (focusKey) button.dataset.focusKey = `${focusKey}:${delta}`;
    button.textContent = delta < 0 ? "−" : "+";
    button.setAttribute("aria-label", delta < 0 ? `one fewer ${label}` : `one more ${label}`);
    return button;
  };
  const fewer = step(-1);
  const more = step(1);
  fewer.disabled = value <= 1;
  more.disabled = value >= MAX_QTY;

  const output = document.createElement("output");
  output.className = "qty__value";
  output.value = String(value);

  group.append(fewer, output, more);
  return group;
};

export const renderCartLines = (
  list: HTMLElement,
  cart: Cart,
  prices: Record<string, number>,
) => {
  // redrawing replaces the buttons, so put keyboard focus back where it was
  // (only focus inside this list; a redraw from elsewhere must not pull focus here)
  const active = document.activeElement as HTMLElement | null;
  const focused = active && list.contains(active) ? active.dataset.focusKey : undefined;

  list.replaceChildren(
    ...cart.lines.map((line) => {
      const key = lineKey(line);
      const name = productName(line.item);
      const label = line.size ? `${name}, size ${line.size}` : name;

      const row = document.createElement("li");
      row.className = "cart-line";

      const thumb = document.createElement("img");
      thumb.className = "cart-line__thumb";
      thumb.src = `/preorder/cutouts/${line.item}.webp`; // trimmed, so the item fills its square
      thumb.alt = "";

      const text = document.createElement("div");
      text.className = "cart-line__text";
      const title = document.createElement("span");
      title.className = "cart-line__name";
      title.textContent = name;
      text.append(title);
      if (line.size) {
        const size = document.createElement("span");
        size.className = "cart-line__meta";
        size.textContent = `size ${line.size}`;
        text.append(size);
      }
      const stepper = qtyStepper(line.qty, label, key);
      stepper.addEventListener("click", (event) => {
        const step = (event.target as Element).closest<HTMLButtonElement>("[data-step]");
        if (step) writeCart(setLineQty(cart, key, Math.max(1, line.qty + Number(step.dataset.step))));
      });

      const price = document.createElement("output");
      price.className = "cart-line__price";
      price.value = Object.hasOwn(prices, line.item) ? money(prices[line.item] * line.qty) : "—";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cart-line__remove";
      remove.innerHTML = TRASH_ICON;
      remove.dataset.focusKey = `${key}:remove`;
      const last = cart.lines.length === 1;
      remove.disabled = last;
      remove.setAttribute("aria-label", `remove ${label}`);
      remove.title = last ? "your cart needs at least one item" : `remove ${label}`;
      remove.addEventListener("click", () => {
        if (cart.lines.length > 1) writeCart(setLineQty(cart, key, 0));
      });

      row.append(thumb, text, stepper, price, remove);
      return row;
    }),
  );

  if (focused) {
    let again = list.querySelector<HTMLButtonElement>(`[data-focus-key="${CSS.escape(focused)}"]`);
    // a step button just hit its limit and went disabled: move to the other one
    if (again?.disabled && again.dataset.step) {
      const other = again.dataset.step === "1" ? "-1" : "1";
      again = again.parentElement?.querySelector<HTMLButtonElement>(`[data-step="${other}"]`) ?? null;
    }
    // removing a line can leave a single, now-disabled trash button: fall back to the cart
    if (again?.disabled) again = null;
    // the line is gone: fall back to the cart itself
    if (again) again.focus();
    else list.closest<HTMLElement>("[data-cart-focus]")?.focus();
  }
};
