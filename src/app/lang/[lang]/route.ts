import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { switchTarget } from "@/lib/i18n/gate";
import { isLocale, LANG_COOKIE } from "@/lib/i18n/locales";

/**
 * The language toggle's target: remembers the chosen language in a cookie and
 * redirects to the same page in that language. `to` is the current path
 * without its locale prefix; `switchTarget` keeps the redirect same-origin.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/lang/[lang]">): Promise<Response> {
  const { lang } = await ctx.params;
  if (!isLocale(lang)) notFound();

  const target = switchTarget(lang, request.nextUrl.searchParams.get("to"));
  const res = NextResponse.redirect(new URL(target, request.url), 307);
  res.cookies.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
