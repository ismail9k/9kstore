/**
 * Where the order button lands. A plain GET navigation rather than a form
 * post or a fetch: the page builds an ordinary link, the browser follows our
 * redirect like any wa.me link, and so ordering works in in-app browsers with
 * no JavaScript beyond the state that built the link. The route reads D1
 * fresh, so a size that sold out or a price that changed since the page
 * loaded sends the customer back to the page with a notice instead.
 */
import type { NextRequest } from "next/server";

import { getProductBySlug, getSettings, SLUG } from "@/lib/catalog";
import { isLocale } from "@/lib/i18n/locales";
import { decideOrder, requestOrigin } from "@/lib/order/decide";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

const notFound = () => new Response(null, { status: 404, headers: HEADERS });

export async function GET(request: NextRequest, ctx: RouteContext<"/[lang]/p/[slug]/order">): Promise<Response> {
  const { lang, slug } = await ctx.params;
  if (!isLocale(lang) || slug.length > 80 || !SLUG.test(slug)) return notFound();

  const product = await getProductBySlug(slug);
  if (!product || !product.published) return notFound();
  const settings = await getSettings();

  const sp = request.nextUrl.searchParams;
  const decision = decideOrder({
    product,
    settings,
    locale: lang,
    origin: requestOrigin(request.headers, request.url),
    query: { color: sp.get("color"), size: sp.get("size"), price: sp.get("price") },
  });
  return new Response(null, {
    status: 302,
    headers: { Location: decision.kind === "whatsapp" ? decision.url : decision.path, ...HEADERS },
  });
}
