import Link from "next/link";

import { Button } from "@/components/ui/button";
import { withLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

/**
 * A hidden product's page: its name, "no longer available", and a way back
 * to the shop. Answered with 200 so old story links keep working; the
 * metadata marks it noindex. The same shape as `not-found.tsx`.
 */
export function Unavailable({ name, locale }: { name: string; locale: Locale }) {
  const t = getMessages(locale);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-sm font-semibold text-muted-foreground">{name}</p>
      <h1 className="text-3xl font-bold">{t.unavailable.title}</h1>
      <p className="text-muted-foreground">{t.unavailable.body}</p>
      <Button asChild>
        <Link href={withLocale(locale, "/")}>{t.unavailable.back}</Link>
      </Button>
    </main>
  );
}
