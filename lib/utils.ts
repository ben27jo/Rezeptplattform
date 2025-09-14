export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function uniqueSorted<T>(arr: T[]): T[] {
  return Array.from(new Set(arr)).sort((a: any, b: any) =>
    String(a).localeCompare(String(b), "de", { sensitivity: "base" })
  );
}

export const cuisines: string[] = [
  "Schweizerisch",
  "Deutsch",
  "Österreichisch",
  "Italienisch",
  "Französisch",
  "Spanisch",
  "Mittelmeer/Mediterran",
  "Griechisch",
  "Türkisch",
  "Arabisch/Levantinisch",
  "Nordafrikanisch",
  "Indisch (Nord)",
  "Indisch (Süd)",
  "Thai",
  "Vietnamesisch",
  "Chinesisch",
  "Japanisch",
  "Koreanisch",
  "Mexikanisch",
  "US-BBQ",
  "Britisch/Irisch",
  "Skandinavisch",
];

import type { Recipe, RecipeIngredient } from "./types";
export function normalizeIngredients(input: Recipe["ingredients"]): string[] {
  if (!input || !Array.isArray(input)) return [];
  return input.map((it) => {
    if (typeof it === "string") return it;
    const { amount, unit, item, note } = it as RecipeIngredient;
    const parts: string[] = [];
    if (amount) parts.push(amount);
    if (unit) parts.push(unit);
    if (item) parts.push(item);
    const base = parts.join(" ").trim();
    return note ? `${base} (${note})` : base;
  });
}

/** Share-Link: lokal & Vercel */
export function buildShareUrl(pantry: Record<string, boolean>) {
  const base =
    (typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_BASE_URL
      : window.location.origin) || "";
  const payload = encodeURIComponent(JSON.stringify(pantry || {}));
  return `${base}/?share=${payload}`;
}
