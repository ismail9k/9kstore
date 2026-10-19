import { splitLocale, withLocale, type Locale } from "./locales";

/** One leading slash, not followed by another slash or a backslash: a same-origin path. */
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;

/**
 * Where `/lang/<lang>?to=<to>` redirects: `to` re-prefixed with `lang`, its
 * query kept. Anything that is not a same-origin path, including a rest that
 * becomes protocol-relative once a locale is stripped, falls back to the
 * language's home, so the switch route is never an open redirect.
 */
export function switchTarget(lang: Locale, to: string | null | undefined): string {
  if (!to || !SAME_ORIGIN_PATH.test(to)) return withLocale(lang, "/");
  const q = to.indexOf("?");
  const path = q === -1 ? to : to.slice(0, q);
  const search = q === -1 ? "" : to.slice(q);
  const { rest } = splitLocale(path);
  if (!SAME_ORIGIN_PATH.test(rest)) return withLocale(lang, "/");
  return withLocale(lang, rest, search);
}
