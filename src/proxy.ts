import { NextResponse, type NextRequest } from "next/server";

import { getSecrets } from "@/lib/auth/secrets";
import { COOKIE_NAME } from "@/lib/auth/session";
import { verifyToken } from "@/lib/auth/token";

const LOGIN_PATH = "/admin/login";

/**
 * Optimistic gate for /admin: sends visitors without a valid cookie to the
 * login page and logged-in owners away from it. Pages and Server Actions
 * still call `requireOwner()`; this is not the security boundary.
 */
export async function proxy(request: NextRequest) {
  const secrets = await getSecrets();
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const loggedIn = secrets !== null && (await verifyToken(token, secrets.sessionSecret)) !== null;
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
