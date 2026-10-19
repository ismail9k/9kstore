import Link from "next/link";

import { Photo } from "@/components/photo";
import { nameIn, railItems, type Product } from "@/lib/catalog";
import { withLocale, type Locale } from "@/lib/i18n/locales";

/**
 * The hanging rail: a full-bleed bar drawn in CSS with the featured
 * product's colors hanging from it, each linking to that color on the
 * product page. Always LTR: it is a picture of a rail, not text.
 * Each image box's top edge sits on the bar; the photos are shot with the
 * hook at the top center, so the hook meets the bar.
 *
 * Full bleed: a 100vw box with -50vw margins, centered by its flex-column
 * parent (`self-center`), so it reaches both viewport edges. The classic
 * `relative inset-x-1/2` offset is left out: in a centered flex column it
 * shifts the box by half the column and makes the page scroll sideways.
 */
export function Rail({ product, locale }: { product: Product; locale: Locale }) {
  const name = nameIn(product, locale);

  return (
    <div dir="ltr" className="-mx-[50vw] w-screen self-center overflow-x-hidden">
      <div aria-hidden className="h-[3px] w-full rounded-full bg-gradient-to-b from-[#8a8a8a] to-foreground" />
      <div className="flex justify-center">
        {railItems(product).map(({ color, photo }) => (
          <Link
            key={color.key}
            href={withLocale(locale, `/p/${product.slug}`, `?color=${color.key}`)}
            aria-label={`${name} — ${nameIn(color, locale)}`}
            className="-mx-[4vw] block w-[46vw] shrink-0 sm:w-[30vw] lg:-mx-4 lg:w-56"
          >
            <Photo
              photo={photo}
              alt=""
              sizes="(min-width: 1024px) 224px, (min-width: 640px) 30vw, 46vw"
              priority
              className="w-full"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
