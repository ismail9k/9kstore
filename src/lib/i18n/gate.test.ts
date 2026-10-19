import { describe, expect, test } from "vitest";
import { localeGate, switchTarget } from "./gate";
import { toggleHref } from "./locales";

describe("switchTarget", () => {
  test("prefixes a locale-free path and keeps the query", () => {
    expect(switchTarget("en", "/p/tee?color=black")).toBe("/en/p/tee?color=black");
    expect(switchTarget("ar", "/")).toBe("/ar");
  });
  test("strips a locale a caller sent anyway", () => {
    expect(switchTarget("en", "/ar/p/tee")).toBe("/en/p/tee");
  });
  test("falls back to the language home for anything that is not a same-origin path", () => {
    for (const bad of [undefined, null, "", "//evil.example", "https://evil.example", "p/tee", "/\\evil.example"]) {
      expect(switchTarget("ar", bad)).toBe("/ar");
    }
  });
  test("a locale strip that leaves a protocol-relative rest still falls back home", () => {
    expect(switchTarget("ar", "//evil.example/x")).toBe("/ar");
    expect(switchTarget("ar", "/en//evil.example")).toBe("/ar");
    const to = new URL(toggleHref("en", "/en//evil.example", ""), "http://x").searchParams.get("to");
    expect(to).toBe("//evil.example");
    expect(switchTarget("ar", to)).toBe("/ar");
  });
});

describe("localeGate", () => {
  test("the bare domain goes to the remembered language, else Arabic", () => {
    expect(localeGate("/", undefined)).toEqual({ kind: "redirect", pathname: "/ar" });
    expect(localeGate("/", "en")).toEqual({ kind: "redirect", pathname: "/en" });
    for (const bad of ["fr", "AR", ""]) expect(localeGate("/", bad)).toEqual({ kind: "redirect", pathname: "/ar" });
  });
  test("unprefixed deep paths get the default prefix, keeping the path, whatever is remembered", () => {
    expect(localeGate("/p/tee", undefined)).toEqual({ kind: "redirect", pathname: "/ar/p/tee" });
    expect(localeGate("/p/tee", "en")).toEqual({ kind: "redirect", pathname: "/ar/p/tee" });
    expect(localeGate("/fr/p/tee", undefined)).toEqual({ kind: "redirect", pathname: "/ar/fr/p/tee" });
  });
  test("prefixed and reserved paths pass", () => {
    expect(localeGate("/ar/p/tee", "en")).toEqual({ kind: "next" });
    expect(localeGate("/en", undefined)).toEqual({ kind: "next" });
    expect(localeGate("/lang/en", undefined)).toEqual({ kind: "next" });
  });
  test("bare /lang is not the toggle route, so it gets a prefix like any other path", () => {
    expect(localeGate("/lang", undefined)).toEqual({ kind: "redirect", pathname: "/ar/lang" });
  });
});
