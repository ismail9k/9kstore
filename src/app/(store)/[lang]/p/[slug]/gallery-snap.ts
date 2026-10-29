/**
 * Where a mouse drag of the product gallery (`gallery.tsx`) settles. The strip
 * is always LTR, so photo `i` sits at scrollLeft `i * width`.
 */

/** How far a drag must go, as a share of the photo's width, to move on to the next photo. */
export const FLICK_SHARE = 0.2;

/**
 * The photo a drag lands on: the one nearest `scrollLeft`, except that a drag
 * past `FLICK_SHARE` of a photo that would land back on the photo it started
 * from moves one photo along in the drag's direction instead.
 */
export function settlePhoto(startIndex: number, scrollLeft: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  const nearest = clamp(Math.round(scrollLeft / width));
  const moved = scrollLeft - startIndex * width;
  if (nearest !== startIndex || Math.abs(moved) < width * FLICK_SHARE) return nearest;
  return clamp(startIndex + Math.sign(moved));
}
