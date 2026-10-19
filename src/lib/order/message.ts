/**
 * The WhatsApp order message and its wa.me link.
 * Pure, with no `next` imports; safe to import from client and server code.
 */
import { formatPrice, isolateLtr } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

export type OrderDetails = {
  /** settings.greetingAr / greetingEn by locale */
  greeting: string;
  /** nameIn(product, locale) */
  productName: string;
  /** nameIn(color, locale) */
  colorName: string;
  size: string;
  priceEgp: number;
  code: string | null;
  /** `${origin}/<lang>/p/<slug>?color=<key>` */
  link: string;
};

/** The message in the given locale, lines joined with "\n"; size, price and code are LTR-isolated in Arabic. */
export function buildOrderMessage(d: OrderDetails, locale: Locale): string {
  const t = getMessages(locale);
  const ltr = (text: string) => (locale === "ar" ? isolateLtr(text) : text);
  const lines = [
    d.greeting,
    `${d.productName} — ${d.colorName}`,
    `${t.product.size}: ${ltr(d.size)}`,
    `${t.product.price}: ${ltr(formatPrice(d.priceEgp, locale))}`,
  ];
  if (d.code !== null) lines.push(`${t.order.code}: ${ltr(d.code)}`);
  lines.push(d.link);
  return lines.join("\n");
}

/** `https://wa.me/<digits>?text=<encodeURIComponent(message)>` */
export function whatsappUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
