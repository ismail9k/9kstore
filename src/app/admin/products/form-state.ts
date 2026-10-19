/**
 * The product form's draft and its reducer. Pure: no React, no dnd-kit, and
 * imported by a client component, so it reads only types from the schema and
 * the pure catalog helpers (never the server-only `@/lib/catalog` index).
 *
 * Color keys are stable (spec Call 5): a color added in the form gets a
 * temporary `new-<n>` key, renaming never rekeys, and only `assignColorKeys`,
 * run by the save action before validation, turns `new-*` keys into permanent
 * ones. `soldOut` is kept deduplicated, and removing a size or a color drops
 * its sold-out marks.
 */
import { colorKey, slugify } from "@/lib/catalog/helpers";
import type { Color, Photo, Product, ProductInput } from "@/lib/catalog/schema";

export type Draft = ProductInput & { slugEdited: boolean };

type SoldOut = ProductInput["soldOut"];

export const NEW_KEY_PREFIX = "new-";

const NEW_COLOR_SWATCH = "#0a0a0a";

export type Action =
  | { type: "field"; name: keyof ProductInput & string; value: string | number | boolean }
  | { type: "nameEn"; value: string }
  | { type: "slug"; value: string }
  | { type: "addSize"; size: string }
  | { type: "removeSize"; size: string }
  | { type: "moveSize"; from: number; to: number }
  | { type: "addColor" }
  | { type: "removeColor"; key: string }
  | { type: "moveColor"; from: number; to: number }
  | { type: "colorField"; key: string; name: "nameAr" | "nameEn" | "swatch"; value: string }
  | { type: "removePhoto"; key: string; photoKey: string }
  | { type: "movePhoto"; key: string; from: number; to: number }
  | { type: "setStock"; color: string; size: string; inStock: boolean }
  | { type: "setColorStock"; color: string; inStock: boolean }
  | { type: "setSizeStock"; size: string; inStock: boolean }
  | { type: "removeSizeChart" };

function isNewKey(key: string): boolean {
  return key.startsWith(NEW_KEY_PREFIX);
}

/** `new-<n>`, n = 1 + the number of `new-*` keys, bumped past any key still taken (after a removal). */
function newColorKey(colors: Color[]): string {
  const taken = new Set(colors.map((c) => c.key));
  let n = colors.filter((c) => isNewKey(c.key)).length + 1;
  while (taken.has(`${NEW_KEY_PREFIX}${n}`)) n++;
  return `${NEW_KEY_PREFIX}${n}`;
}

function blankColor(key: string): Color {
  return { key, nameAr: "", nameEn: "", swatch: NEW_COLOR_SWATCH, photos: [] };
}

function dedupe(soldOut: SoldOut): SoldOut {
  const seen = new Set<string>();
  return soldOut.filter((s) => {
    const id = JSON.stringify([s.color, s.size]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** A copy of `items` with the item at `from` moved to `to`; unchanged when either index is out of range. */
function move<T>(items: T[], from: number, to: number): T[] {
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < items.length;
  if (!inRange(from) || !inRange(to) || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

function updateColor(draft: Draft, key: string, update: (c: Color) => Color): Draft {
  return { ...draft, colors: draft.colors.map((c) => (c.key === key ? update(c) : c)) };
}

function setPairs(draft: Draft, pairs: SoldOut, inStock: boolean): Draft {
  const isTarget = (s: SoldOut[number]) => pairs.some((p) => p.color === s.color && p.size === s.size);
  const rest = draft.soldOut.filter((s) => !isTarget(s));
  return { ...draft, soldOut: dedupe(inStock ? rest : [...rest, ...pairs]) };
}

export function emptyDraft(): Draft {
  return {
    slug: "",
    nameAr: "",
    nameEn: "",
    descriptionAr: "",
    descriptionEn: "",
    priceEgp: 0,
    code: null,
    sizes: [],
    colors: [blankColor(`${NEW_KEY_PREFIX}1`)],
    soldOut: [],
    sizeChart: null,
    published: false,
    slugEdited: false,
  };
}

export function draftFromProduct(p: Product): Draft {
  return {
    slug: p.slug,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    descriptionAr: p.descriptionAr,
    descriptionEn: p.descriptionEn,
    priceEgp: p.priceEgp,
    code: p.code,
    sizes: p.sizes,
    colors: p.colors,
    soldOut: dedupe(p.soldOut),
    sizeChart: p.sizeChart,
    published: p.published,
    slugEdited: true,
  };
}

/**
 * Gives every `new-*` color its permanent key from its English name, unique
 * among the keys already taken, and rewrites its sold-out pairs. Saved keys
 * are never changed.
 */
export function assignColorKeys(draft: Draft): Draft {
  const taken = new Set(draft.colors.filter((c) => !isNewKey(c.key)).map((c) => c.key));
  const renamed = new Map<string, string>();
  const colors = draft.colors.map((c) => {
    if (!isNewKey(c.key)) return c;
    const key = colorKey(c.nameEn, taken);
    taken.add(key);
    renamed.set(c.key, key);
    return { ...c, key };
  });
  const soldOut = dedupe(draft.soldOut.map((s) => ({ ...s, color: renamed.get(s.color) ?? s.color })));
  return { ...draft, colors, soldOut };
}

export function reduce(draft: Draft, action: Action): Draft {
  switch (action.type) {
    case "field":
      return { ...draft, [action.name]: action.value };
    case "nameEn":
      return { ...draft, nameEn: action.value, slug: draft.slugEdited ? draft.slug : slugify(action.value) };
    case "slug":
      return { ...draft, slug: action.value, slugEdited: true };
    case "addSize": {
      const size = action.size.trim();
      if (!size || draft.sizes.includes(size)) return draft;
      // A new size is in stock for every color (spec Call 10): no sold-out marks.
      return { ...draft, sizes: [...draft.sizes, size] };
    }
    case "removeSize":
      return {
        ...draft,
        sizes: draft.sizes.filter((s) => s !== action.size),
        soldOut: draft.soldOut.filter((s) => s.size !== action.size),
      };
    case "moveSize":
      return { ...draft, sizes: move(draft.sizes, action.from, action.to) };
    case "addColor":
      return { ...draft, colors: [...draft.colors, blankColor(newColorKey(draft.colors))] };
    case "removeColor":
      return {
        ...draft,
        colors: draft.colors.filter((c) => c.key !== action.key),
        soldOut: draft.soldOut.filter((s) => s.color !== action.key),
      };
    case "moveColor":
      return { ...draft, colors: move(draft.colors, action.from, action.to) };
    case "colorField":
      return updateColor(draft, action.key, (c) => ({ ...c, [action.name]: action.value }));
    case "removePhoto":
      return updateColor(draft, action.key, (c) => ({
        ...c,
        photos: c.photos.filter((p: Photo) => p.key !== action.photoKey),
      }));
    case "movePhoto":
      return updateColor(draft, action.key, (c) => ({ ...c, photos: move(c.photos, action.from, action.to) }));
    case "setStock":
      return setPairs(draft, [{ color: action.color, size: action.size }], action.inStock);
    case "setColorStock":
      return setPairs(
        draft,
        draft.sizes.map((size) => ({ color: action.color, size })),
        action.inStock,
      );
    case "setSizeStock":
      return setPairs(
        draft,
        draft.colors.map((c) => ({ color: c.key, size: action.size })),
        action.inStock,
      );
    case "removeSizeChart":
      return { ...draft, sizeChart: null };
  }
}
