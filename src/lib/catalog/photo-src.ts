/**
 * The URL a stored photo is served from. Pure; safe for client and server.
 */
import type { Photo } from "./schema";

/**
 * PLACEHOLDER until #3 (photo upload) lands: photos have no storage or
 * serving route yet, so this returns a path that does not resolve. #3
 * replaces the body with the real URL for `photo.key`; callers keep using
 * this function and need no change.
 */
export function photoSrc(photo: Photo): string {
  return `/photos/${photo.key}`;
}
