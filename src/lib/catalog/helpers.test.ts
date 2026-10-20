import { describe, expect, test } from "vitest";

import {
  cardPhoto,
  colorKey,
  isInStock,
  isSoldOut,
  nextSortOrder,
  normalizeWhatsapp,
  slugify,
  uniqueSlug,
} from "./helpers";
import type { Color } from "./schema";

function color(key: string, photos: Color["photos"] = []): Color {
  return { key, nameAr: key, nameEn: key, swatch: "#0a0a0a", photos };
}

describe("slugify", () => {
  test("lowercases, strips accents and punctuation, hyphenates", () =>
    expect(slugify("  Oversized Tee — Black! ")).toBe("oversized-tee-black"));
  test("strips accents", () => expect(slugify("Café Crème")).toBe("cafe-creme"));
  test("of Arabic-only text is empty", () => expect(slugify("تيشيرت")).toBe(""));
  test("of punctuation-only text is empty", () => expect(slugify(" — !! ")).toBe(""));
  test("keeps the Latin part of mixed text", () =>
    expect(slugify("تيشيرت Tee 2")).toBe("tee-2"));
});

describe("uniqueSlug", () => {
  test("returns the base when free", () => expect(uniqueSlug("tee", ["shirt"])).toBe("tee"));
  test("suffixes -2, -3", () => expect(uniqueSlug("tee", ["tee", "tee-2"])).toBe("tee-3"));
  test("accepts any iterable", () => expect(uniqueSlug("tee", new Set(["tee"]))).toBe("tee-2"));
});

describe("colorKey", () => {
  test("is the slugified English name", () => expect(colorKey("Off White", [])).toBe("off-white"));
  test("falls back to 'color' when the name has no Latin letters", () =>
    expect(colorKey("أسود", [])).toBe("color"));
  test("keeps keys unique within a product", () =>
    expect(colorKey("Black", ["black"])).toBe("black-2"));
  test("suffixes the 'color' fallback too", () =>
    expect(colorKey("أسود", ["color", "color-2"])).toBe("color-3"));
});

describe("stock", () => {
  const p = {
    sizes: ["S", "M"],
    colors: [color("black")],
    soldOut: [{ color: "black", size: "S" }],
  };

  test("isInStock is false for a sold-out pair and for unknown color or size", () => {
    expect(isInStock(p, "black", "M")).toBe(true);
    expect(isInStock(p, "black", "S")).toBe(false);
    expect(isInStock(p, "red", "M")).toBe(false);
    expect(isInStock(p, "black", "XL")).toBe(false);
  });

  test("isSoldOut is true only when every pair is sold out, and when there are no sizes", () => {
    expect(isSoldOut(p)).toBe(false);
    expect(
      isSoldOut({
        ...p,
        soldOut: [
          { color: "black", size: "S" },
          { color: "black", size: "M" },
        ],
      }),
    ).toBe(true);
    expect(isSoldOut({ ...p, sizes: [], soldOut: [] })).toBe(true);
    expect(isSoldOut({ ...p, colors: [], soldOut: [] })).toBe(true);
    // Another color still in stock keeps the product available.
    expect(
      isSoldOut({
        ...p,
        colors: [color("black"), color("cream")],
        soldOut: [
          { color: "black", size: "S" },
          { color: "black", size: "M" },
        ],
      }),
    ).toBe(false);
  });
});

describe("cardPhoto", () => {
  test("is the first photo of the first color, else null", () => {
    const first = { key: "a.jpg", width: 800, height: 1000 };
    expect(cardPhoto({ colors: [color("black", [first, { key: "b.jpg" }]), color("cream", [{ key: "c.jpg" }])] })).toEqual(first);
    expect(cardPhoto({ colors: [color("black"), color("cream", [{ key: "c.jpg" }])] })).toBeNull();
    expect(cardPhoto({ colors: [] })).toBeNull();
  });
});

describe("nextSortOrder", () => {
  test("is min - 1, and 0 for an empty catalog", () => {
    expect(nextSortOrder([3, 5])).toBe(2);
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([0, -4, 7])).toBe(-5);
  });
});

describe("normalizeWhatsapp", () => {
  test("strips +, spaces and dashes", () =>
    expect(normalizeWhatsapp("+20 10 1234-5678")).toBe("201012345678"));
  test("leaves letters for the schema to reject", () => expect(normalizeWhatsapp("abc")).toBe("abc"));
  test("handles a local number with dashes", () =>
    expect(normalizeWhatsapp("010-1234-5678")).toBe("01012345678"));
});
