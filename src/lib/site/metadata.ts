/**
 * The store's shared `<head>` tags: canonical, hreflang, Open Graph and
 * Twitter. Pure (no request, no catalog): the caller passes the origin from
 * `getSiteOrigin()` and spreads the result into its `Metadata`.
 */
import type { Metadata } from "next";

import { DEFAULT_LOCALE, LOCALES, otherLocale, withLocale, type Locale } from "@/lib/i18n/locales";

/** A preview image; `src` is a site path such as `/photos/<id>/1280.jpg`. */
export type PreviewImage = { src: string; width?: number; height?: number; alt: string };

export type StoreMetadataInput = {
  /** `<proto>://<host>`, no trailing slash. */
  origin: string;
  locale: Locale;
  /** Locale-less, as `withLocale` takes it: `"/"` or `"/p/<slug>"`. */
  path: string;
  /** Appended to `og:url` only (e.g. `{ color: "black" }`); never to the canonical. */
  ogQuery?: Record<string, string>;
  /** `<title>`. */
  title: string;
  /** `og:title` and `twitter:title` when they differ from `<title>`. */
  ogTitle?: string;
  description: string;
  siteName: string;
  image?: PreviewImage | null;
  noindex?: boolean;
  other?: Record<string, string>;
};

/** Facebook's documented `og:locale` codes (Arabic has no `ar_EG` there). */
export const OG_LOCALES: Record<Locale, string> = { ar: "ar_AR", en: "en_US" };

export function storeMetadata(input: StoreMetadataInput): Metadata {
  const { origin, locale, path, ogQuery, title, description, siteName, image, noindex, other } = input;
  const urlFor = (l: Locale) => origin + withLocale(l, path);
  const canonical = urlFor(locale);
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = urlFor(l);
  languages["x-default"] = urlFor(DEFAULT_LOCALE);

  const query = ogQuery && Object.keys(ogQuery).length > 0 ? `?${new URLSearchParams(ogQuery)}` : "";
  const shareTitle = input.ogTitle ?? title;

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: shareTitle,
      description,
      url: canonical + query,
      siteName,
      locale: OG_LOCALES[locale],
      alternateLocale: [OG_LOCALES[otherLocale(locale)]],
      type: "website",
      ...(image && {
        images: [
          {
            url: origin + image.src,
            ...(image.width !== undefined && { width: image.width }),
            ...(image.height !== undefined && { height: image.height }),
            alt: image.alt,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      ...(image && { images: [origin + image.src] }),
    },
    ...(noindex && { robots: { index: false, follow: true } }),
    ...(other && { other }),
  };
}
