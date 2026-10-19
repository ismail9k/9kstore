/**
 * Pure catalog helpers shared by the admin and the customer pages.
 * No I/O; safe to import from client and server code.
 */
import type { Photo, Product } from "./schema";

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

/** A new product goes first: one below the current minimum, 0 when empty. */
export function nextSortOrder(existing: number[]): number {
  return existing.length === 0 ? 0 : Math.min(...existing) - 1;
}

/** Strips "+", whitespace and dashes; anything else is left for validation. */
export function normalizeWhatsapp(raw: string): string {
  return raw.replace(/[+\s-]/g, "");
}
