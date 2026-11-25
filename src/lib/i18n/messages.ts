import type { Locale } from "./locales";
import { ar } from "./messages/ar";
import { en, type Messages } from "./messages/en";

export type { Messages };

export function getMessages(locale: Locale): Messages {
  return locale === "ar" ? ar : en;
}
