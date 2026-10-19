/**
 * Pure pieces of the settings save: checking the untrusted argument the
 * Server Action receives, and turning saved settings back into form values.
 * Imported by the action and by the client form, so it stays free of
 * server-only code.
 */
import { settingsInputSchema, type Settings, type SettingsInput } from "@/lib/catalog/schema";

import { issuesToErrors, ownerErrorMap, SAVE_FAILED, type SaveErrors } from "../products/save-input";

export type ParsedSettings = { ok: true; input: SettingsInput } | { ok: false; errors: SaveErrors };

/** The fields `<SettingsForm>` shows and sends, without `updatedAt`. */
export function settingsToInput(settings: Settings): SettingsInput {
  return {
    storeName: settings.storeName,
    whatsappNumber: settings.whatsappNumber,
    greetingAr: settings.greetingAr,
    greetingEn: settings.greetingEn,
    instagramUrl: settings.instagramUrl,
    logo: settings.logo,
  };
}

/**
 * Validates the form's values. A non-object (a broken or tampered request)
 * gets the generic form message; field problems come back keyed by field
 * (`"whatsappNumber"`, `"logo.key"`).
 */
export function parseSettingsInput(input: unknown): ParsedSettings {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: { form: SAVE_FAILED } };
  }
  const parsed = settingsInputSchema.safeParse(input, { error: ownerErrorMap });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };
  return { ok: true, input: parsed.data };
}

const SHOWN_BY_FIELD = new Set(["storeName", "whatsappNumber", "instagramUrl", "greetingAr", "greetingEn"]);

/** The first message no field shows (e.g. a broken logo), for the form-level notice. */
export function settingsFormError(errors: SaveErrors): string | undefined {
  const key = Object.keys(errors).find((k) => !SHOWN_BY_FIELD.has(k));
  return key === undefined ? undefined : errors[key];
}
