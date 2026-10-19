import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import { featuredProduct, getSettings, listProducts } from "@/lib/catalog";
import { isLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

import { Hero } from "./hero";
import { ProductCard } from "./product-card";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const settings = await getSettings();
  return {
    title: settings.storeName,
    description: getMessages(locale).meta.description,
  };
}

export default async function Home() {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const [t, products] = [getMessages(locale), await listProducts({ publishedOnly: true })];
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
