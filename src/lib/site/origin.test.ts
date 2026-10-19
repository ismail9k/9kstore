import { describe, expect, test, vi } from "vitest";
import { siteOrigin } from "./origin";

vi.mock("server-only", () => ({}));


const h = (init: Record<string, string>) => new Headers(init);

describe("siteOrigin", () => {
  test("a configured origin wins, reduced to its origin", () => {
    expect(siteOrigin("https://shop.example", h({ host: "x" }))).toBe("https://shop.example");
    expect(siteOrigin("https://shop.example/", h({ host: "x" }))).toBe("https://shop.example");
    expect(siteOrigin(" https://shop.example/en ", h({ host: "x" }))).toBe("https://shop.example");
  });
  test("a malformed configured value is ignored with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(siteOrigin("shop.example", h({ host: "shop.example" }))).toBe("https://shop.example");
    expect(siteOrigin("ftp://shop.example", h({ host: "shop.example" }))).toBe("https://shop.example");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  test("empty or undefined falls through to the request", () => {
    expect(siteOrigin("", h({ host: "shop.example" }))).toBe("https://shop.example");
    expect(siteOrigin(undefined, h({ host: "shop.example" }))).toBe("https://shop.example");
  });
  test("forwarded headers win over host", () =>
    expect(siteOrigin(undefined, h({ "x-forwarded-proto": "https", "x-forwarded-host": "9k.example", host: "internal" }))).toBe("https://9k.example"));
  test("no forwarded proto: http for local hosts, https otherwise", () => {
    expect(siteOrigin(undefined, h({ host: "localhost:8787" }))).toBe("http://localhost:8787");
    expect(siteOrigin(undefined, h({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(siteOrigin(undefined, h({ host: "[::1]:3000" }))).toBe("http://[::1]:3000");
    expect(siteOrigin(undefined, h({ host: "shop.localhost" }))).toBe("http://shop.localhost");
    expect(siteOrigin(undefined, h({ host: "9k-store.example.workers.dev" }))).toBe("https://9k-store.example.workers.dev");
  });
  test("no host at all", () => expect(siteOrigin(undefined, h({}))).toBe("http://localhost:3000"));
});
