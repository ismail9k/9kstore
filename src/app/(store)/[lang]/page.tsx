import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { cache } from "react";

import {
  cardPhoto,
  featuredProduct,
  getSettings,
  listProducts,
  nameIn,
  type Product,
  type Settings,
} from "@/lib/catalog";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { ogImageSize, photoOgSrc } from "@/lib/photos/urls";
import { storeMetadata, type PreviewImage } from "@/lib/site/metadata";
import { getSiteOrigin } from "@/lib/site/origin";

import { Hero } from "./hero";
import { ProductCard } from "./product-card";

/**
 * The page's data, read fresh from D1 on every request; `cache()` is
 * request-scoped, so `generateMetadata` and the page share one read of the
 * settings and one of the published products.
 */
const load = cache(async () => {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const [settings, products] = await Promise.all([getSettings(), listProducts({ publishedOnly: true })]);
  return { locale, settings, products };
});

/**
 * The link preview: the first product in catalog order with a card photo,
 * else the store logo (an empty shop), else no image.
 */
function homePreview(products: Product[], settings: Settings, locale: Locale): PreviewImage | null {
  for (const product of products) {
    const photo = cardPhoto(product);
    if (photo) return { src: photoOgSrc(photo), ...(ogImageSize(photo) ?? {}), alt: nameIn(product, locale) };
  }
  const logo = settings.logo;
  if (logo) return { src: photoOgSrc(logo), ...(ogImageSize(logo) ?? {}), alt: settings.storeName };
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, settings, products } = await load();
  return storeMetadata({
    origin: await getSiteOrigin(),
    locale,
    path: "/",
    title: settings.storeName,
    description: getMessages(locale).meta.description,
    siteName: settings.storeName,
    image: homePreview(products, settings, locale),
  });
}

export default async function Home() {
  const { locale, products } = await load();
  const t = getMessages(locale);
  const featured = featuredProduct(products);

  return (
    // Full width and clipped: the rail's 100vw counts a classic scrollbar and would otherwise scroll sideways.
    <main className="w-full flex-1 overflow-x-clip">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-16">
        {featured && <Hero product={featured} locale={locale} t={t} />}
        {products.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">{t.home.empty}</p>
        ) : (
          <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} locale={locale} soldOutLabel={t.product.soldOut} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
