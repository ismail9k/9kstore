import Link from "next/link";
import { Suspense } from "react";

import { LanguageToggle } from "@/components/site/language-toggle";
import { withLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

/** The slim store header: wordmark, language pill at the row's end, hairline below. */
export function SiteHeader({ locale, storeName }: { locale: Locale; storeName: string }) {
  const t = getMessages(locale);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
        <Link href={withLocale(locale, "/")} dir="ltr" className="font-bold text-primary" aria-label={storeName}>
          9k store
        </Link>
        <div className="ms-auto">
          <Suspense fallback={null}>
            <LanguageToggle locale={locale} label={t.header.switchLanguage} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
