/**
 * The upload route's checks on the request itself, before the body is read.
 * Pure, so they run under Vitest.
 */
import { MESSAGES } from "@/lib/photos/process";
import { ACCEPTED_TYPES, INPUT_MAX_BYTES } from "@/lib/photos/variants";

export type HeaderRejection = { status: 400 | 413 | 415; error: string };

/**
 * Whether the request came from the admin's own pages. `Sec-Fetch-Site`
 * decides when the browser sends it; otherwise `Origin` must equal the
 * request's origin. Neither header → false. Route Handlers don't get the
 * origin check Server Actions get, and the admin cookie is `SameSite=Lax`.
 */
export function sameOrigin(headers: Headers, requestUrl: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = headers.get("origin");
  return origin !== null && origin === new URL(requestUrl).origin;
}

/** The media type without parameters, lowercased: `"image/webp; x=y"` → `"image/webp"`. */
export function mediaType(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * `Content-Length` present, a whole number and at most 20 MB; `Content-Type`
 * one of the accepted photo types. Null when the request may be read.
 */
export function checkUploadHeaders(headers: Headers): HeaderRejection | null {
  const length = headers.get("content-length");
  if (length === null || !/^\d+$/.test(length.trim())) return { status: 400, error: MESSAGES.network };
  if (Number(length.trim()) > INPUT_MAX_BYTES) return { status: 413, error: MESSAGES.tooBig };
  if (!(ACCEPTED_TYPES as readonly string[]).includes(mediaType(headers.get("content-type")))) {
    return { status: 415, error: MESSAGES.badType };
  }
  return null;
}
