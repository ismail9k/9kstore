import { describe, expect, test } from "vitest";

import type { Color, Product, Settings } from "@/lib/catalog/schema";

import { decideOrder, parseNotice, requestOrigin, type OrderQuery } from "./decide";

// The dev seed's product (migrations/seed/dev.sql), photos left out.
const color = (key: string, nameEn: string, nameAr: string, swatch: string): Color => ({ key, nameAr, nameEn, swatch, photos: [] });

const product: Product = {
  id: "seed-oversized-tee",
  slug: "oversized-tee",
  nameAr: "تيشيرت أوفر سايز",
  nameEn: "Oversized Tee",
  descriptionAr: "",
  descriptionEn: "",
  priceEgp: 850,
  code: "TEE-01",
  sizes: ["S", "M", "L", "XL"],
  colors: [
    color("grey", "Grey", "رمادي", "#8a8a8a"),
    color("black", "Black", "أسود", "#0a0a0a"),
    color("green", "Green", "أخضر", "#1f4f34"),
    color("cream", "Cream", "كريمي", "#f1ede7"),
  ],
  soldOut: [{ color: "black", size: "S" }],
  sizeChart: null,
  published: true,
  sortOrder: 0,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
};

// The settings row's defaults (migrations/0001_catalog.sql) with a number set.
const settings: Settings = {
  storeName: "9k Store",
  whatsappNumber: "201011111111",
  greetingAr: "أهلاً 9k Store، حابب أطلب:",
  greetingEn: "Hi 9k Store, I'd like to order:",
  instagramUrl: "",
  logo: null,
  updatedAt: "2026-10-19T00:00:00.000Z",
};

const base = { product, settings, locale: "en" as const, origin: "https://example.com" };
const q = (over: Partial<OrderQuery>): OrderQuery => ({ color: "black", size: "L", price: "850", ...over });

describe("decideOrder", () => {
  test("in stock → WhatsApp with the full message and the color link", () => {
    const d = decideOrder({ ...base, query: q({}) });
    expect(d.kind).toBe("whatsapp");
    const url = new URL((d as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://wa.me/201011111111");
    expect(url.searchParams.get("text")).toBe(
      "Hi 9k Store, I'd like to order:\nOversized Tee — Black\nSize: L\nPrice: 850 EGP\nCode: TEE-01\nhttps://example.com/en/p/oversized-tee?color=black",
    );
  });
  test("Arabic uses the Arabic greeting, names and link", () => {
    const d = decideOrder({ ...base, locale: "ar", query: q({}) }) as { url: string };
    const text = new URL(d.url).searchParams.get("text")!;
    expect(text.startsWith("أهلاً 9k Store، حابب أطلب:\nتيشيرت أوفر سايز — أسود\n")).toBe(true);
    expect(text.endsWith("https://example.com/ar/p/oversized-tee?color=black")).toBe(true);
  });
  test("a size with a space survives the round trip", () => {
    const p = { ...product, sizes: ["32 Long"], soldOut: [] };
    const d = decideOrder({ ...base, product: p, query: q({ size: "32 Long" }) }) as { url: string };
    expect(new URL(d.url).searchParams.get("text")).toContain("Size: 32 Long");
  });
  test("sold out → back with notice=sold-out", () =>
    expect(decideOrder({ ...base, query: q({ size: "S" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=sold-out" }));
  test("price mismatch → back with notice=changed", () =>
    expect(decideOrder({ ...base, query: q({ price: "900" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=changed" }));
  test("missing or non-integer price skips the price check", () => {
    for (const price of [null, "", "abc", "850.5"]) expect(decideOrder({ ...base, query: q({ price }) }).kind).toBe("whatsapp");
  });
  test("unknown color → back to the page with notice=failed and no color", () =>
    expect(decideOrder({ ...base, query: q({ color: "pink" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?notice=failed" }));
  test("unknown size → back with the color and notice=failed", () =>
    expect(decideOrder({ ...base, query: q({ size: "XXL" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=failed" }));
  test("no WhatsApp number → back with notice=failed", () =>
    expect(decideOrder({ ...base, settings: { ...settings, whatsappNumber: "" }, query: q({}) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=failed" }));
  test("a back path is always a same-origin path", () => {
    for (const color of ["//evil.example", "https://evil.example", "black"]) {
      const d = decideOrder({ ...base, query: q({ color, size: "nope" }) });
      expect(d.kind).toBe("back");
      expect((d as { path: string }).path).toMatch(/^\/en\/p\/oversized-tee(\?|$)/);
    }
  });
});

describe("parseNotice", () => {
  test.each(["sold-out", "changed", "failed"])("accepts %s", (v) => expect(parseNotice(v)).toBe(v));
  test.each(["x", "", null, undefined, ["sold-out"]])("rejects %j", (v) => expect(parseNotice(v as never)).toBeNull());
});

describe("requestOrigin", () => {
  test("forwarded headers win", () =>
    expect(requestOrigin(new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "9k.example", host: "internal" }), "http://internal/x")).toBe("https://9k.example"));
  test("host header next", () => expect(requestOrigin(new Headers({ host: "shop.example" }), "https://ignored/x")).toBe("https://shop.example"));
  test("the URL last, with no trailing slash", () => expect(requestOrigin(new Headers(), "http://localhost:3000/ar/p/tee/order?x=1")).toBe("http://localhost:3000"));
});
