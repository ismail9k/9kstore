/** Response headers and conditional-request helpers for the photo route. Pure. */

/** Headers for a served variant: cached for a year, never sniffed, shown inline. */
export function immutableHeaders(contentType: string, etag: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
}

/** Headers for 404s and 503s, which must never be cached. */
export function noStore(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function opaque(tag: string): string {
  return tag.startsWith("W/") ? tag.slice(2) : tag;
}

/** Whether `If-None-Match` matches `etag` (weak comparison, lists and `*`). */
export function isNotModified(ifNoneMatch: string | null, etag: string): boolean {
  if (ifNoneMatch === null) return false;
  const target = opaque(etag);
  return ifNoneMatch.split(",").some((part) => {
    const tag = part.trim();
    return tag === "*" || opaque(tag) === target;
  });
}
