/**
 * Which responses Workers Cache may share between visitors, and their tags.
 * Pure; used by the Worker entry (`worker.ts`) and the admin's purges.
 *
 * Only the catalog (`/ar`, `/en`) and product pages (`/<lang>/p/<slug>`) are
 * shared: they read no cookie and nothing about the visitor. Everything else
 * (the admin, the order redirect, the language toggle, the proxy's redirects)
 * keeps Next's own `private`/`no-store` and runs on every request.
 *
 * Workers Cache keys on the path and query (not the host, not cookies) and
 * honors `Vary`, so Next's `Vary: rsc, next-router-state-tree, …` keeps an RSC
 * payload and the HTML of one URL apart. `Host` is added to `Vary` because
 * absolute URLs (canonical, Open Graph) come from the request's host until
 * `PUBLIC_ORIGIN` is set, and the Worker answers on more than one hostname.
 * https://developers.cloudflare.com/workers/cache/cache-keys/
 */
import { SLUG, SLUG_MAX } from "@/lib/catalog/slug";
import { isLocale } from "@/lib/i18n/locales";

/** On every shared page: the settings (store name, footer, WhatsApp number) shape them all. */
export const STORE_TAG = "store";
/** On the catalog in both languages. */
export const CATALOG_TAG = "catalog";
/** On one product's page in both languages, with any `?color=`. Tags match case-insensitively; slugs are lowercase. */
export function productTag(slug: string): string {
  return `product:${slug}`;
}

/**
 * For the browser, `max-age=0`: it asks again on every visit and gets the
 * cached copy from the edge, so a purge reaches visitors at once. For Workers
 * Cache, an hour: purges do the real work, and the hour only bounds how stale
 * a page can get if one fails. `Cloudflare-CDN-Cache-Control` wins over
 * `Cache-Control` at the edge and is stripped before the browser.
 * https://developers.cloudflare.com/workers/cache/configuration/
 */
export const BROWSER_CACHE_CONTROL = "public, max-age=0";
export const EDGE_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=60";

/**
 * The tags of a request for a shared page, or null when its response must not
 * be shared. GET and HEAD only (the only methods the cache stores). A
 * `?notice=` page is where the order route sends a customer after the price
 * or stock changed, so it always renders fresh.
 */
export function sharedPageTags(method: string, url: URL): string[] | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.searchParams.has("notice")) return null;

  const [, lang, ...rest] = url.pathname.split("/");
  if (!lang || !isLocale(lang)) return null;
  if (rest.length === 0) return [STORE_TAG, CATALOG_TAG];
  const [p, slug, ...more] = rest;
  if (p === "p" && slug && more.length === 0 && slug.length <= SLUG_MAX && SLUG.test(slug)) {
    return [STORE_TAG, productTag(slug)];
  }
  return null;
}

/**
 * Request headers Next would read into a shared page's absolute URLs:
 * `siteOrigin()` prefers `x-forwarded-host`/`-proto` over the host. A visitor
 * can send them, and `x-forwarded-proto` is not in the cache key, so they are
 * dropped before rendering a shared page.
 */
const FORWARDED = ["x-forwarded-host", "x-forwarded-proto"] as const;

export function withoutForwardedHeaders<R extends Request>(request: R): R {
  if (!FORWARDED.some((name) => request.headers.has(name))) return request;
  const headers = new Headers(request.headers);
  for (const name of FORWARDED) headers.delete(name);
  // A copy keeps the source request's `cf` in workerd, so it is still an incoming request.
  return new Request(request, { headers }) as R;
}

/**
 * Marks a rendered page as shared, with its tags. Only a 200 without
 * `Set-Cookie`: a 404 (unknown slug, never-published draft), a redirect or an
 * error keeps Next's `private, no-store`.
 */
export function sharePage(response: Response, tags: string[]): Response {
  if (response.status !== 200 || response.headers.has("set-cookie")) return response;
  const shared = new Response(response.body, response);
  shared.headers.set("Cache-Control", BROWSER_CACHE_CONTROL);
  shared.headers.set("Cloudflare-CDN-Cache-Control", EDGE_CACHE_CONTROL);
  shared.headers.set("Cache-Tag", tags.join(","));
  shared.headers.delete("Expires");
  const vary = shared.headers.get("Vary");
  if (!vary?.split(",").some((name) => name.trim().toLowerCase() === "host")) {
    shared.headers.set("Vary", vary ? `${vary}, Host` : "Host");
  }
  return shared;
}
