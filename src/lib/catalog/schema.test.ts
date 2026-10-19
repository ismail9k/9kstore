import { describe, expect, test } from "vitest";

import {
  productInputSchema,
  productSchema,
  settingsInputSchema,
  settingsSchema,
  type ProductInput,
  type SettingsInput,
} from "./schema";

function validProduct(): ProductInput {
  return {
    slug: "oversized-tee",
    nameAr: "تيشيرت أوفرسايز",
    nameEn: "Oversized Tee",
    descriptionAr: "قطن ثقيل",
    descriptionEn: "Heavy cotton",
    priceEgp: 850,
    code: "TEE-01",
    sizes: ["S", "M", "L"],
    colors: [
      { key: "black", nameAr: "أسود", nameEn: "Black", swatch: "#0a0a0a", photos: [{ key: "tee/black-1.jpg", width: 1200, height: 1500 }] },
      { key: "cream", nameAr: "كريمي", nameEn: "Cream", swatch: "#f1ede7", photos: [] },
    ],
    soldOut: [{ color: "black", size: "S" }],
    sizeChart: null,
    published: false,
  };
}

function validSettings(): SettingsInput {
  return {
    storeName: "9k Store",
    whatsappNumber: "201012345678",
    greetingAr: "أهلاً 9k Store، حابب أطلب:",
    greetingEn: "Hi 9k Store, I'd like to order:",
    instagramUrl: "https://instagram.com/9kstore",
    logo: null,
  };
}

function messagesAt(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, path: PropertyKey[]) {
  return (result.error?.issues ?? [])
    .filter((i) => JSON.stringify(i.path) === JSON.stringify(path))
    .map((i) => i.message);
}

describe("productInputSchema", () => {
  test("accepts a full valid product", () =>
    expect(productInputSchema.safeParse(validProduct()).success).toBe(true));

  test("rejects empty sizes", () =>
    expect(productInputSchema.safeParse({ ...validProduct(), sizes: [] }).success).toBe(false));

  test("trims sizes and rejects duplicates after trimming", () => {
    const dup = productInputSchema.safeParse({ ...validProduct(), sizes: [" M ", "M"] });
    expect(dup.success).toBe(false);
    expect(messagesAt(dup, ["sizes"])).toEqual(["Each size can only appear once"]);
    expect(productInputSchema.parse({ ...validProduct(), sizes: [" M "], soldOut: [] }).sizes).toEqual(["M"]);
  });

  test("rejects a blank size", () =>
    expect(productInputSchema.safeParse({ ...validProduct(), sizes: ["S", "  "] }).success).toBe(false));

  test("keeps m and M as distinct sizes", () =>
    expect(productInputSchema.safeParse({ ...validProduct(), sizes: ["m", "M"] }).success).toBe(true));

  test("rejects a bad swatch", () => {
    for (const swatch of ["#12345", "red"]) {
      const p = validProduct();
      const colors = p.colors.map((c, i) => (i === 0 ? { ...c, swatch } : c));
      expect(productInputSchema.safeParse({ ...p, colors }).success).toBe(false);
    }
  });

  test("rejects duplicate color keys", () => {
    const p = validProduct();
    const colors = p.colors.map((c) => ({ ...c, key: "black" }));
    const r = productInputSchema.safeParse({ ...p, colors });
    expect(r.success).toBe(false);
    expect(messagesAt(r, ["colors", 1, "key"])).toHaveLength(1);
  });

  test("rejects no colors", () =>
    expect(productInputSchema.safeParse({ ...validProduct(), colors: [], soldOut: [] }).success).toBe(false));

  test("rejects a bad slug", () => {
    for (const slug of ["Tee Black", "-tee", "tee-", "tee--black", ""]) {
      expect(productInputSchema.safeParse({ ...validProduct(), slug }).success).toBe(false);
    }
    expect(messagesAt(productInputSchema.safeParse({ ...validProduct(), slug: "Tee Black" }), ["slug"])).toEqual([
      "Use lowercase letters, numbers and hyphens only",
    ]);
    expect(productInputSchema.safeParse({ ...validProduct(), slug: "a".repeat(81) }).success).toBe(false);
  });

  test("drops a soldOut pair whose size or color no longer exists", () => {
    const r = productInputSchema.parse({
      ...validProduct(),
      soldOut: [
        { color: "black", size: "XXL" },
        { color: "red", size: "S" },
        { color: "black", size: "S" },
      ],
    });
    expect(r.soldOut).toEqual([{ color: "black", size: "S" }]);
  });

  test("matches sold-out sizes after trimming", () => {
    const r = productInputSchema.parse({ ...validProduct(), sizes: [" S ", "M"], soldOut: [{ color: "black", size: "S" }] });
    expect(r.soldOut).toEqual([{ color: "black", size: "S" }]);
  });

  test("empty code becomes null", () => {
    expect(productInputSchema.parse({ ...validProduct(), code: "  " }).code).toBeNull();
    expect(productInputSchema.parse({ ...validProduct(), code: null }).code).toBeNull();
    expect(productInputSchema.parse({ ...validProduct(), code: " TEE-01 " }).code).toBe("TEE-01");
    expect(productInputSchema.safeParse({ ...validProduct(), code: "x".repeat(41) }).success).toBe(false);
  });

  test("price must be a whole number of pounds within range", () => {
    for (const priceEgp of [850.5, -1, 1_000_001]) {
      expect(productInputSchema.safeParse({ ...validProduct(), priceEgp }).success).toBe(false);
    }
    for (const priceEgp of [0, 1_000_000]) {
      expect(productInputSchema.safeParse({ ...validProduct(), priceEgp }).success).toBe(true);
    }
  });

  test("names are required and length-limited, descriptions may be empty", () => {
    expect(productInputSchema.safeParse({ ...validProduct(), nameEn: "  " }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...validProduct(), nameAr: "x".repeat(121) }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...validProduct(), descriptionEn: "" }).success).toBe(true);
    expect(productInputSchema.safeParse({ ...validProduct(), descriptionAr: "x".repeat(1001) }).success).toBe(false);
  });

  test("owner-facing messages never use technical words", () => {
    const p = validProduct();
    const r = productInputSchema.safeParse({
      ...p,
      slug: "",
      sizes: ["S", "S"],
      colors: p.colors.map((c) => ({ ...c, key: "black" })),
    });
    for (const issue of r.error?.issues ?? []) {
      expect(issue.message).not.toMatch(/slug|key|json|payload/i);
    }
  });
});

