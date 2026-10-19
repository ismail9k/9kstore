import Link from "next/link";
import { lang } from "next/root-params";

import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isLocale, withLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

export default async function NotFound() {
  const raw = await lang();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = getMessages(locale);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-bold">{t.notFound.title}</h1>
      <p className="text-muted-foreground">{t.notFound.body}</p>
      <Button asChild>
        <Link href={withLocale(locale, "/")}>{t.notFound.back}</Link>
      </Button>
    </main>
  );
}
