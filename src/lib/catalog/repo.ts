/**
 * The catalog's data-access layer over D1. Server-only.
 *
 * Reads are never cached: every call goes to D1 for the current request, so
 * the owner's edits reach the site without a deploy. Customer pages that show
 * product data must opt out of static rendering themselves (read at request
 * time); nothing here can make a statically rendered page fresh.
 *
 * Inputs are validated again here with the zod schemas, so the rules hold
 * for every caller, not only the admin form.
 */
import "server-only";

import { getDb } from "@/lib/db";

import { nextSortOrder, uniqueSlug } from "./helpers";
import { productToRow, rowToProduct, rowToSettings, type ProductRow, type SettingsRow } from "./rows";
import {
  productInputSchema,
  settingsInputSchema,
  type Product,
  type ProductInput,
  type Settings,
  type SettingsInput,
} from "./schema";

/** `slugTaken` means the owner typed a link name another product already uses. */
export type SaveResult = { ok: true; product: Product } | { ok: false; slugTaken: true };

type SaveOptions = { slugEdited: boolean };

const SLUG_MAX = 80;

const PRODUCT_COLUMNS = [
  "id",
  "slug",
  "name_ar",
  "name_en",
  "description_ar",
  "description_en",
  "price_egp",
  "code",
  "sizes",
  "colors",
  "sold_out",
  "size_chart",
  "published",
  "sort_order",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ProductRow)[];

const INSERT_PRODUCT = `INSERT INTO products (${PRODUCT_COLUMNS.join(", ")}) VALUES (${PRODUCT_COLUMNS.map((_, i) => `?${i + 1}`).join(", ")})`;

/** Every column but `id`, bound in PRODUCT_COLUMNS order; `id` is the last parameter. */
const UPDATE_COLUMNS = PRODUCT_COLUMNS.filter((c) => c !== "id");
const UPDATE_PRODUCT = `UPDATE products SET ${UPDATE_COLUMNS.map((c, i) => `${c} = ?${i + 1}`).join(", ")} WHERE id = ?${UPDATE_COLUMNS.length + 1}`;

const now = () => new Date().toISOString();

function isSlugConflict(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed: products\.slug/.test(err.message);
}

/** Slugs equal to `base` or of the form `base-…`, ignoring the product being edited. */
async function slugsLike(db: D1Database, base: string, excludeId: string | null): Promise<string[]> {
  // Slugs are [a-z0-9-] only, so LIKE's `_`/`%` wildcards and ASCII case-folding can't misfire;
  // the LIKE rows only feed uniqueSlug, the exact "taken" check is done with === below.
  const { results } = await db
    .prepare("SELECT slug FROM products WHERE (slug = ?1 OR slug LIKE ?1 || '-%') AND id IS NOT ?2")
    .bind(base, excludeId)
    .all<{ slug: string }>();
  return results.map((r) => r.slug);
}

/**
 * The slug to save, or null when the owner typed a slug that is taken.
 * An auto-filled slug that collides gets `-2`, `-3`…, shortened if needed to stay within 80 characters.
 */
async function resolveSlug(db: D1Database, slug: string, opts: SaveOptions, excludeId: string | null): Promise<string | null> {
  const existing = await slugsLike(db, slug, excludeId);
  if (!existing.some((s) => s === slug)) return slug;
  if (opts.slugEdited) return null;

  let base = slug;
  let others = existing;
  for (;;) {
    const candidate = uniqueSlug(base, others);
    if (candidate.length <= SLUG_MAX) return candidate;
    base = base.slice(0, SLUG_MAX - (candidate.length - base.length)).replace(/-+$/, "") || "product";
    others = await slugsLike(db, base, excludeId);
  }
}

export async function listProducts(opts?: { publishedOnly?: boolean }): Promise<Product[]> {
  const db = await getDb();
  const where = opts?.publishedOnly ? "WHERE published = 1 " : "";
  const { results } = await db
    .prepare(`SELECT * FROM products ${where}ORDER BY sort_order ASC, created_at DESC`)
    .all<ProductRow>();
  return results.map(rowToProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM products WHERE id = ?1").bind(id).first<ProductRow>();
  return row ? rowToProduct(row) : null;
}

/** Includes hidden products, so an old link can say "no longer available". */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM products WHERE slug = ?1").bind(slug).first<ProductRow>();
  return row ? rowToProduct(row) : null;
}

