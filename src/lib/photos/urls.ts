/**
 * The public URLs a stored photo is served from (`/photos/[id]/[file]`).
 * Pure; safe for client and server.
 */
import type { Photo } from "@/lib/catalog/schema";

import { OG_VARIANT, VARIANT_WIDTHS, type VariantWidth } from "./variants";

/** `/photos/<key>/<w>.webp` */
export function photoSrc(photo: Photo, width: VariantWidth = 640): string {
  return `/photos/${photo.key}/${width}.webp`;
}

/**
 * `"/photos/k/320.webp 320w, /photos/k/640.webp 640w, …"`. Widths above the
 * master's own width are skipped: the first one at or above it is kept and
 * advertised at the master's width, since `scale-down` never upscales (a
 * 1200-wide master ends with `/photos/k/1280.webp 1200w`). Every earlier
 * width is below the master's, so no descriptor repeats. With no known
 * width, all four are listed at their own widths.
 */
export function photoSrcSet(photo: Photo): string {
  const entries: string[] = [];
  for (const width of VARIANT_WIDTHS) {
    const actual = photo.width === undefined ? width : Math.min(width, photo.width);
    entries.push(`${photoSrc(photo, width)} ${actual}w`);
    if (photo.width !== undefined && width >= photo.width) break;
  }
  return entries.join(", ");
}

/** `/photos/<key>/1280.jpg` — the link-preview image. */
export function photoOgSrc(photo: Photo): string {
  return `/photos/${photo.key}/${OG_VARIANT.file}`;
}

/** The master's dimensions, or null when either is unknown. */
export function photoAspect(photo: Photo): { width: number; height: number } | null {
  if (photo.width === undefined || photo.height === undefined) return null;
  return { width: photo.width, height: photo.height };
}
