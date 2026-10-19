import { NextResponse, type NextRequest } from "next/server";

import { getSecrets } from "@/lib/auth/secrets";
import { COOKIE_NAME, isValidSessionToken } from "@/lib/auth/session";

const LOGIN_PATH = "/admin/login";

/**
 * Optimistic gate for /admin: sends visitors without a valid cookie to the
 * login page and logged-in owners away from it. Pages and Server Actions
 * still call `requireOwner()`; this is not the security boundary.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  // The same check as `requireOwner()`, so a revoked cookie cannot bounce
  // between this proxy and the pages. Never throws.
  const loggedIn = await isValidSessionToken(token, await getSecrets());
  const { pathname } = request.nextUrl;
  const onLogin = pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`;

  let response: NextResponse;
  if (!loggedIn && !onLogin) {
    response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  } else if (loggedIn && onLogin) {
    response = NextResponse.redirect(new URL("/admin", request.url));
  } else {
    response = NextResponse.next();
  }
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
