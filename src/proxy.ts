import { NextResponse, type NextRequest } from "next/server";

import { adminGate, isPageRequest, LOGIN_PATH } from "@/lib/auth/gate";
import { getSecrets } from "@/lib/auth/secrets";
import { COOKIE_NAME, isValidSessionToken } from "@/lib/auth/session";
import { localeGate } from "@/lib/i18n/gate";
import { LANG_COOKIE } from "@/lib/i18n/locales";

/**
 * The site's router, in two branches.
 *
 * Customers: `localeGate` sends the bare domain to the remembered language
 * (the `9k_lang` cookie, set only by the toggle's `/lang/[lang]` route), else
 * Arabic, and any other path without an `/ar` or `/en` prefix to Arabic,
 * keeping the path and query. 307, because the target of `/` depends on a
 * cookie. Sets no cookies.
 *
 * Admin: optimistic gate for /admin page loads: sends visitors without a
 * valid cookie to the login page and logged-in owners away from it. Server
 * Action POSTs pass through, so a save with an ended session gets the
 * action's own "logged out" answer instead of a redirect. Pages and Server
 * Actions still check the session; this is not the security boundary.
 *
 * Photo files under `/photos/` are served by their own route and skip the
 * router.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
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

  const decision = localeGate(pathname, request.cookies.get(LANG_COOKIE)?.value);
  if (decision.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname; // search is preserved on the clone
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|photos/|.*\\..*).*)"],
};
