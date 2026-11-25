import { describe, expect, test } from "vitest";

import type { Color, Product } from "@/lib/catalog/schema";

import {
  assignColorKeys,
  autoSlug,
  type Draft,
  draftFromProduct,
  emptyDraft,
  NEW_KEY_PREFIX,
  reduce,
} from "./form-state";

function color(key: string, nameEn = key, photos: Color["photos"] = []): Color {
  return { key, nameAr: nameEn, nameEn, swatch: "#123456", photos };
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    ...emptyDraft(),
    slug: "tee",
    nameEn: "Tee",
    nameAr: "تيشيرت",
    slugEdited: true,
    sizes: ["S", "M", "L"],
    colors: [color("black"), color("white")],
    soldOut: [],
    ...overrides,
  };
}

const product: Product = {
  id: "p1",
  slug: "tee",
  nameAr: "تيشيرت",
  nameEn: "Tee",
  descriptionAr: "",
  descriptionEn: "",
  priceEgp: 450,
  code: "T-1",
  sizes: ["S", "M"],
  colors: [color("black")],
  soldOut: [{ color: "black", size: "S" }],
  sizeChart: { key: "chart.jpg" },
  published: true,
  wasPublished: true,
  sortOrder: -1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

describe("emptyDraft", () => {
  test("is hidden, sizeless, with one empty near-black color and an auto slug", () => {
    const d = emptyDraft();
    expect(d.published).toBe(false);
    expect(d.sizes).toEqual([]);
    expect(d.slugEdited).toBe(false);
    expect(d.code).toBeNull();
    expect(d.sizeChart).toBeNull();
    expect(d.colors).toHaveLength(1);
    expect(d.colors[0]).toMatchObject({ nameAr: "", nameEn: "", swatch: "#0a0a0a", photos: [] });
    expect(d.colors[0]?.key.startsWith(NEW_KEY_PREFIX)).toBe(true);
  });
});

describe("draftFromProduct", () => {
  test("keeps the product's input fields and marks the slug as edited", () => {
    const d = draftFromProduct(product);
    expect(d.slugEdited).toBe(true);
    expect(d).not.toHaveProperty("id");
    expect(d).not.toHaveProperty("sortOrder");
    expect(d).not.toHaveProperty("wasPublished");
    expect(d).not.toHaveProperty("createdAt");
    expect(d).not.toHaveProperty("updatedAt");
    expect(d.slug).toBe("tee");
    expect(d.soldOut).toEqual([{ color: "black", size: "S" }]);
    expect(d.sizeChart).toEqual({ key: "chart.jpg" });
  });
});

describe("names and slug", () => {
  test("nameEn updates the slug while it has not been edited", () => {
    const d = reduce(emptyDraft(), { type: "nameEn", value: "Oversized Tee" });
    expect(d.nameEn).toBe("Oversized Tee");
    expect(d.slug).toBe("oversized-tee");
  });

  test("nameEn leaves an edited slug alone", () => {
    const d = reduce(draft({ slug: "my-link", slugEdited: true }), { type: "nameEn", value: "Oversized Tee" });
    expect(d.nameEn).toBe("Oversized Tee");
    expect(d.slug).toBe("my-link");
  });

  test("nameEn cuts a long auto-filled slug to 80 characters at a word boundary", () => {
    // 15 words of "abcdefghi" → 149 characters slugified.
    const name = Array.from({ length: 15 }, () => "abcdefghi").join(" ");
    const d = reduce(emptyDraft(), { type: "nameEn", value: name });
    expect(d.slug.length).toBeLessThanOrEqual(80);
    expect(d.slug).toBe(Array.from({ length: 8 }, () => "abcdefghi").join("-")); // 79 characters
    expect(d.slug.endsWith("-")).toBe(false);
  });

  test("nameEn leaves a long owner-typed slug alone", () => {
    const long = "a".repeat(100);
    const d = reduce(draft({ slug: long, slugEdited: true }), { type: "nameEn", value: "x ".repeat(60) });
    expect(d.slug).toBe(long);
  });

  test("slug action marks slugEdited", () => {
    const d = reduce(emptyDraft(), { type: "slug", value: "custom" });
    expect(d.slug).toBe("custom");
    expect(d.slugEdited).toBe(true);
    expect(reduce(d, { type: "nameEn", value: "Other" }).slug).toBe("custom");
  });

  test("field sets a plain field", () => {
    expect(reduce(draft(), { type: "field", name: "priceEgp", value: 300 }).priceEgp).toBe(300);
    expect(reduce(draft(), { type: "field", name: "published", value: true }).published).toBe(true);
    expect(reduce(draft(), { type: "field", name: "nameAr", value: "قميص" }).nameAr).toBe("قميص");
  });
});

describe("sizes", () => {
  test("addSize trims and ignores empty or duplicate sizes", () => {
    let d = draft({ sizes: [] });
    d = reduce(d, { type: "addSize", size: " M " });
    d = reduce(d, { type: "addSize", size: "   " });
    d = reduce(d, { type: "addSize", size: "M" });
    d = reduce(d, { type: "addSize", size: "m" });
    expect(d.sizes).toEqual(["M", "m"]);
  });

  test("addSize leaves the new size in stock for every color", () => {
    const d = reduce(draft({ soldOut: [{ color: "black", size: "S" }] }), { type: "addSize", size: "XL" });
    expect(d.soldOut).toEqual([{ color: "black", size: "S" }]);
  });

  test("removeSize drops its sold-out pairs", () => {
    const d = reduce(
      draft({
        soldOut: [
          { color: "black", size: "S" },
          { color: "white", size: "S" },
          { color: "black", size: "M" },
        ],
      }),
      { type: "removeSize", size: "S" },
    );
    expect(d.sizes).toEqual(["M", "L"]);
    expect(d.soldOut).toEqual([{ color: "black", size: "M" }]);
  });
});

describe("colors", () => {
  test("removeColor drops its sold-out pairs", () => {
    const d = reduce(
      draft({
        soldOut: [
          { color: "black", size: "S" },
          { color: "white", size: "M" },
        ],
      }),
      { type: "removeColor", key: "black" },
    );
    expect(d.colors.map((c) => c.key)).toEqual(["white"]);
    expect(d.soldOut).toEqual([{ color: "white", size: "M" }]);
  });

  test("addColor appends a color with a temporary unique key and black swatch", () => {
    let d = draft();
    d = reduce(d, { type: "addColor" });
    d = reduce(d, { type: "addColor" });
    expect(d.colors.map((c) => c.key)).toEqual(["black", "white", "new:1", "new:2"]);
    expect(d.colors[3]).toEqual({ key: "new:2", nameAr: "", nameEn: "", swatch: "#0a0a0a", photos: [] });
  });

  test("addColor never reuses a temporary key after a removal", () => {
    let d = draft();
    d = reduce(d, { type: "addColor" });
    d = reduce(d, { type: "addColor" });
    d = reduce(d, { type: "removeColor", key: "new:1" });
    d = reduce(d, { type: "addColor" });
    const keys = d.colors.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("colorField nameEn never changes the key", () => {
    let d = reduce(draft(), { type: "colorField", key: "black", name: "nameEn", value: "Jet Black" });
    d = reduce(d, { type: "addColor" });
    d = reduce(d, { type: "colorField", key: "new:1", name: "nameEn", value: "Navy" });
    expect(d.colors.map((c) => [c.key, c.nameEn])).toEqual([
      ["black", "Jet Black"],
      ["white", "white"],
      ["new:1", "Navy"],
    ]);
  });

  test("colorField sets the Arabic name and the swatch", () => {
    let d = reduce(draft(), { type: "colorField", key: "white", name: "nameAr", value: "أبيض" });
    d = reduce(d, { type: "colorField", key: "white", name: "swatch", value: "#ffffff" });
    expect(d.colors[1]).toMatchObject({ key: "white", nameAr: "أبيض", swatch: "#ffffff" });
  });

  test("moveSize and moveColor reorder", () => {
    let d = reduce(draft(), { type: "moveSize", from: 0, to: 2 });
    expect(d.sizes).toEqual(["M", "L", "S"]);
    d = reduce(d, { type: "moveColor", from: 1, to: 0 });
    expect(d.colors.map((c) => c.key)).toEqual(["white", "black"]);
  });

  test("moves out of range change nothing", () => {
    const d = draft();
    expect(reduce(d, { type: "moveSize", from: 5, to: 0 }).sizes).toEqual(["S", "M", "L"]);
    expect(reduce(d, { type: "moveColor", from: 0, to: -1 }).colors.map((c) => c.key)).toEqual(["black", "white"]);
  });
});

describe("photos and size chart", () => {
  const withPhotos = () =>
    draft({ colors: [color("black", "Black", [{ key: "a" }, { key: "b" }, { key: "c" }]), color("white")] });

  test("removePhoto removes one photo from its color", () => {
    const d = reduce(withPhotos(), { type: "removePhoto", key: "black", photoKey: "b" });
    expect(d.colors[0]?.photos).toEqual([{ key: "a" }, { key: "c" }]);
  });

  test("movePhoto reorders a color's photos", () => {
    const d = reduce(withPhotos(), { type: "movePhoto", key: "black", from: 2, to: 0 });
    expect(d.colors[0]?.photos.map((p) => p.key)).toEqual(["c", "a", "b"]);
  });

  test("removeSizeChart clears it", () => {
    expect(reduce(draft({ sizeChart: { key: "chart" } }), { type: "removeSizeChart" }).sizeChart).toBeNull();
  });
});

describe("stock", () => {
  test("setStock true removes the pair, false adds it once", () => {
    let d = reduce(draft(), { type: "setStock", color: "black", size: "S", inStock: false });
    d = reduce(d, { type: "setStock", color: "black", size: "S", inStock: false });
    expect(d.soldOut).toEqual([{ color: "black", size: "S" }]);
    d = reduce(d, { type: "setStock", color: "black", size: "S", inStock: true });
    expect(d.soldOut).toEqual([]);
  });

  test("setColorStock marks every size of the color", () => {
    let d = draft({ soldOut: [{ color: "black", size: "M" }, { color: "white", size: "S" }] });
    d = reduce(d, { type: "setColorStock", color: "black", inStock: false });
    expect(d.soldOut).toHaveLength(4);
    expect(d.soldOut).toEqual(
      expect.arrayContaining([
        { color: "black", size: "S" },
        { color: "black", size: "M" },
        { color: "black", size: "L" },
        { color: "white", size: "S" },
      ]),
    );
    d = reduce(d, { type: "setColorStock", color: "black", inStock: true });
    expect(d.soldOut).toEqual([{ color: "white", size: "S" }]);
  });

  test("setSizeStock marks every color for the size", () => {
    let d = draft({ soldOut: [{ color: "white", size: "M" }, { color: "black", size: "S" }] });
    d = reduce(d, { type: "setSizeStock", size: "M", inStock: false });
    expect(d.soldOut).toHaveLength(3);
    expect(d.soldOut).toEqual(
      expect.arrayContaining([
        { color: "black", size: "M" },
        { color: "white", size: "M" },
        { color: "black", size: "S" },
      ]),
    );
    d = reduce(d, { type: "setSizeStock", size: "M", inStock: true });
    expect(d.soldOut).toEqual([{ color: "black", size: "S" }]);
  });
});

describe("assignColorKeys", () => {
  test("assignColorKeys keys new colors from their English name and rewrites sold-out pairs", () => {
    const d = assignColorKeys(
      draft({
        colors: [color("black", "Black"), color("new:1", "Black"), color("new:2", "أسود")],
        soldOut: [{ color: "new:1", size: "S" }],
      }),
    );
    expect(d.colors.map((c) => c.key)).toEqual(["black", "black-2", "color"]);
    expect(d.soldOut).toEqual([{ color: "black-2", size: "S" }]);
  });

  test("assignColorKeys leaves saved keys alone", () => {
    const before = draft({
      colors: [color("black", "Jet Black"), color("white", "Black")],
      soldOut: [{ color: "white", size: "M" }],
    });
    const d = assignColorKeys(before);
    expect(d.colors.map((c) => c.key)).toEqual(["black", "white"]);
    expect(d.soldOut).toEqual([{ color: "white", size: "M" }]);
  });

  test("saved keys that look like slugs of 'New …' names keep their key after a rename", () => {
    let d = draft({
      colors: [color("new-navy", "New Navy"), color("new-1", "New 1")],
      soldOut: [{ color: "new-navy", size: "S" }],
    });
    d = reduce(d, { type: "colorField", key: "new-navy", name: "nameEn", value: "Midnight" });
    d = reduce(d, { type: "colorField", key: "new-1", name: "nameEn", value: "Sand" });
    d = reduce(d, { type: "addColor" });
    const added = d.colors[2]?.key ?? "";
    d = reduce(d, { type: "colorField", key: added, name: "nameEn", value: "New Navy" });
    const saved = assignColorKeys(d);
    expect(saved.colors.map((c) => c.key)).toEqual(["new-navy", "new-1", "new-navy-2"]);
    expect(saved.soldOut).toEqual([{ color: "new-navy", size: "S" }]);
  });

  test("a new color never takes a key a later saved color already has", () => {
    const d = assignColorKeys(draft({ colors: [color("new:1", "Navy"), color("navy", "Navy blue")] }));
    expect(d.colors.map((c) => c.key)).toEqual(["navy-2", "navy"]);
  });
});

describe("autoSlug", () => {
  test("keeps a slug of 80 characters or fewer as is", () => {
    expect(autoSlug("Oversized Tee")).toBe("oversized-tee");
    expect(autoSlug("a".repeat(80))).toBe("a".repeat(80));
  });

  test("keeps exactly 80 characters when a word ends there", () => {
    expect(autoSlug(`${"a".repeat(80)} more`)).toBe("a".repeat(80));
  });

  test("cuts at the last hyphen within 80", () => {
    expect(autoSlug(`${"a".repeat(70)} ${"b".repeat(20)}`)).toBe("a".repeat(70));
  });

  test("hard-cuts one word longer than 80", () => {
    expect(autoSlug("a".repeat(100))).toBe("a".repeat(80));
  });

  test("is still empty for an Arabic-only name", () => {
    expect(autoSlug("تيشيرت")).toBe("");
  });
});

test("addPhoto appends to the named color and ignores a duplicate key", () => {
  let d = reduce(emptyDraft(), { type: "addPhoto", key: "new:1", photo: { key: "p1", width: 10, height: 10 } });
  d = reduce(d, { type: "addPhoto", key: "new:1", photo: { key: "p2" } });
  d = reduce(d, { type: "addPhoto", key: "new:1", photo: { key: "p1" } });
  expect(d.colors[0]?.photos.map((p) => p.key)).toEqual(["p1", "p2"]);
});
test("setSizeChart replaces", () => {
  const d = reduce({ ...emptyDraft(), sizeChart: { key: "old" } }, { type: "setSizeChart", photo: { key: "new" } });
  expect(d.sizeChart).toEqual({ key: "new" });
});
