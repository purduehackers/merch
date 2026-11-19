// The W2026 cart, kept in this browser so the homepage can hand it to /preorder.
// A cart is a list of lines: an item, its size (shirt and socks only) and how many. The same
// item in two sizes is two lines. /api/checkout takes these lines as they are.

export type CartLine = { item: string; size?: string; qty: number };
export type Cart = { lines: CartLine[] };

/** most of one line (item + size) a single order can hold; the server checks the same limit */
export const MAX_QTY = 10;

const KEY = "ph-w2026-cart";
/** fired on window whenever the cart is saved, so every view of it can redraw */
export const CART_EVENT = "ph:cart-change";

const clampQty = (qty: number) => Math.min(MAX_QTY, Math.max(0, Math.floor(qty)));

export const lineKey = (line: Pick<CartLine, "item" | "size">) => (line.size ? `${line.item}:${line.size}` : line.item);

const parse = (raw: unknown): Cart => {
  if (!raw || typeof raw !== "object") return { lines: [] };
  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.lines)) {
    let cart: Cart = { lines: [] };
    for (const line of data.lines) {
      if (!line || typeof line !== "object") continue;
      const { item, size, qty } = line as Record<string, unknown>;
      if (typeof item !== "string" || typeof qty !== "number") continue;
      cart = addToCart(cart, item, typeof size === "string" ? size : undefined, qty);
    }
    return cart;
  }

  // the first cart: { items: [...], shirt_size, sock_size }, one of each
  if (Array.isArray(data.items)) {
    const sizes: Record<string, unknown> = { shirt: data.shirt_size, socks: data.sock_size };
    let cart: Cart = { lines: [] };
    for (const item of data.items) {
      if (typeof item !== "string") continue;
      const size = sizes[item];
      cart = addToCart(cart, item, typeof size === "string" ? size : undefined, 1);
    }
    return cart;
  }

  return { lines: [] };
};

export const readCart = (): Cart => {
  try {
    return parse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    // storage blocked or junk in it: start empty
    return { lines: [] };
  }
};

export const writeCart = (cart: Cart) => {
  try {
    if (cart.lines.length) localStorage.setItem(KEY, JSON.stringify(cart));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the cart just won't survive the page change
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: cart }));
};

export const clearCart = () => writeCart({ lines: [] });

/** adds qty to the line for item + size (making it if needed), up to MAX_QTY */
export const addToCart = (cart: Cart, item: string, size: string | undefined, qty: number): Cart => {
  const key = lineKey({ item, size });
  const existing = cart.lines.find((line) => lineKey(line) === key);
  const next = clampQty((existing?.qty ?? 0) + qty);
  if (!next) return cart;
  return {
    lines: existing
      ? cart.lines.map((line) => (line === existing ? { ...line, qty: next } : line))
      : [...cart.lines, { item, ...(size ? { size } : {}), qty: next }],
  };
};

/** sets one line's quantity; 0 removes it */
export const setLineQty = (cart: Cart, key: string, qty: number): Cart => {
  const next = clampQty(qty);
  return {
    lines: next
      ? cart.lines.map((line) => (lineKey(line) === key ? { ...line, qty: next } : line))
      : cart.lines.filter((line) => lineKey(line) !== key),
  };
};

export const lineQty = (cart: Cart, item: string, size?: string) =>
  cart.lines.find((line) => lineKey(line) === lineKey({ item, size }))?.qty ?? 0;

export const itemCount = (cart: Cart, item?: string) =>
  cart.lines.reduce((sum, line) => (item && line.item !== item ? sum : sum + line.qty), 0);

export function cartTotal(cart: Cart, prices: Record<string, number>): number | null {
  let total = 0;
  for (const { item, qty } of cart.lines) {
    if (!Object.hasOwn(prices, item)) return null;
    total += prices[item] * qty;
  }
  return total;
}

export const money = (amount: number) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
