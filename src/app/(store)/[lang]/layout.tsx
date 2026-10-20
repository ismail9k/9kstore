import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import "@/app/globals.css";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getSettings } from "@/lib/catalog";
import { plex } from "@/lib/i18n/font";
import { dirOf, isLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const settings = await getSettings();
  return {
    title: settings.storeName,
    description: getMessages(locale).meta.description,
  };
}

export default async function StoreLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const settings = await getSettings();

  return (
    <html lang={locale} dir={dirOf(locale)} className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader locale={locale} storeName={settings.storeName} />
        {children}
        <SiteFooter locale={locale} settings={settings} />
      </body>
    </html>
  );
}
