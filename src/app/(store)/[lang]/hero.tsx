import { cn } from "cn";
import Link from "next/link";

import { Price } from "@/components/price";
import { Button } from "@/components/ui/button";
import { isSoldOut, nameIn, type Product } from "@/lib/catalog";
import { withLocale, type Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";

import { SoldOutBadge } from "./product-card";
import { Rail } from "./rail";

/** The home page's opening shot: eyebrow, two-line headline, the rail, the featured product and its one button. */
export function Hero({ product, locale, t }: { product: Product; locale: Locale; t: Messages }) {
  return (
    <section className="flex flex-col items-center gap-4 pt-8 text-center">
      <p
        className={cn(
          "text-sm font-semibold text-muted-foreground",
          // Arabic has no case and is never letter-spaced.
          locale === "en" && "uppercase tracking-[0.2em]",
        )}
      >
        {t.home.eyebrow}
      </p>
      <h1 className="text-4xl font-bold leading-[1.05] md:text-6xl">
        {t.home.headlineTop}
        <br />
        <span className="text-primary">{t.home.headlineAccent}</span>
      </h1>
      <Rail product={product} locale={locale} />
      <p className="flex items-center gap-2 text-xl font-bold">
        {nameIn(product, locale)}
        {isSoldOut(product) && <SoldOutBadge label={t.product.soldOut} />}
      </p>
      <Price value={product.priceEgp} locale={locale} className="font-semibold text-primary" />
      <Button asChild size="lg">
        <Link href={withLocale(locale, `/p/${product.slug}`)}>{t.home.viewProduct}</Link>
      </Button>
    </section>
  );
}
