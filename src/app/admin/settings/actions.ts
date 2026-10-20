"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { updateSettings } from "@/lib/catalog";
import type { Settings, SettingsInput } from "@/lib/catalog/schema";

import { LOGGED_OUT, SAVE_FAILED } from "../products/save-input";
import { parseSettingsInput } from "./settings-input";

export type SaveSettingsResult = { ok: true; settings: Settings } | { ok: false; errors: Record<string, string> };

/**
 * Saves the store settings. Errors are keyed by field (`"whatsappNumber"`);
 * `form` holds a message for the whole form. On success returns the saved
 * settings (the WhatsApp number as digits only) so the form shows what was
 * stored. Server Actions are public endpoints: `input` is treated as untrusted.
 * Logged out (the session ended while editing), it returns a form error
 * instead of redirecting, so the form keeps the owner's edits.
 */
export async function saveSettings(input: SettingsInput): Promise<SaveSettingsResult> {
  if (!(await getSession())) return { ok: false, errors: { form: LOGGED_OUT } };

  const parsed = parseSettingsInput(input);
  if (!parsed.ok) return parsed;

  let settings: Settings;
  try {
    settings = await updateSettings(parsed.input);
  } catch (err) {
    console.error("saveSettings failed", err);
    return { ok: false, errors: { form: SAVE_FAILED } };
  }

  // The header in the admin layout shows the store name, so refresh the layout too.
  revalidatePath("/admin", "layout");
  return { ok: true, settings };
}
