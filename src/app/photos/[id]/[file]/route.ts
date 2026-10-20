import type { NextRequest } from "next/server";

import { getPhotoDeps } from "@/lib/photos/bindings";
import { immutableHeaders, isNotModified, noStore } from "@/lib/photos/http";
import { readVariant, type Served } from "@/lib/photos/store";
import { isPhotoId, parseVariant } from "@/lib/photos/variants";

const SHORT_CACHE = "public, max-age=300";

function notFound(): Response {
  return new Response(null, { status: 404, headers: noStore() });
}

function unavailable(): Response {
  return new Response(null, { status: 503, headers: { ...noStore(), "Retry-After": "60" } });
}

function servedHeaders(served: Served): Headers {
  const headers = new Headers(immutableHeaders(served.contentType, served.etag));
  if (served.cache === "short") headers.set("Cache-Control", SHORT_CACHE);
  return headers;
}

/**
 * One photo variant: `/photos/<id>/<file>`, where `file` is exactly one of the
 * five variant names (`parseVariant` is the gate, so `master`, `641.webp` or a
 * `..` segment is a 404 and never reaches the bucket). Stored variants are
 * served immutable; a missing one is filled from the master.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/photos/[id]/[file]">): Promise<Response> {
  const { id, file } = await ctx.params;
  const variant = parseVariant(file);
  if (!isPhotoId(id) || !variant) return notFound();

  let result: Awaited<ReturnType<typeof readVariant>>;
  try {
    result = await readVariant(await getPhotoDeps(), id, variant);
  } catch (cause) {
    console.error(`photos: reading ${file} for ${id} failed`, cause);
    return unavailable();
  }
  if (!result.ok) return result.status === 404 ? notFound() : unavailable();

  const { served } = result;
  const headers = servedHeaders(served);
  if (isNotModified(request.headers.get("if-none-match"), served.etag)) {
    // No body on a 304: release the R2 stream instead of leaving it unread.
    if (served.body instanceof ReadableStream) await served.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(served.body, { status: 200, headers });
}
