"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { createProduct, productInputSchema, updateProduct, type SaveResult } from "@/lib/catalog";

import type { Draft } from "./form-state";
import { issuesToErrors, LOGGED_OUT, ownerErrorMap, prepareDraft, SAVE_FAILED, SLUG_TAKEN } from "./save-input";

export type SaveProductResult = { ok: true } | { ok: false; errors: Record<string, string> };

const failed: SaveProductResult = { ok: false, errors: { form: SAVE_FAILED } };

/**
 * Creates (`id` null) or replaces a product from the form's draft. Errors are
 * keyed by field path (`"nameAr"`, `"colors.1.swatch"`, `"slug"`); `form`
 * holds a message for the whole form. On success the caller shows the toast
 * and navigates to /admin (the action does not redirect, so the toast can
 * show). Server Actions are public endpoints: `draft` is treated as untrusted.
 * Logged out (the session ended while editing), it returns a form error
 * instead of redirecting, so the form keeps the owner's edits.
 */
export async function saveProduct(id: string | null, draft: Draft): Promise<SaveProductResult> {
  if (!(await getSession())) return { ok: false, errors: { form: LOGGED_OUT } };
  if (id !== null && (typeof id !== "string" || id.length === 0)) return failed;

  const prepared = prepareDraft(draft);
  if (!prepared.ok) return failed;

  const parsed = productInputSchema.safeParse(prepared.input, { error: ownerErrorMap });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };

  const opts = { slugEdited: prepared.slugEdited };
  let result: SaveResult;
  try {
    result = id === null ? await createProduct(parsed.data, opts) : await updateProduct(id, parsed.data, opts);
  } catch (err) {
    // An unknown id (updateProduct throws) or a database failure.
    console.error("saveProduct failed", err);
    return failed;
  }
  if (!result.ok) return { ok: false, errors: { slug: SLUG_TAKEN } };

  revalidatePath("/admin");
  return { ok: true };
}