describe("productSchema", () => {
  const stored = () => ({
    ...validProduct(),
    id: "p_123",
    sortOrder: -1,
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z",
  });

  test("accepts a stored product", () => expect(productSchema.parse(stored()).id).toBe("p_123"));

  test("applies the same rules as the input schema", () => {
    expect(productSchema.parse({ ...stored(), code: "" }).code).toBeNull();
    expect(productSchema.parse({ ...stored(), soldOut: [{ color: "black", size: "XXL" }] }).soldOut).toEqual([]);
    expect(productSchema.safeParse({ ...stored(), sizes: ["M", "M"] }).success).toBe(false);
  });

  test("requires the stored fields", () =>
    expect(productSchema.safeParse(validProduct()).success).toBe(false));
});

describe("settingsInputSchema", () => {
  test("accepts valid settings", () =>
    expect(settingsInputSchema.safeParse(validSettings()).success).toBe(true));

  test("normalizes the WhatsApp number and rejects letters", () => {
    expect(settingsInputSchema.parse({ ...validSettings(), whatsappNumber: "+20 10 1234-5678" }).whatsappNumber).toBe("201012345678");
    expect(settingsInputSchema.parse({ ...validSettings(), whatsappNumber: "+20 10 1234 5678" }).whatsappNumber).toBe("201012345678");
    expect(settingsInputSchema.parse({ ...validSettings(), whatsappNumber: "010-1234-5678" }).whatsappNumber).toBe("01012345678");
    expect(settingsInputSchema.safeParse({ ...validSettings(), whatsappNumber: "abc" }).success).toBe(false);
  });

  test("an empty WhatsApp number is allowed (not set up yet)", () =>
    expect(settingsInputSchema.safeParse({ ...validSettings(), whatsappNumber: "" }).success).toBe(true));

  test("instagramUrl must be a URL or empty", () => {
    expect(settingsInputSchema.safeParse({ ...validSettings(), instagramUrl: "" }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ ...validSettings(), instagramUrl: "https://www.instagram.com/9kstore/" }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ ...validSettings(), instagramUrl: "instagram.com/9kstore" }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...validSettings(), instagramUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  test("store name is required", () =>
    expect(settingsInputSchema.safeParse({ ...validSettings(), storeName: " " }).success).toBe(false));
});

describe("settingsSchema", () => {
  test("adds updatedAt", () => {
    expect(settingsSchema.safeParse({ ...validSettings(), updatedAt: "2026-10-19T10:00:00.000Z" }).success).toBe(true);
    expect(settingsSchema.safeParse(validSettings()).success).toBe(false);
  });
});
