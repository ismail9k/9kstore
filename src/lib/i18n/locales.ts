export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LANG_COOKIE = "9k_lang";

/** Each language's name in its own script, for the toggle. */
export const LOCALE_NAMES: Record<Locale, string> = { ar: "العربية", en: "English" };

export function isLocale(value: string | undefined | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

/** "/en/p/tee" → { locale: "en", rest: "/p/tee" }; "/p/tee" → { locale: null, rest: "/p/tee" }; "/en" → rest "/" */
export function splitLocale(pathname: string): { locale: Locale | null; rest: string } {
  const [, first, ...remaining] = pathname.split("/");
  if (!isLocale(first)) return { locale: null, rest: pathname };
  const joined = remaining.join("/");
  return { locale: first, rest: joined ? `/${joined}` : "/" };
}

/** withLocale("en", "/p/tee", "?color=black") → "/en/p/tee?color=black"; rest "/" → "/en" */
export function withLocale(locale: Locale, rest: string, search?: string): string {
  const path = rest === "/" ? `/${locale}` : `/${locale}${rest}`;
  return search ? path + search : path;
}

/** toggleHref("ar", "/ar/p/tee", "?color=black") → "/lang/en?to=%2Fp%2Ftee%3Fcolor%3Dblack" */
export function toggleHref(current: Locale, pathname: string, search: string): string {
  const { rest } = splitLocale(pathname);
  return `/lang/${otherLocale(current)}?to=${encodeURIComponent(rest + search)}`;
}
