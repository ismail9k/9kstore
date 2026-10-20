import { describe, expect, test } from "vitest";
import { storeMetadata } from "./metadata";

const base = { origin: "https://shop.example", title: "Oversized Tee — 9k Store", description: "A tee.", siteName: "9k Store" };
const og = (m: ReturnType<typeof storeMetadata>) => m.openGraph as Record<string, unknown>;

describe("storeMetadata", () => {
  test("canonical and hreflang are absolute and query-free; og:url carries the query", () => {
    const m = storeMetadata({ ...base, locale: "en", path: "/p/oversized-tee", ogQuery: { color: "black" } });
    expect(m.alternates?.canonical).toBe("https://shop.example/en/p/oversized-tee");
    expect(m.alternates?.languages).toEqual({
      ar: "https://shop.example/ar/p/oversized-tee",
      en: "https://shop.example/en/p/oversized-tee",
      "x-default": "https://shop.example/ar/p/oversized-tee",
    });
    expect(og(m).url).toBe("https://shop.example/en/p/oversized-tee?color=black");
  });
  test("no query or an empty query leaves og:url canonical; the home path is /<lang>", () => {
    expect(og(storeMetadata({ ...base, locale: "ar", path: "/" })).url).toBe("https://shop.example/ar");
    expect(og(storeMetadata({ ...base, locale: "ar", path: "/", ogQuery: {} })).url).toBe("https://shop.example/ar");
  });
  test("locales", () => {
    const m = storeMetadata({ ...base, locale: "ar", path: "/" });
    expect(og(m).locale).toBe("ar_AR");
    expect(og(m).alternateLocale).toEqual(["en_US"]);
    expect(og(m).siteName).toBe("9k Store");
    expect(og(m).type).toBe("website");
  });
  test("titles: og:title and twitter:title follow ogTitle, <title> does not", () => {
    const m = storeMetadata({ ...base, locale: "en", path: "/p/t", ogTitle: "Oversized Tee — 850 EGP" });
    expect(m.title).toBe("Oversized Tee — 9k Store");
    expect(og(m).title).toBe("Oversized Tee — 850 EGP");
    expect((m.twitter as Record<string, unknown>).title).toBe("Oversized Tee — 850 EGP");
    expect((m.twitter as Record<string, unknown>).card).toBe("summary_large_image");
  });
  test("image: absolute, with dimensions when known, in both og and twitter; absent otherwise", () => {
    const withSize = storeMetadata({ ...base, locale: "en", path: "/p/t", image: { src: "/photos/k/1280.jpg", width: 1280, height: 1920, alt: "Oversized Tee — Black" } });
    expect(og(withSize).images).toEqual([{ url: "https://shop.example/photos/k/1280.jpg", width: 1280, height: 1920, alt: "Oversized Tee — Black" }]);
    expect((withSize.twitter as Record<string, unknown>).images).toEqual(["https://shop.example/photos/k/1280.jpg"]);
    const noSize = storeMetadata({ ...base, locale: "en", path: "/p/t", image: { src: "/photos/k/1280.jpg", alt: "x" } });
    expect(og(noSize).images).toEqual([{ url: "https://shop.example/photos/k/1280.jpg", alt: "x" }]);
    const none = storeMetadata({ ...base, locale: "en", path: "/p/t", image: null });
    expect(og(none)).not.toHaveProperty("images");
    expect(none.twitter).not.toHaveProperty("images");
  });
  test("noindex and other", () => {
    const m = storeMetadata({ ...base, locale: "en", path: "/p/t", noindex: true, other: { "product:price:amount": "850" } });
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.other).toEqual({ "product:price:amount": "850" });
    expect(storeMetadata({ ...base, locale: "en", path: "/p/t" })).not.toHaveProperty("robots");
  });
});
