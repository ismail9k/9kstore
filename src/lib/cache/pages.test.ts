import { describe, expect, it } from "vitest";

import {
  BROWSER_CACHE_CONTROL,
  CATALOG_TAG,
  EDGE_CACHE_CONTROL,
  productTag,
  sharedPageTags,
  sharePage,
  STORE_TAG,
  withoutForwardedHeaders,
} from "./pages";

const at = (path: string) => new URL(path, "https://9kstore.example");

describe("sharedPageTags", () => {
  it("tags the catalog in both languages", () => {
    expect(sharedPageTags("GET", at("/ar"))).toEqual([STORE_TAG, CATALOG_TAG]);
    expect(sharedPageTags("GET", at("/en"))).toEqual([STORE_TAG, CATALOG_TAG]);
  });

  it("tags a product page by its slug, with or without ?color=", () => {
    expect(sharedPageTags("GET", at("/en/p/oversized-tee"))).toEqual([STORE_TAG, "product:oversized-tee"]);
    expect(sharedPageTags("HEAD", at("/ar/p/oversized-tee?color=black"))).toEqual([
      STORE_TAG,
      productTag("oversized-tee"),
    ]);
  });

  it("shares RSC requests too: Next's Vary keeps them apart from the HTML", () => {
    expect(sharedPageTags("GET", at("/ar/p/tee?_rsc=abc12"))).not.toBeNull();
  });

  it("never shares a page the order route bounced the customer to", () => {
    expect(sharedPageTags("GET", at("/en/p/tee?notice=soldout"))).toBeNull();
  });

  it.each([
    "/",
    "/fr",
    "/ar/",
    "/ar/p",
    "/ar/p/",
    "/ar/p/Tee",
    "/ar/p/tee/order",
    `/ar/p/${"a".repeat(81)}`,
    "/ar/about",
    "/lang/en",
    "/admin",
    "/admin/products/1",
    "/photos/abc/640.webp",
  ])("does not share %s", (path) => {
    expect(sharedPageTags("GET", at(path))).toBeNull();
  });

  it("does not share writes", () => {
    expect(sharedPageTags("POST", at("/ar"))).toBeNull();
  });
});

describe("withoutForwardedHeaders", () => {
  it("drops the forwarded host and protocol and keeps the rest", () => {
    const request = new Request("https://9kstore.example/ar", {
      headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http", accept: "text/html" },
    });
    const out = withoutForwardedHeaders(request);
    expect(out.headers.has("x-forwarded-host")).toBe(false);
    expect(out.headers.has("x-forwarded-proto")).toBe(false);
    expect(out.headers.get("accept")).toBe("text/html");
    expect(out.url).toBe(request.url);
  });

  it("returns the request itself when there is nothing to drop", () => {
    const request = new Request("https://9kstore.example/ar");
    expect(withoutForwardedHeaders(request)).toBe(request);
  });
});

describe("sharePage", () => {
  const nextPage = (status: number, headers: Record<string, string> = {}) =>
    new Response("<html></html>", {
      status,
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
        Vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
        ...headers,
      },
    });

  it("makes a 200 public, with the edge TTL, the tags and Host in Vary", async () => {
    const out = sharePage(nextPage(200), [STORE_TAG, productTag("tee")]);
    expect(out.status).toBe(200);
    expect(out.headers.get("Cache-Control")).toBe(BROWSER_CACHE_CONTROL);
    expect(out.headers.get("Cloudflare-CDN-Cache-Control")).toBe(EDGE_CACHE_CONTROL);
    expect(out.headers.get("Cache-Tag")).toBe("store,product:tee");
    expect(out.headers.get("Vary")).toBe(
      "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Host",
    );
    expect(await out.text()).toBe("<html></html>");
  });

  it("does not add Host to Vary twice", () => {
    expect(sharePage(nextPage(200, { Vary: "host" }), [CATALOG_TAG]).headers.get("Vary")).toBe("host");
  });

  it.each([404, 500, 307])("leaves a %i private", (status) => {
    const response = nextPage(status);
    expect(sharePage(response, [CATALOG_TAG])).toBe(response);
  });

  it("leaves a response that sets a cookie private", () => {
    const response = nextPage(200, { "Set-Cookie": "a=b" });
    expect(sharePage(response, [CATALOG_TAG])).toBe(response);
  });
});
