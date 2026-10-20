import { NextResponse, type NextRequest } from "next/server";

import { adminGate, isPageRequest, LOGIN_PATH } from "@/lib/auth/gate";
import { getSecrets } from "@/lib/auth/secrets";
import { COOKIE_NAME, isValidSessionToken } from "@/lib/auth/session";

/**
 * Optimistic gate for /admin page loads: sends visitors without a valid
 * cookie to the login page and logged-in owners away from it. Server Action
 * POSTs pass through, so a save with an ended session gets the action's own
 * "logged out" answer instead of a redirect. Pages and Server Actions still
 * check the session; this is not the security boundary.
 */
export async function proxy(request: NextRequest) {
  const { method } = request;
  // The same check as `getSession()`, so a revoked cookie cannot bounce
  // between this proxy and the pages. Never throws. Skipped for non-page
  // requests, which always pass through.
  const loggedIn = isPageRequest(method)
    ? await isValidSessionToken(request.cookies.get(COOKIE_NAME)?.value, await getSecrets())
    : false;

  let response: NextResponse;
  switch (adminGate(method, request.nextUrl.pathname, loggedIn)) {
    case "login":
      response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
      break;
    case "admin":
      response = NextResponse.redirect(new URL("/admin", request.url));
      break;
    case "next":
      response = NextResponse.next();
      break;
  }
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
