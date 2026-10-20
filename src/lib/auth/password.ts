const encoder = new TextEncoder();

/**
 * Compares two strings by their UTF-8 bytes in time that depends only on
 * the longer input's length, not on where they first differ. Different
 * lengths are unequal, but only after the full loop has run.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
