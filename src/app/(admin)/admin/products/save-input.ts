/**
 * Pure pieces of the product save: turning the untrusted draft a Server
 * Action receives into schema input, turning zod issues into the form's
 * per-field messages, and deciding which messages no field shows.
 *
 * Imported by the save action and by the client form, so it stays free of
 * server-only code. Owner-facing text never says slug, key, JSON or payload.
 */
import { assignColorKeys, type Draft } from "./form-state";

export const SAVE_FAILED = "Couldn't save. Try again.";
/** A save sent after the session ended: the form keeps the draft so nothing is lost. */
export const LOGGED_OUT = "You were logged out. Log in again in a new tab, then save.";
export const SLUG_TAKEN = "Another product already uses this link name.";
export const PRICE_INVALID = "Enter a price in whole pounds.";
const FIELD_INVALID = "Check this field and try again.";

/** Used when the link name was auto-filled from an English name with no Latin letters or digits. */
export const FALLBACK_SLUG = "product";

export type SaveErrors = Record<string, string>;

type PreparedDraft = { ok: true; input: unknown; slugEdited: boolean } | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What `assignColorKeys` reads; anything else is left to the schema to report. */
function hasKeyableShape(draft: Record<string, unknown>): boolean {
  const { colors, soldOut } = draft;
  return (
    Array.isArray(colors) &&
    colors.every((c) => isRecord(c) && typeof c.key === "string" && typeof c.nameEn === "string") &&
    Array.isArray(soldOut) &&
    soldOut.every(isRecord)
  );
}

/**
 * Checks the draft is shaped well enough to key its colors, applies the
 * "product" fallback for an empty auto-filled link name (an owner-typed
 * empty one is left for the schema to reject), and assigns color keys.
 * The result still needs `productInputSchema`.
 */
export function prepareDraft(draft: unknown): PreparedDraft {
  if (!isRecord(draft) || typeof draft.slugEdited !== "boolean" || !hasKeyableShape(draft)) {
    return { ok: false };
  }
  const slugEdited = draft.slugEdited;
  const withSlug = !slugEdited && draft.slug === "" ? { ...draft, slug: FALLBACK_SLUG } : draft;
  // `slugEdited` stays on the object; the schema strips unknown fields.
  return { ok: true, input: assignColorKeys(withSlug as Draft), slugEdited };
}

/**
 * The price field's text as the draft's number. Empty becomes NaN, not 0,
 * so an untouched price is reported instead of saved as free.
 */
export function parsePrice(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

/**
 * Per-parse zod error map: only reached for issues whose schema sets no
 * message, i.e. wrong types (an empty price arrives as NaN) from a broken
 * or tampered form. Keeps those messages in plain words.
 */
export function ownerErrorMap(issue: { path?: PropertyKey[] }): string {
  return issue.path?.[0] === "priceEgp" ? PRICE_INVALID : FIELD_INVALID;
}

/** `{ "colors.1.swatch": message }`, keeping the first message for each path. */
export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): SaveErrors {
  const errors: SaveErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

/** The first message for `field` or anything under it (`sizes` covers `sizes.2`). */
export function errorUnder(errors: SaveErrors, field: string): string | undefined {
  if (errors[field]) return errors[field];
  const key = Object.keys(errors).find((k) => k.startsWith(`${field}.`));
  return key === undefined ? undefined : errors[key];
}

const SHOWN_EXACT = new Set([
  "slug",
  "nameEn",
  "nameAr",
  "descriptionEn",
  "descriptionAr",
  "priceEgp",
  "code",
  "colors",
  "published",
]);
const SHOWN_PATTERNS = [/^sizes(\.\d+)?$/, /^colors\.\d+\.(nameEn|nameAr|swatch|key)$/];

/** Whether the form shows this error next to a field (see product-form.tsx). */
export function isShownByField(key: string): boolean {
  return SHOWN_EXACT.has(key) || SHOWN_PATTERNS.some((p) => p.test(key));
}

/** The first message no field shows, for the form-level notice. */
export function formLevelError(errors: SaveErrors): string | undefined {
  const key = Object.keys(errors).find((k) => !isShownByField(k));
  return key === undefined ? undefined : errors[key];
}
