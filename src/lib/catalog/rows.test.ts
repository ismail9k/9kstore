import { describe, expect, test } from "vitest";

import { parseProductRows, productToRow, rowToProduct, rowToSettings, settingsToRow, type ProductRow, type SettingsRow } from "./rows";
import type { Product, Settings } from "./schema";

function fullProduct(): Product {
  return {
    id: "3f1c2a9e-0000-4000-8000-000000000001",
    slug: "oversized-tee",
    nameAr: "تيشيرت أوفرسايز",
    nameEn: "Oversized Tee",
    descriptionAr: "قطن ثقيل",
    descriptionEn: "Heavy cotton",
    priceEgp: 850,
    code: "TEE-01",
    sizes: ["S", "M", "L"],
    colors: [
      {
        key: "black",
        nameAr: "أسود",
        nameEn: "Black",
        swatch: "#0a0a0a",
        photos: [
          { key: "tee-black-1", width: 1200, height: 1500 },
          { key: "tee-black-2" },
        ],
      },
      { key: "cream", nameAr: "كريمي", nameEn: "Cream", swatch: "#f1ede7", photos: [] },
    ],
    soldOut: [{ color: "black", size: "S" }],
    sizeChart: { key: "tee-size-chart", width: 800, height: 600 },
    published: false,
    wasPublished: true,
    sortOrder: -3,
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T11:30:00.000Z",
  };
}

function fullSettings(): Settings {
  return {
    storeName: "9k Store",
    whatsappNumber: "201012345678",
    greetingAr: "أهلاً 9k Store، حابب أطلب:",
    greetingEn: "Hi 9k Store, I'd like to order:",
    instagramUrl: "https://instagram.com/9kstore",
    logo: { key: "brand-logo", width: 512, height: 512 },
    updatedAt: "2026-10-19T12:00:00.000Z",
  };
}

describe("product rows", () => {
  test("product round-trips through a row", () => {
    const p = fullProduct();
    expect(rowToProduct(productToRow(p))).toEqual(p);
  });

  test("published is stored as 0/1", () => {
    expect(productToRow({ ...fullProduct(), published: true }).published).toBe(1);
    expect(productToRow({ ...fullProduct(), published: false }).published).toBe(0);
    expect(rowToProduct({ ...productToRow(fullProduct()), published: 1 }).published).toBe(true);
  });

  test("was_published is stored as 0/1 and round-trips", () => {
    expect(productToRow({ ...fullProduct(), wasPublished: true }).was_published).toBe(1);
    expect(productToRow({ ...fullProduct(), wasPublished: false }).was_published).toBe(0);
    expect(rowToProduct({ ...productToRow(fullProduct()), was_published: 1 }).wasPublished).toBe(true);
    expect(rowToProduct({ ...productToRow(fullProduct()), was_published: 0 }).wasPublished).toBe(false);
    for (const wasPublished of [true, false]) {
      const p = { ...fullProduct(), wasPublished };
      expect(rowToProduct(productToRow(p))).toEqual(p);
    }
  });

  test("columns are snake_case with JSON text for nested fields", () => {
    const row = productToRow(fullProduct());
    expect(row.name_en).toBe("Oversized Tee");
    expect(row.price_egp).toBe(850);
    expect(row.sort_order).toBe(-3);
    expect(row.created_at).toBe("2026-10-19T10:00:00.000Z");
    expect(JSON.parse(row.sizes)).toEqual(["S", "M", "L"]);
    expect(JSON.parse(row.sold_out)).toEqual([{ color: "black", size: "S" }]);
    expect(JSON.parse(row.colors)[0].photos).toHaveLength(2);
  });

  test("null size chart and code survive the round-trip", () => {
    const p = { ...fullProduct(), sizeChart: null, code: null };
    const row = productToRow(p);
    expect(row.size_chart).toBeNull();
    expect(row.code).toBeNull();
    expect(rowToProduct(row)).toEqual(p);
  });

  test("a corrupt row throws instead of returning a broken product", () => {
    const row: ProductRow = { ...productToRow(fullProduct()), colors: "[]" };
    expect(() => rowToProduct(row)).toThrow();
    expect(() => rowToProduct({ ...productToRow(fullProduct()), sizes: "not json" })).toThrow();
  });
});

describe("settings rows", () => {
  test("settings round-trip with a logo", () => {
    const s = fullSettings();
    const row = settingsToRow(s);
    expect(row.id).toBe(1);
    expect(row.whatsapp_number).toBe("201012345678");
    expect(rowToSettings(row)).toEqual(s);
  });

  test("settings round-trip with no logo", () => {
    const s = { ...fullSettings(), logo: null };
    const row = settingsToRow(s);
    expect(row.logo).toBeNull();
    expect(rowToSettings(row)).toEqual(s);
  });

  test("the freshly migrated settings row reads as valid settings", () => {
    const row: SettingsRow = {
      id: 1,
      store_name: "9k Store",
      whatsapp_number: "",
      greeting_ar: "أهلاً 9k Store، حابب أطلب:",
      greeting_en: "Hi 9k Store, I'd like to order:",
      instagram_url: "",
      logo: null,
      updated_at: "2026-10-19T09:00:00.000Z",
    };
    expect(rowToSettings(row)).toMatchObject({ whatsappNumber: "", instagramUrl: "", logo: null });
  });
});

describe("parseProductRows", () => {
  test("returns every good row with nothing rejected", () => {
    const row = productToRow(fullProduct());
    expect(parseProductRows([row])).toEqual({ products: [fullProduct()], rejected: [] });
  });
  test("skips a row with invalid JSON and names it", () => {
    const good = productToRow(fullProduct());
    const bad = { ...productToRow(fullProduct()), id: "bad-json", colors: "{not json" };
    const result = parseProductRows([bad, good]);
    expect(result.products.map((p) => p.id)).toEqual([good.id]);
    expect(result.rejected).toEqual([{ id: "bad-json", reason: expect.stringContaining("colors") }]);
  });
  test("skips a row that fails the schema", () => {
    const bad = { ...productToRow(fullProduct()), id: "bad-price", price_egp: -1 };
    const result = parseProductRows([bad]);
    expect(result.products).toEqual([]);
    expect(result.rejected[0]?.id).toBe("bad-price");
  });
});
