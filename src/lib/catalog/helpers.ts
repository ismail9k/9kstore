/**
 * Pure catalog helpers shared by the admin and the customer pages.
 * No I/O; safe to import from client and server code.
 */
import type { Locale } from "@/lib/i18n/locales";

import type { Color, Photo, Product } from "./schema";

type StockFields = Pick<Product, "sizes" | "colors" | "soldOut">;

/**
 * Lowercase ASCII letters and digits joined by single hyphens.
 * Non-Latin input (an Arabic-only name) or punctuation-only input yields "";
 * the caller decides the fallback.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `base`, or `base-2`, `base-3`… — the first one not in `existing`. */
export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** A color key unique within the product, derived from the English name. */
export function colorKey(nameEn: string, existing: Iterable<string>): string {
  return uniqueSlug(slugify(nameEn) || "color", existing);
}

/** False when the pair is marked sold out, or the color or size does not exist. */
export function isInStock(p: StockFields, colorKey: string, size: string): boolean {
  if (!p.sizes.includes(size)) return false;
  if (!p.colors.some((c) => c.key === colorKey)) return false;
  return !p.soldOut.some((s) => s.color === colorKey && s.size === size);
}

/** True when every color × size pair is sold out, or there is nothing to buy. */
export function isSoldOut(p: StockFields): boolean {
  return !p.colors.some((c) => p.sizes.some((size) => isInStock(p, c.key, size)));
}

/** The first photo of the first color, the catalog card photo. */
export function cardPhoto(p: Pick<Product, "colors">): Photo | null {
  return p.colors[0]?.photos[0] ?? null;
}

/** The most colors a product hangs on the home page rail. */
export const RAIL_MAX = 4;

/** The Arabic or English name, by locale. */
export function nameIn(item: { nameAr: string; nameEn: string }, locale: Locale): string {
  return locale === "ar" ? item.nameAr : item.nameEn;
}

/** A color's rail photo: its second photo (on the hanger) when it has two or more, else its first. */
export function railPhoto(color: Color): Photo | null {
  return color.photos[1] ?? color.photos[0] ?? null;
}

/** The colors that hang on the rail, in the owner's order: photoless ones skipped, at most RAIL_MAX. */
export function railItems(product: Pick<Product, "colors">): { color: Color; photo: Photo }[] {
  const items: { color: Color; photo: Photo }[] = [];
  for (const color of product.colors) {
    const photo = railPhoto(color);
    if (photo) items.push({ color, photo });
  }
  return items.slice(0, RAIL_MAX);
}

/** The home page hero: the first product with at least one rail item, else null. */
export function featuredProduct(products: Product[]): Product | null {
  return products.find((p) => railItems(p).length > 0) ?? null;
}

/** A new product goes first: one below the current minimum, 0 when empty. */
export function nextSortOrder(existing: number[]): number {
  return existing.length === 0 ? 0 : Math.min(...existing) - 1;
}

/** Strips "+", whitespace and dashes; anything else is left for validation. */
export function normalizeWhatsapp(raw: string): string {
  return raw.replace(/[+\s-]/g, "");
}
