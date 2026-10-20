/**
 * Pure mapping between D1 rows (snake_case columns, JSON text for nested
 * fields, 0/1 for booleans) and the catalog objects. Reads are validated with
 * the zod schemas: a corrupt row throws a clear error from `rowToProduct`
 * instead of reaching a page half-broken, and `parseProductRows` collects
 * such failures for list reads so one bad row cannot fail the whole list.
 */
import { productSchema, settingsSchema, type Product, type Settings } from "./schema";

/** A `products` row as D1 returns it (see migrations/0001_catalog.sql and 0003_was_published.sql). */
export type ProductRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  price_egp: number;
  code: string | null;
  sizes: string; // JSON string[]
  colors: string; // JSON Color[]
  sold_out: string; // JSON {color,size}[]
  size_chart: string | null; // JSON Photo or NULL
  published: number; // 0/1
  was_published: number; // 0/1, 1 once ever published
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** The single `settings` row (id is always 1). */
export type SettingsRow = {
  id: number;
  store_name: string;
  whatsapp_number: string;
  greeting_ar: string;
  greeting_en: string;
  instagram_url: string;
  logo: string | null; // JSON Photo or NULL
  updated_at: string;
};

function parseJson(column: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Stored product column "${column}" is not valid JSON`);
  }
}

export function rowToProduct(row: ProductRow): Product {
  return productSchema.parse({
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en,
    priceEgp: row.price_egp,
    code: row.code,
    sizes: parseJson("sizes", row.sizes),
    colors: parseJson("colors", row.colors),
    soldOut: parseJson("sold_out", row.sold_out),
    sizeChart: row.size_chart === null ? null : parseJson("size_chart", row.size_chart),
    published: row.published === 1,
    wasPublished: row.was_published === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** Parses each row, keeping the good ones and naming each one that fails, with why. */
export function parseProductRows(rows: ProductRow[]): {
  products: Product[];
  rejected: { id: string; reason: string }[];
} {
  const products: Product[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const row of rows) {
    try {
      products.push(rowToProduct(row));
    } catch (err) {
      rejected.push({ id: row.id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { products, rejected };
}

export function productToRow(p: Product): ProductRow {
  return {
    id: p.id,
    slug: p.slug,
    name_ar: p.nameAr,
    name_en: p.nameEn,
    description_ar: p.descriptionAr,
    description_en: p.descriptionEn,
    price_egp: p.priceEgp,
    code: p.code,
    sizes: JSON.stringify(p.sizes),
    colors: JSON.stringify(p.colors),
    sold_out: JSON.stringify(p.soldOut),
    size_chart: p.sizeChart === null ? null : JSON.stringify(p.sizeChart),
    published: p.published ? 1 : 0,
    was_published: p.wasPublished ? 1 : 0,
    sort_order: p.sortOrder,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function rowToSettings(row: SettingsRow): Settings {
  return settingsSchema.parse({
    storeName: row.store_name,
    whatsappNumber: row.whatsapp_number,
    greetingAr: row.greeting_ar,
    greetingEn: row.greeting_en,
    instagramUrl: row.instagram_url,
    logo: row.logo === null ? null : parseJson("logo", row.logo),
    updatedAt: row.updated_at,
  });
}

export function settingsToRow(s: Settings): SettingsRow {
  return {
    id: 1,
    store_name: s.storeName,
    whatsapp_number: s.whatsappNumber,
    greeting_ar: s.greetingAr,
    greeting_en: s.greetingEn,
    instagram_url: s.instagramUrl,
    logo: s.logo === null ? null : JSON.stringify(s.logo),
    updated_at: s.updatedAt,
  };
}
