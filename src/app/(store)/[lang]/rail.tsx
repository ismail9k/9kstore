import Link from "next/link";
import type { CSSProperties } from "react";

import { Photo } from "@/components/photo";
import { hookOffset, nameIn, railItems, type Product } from "@/lib/catalog";
import { withLocale, type Locale } from "@/lib/i18n/locales";

/**
 * The hanging rail: a full-bleed bar drawn in CSS with the featured
 * product's colors hanging from it, each linking to that color on the
 * product page. Always LTR: it is a picture of a rail, not text.
 * The photos are shot with the hook at the top center, below a transparent
 * margin that differs per photo, so each tee is aligned by its own hook:
 * its `--hook` (`hookOffset`, the hook's top as a fraction of the box width,
 * measured at upload) pulls it up by `--hook × --tee` plus the bar's 3px,
 * under the bar (drawn above it), so the top of every hook meets the bar's
 * top edge.
 *
 * Full bleed: a 100vw box with -50vw margins, centered by its flex-column
 * parent (`self-center`), so it reaches both viewport edges. 100vw counts an
 * always-visible scrollbar, so the page's `<main>` clips the overhang. The classic
 * `relative inset-x-1/2` offset is left out: in a centered flex column it
 * shifts the box by half the column and makes the page scroll sideways.
 *
 * Every photographed color hangs. `--tee` is a tee's width and the overlap
 * margins are a fixed fraction f of it per breakpoint (4/46, 4/30, 1/14: 4vw,
 * 4vw and 16px at the full widths). Up to four tees keep the full widths
 * (46vw, 30vw from sm, 224px from lg), so the outer two run off a phone's
 * edges. With more, a tee is the smallest of:
 * - the full width;
 * - `100vw / ((n - 1)(1 - 2f))`: n - 1 pitches span the viewport, so the
 *   first and last tees are at least half on screen;
 * - `(100vw - 88px) / (n(1 - 2f) + 6f - 2)`: the first tee, whose right
 *   side lies under the second, keeps at least 44px on screen to tap (the
 *   last tee lies on top and keeps more). Solving "visible part minus the
 *   2f overlap >= 44px" for the tee width gives this bound.
 * With f fixed per breakpoint each bound reduces to the integer form below.
 * Every tee keeps a 44px target up to 8 colors at 390px (the viewport
 * divided by 44px is the hard limit).
 */
const FULL = "[--tee:46vw] sm:[--tee:30vw] lg:[--tee:224px]";
const FIT =
  "[--tee:min(46vw,calc(100vw*46/(38*(var(--n)_-_1))),calc((100vw_-_88px)*46/(38*var(--n)_-_68)))] " +
  "sm:[--tee:min(30vw,calc(100vw*30/(22*(var(--n)_-_1))),calc((100vw_-_88px)*30/(22*var(--n)_-_36)))] " +
  "lg:[--tee:min(224px,calc(100vw*14/(12*(var(--n)_-_1))),calc((100vw_-_88px)*14/(12*var(--n)_-_22)))]";

export function Rail({ product, locale }: { product: Product; locale: Locale }) {
  const name = nameIn(product, locale);
  const items = railItems(product);

  return (
    <div dir="ltr" className="-mx-[50vw] w-screen self-center overflow-x-hidden">
      <div aria-hidden className="relative z-10 h-[3px] w-full rounded-full bg-gradient-to-b from-[#8a8a8a] to-foreground" />
      <div
        style={{ "--n": items.length } as CSSProperties}
        className={`flex items-start justify-center ${items.length > 4 ? FIT : FULL}`}
      >
        {items.map(({ color, photo }) => (
          <Link
            key={color.key}
            href={withLocale(locale, `/p/${product.slug}`, `?color=${color.key}`)}
            aria-label={`${name} — ${nameIn(color, locale)}`}
            style={{ "--hook": hookOffset(photo) } as CSSProperties}
            className="mt-[calc(var(--hook)*var(--tee)*-1_-_3px)] -mx-[calc(var(--tee)*4/46)] block w-(--tee) shrink-0 sm:-mx-[calc(var(--tee)*4/30)] lg:-mx-[calc(var(--tee)/14)]"
          >
            {/* sizes: the full widths, an upper bound for the slot (a shrunk tee may fetch one width class larger). */}
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
