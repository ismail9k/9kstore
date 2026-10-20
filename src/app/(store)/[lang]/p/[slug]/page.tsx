import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import { getProductBySlug, getSettings, initialColor, nameIn, SLUG, SLUG_MAX } from "@/lib/catalog";
import { isLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { parseNotice } from "@/lib/order/decide";

import { ProductView } from "./product-view";

/**
 * The page's data, read fresh from D1 on every request. A malformed slug is
 * rejected before touching D1; a missing or unpublished product is a 404. A
 * corrupt row throws and stays a 500.
 */
async function load(slug: string) {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  if (slug.length > SLUG_MAX || !SLUG.test(slug)) notFound();
  const product = await getProductBySlug(slug);
  if (!product || !product.published) notFound();
  const settings = await getSettings();
  return { locale, product, settings };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { locale, product, settings } = await load(slug);
  const description = locale === "ar" ? product.descriptionAr : product.descriptionEn;
  return {
    title: `${nameIn(product, locale)} — ${settings.storeName}`,
    description: description || getMessages(locale).meta.description,
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[lang]/p/[slug]">) {
  const { slug } = await params;
  const { color, notice } = await searchParams;
  const { locale, product, settings } = await load(slug);
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
