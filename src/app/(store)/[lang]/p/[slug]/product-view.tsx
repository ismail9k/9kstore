"use client";

import { useEffect, useState } from "react";

import { Ltr } from "@/components/ltr";
import { Photo } from "@/components/photo";
import { Price } from "@/components/price";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  colorByKey,
  initialColor,
  isColorSoldOut,
  isInStock,
  isSoldOut,
  nameIn,
  sizeAvailability,
} from "@/lib/catalog/helpers";
import type { Product } from "@/lib/catalog/schema";
import { dirOf, withLocale, type Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";
import type { Notice } from "@/lib/order/decide";

import { SoldOutBadge } from "../../product-card";
import { Gallery } from "./gallery";

/** `?color=<key>` in place: the color is view state, so nothing is pushed. */
function replaceColor(key: string) {
  window.history.replaceState(null, "", `?${new URLSearchParams({ color: key }).toString()}`);
}

/**
 * The product page's interactive part: the gallery of the selected color,
 * the color and size pickers, and the order button, which is a plain link to
 * the order route once a size is chosen (no `target`, no `onClick`, so it
 * works in in-app browsers). Before hydration it renders the "choose a size"
 * state, which is right: nothing can be chosen yet.
 */
export function ProductView({
  product,
  locale,
  initialColorKey,
  notice,
  canOrder,
  t,
}: {
  product: Product;
  locale: Locale;
  initialColorKey: string;
  notice: Notice | null;
  canOrder: boolean;
  t: Pick<Messages, "product" | "order">;
}) {
  const [colorKey, setColorKey] = useState(initialColorKey);
  const [size, setSize] = useState<string | null>(null);
  const [shownNotice, setShownNotice] = useState(notice);

  const color = colorByKey(product, colorKey) ?? initialColor(product, undefined);
  const sizes = sizeAvailability(product, color.key);
  const soldOutSizes = sizes.filter((s) => !s.inStock).map((s) => s.size);
  const colorOut = isColorSoldOut(product, color.key);
  const name = nameIn(product, locale);
  const description = locale === "ar" ? product.descriptionAr : product.descriptionEn;

  // Sent back with a notice: drop `?notice=` so a reload or the language toggle does not repeat it.
  useEffect(() => {
    if (notice !== null) replaceColor(initialColorKey);
  }, [notice, initialColorKey]);

  function onColorChange(key: string) {
    if (key === "") return; // Pressing the selected swatch again; a color stays chosen.
    setColorKey(key);
    if (size !== null && !isInStock(product, key, size)) setSize(null);
    replaceColor(key);
  }

  function onSizeChange(value: string) {
    if (value === "") return;
    setSize(value);
    setShownNotice(null);
  }

  const hint = !canOrder
    ? t.product.orderingUnavailable
    : colorOut
      ? t.product.colorSoldOut
      : size === null
        ? t.product.chooseSize
        : null;
  const orderHref =
    hint === null && size !== null
      ? withLocale(
          locale,
          `/p/${product.slug}/order`,
          `?${new URLSearchParams({ color: color.key, size, price: String(product.priceEgp) }).toString()}`,
        )
      : null;

  return (
    <div className="md:grid md:grid-cols-2 md:gap-10">
      <Gallery
        photos={color.photos}
        alt={`${name} — ${nameIn(color, locale)}`}
        priorityFirst={color.key === initialColorKey}
      />

      <div className="mt-6 flex flex-col gap-4 md:mt-0">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {name}
            {isSoldOut(product) && <SoldOutBadge label={t.product.soldOut} />}
          </h1>
          <p>
            <Price value={product.priceEgp} locale={locale} className="text-lg font-semibold text-primary" />
          </p>
        </div>

        {description !== "" && <p className="whitespace-pre-line text-muted-foreground">{description}</p>}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{`${t.product.color}: ${nameIn(color, locale)}`}</p>
          {product.colors.length > 1 && (
            <ToggleGroup
              type="single"
              value={color.key}
              onValueChange={onColorChange}
              dir={dirOf(locale)}
              aria-label={t.product.color}
              spacing={3}
              className="flex-wrap p-1"
            >
              {product.colors.map((c) => (
                <ToggleGroupItem
                  key={c.key}
                  value={c.key}
                  aria-label={nameIn(c, locale)}
                  style={{ background: c.swatch }}
                  className="size-9 min-w-0 rounded-full border border-border p-0 data-[state=on]:ring-2 data-[state=on]:ring-primary data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-background"
                />
              ))}
            </ToggleGroup>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{t.product.size}</p>
          <ToggleGroup
            type="single"
            value={size ?? ""}
            onValueChange={onSizeChange}
            dir={dirOf(locale)}
            aria-label={t.product.size}
            spacing={2}
            className="flex-wrap"
          >
            {sizes.map(({ size: s, inStock }) => (
              <ToggleGroupItem
                key={s}
                value={s}
                disabled={!inStock}
                aria-label={inStock ? undefined : `${s} — ${t.product.soldOut}`}
                className={`min-h-11 min-w-11 rounded-[8px] border px-3 text-sm font-semibold ${
                  inStock
                    ? "border-border bg-background text-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:data-[state=on]:bg-primary hover:data-[state=on]:text-primary-foreground"
                    : "border-border/60 bg-background text-foreground/40 disabled:opacity-100"
                }`}
              >
                {inStock ? (
                  <Ltr>{s}</Ltr>
                ) : (
                  <s>
                    <Ltr>{s}</Ltr>
                  </s>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {soldOutSizes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {`${t.product.soldOut}: `}
              {soldOutSizes.map((s, i) => (
                <span key={s}>
                  {i > 0 && ", "}
                  <Ltr>{s}</Ltr>
                </span>
              ))}
            </p>
          )}
          {product.sizeChart && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">{t.product.sizeChart}</summary>
              <Photo
                photo={product.sizeChart}
                alt={t.product.sizeChart}
                sizes="(min-width: 768px) 50vw, 100vw"
                className="mt-2 h-auto w-full rounded-[10px] bg-muted"
              />
            </details>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {shownNotice && (
            <p role="status" className="text-foreground">
              {t.order[shownNotice === "sold-out" ? "soldOut" : shownNotice]}
            </p>
          )}
          {orderHref !== null ? (
            <Button size="lg" asChild className="h-12 w-full px-8 text-base font-semibold md:w-auto md:self-start">
              <a href={orderHref}>{t.product.orderOnWhatsapp}</a>
            </Button>
          ) : (
            <>
              <Button size="lg" disabled aria-describedby="order-hint" className="h-12 w-full px-8 text-base font-semibold md:w-auto md:self-start">
                {t.product.orderOnWhatsapp}
              </Button>
              <p id="order-hint" className="text-sm text-muted-foreground">
                {hint}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
