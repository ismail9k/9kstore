import type { Settings } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

const linkClass =
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The store footer: hairline above, the store name, then Instagram and WhatsApp when they are set. */
export function SiteFooter({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = getMessages(locale);

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
        <span>{settings.storeName}</span>
        {settings.instagramUrl !== "" && (
          <a href={settings.instagramUrl} target="_blank" rel="noopener" className={linkClass}>
            {t.footer.instagram}
          </a>
        )}
        {settings.whatsappNumber !== "" && (
          <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener" className={linkClass}>
            {t.footer.whatsapp}
          </a>
        )}
      </div>
    </footer>
  );
}
