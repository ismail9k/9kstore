"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { updateSettings } from "@/lib/catalog";
import type { Settings, SettingsInput } from "@/lib/catalog/schema";

import { SAVE_FAILED } from "../products/save-input";
import { parseSettingsInput } from "./settings-input";

export type SaveSettingsResult = { ok: true; settings: Settings } | { ok: false; errors: Record<string, string> };

/**
 * Saves the store settings. Errors are keyed by field (`"whatsappNumber"`);
 * `form` holds a message for the whole form. On success returns the saved
 * settings (the WhatsApp number as digits only) so the form shows what was
 * stored. Server Actions are public endpoints: `input` is treated as untrusted.
 */
export async function saveSettings(input: SettingsInput): Promise<SaveSettingsResult> {
  await requireOwner();

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
