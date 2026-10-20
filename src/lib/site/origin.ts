import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers as requestHeaders } from "next/headers";

/** Hosts reached over plain http when no `x-forwarded-proto` says otherwise. */
function isLocalHost(host: string): boolean {
  if (/^\[::1\](:\d+)?$/.test(host)) return true;
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name.endsWith(".localhost");
}

/**
 * `<proto>://<host>` for absolute URLs: the configured public origin, else the
 * request's. A configured value counts only as an http(s) URL and is reduced
 * to its origin (no trailing slash, no path); anything else non-empty logs a
 * warning and falls through. The request's host is `x-forwarded-host`, else
 * `host`; its protocol is `x-forwarded-proto`, else http for local hosts
 * (`pnpm preview` sends no forwarded headers) and https otherwise. Pure.
 */
export function siteOrigin(configured: string | undefined, headers: Headers): string {
  const value = configured?.trim() ?? "";
  if (value !== "") {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // Not a URL: warned about below.
    }
    console.warn(`site: ignoring PUBLIC_ORIGIN "${configured}": not an http(s) URL`);
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return "http://localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (isLocalHost(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * siteOrigin() with `PUBLIC_ORIGIN` from the Worker env (or `process.env`) and
 * this request's headers. Pages and `generateMetadata` call it with no
 * argument (it reads `headers()` from `next/headers`); Route Handlers pass
 * `request.headers`. The only source of absolute URLs on the site.
 */
export async function getSiteOrigin(headers?: Headers): Promise<string> {
  // PUBLIC_ORIGIN is not declared in wrangler.jsonc yet, hence the widened type.
  let env: Partial<CloudflareEnv> & { PUBLIC_ORIGIN?: string } = {};
  try {
    env = (await getCloudflareContext({ async: true })).env;
  } catch {
    // No Cloudflare context (e.g. a plain Node process): use process.env.
  }
  const configured = env.PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN;
  return siteOrigin(configured, headers ?? (await requestHeaders()));
}
