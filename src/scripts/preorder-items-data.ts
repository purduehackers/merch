// Copy + images for the /preorder-items popups. Edit freely: names, blurbs and descriptions are drafts.
// Add more photos/mockups to `images` and the popup carousel picks them up (dots + swipe appear at 2+).
export type ProductId = "shirt" | "tote" | "socks" | "keychain";

export type Product = {
  id: ProductId;
  name: string;
  blurb: string;
  title: string[];
  description: string[];
  images: { src: string; alt: string }[];
  /** which size chart + size picker to show */
  sizing?: "shirt" | "socks";
  /** shown instead of a chart for one-size items */
  oneSize?: string;
  /** other designs a buyer might get, with a note on how one is picked */
  variants?: {
    caption: string;
    note: string;
    images: { src: string; alt: string; width: number; height: number; nodeId?: string }[];
  };
};

export const SEASON = "winter 2026";

export const products: Product[] = [
  {
    id: "shirt",
    name: "shirt",
    blurb: "black tee, ascii side-scroller",
    title: ["ASCII", "TEE"],
    description: [
      "a black tee with an ascii side-scroller across the front: a little hacker at START!, platforms, fish and birds along the way.",
    ],
    images: [{ src: "/preorder/figma-shirt.png", alt: "Black t-shirt with a small ascii side-scroller game printed across the front" }],
    sizing: "shirt",
  },
  {
    id: "tote",
    name: "tote bag",
    blurb: "black tote, ascii sailboat",
    title: ["SHIP IT", "TOTE"],
    description: ["a black tote with an ascii sailboat on a dotted sea, and SHIP IT. underneath."],
    images: [{ src: "/preorder/figma-tote.png", alt: "Black tote bag with a yellow ascii sailboat over blue dotted waves and the words SHIP IT." }],
    oneSize: "one size",
  },
  {
    id: "socks",
    name: "socks",
    blurb: "cream crew socks",
    title: ["SHIP IT", "SOCKS"],
    description: ["cream ribbed crew socks with Ship it knit up the side in black."],
    images: [{ src: "/preorder/figma-socks.png", alt: "Pair of cream crew socks with Ship it knit vertically up the side in black" }],
    sizing: "socks",
  },
  {
    id: "keychain",
    name: "keychain",
    blurb: "creatura + logo charms",
    title: ["CREATURA", "KEYCHAIN"],
    description: ["two charms on a yellow ring: a creatura dino and the purdue hackers logo."],
    images: [{ src: "/preorder/figma-keychain.png", alt: "Keychain with a grey dinosaur charm and a yellow Purdue Hackers logo charm on a yellow ring" }],
    oneSize: "one size",
    // the creatura charm varies; the glider (Purdue Hackers logo) charm is on every keychain.
    // Figma f2026-drop: frog 416:9, squirrel 416:12.
    variants: {
      caption: "other creatura designs",
      note: "creatura charm (frosted acrylic) is picked at random",
      images: [
        { src: "/preorder/keychain/frog.svg", alt: "frog creatura charm", width: 322.912, height: 243.952, nodeId: "416:9" },
        { src: "/preorder/keychain/squirrel.svg", alt: "squirrel creatura charm", width: 308.412, height: 225.53, nodeId: "416:12" },
      ],
    },
  },
];
