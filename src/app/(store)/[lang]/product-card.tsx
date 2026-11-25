import Link from "next/link";

import { Photo } from "@/components/photo";
import { Price } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { cardPhoto, isSoldOut, nameIn } from "@/lib/catalog/helpers";
import type { Product } from "@/lib/catalog/schema";
import { withLocale, type Locale } from "@/lib/i18n/locales";

/** The brand's sold-out mark: near-black on off-white, never red. */
export function SoldOutBadge({ label }: { label: string }) {
  return <Badge className="bg-foreground text-background">{label}</Badge>;
}

/** A catalog grid card: the flat photo on a tile, the name and the price. No border, shadow or hover transform. */
export function ProductCard({
  product,
  locale,
  soldOutLabel,
}: {
  product: Product;
  locale: Locale;
  soldOutLabel: string;
}) {
  const name = nameIn(product, locale);
  const photo = cardPhoto(product);

  return (
    <Link
      href={withLocale(locale, `/p/${product.slug}`)}
      className="group block rounded-[10px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-square overflow-hidden rounded-[10px] bg-muted">
        {photo && (
          <Photo
            photo={photo}
            alt={name}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="size-full object-contain"
          />
        )}
        {isSoldOut(product) && (
          <div className="absolute top-2 start-2">
            <SoldOutBadge label={soldOutLabel} />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-bold">{name}</p>
      {/* The page-direction <p> is the block; the LTR <bdi> inside stays inline, so the price lines up with the name in Arabic. */}
      <p className="mt-0.5 text-sm font-semibold text-primary">
        <Price value={product.priceEgp} locale={locale} />
      </p>
    </Link>
  );
}
