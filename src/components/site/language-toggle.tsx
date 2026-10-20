"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { dirOf, LOCALE_NAMES, otherLocale, toggleHref, type Locale } from "@/lib/i18n/locales";

/**
 * The language pill. A plain anchor, not `next/link`: its target is a route
 * handler that sets a cookie, so it must not be prefetched. The href resolves
 * during server rendering, so the toggle works before hydration.
 */
export function LanguageToggle({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = toggleHref(locale, pathname, search ? `?${search}` : "");
  const other = otherLocale(locale);

  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} aria-label={`${label}: ${LOCALE_NAMES[other]}`}>
        <span lang={other} dir={dirOf(other)}>
          {LOCALE_NAMES[other]}
        </span>
      </a>
    </Button>
  );
}
