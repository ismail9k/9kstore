import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { cache } from "react";

import {
  cardPhoto,
  colorByKey,
  getProductBySlug,
  getSettings,
  initialColor,
  linkState,
  nameIn,
  SLUG,
  SLUG_MAX,
  type Product,
} from "@/lib/catalog";
import { formatPrice } from "@/lib/i18n/format";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { parseNotice } from "@/lib/order/decide";
import { ogImageSize, photoOgSrc } from "@/lib/photos/urls";
import { storeMetadata, type PreviewImage } from "@/lib/site/metadata";
import { getSiteOrigin } from "@/lib/site/origin";

import { ProductView } from "./product-view";
import { Unavailable } from "./unavailable";

/**
 * The page's data, read fresh from D1 on every request; `cache()` is
 * request-scoped, so `generateMetadata` and the page share one pair of reads.
 * A malformed slug is rejected before touching D1; a missing product and a
 * never-published draft are both a 404 (a draft's name stays secret). A
 * product hidden after being published is returned: the callers branch on
 * `published`. A corrupt row throws and stays a 500.
 */
const load = cache(async (slug: string) => {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  if (slug.length > SLUG_MAX || !SLUG.test(slug)) notFound();
  const product = await getProductBySlug(slug);
  if (!product || linkState(product) === "missing") notFound();
  const settings = await getSettings();
  return { locale, product, settings };
});

/**
 * The link preview for `?color=`: that color's first photo when the key names
 * an existing color (and `og:url` carries it), else the first color's; a color
 * with no photos falls back to the catalog card photo, and none at all means
 * no image.
 */
function preview(
  product: Product,
  locale: Locale,
  color: string | string[] | undefined,
): { ogQuery: Record<string, string> | undefined; image: PreviewImage | null } {
  const named = typeof color === "string" ? colorByKey(product, color) : null;
  const chosen = named ?? initialColor(product, undefined);
  const photo = chosen.photos[0] ?? cardPhoto(product);
  return {
    ogQuery: named ? { color: named.key } : undefined,
    image: photo
      ? {
          src: photoOgSrc(photo),
          ...(ogImageSize(photo) ?? {}),
          alt: `${nameIn(product, locale)} — ${nameIn(chosen, locale)}`,
        }
      : null,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[lang]/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { color } = await searchParams;
  const { locale, product, settings } = await load(slug);
  const origin = await getSiteOrigin();
  const t = getMessages(locale);
  const name = nameIn(product, locale);
  const path = `/p/${product.slug}`;

  if (!product.published) {
    return storeMetadata({
      origin,
      locale,
      path,
      title: `${t.unavailable.title} — ${settings.storeName}`,
      description: `${name} — ${t.unavailable.body}`,
      siteName: settings.storeName,
      noindex: true,
    });
  }

  return storeMetadata({
    origin,
    locale,
    path,
    ...preview(product, locale, color),
    title: `${name} — ${settings.storeName}`,
    ogTitle: `${name} — ${formatPrice(product.priceEgp, locale)}`,
    description: (locale === "ar" ? product.descriptionAr : product.descriptionEn) || t.meta.description,
    siteName: settings.storeName,
    other: { "product:price:amount": String(product.priceEgp), "product:price:currency": "EGP" },
  });
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[lang]/p/[slug]">) {
  const { slug } = await params;
  const { color, notice } = await searchParams;
  const { locale, product, settings } = await load(slug);
  if (!product.published) return <Unavailable name={nameIn(product, locale)} locale={locale} />;
  const t = getMessages(locale);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">
      <ProductView
        product={product}
        locale={locale}
        initialColorKey={initialColor(product, color).key}
        notice={parseNotice(notice)}
        canOrder={settings.whatsappNumber !== ""}
        t={{ product: t.product, order: t.order }}
      />
    </main>
  );
}
