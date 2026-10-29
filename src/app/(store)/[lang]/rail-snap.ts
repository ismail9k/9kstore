/**
 * Scroll math for the hanging rail (`rail-scroll.tsx`). Positions are in the
 * rail's own LTR content pixels: the rail is a picture, never mirrored, so
 * `scrollLeft` runs 0 → max in both languages.
 */

/** How far (px) a mouse must move with the button down before it drags instead of clicks. */
export const DRAG_THRESHOLD = 5;

/**
 * The tee the rail opens on: the middle one. With an even count, the one of
 * the middle two nearer where the reader starts: left in English, right in
 * Arabic.
 */
export function middleIndex(count: number, dir: "ltr" | "rtl"): number {
  return Math.max(0, dir === "rtl" ? Math.floor(count / 2) : Math.floor((count - 1) / 2));
}

/** The scroll position that puts `center` at the scroller's center, clamped to what it can reach. */
export function centeredScroll(center: number, clientWidth: number, scrollWidth: number): number {
  const max = Math.max(0, scrollWidth - clientWidth);
  return Math.min(max, Math.max(0, center - clientWidth / 2));
}

/**
 * Where a mouse drag settles: of the positions that center each tee, the
 * nearest to `scrollLeft`. They are clamped like the scroller is, so the
 * ends are among them and the outer tees can be seen in full.
 */
export function snapScroll(scrollLeft: number, centers: number[], clientWidth: number, scrollWidth: number): number {
  let best = scrollLeft;
  let bestDistance = Infinity;
  for (const center of centers) {
    const target = centeredScroll(center, clientWidth, scrollWidth);
    const distance = Math.abs(target - scrollLeft);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
