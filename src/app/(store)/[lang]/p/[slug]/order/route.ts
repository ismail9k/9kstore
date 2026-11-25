/**
 * Where the order button lands. A plain GET navigation rather than a form
 * post or a fetch: the page builds an ordinary link, the browser follows our
 * redirect like any wa.me link, and so ordering works in in-app browsers with
 * no JavaScript beyond the state that built the link. The route reads D1
 * fresh, so a size that sold out or a price that changed since the page
 * loaded sends the customer back to the page with a notice instead.
 */
import type { NextRequest } from "next/server";

import { getProductBySlug, getSettings, SLUG, SLUG_MAX } from "@/lib/catalog";
import { isLocale, withLocale } from "@/lib/i18n/locales";
import { decideOrder } from "@/lib/order/decide";
import { getSiteOrigin } from "@/lib/site/origin";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

const notFound = () => new Response(null, { status: 404, headers: HEADERS });

export async function GET(request: NextRequest, ctx: RouteContext<"/[lang]/p/[slug]/order">): Promise<Response> {
  const { lang, slug } = await ctx.params;
  if (!isLocale(lang) || slug.length > SLUG_MAX || !SLUG.test(slug)) return notFound();

  let location: string;
  try {
    const product = await getProductBySlug(slug);
    if (!product || !product.published) return notFound();
    const settings = await getSettings();

    const sp = request.nextUrl.searchParams;
    const decision = decideOrder({
      product,
      settings,
      locale: lang,
      origin: await getSiteOrigin(request.headers),
      query: { color: sp.get("color"), size: sp.get("size"), price: sp.get("price") },
    });
    location = decision.kind === "whatsapp" ? decision.url : decision.path;
  } catch (error) {
    // A D1 or settings failure: back to the page with the failed notice rather
    // than a bare 500. lang and slug are validated, so the path stays same-origin.
    console.error(`order: could not decide the order for slug "${slug}":`, error);
    location = withLocale(lang, `/p/${slug}`, "?notice=failed");
  }
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...HEADERS },
  });
}
