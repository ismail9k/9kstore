import { Ltr } from "@/components/ltr";
import { formatPrice } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";

export function Price({ value, locale, className }: { value: number; locale: Locale; className?: string }) {
  return <Ltr className={className}>{formatPrice(value, locale)}</Ltr>;
}
