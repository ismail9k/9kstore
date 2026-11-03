/**
 * Where a login request really came from. Pure: no Next import, so it is
 * easy to test.
 *
 * Next sets `x-action-forwarded` on the self-fetch it makes when a Server
 * Action is posted to a page that does not own it (`createForwardedActionResponse`
 * in `action-handler.js`). The login refuses those calls, so every checked
 * guess was posted straight to `/admin/login` and carries the IP Cloudflare's
 * edge reports.
 *
 * The client IP comes from `cf-connecting-ip` alone: Cloudflare's edge sets it
 * and overwrites any value the client sends. `x-forwarded-for` is never read,
 * because its first entry is whatever the client wrote. Without
 * `cf-connecting-ip` (`next dev`, `next start`) every client shares the one
 * key `unknown`, so no header value picks a fresh key.
 */

export const FORWARDED_ACTION_HEADER = "x-action-forwarded";
export const UNKNOWN_CLIENT_IP = "unknown";

/** A `Headers` / `ReadonlyHeaders` from `headers()` fits. */
export type HeaderReader = { get(name: string): string | null };

/** True when Next forwarded this Server Action from another page. Any value counts. */
export function isForwardedAction(headers: HeaderReader): boolean {
  return headers.get(FORWARDED_ACTION_HEADER) !== null;
}

/** The client IP Cloudflare reports, or `unknown` when it is missing or blank. */
export function connectingIp(headers: HeaderReader): string {
  const ip = headers.get("cf-connecting-ip")?.trim();
  return ip ? ip : UNKNOWN_CLIENT_IP;
}