/** A new product goes first in the catalog. */
export async function createProduct(input: ProductInput, opts: SaveOptions): Promise<SaveResult> {
  const data = productInputSchema.parse(input);
  const db = await getDb();

  const slug = await resolveSlug(db, data.slug, opts, null);
  if (slug === null) return { ok: false, slugTaken: true };

  const min = await db.prepare("SELECT MIN(sort_order) AS min FROM products").first<{ min: number | null }>();
  const timestamp = now();
  const product: Product = {
    ...data,
    slug,
    id: crypto.randomUUID(),
    sortOrder: nextSortOrder(min?.min == null ? [] : [min.min]),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const row = productToRow(product);
  try {
    await db
      .prepare(INSERT_PRODUCT)
      .bind(...PRODUCT_COLUMNS.map((c) => row[c]))
      .run();
  } catch (err) {
    if (isSlugConflict(err)) return { ok: false, slugTaken: true };
    throw err;
  }
  return { ok: true, product };
}

/** Replaces the product's fields; `id`, `sortOrder` and `createdAt` are kept. Throws for an unknown id. */
export async function updateProduct(id: string, input: ProductInput, opts: SaveOptions): Promise<SaveResult> {
  const data = productInputSchema.parse(input);
  const db = await getDb();

  const current = await db
    .prepare("SELECT sort_order, created_at FROM products WHERE id = ?1")
    .bind(id)
    .first<Pick<ProductRow, "sort_order" | "created_at">>();
  if (!current) throw new Error(`Product ${id} not found`);

  const slug = await resolveSlug(db, data.slug, opts, id);
  if (slug === null) return { ok: false, slugTaken: true };

  const product: Product = {
    ...data,
    slug,
    id,
    sortOrder: current.sort_order,
    createdAt: current.created_at,
    updatedAt: now(),
  };

  const row = productToRow(product);
  try {
    await db
      .prepare(UPDATE_PRODUCT)
      .bind(...UPDATE_COLUMNS.map((c) => row[c]), id)
      .run();
  } catch (err) {
    if (isSlugConflict(err)) return { ok: false, slugTaken: true };
    throw err;
  }
  return { ok: true, product };
}

/** Throws for an unknown id. */
export async function setPublished(id: string, published: boolean): Promise<void> {
  const db = await getDb();
  const { meta } = await db
    .prepare("UPDATE products SET published = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(published ? 1 : 0, now(), id)
    .run();
  if (meta.changes === 0) throw new Error(`Product ${id} not found`);
}

/** `sort_order` becomes each id's index, in one batch. Unknown ids are ignored. */
export async function reorderProducts(idsInOrder: string[]): Promise<void> {
  if (idsInOrder.length === 0) return;
  const db = await getDb();
  const stmt = db.prepare("UPDATE products SET sort_order = ?1 WHERE id = ?2");
  await db.batch(idsInOrder.map((id, i) => stmt.bind(i, id)));
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM settings WHERE id = 1").first<SettingsRow>();
  if (!row) throw new Error("The settings row is missing; apply migrations/0001_catalog.sql");
  return rowToSettings(row);
}

export async function updateSettings(input: SettingsInput): Promise<Settings> {
  const s = settingsInputSchema.parse(input);
  const db = await getDb();
  const { meta } = await db
    .prepare(
      `UPDATE settings SET store_name = ?1, whatsapp_number = ?2, greeting_ar = ?3, greeting_en = ?4,
         instagram_url = ?5, logo = ?6, updated_at = ?7 WHERE id = 1`,
    )
    .bind(
      s.storeName,
      s.whatsappNumber,
      s.greetingAr,
      s.greetingEn,
      s.instagramUrl,
      s.logo === null ? null : JSON.stringify(s.logo),
      now(),
    )
    .run();
  if (meta.changes === 0) throw new Error("The settings row is missing; apply migrations/0001_catalog.sql");
  return getSettings();
}
