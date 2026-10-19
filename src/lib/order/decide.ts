/**
 * What the order route does with a tap: open WhatsApp, or send the customer
 * back to the product page with a notice. Decided from the product and
 * settings as read at request time. Pure; no `next` imports.
 */
import { colorByKey, isInStock, nameIn } from "@/lib/catalog/helpers";
import type { Product, Settings } from "@/lib/catalog/schema";
import { withLocale, type Locale } from "@/lib/i18n/locales";

import { buildOrderMessage, whatsappUrl } from "./message";

export type Notice = "sold-out" | "changed" | "failed";

const NOTICES: readonly Notice[] = ["sold-out", "changed", "failed"];

/** `?notice=` as Next or URLSearchParams hands it over; anything but one of the three is null. */
export function parseNotice(value: string | string[] | null | undefined): Notice | null {
  return typeof value === "string" && (NOTICES as readonly string[]).includes(value) ? (value as Notice) : null;
}

export type OrderQuery = { color: string | null; size: string | null; price: string | null };

export type OrderDecision = { kind: "whatsapp"; url: string } | { kind: "back"; path: string };

export function decideOrder(input: {
  product: Product;
  settings: Settings;
  locale: Locale;
  origin: string;
  query: OrderQuery;
}): OrderDecision {
  const { product, settings, locale, origin, query } = input;
  const productPath = `/p/${product.slug}`;
  // Always a same-origin path: the query only ever picks a known color key.
  const back = (params: Record<string, string>): OrderDecision => ({
    kind: "back",
    path: withLocale(locale, productPath, `?${new URLSearchParams(params).toString()}`),
  });

  const color = query.color === null ? null : colorByKey(product, query.color);
  if (!color) return back({ notice: "failed" });
  const size = query.size;
  if (size === null || !product.sizes.includes(size)) return back({ color: color.key, notice: "failed" });
  if (!isInStock(product, color.key, size)) return back({ color: color.key, notice: "sold-out" });
  // A missing or non-integer price skips the check: a hand-typed link orders at the current price.
  if (query.price !== null && /^\d+$/.test(query.price) && Number(query.price) !== product.priceEgp) {
    return back({ color: color.key, notice: "changed" });
  }
  if (settings.whatsappNumber === "") return back({ color: color.key, notice: "failed" });

  const link = `${origin}${withLocale(locale, productPath, `?${new URLSearchParams({ color: color.key }).toString()}`)}`;
  const message = buildOrderMessage(
    {
      greeting: locale === "ar" ? settings.greetingAr : settings.greetingEn,
      productName: nameIn(product, locale),
      colorName: nameIn(color, locale),
      size,
      priceEgp: product.priceEgp,
      code: product.code,
      link,
    },
    locale,
  );
  return { kind: "whatsapp", url: whatsappUrl(settings.whatsappNumber, message) };
}

/** `<proto>://<host>` the request was reached on: forwarded headers, then `Host`, then the URL itself. */
export function requestOrigin(headers: Headers, url: string): string {
  const parsed = new URL(url);
  const proto = headers.get("x-forwarded-proto") ?? parsed.protocol.replace(/:$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? parsed.host;
  return `${proto}://${host}`;
}
