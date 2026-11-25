import type { Locale } from "./locales";
import { getMessages } from "./messages";

const digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Western digits with comma grouping in both languages: "1,250 EGP" / "1,250 جنيه". */
export function formatPrice(priceEgp: number, locale: Locale): string {
  return `${digits.format(priceEgp)} ${getMessages(locale).price.unit}`;
}

/** Wraps left-to-right text (codes, sizes, numbers) in LRI…PDI so it stays readable inside RTL text. */
export function isolateLtr(text: string): string {
  return `\u2066${text}\u2069`;
}
