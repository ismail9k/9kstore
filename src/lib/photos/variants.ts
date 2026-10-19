/**
 * The fixed set of photo variants and the R2 keys they live under. Pure and
 * client-safe: the upload pipeline, the delivery route and customer pages all
 * read the same constants, so a variant is defined in exactly one place.
 */

export const VARIANT_WIDTHS = [320, 640, 960, 1280] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];
export type VariantFormat = "webp" | "jpeg";
export type Variant = {
  width: VariantWidth;
  format: VariantFormat;
  file: string;
  contentType: "image/webp" | "image/jpeg";
};

/** The JPEG for link previews: WhatsApp and Instagram don't reliably render WebP. */
export const OG_VARIANT: Variant = { width: 1280, format: "jpeg", file: "1280.jpg", contentType: "image/jpeg" };

/** Every file the delivery route will serve or generate: four WebP widths and the link-preview JPEG. */
export const VARIANTS: readonly Variant[] = [
  ...VARIANT_WIDTHS.map(
    (width): Variant => ({ width, format: "webp", file: `${width}.webp`, contentType: "image/webp" }),
  ),
  OG_VARIANT,
];

/** The page's off-white, used to flatten transparency in the JPEG. */
export const OG_BACKGROUND = "#F1EDE7";
export const WEBP_QUALITY = 82;
export const JPEG_QUALITY = 85;
export const MASTER_QUALITY = 90;

/** The master's long edge never exceeds this. */
export const MASTER_MAX_EDGE = 2560;
/** A PNG or WebP at or under this size (and edge) is kept byte-for-byte as the master. */
export const KEEP_MAX_BYTES = 4 * 1024 * 1024;
/** The Images binding's input limit. */
export const INPUT_MAX_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PHOTO_ID = /^[a-z0-9-]{1,64}$/;

export function isPhotoId(value: string): boolean {
  return PHOTO_ID.test(value);
}

/** The variant named exactly `file`, or null. An exact lookup: no parsing, no normalization. */
export function parseVariant(file: string): Variant | null {
  return VARIANTS.find((variant) => variant.file === file) ?? null;
}

export function masterKey(id: string): string {
  return `photos/${id}/master`;
}

export function variantKey(id: string, variant: Variant): string {
  return `photos/${id}/${variant.file}`;
}
