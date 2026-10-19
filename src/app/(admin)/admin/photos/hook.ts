/**
 * Where a hanger cutout's hook starts: the first row from the top with a
 * visible pixel, as a fraction of the image height (`Photo.hookTop`). The
 * home page rail pulls each tee up by it so every hook meets the bar
 * (guidelines, "The hanging rail"). Measured in the admin's browser at
 * upload; the server stores whatever the schema accepts (0..1).
 */

/** Alpha at or below this (of 255) counts as transparent: soft cutout edges and noise. */
export const ALPHA_THRESHOLD = 16;

/** Largest edge decoded for the scan; enough for sub-pixel precision on the rail. */
const SCAN_MAX_EDGE = 1200;

/** The first row with a pixel whose alpha is above `threshold`, in RGBA `data`; null when none is. */
export function firstOpaqueRow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = ALPHA_THRESHOLD,
): number | null {
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      if ((data[rowStart + x * 4 + 3] ?? 0) > threshold) return y;
    }
  }
  return null;
}

/** `row / height` rounded to 4 decimals, or undefined with no visible row or no height. */
export function hookTopOf(row: number | null, height: number): number | undefined {
  if (row === null || height <= 0) return undefined;
  return Math.round((row / height) * 10_000) / 10_000;
}

/**
 * Decodes the file in the browser and measures its hook top. Undefined when
 * the browser can't decode it (no `createImageBitmap`, an odd format) or the
 * image is fully transparent: the rail then uses its default.
 */
export async function measureHookTop(file: Blob): Promise<number | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    return hookTopOf(firstOpaqueRow(data, width, height), height);
  } catch {
    return undefined;
  }
}
