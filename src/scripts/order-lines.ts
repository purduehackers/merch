import { SHIRT_SIZES, SOCK_SIZES } from "./preorder-lab/body.ts";

/** product → its sizes, in the order the site shows them. No sizes: one size. */
export const COLUMNS: { item: string; label: string; sizes: string[] }[] = [
  { item: "shirt", label: "Shirt", sizes: SHIRT_SIZES },
  { item: "tote", label: "Tote", sizes: [] },
  { item: "socks", label: "Socks", sizes: SOCK_SIZES },
  { item: "keychain", label: "Keychain", sizes: [] },
];

export type OrderLine = { item: string; size: string | null; qty: number };

/** The order's lines from the session metadata Pluto writes: `lines` is "shirt:M:2,tote::1". */
export const orderLines = (metadata: Record<string, string> | null | undefined): OrderLine[] =>
  (metadata?.lines ?? "")
    .split(",")
    .map((part) => part.split(":"))
    .filter((bits) => bits.length === 3)
    .map(([item, size, qty]) => ({ item, size: size || null, qty: Number(qty) }))
    .filter((line) => line.item && Number.isInteger(line.qty) && line.qty > 0);
