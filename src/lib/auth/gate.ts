/**
 * The proxy's routing decision for /admin, kept pure so it can be tested.
 * Not the security boundary: pages and Server Actions check the session.
 */

export const LOGIN_PATH = "/admin/login";

export type GateDecision = "login" | "admin" | "next";

/**
 * Only page loads (GET/HEAD) are redirected. A Server Action POST (or any
 * other method) passes through so the action's own session check answers:
 * a 307 would turn the save into a failed request and lose the owner's edits.
 */
export function isPageRequest(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * Where a request goes: logged-out page loads to the login page, logged-in
 * loads of the login page to /admin, everything else through. `loggedIn` is
 * ignored for non-page requests (the proxy does not read it for them).
 */
export function adminGate(method: string, pathname: string, loggedIn: boolean): GateDecision {
  if (!isPageRequest(method)) return "next";
  const onLogin = pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`;
  if (!loggedIn && !onLogin) return "login";
  if (loggedIn && onLogin) return "admin";
  return "next";
}
