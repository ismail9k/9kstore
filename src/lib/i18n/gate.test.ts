import { describe, expect, test } from "vitest";
import { switchTarget } from "./gate";
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
