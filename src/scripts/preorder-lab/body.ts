// Sizing data and fit logic for the /preorder-lab fitting room.
// Garment numbers come from the f2026-drop size charts in Figma (nodes 447:2 and 416:61).

export type Sex = "female" | "male";
export type Body = { sex: Sex; heightCm: number; weightKg: number };

export const DEFAULT_BODY: Body = { sex: "female", heightCm: 168, weightKg: 62 };

const IN = 2.54;

// Shirt size chart, inches. frontChest = flat width pit to pit, length from the high point of the
// shoulder, sleeve from the shoulder seam, shoulder = collar to shoulder seam.
export const SHIRT_CHART = {
  XS: { frontChest: 23.0, length: 26.0, sleeve: 8.0, shoulder: 8.0 },
  S: { frontChest: 24.0, length: 26.5, sleeve: 8.0, shoulder: 9.0 },
  M: { frontChest: 24.5, length: 27.0, sleeve: 8.5, shoulder: 9.0 },
  L: { frontChest: 25.0, length: 27.5, sleeve: 9.0, shoulder: 9.5 },
  XL: { frontChest: 26.0, length: 28.5, sleeve: 9.0, shoulder: 10.0 },
  XXL: { frontChest: 27.0, length: 28.5, sleeve: 9.5, shoulder: 10.0 },
  XXXL: { frontChest: 28.5, length: 29.0, sleeve: 10.0, shoulder: 10.5 },
} as const;

export type ShirtSize = keyof typeof SHIRT_CHART;
export const SHIRT_SIZES = Object.keys(SHIRT_CHART) as ShirtSize[];

/** Shirt measurements in metres (chest as full circumference). */
export const shirtMetres = (size: ShirtSize) => {
  const s = SHIRT_CHART[size];
  return {
    chest: (s.frontChest * 2 * IN) / 100,
    length: (s.length * IN) / 100,
    sleeve: (s.sleeve * IN) / 100,
    shoulder: (s.shoulder * IN) / 100,
  };
};

// Sock sizes by US shoe size (upper bound is exclusive except for the largest).
// shoe holds the chart's columns as printed.
export const SOCK_CHART = {
  S: { us: [3, 6], label: "US 3–6 · EU 34–37", shoe: { us: "3–6", au: "1–3", eu: "34–37", uk: "2–4.5" } },
  M: { us: [6, 9], label: "US 6–9 · EU 38–42", shoe: { us: "6–9", au: "4–6", eu: "38–42", uk: "5–7.5" } },
  L: { us: [9, 12], label: "US 9–12 · EU 43–46", shoe: { us: "9–12", au: "7–10", eu: "43–46", uk: "8–11" } },
  XL: { us: [12, 15], label: "US 12–15 · EU 47–51", shoe: { us: "12–15", au: "11–14", eu: "47–51", uk: "11.5–14.5" } },
} as const;

export type SockSize = keyof typeof SOCK_CHART;
export const SOCK_SIZES = Object.keys(SOCK_CHART) as SockSize[];

/** Rough US shoe size from foot length (Brannock-style approximation). */
export const usShoeSize = (footLengthM: number, sex: Sex) => {
  const inches = (footLengthM * 100) / IN;
  return sex === "male" ? 3 * inches - 22 : 3 * inches - 20.5;
};

export const sockSizeFor = (shoe: number): SockSize =>
  SOCK_SIZES.find((size) => shoe < SOCK_CHART[size].us[1]) ?? "XL";

export type Fit = { size: ShirtSize; ease: number; label: string; bodyChest: number; garmentChest: number };

/** How a shirt size sits: ease = garment chest minus body chest, in cm. */
export const fitFor = (bodyChestM: number, size: ShirtSize): Fit => {
  const garmentChest = shirtMetres(size).chest * 100;
  const bodyChest = bodyChestM * 100;
  const ease = garmentChest - bodyChest;
  const label =
    ease < 2 ? "too tight"
    : ease < 10 ? "fitted"
    : ease < 18 ? "relaxed"
    : ease < 32 ? "oversized, as designed"
    : "very baggy";
  return { size, ease, label, bodyChest, garmentChest };
};

/** Smallest size that gives the intended oversized drape (~18 cm of ease). */
export const recommendedShirt = (bodyChestM: number): ShirtSize =>
  SHIRT_SIZES.find((size) => fitFor(bodyChestM, size).ease >= 18) ?? SHIRT_SIZES[SHIRT_SIZES.length - 1];

export const cmToFeet = (cm: number) => {
  const inches = Math.round(cm / IN);
  return `${Math.floor(inches / 12)}′${inches % 12}″`;
};

export const kgToLb = (kg: number) => Math.round(kg * 2.20462);
