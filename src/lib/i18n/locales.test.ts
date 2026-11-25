import { describe, expect, test } from "vitest";
import { dirOf, isLocale, otherLocale, splitLocale, toggleHref, withLocale } from "./locales";

describe("isLocale", () => {
  test("accepts exactly ar and en", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("en")).toBe(true);
    for (const bad of ["fr", "AR", "", undefined, null]) expect(isLocale(bad)).toBe(false);
  });
});

test("dirOf and otherLocale", () => {
  expect(dirOf("ar")).toBe("rtl");
  expect(dirOf("en")).toBe("ltr");
  expect(otherLocale("ar")).toBe("en");
  expect(otherLocale("en")).toBe("ar");
});

describe("splitLocale", () => {
  test("strips a leading locale segment", () => {
    expect(splitLocale("/en/p/tee")).toEqual({ locale: "en", rest: "/p/tee" });
    expect(splitLocale("/ar")).toEqual({ locale: "ar", rest: "/" });
    expect(splitLocale("/en/")).toEqual({ locale: "en", rest: "/" });
  });
  test("leaves paths with no locale alone", () => {
    expect(splitLocale("/")).toEqual({ locale: null, rest: "/" });
    expect(splitLocale("/p/tee")).toEqual({ locale: null, rest: "/p/tee" });
    expect(splitLocale("/english/x")).toEqual({ locale: null, rest: "/english/x" });
  });
});

describe("withLocale", () => {
  test("prefixes and appends the search", () => {
    expect(withLocale("en", "/p/tee", "?color=black")).toBe("/en/p/tee?color=black");
    expect(withLocale("en", "/")).toBe("/en");
    expect(withLocale("ar", "/", "")).toBe("/ar");
  });
});

test("toggleHref points at the switch route with the locale-free path encoded", () => {
  expect(toggleHref("ar", "/ar/p/tee", "?color=black")).toBe("/lang/en?to=%2Fp%2Ftee%3Fcolor%3Dblack");
  expect(toggleHref("en", "/en", "")).toBe("/lang/ar?to=%2F");
});
