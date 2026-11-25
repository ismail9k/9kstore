/**
 * The processing plan for an uploaded photo: which inputs are accepted,
 * whether the master is re-encoded, and how each variant is rendered.
 * Pure: the Images binding calls live in the upload and delivery code.
 */
import {
  ACCEPTED_TYPES,
  JPEG_QUALITY,
  KEEP_MAX_BYTES,
  MASTER_MAX_EDGE,
  MASTER_QUALITY,
  OG_BACKGROUND,
  VARIANTS,
  WEBP_QUALITY,
  type Variant,
} from "./variants";

/** What `IMAGES.info()` reports for a raster image. */
export type ImageInfo = { format: string; width: number; height: number; fileSize: number };
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];
export type UploadRejection = { status: 413 | 415; error: string };

/** Owner-facing copy, fixed by the spec. */
export const MESSAGES = {
  loggedOut: "You were logged out. Log in again in a new tab, then try again.",
  tooBig: "This photo is over 20 MB. Export it smaller and try again.",
  badType: "Use a JPG, PNG or WebP photo.",
  tooLarge: "This photo is too large to process.",
  unavailable: "Photo processing isn't available right now. Try again in a minute.",
  network: "Couldn't upload. Check your connection and try again.",
  perColor: "Up to 20 photos per color",
} as const;

const MAX_EDGE = 12_000;
const MAX_AREA = 100_000_000;

function isAcceptedType(format: string): format is AcceptedType {
  return (ACCEPTED_TYPES as readonly string[]).includes(format);
}

/** Why an input can't be processed, or null when it can. */
export function checkInput(info: ImageInfo | { format: "image/svg+xml" }): UploadRejection | null {
  if (!isAcceptedType(info.format) || !("width" in info)) return { status: 415, error: MESSAGES.badType };
  const { width, height } = info;
  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_AREA) {
    return { status: 415, error: MESSAGES.tooLarge };
  }
  return null;
}

/**
 * Whether the input must be re-encoded into a master. Every JPEG is (to drop
 * EXIF and bake in the orientation); a PNG or WebP only when its long edge is
 * over the master's or it is over the keep-as-is size.
 */
export function needsMaster(info: ImageInfo): boolean {
  if (info.format === "image/jpeg") return true;
  return Math.max(info.width, info.height) > MASTER_MAX_EDGE || info.fileSize > KEEP_MAX_BYTES;
}

export type MasterPlan = { transform: ImageTransform; output: ImageOutputOptions };

export const MASTER_PLAN: MasterPlan = {
  transform: { width: MASTER_MAX_EDGE, height: MASTER_MAX_EDGE, fit: "scale-down" },
  output: { format: "image/webp", quality: MASTER_QUALITY },
};

export type VariantPlan = { variant: Variant; transform: ImageTransform; output: ImageOutputOptions };

/** One plan per variant file, in `VARIANTS` order. */
export function variantPlans(): VariantPlan[] {
  return VARIANTS.map((variant) => ({
    variant,
    transform: { width: variant.width, fit: "scale-down" },
    output:
      variant.format === "jpeg"
        ? { format: "image/jpeg", quality: JPEG_QUALITY, background: OG_BACKGROUND }
        : { format: "image/webp", quality: WEBP_QUALITY },
  }));
}
