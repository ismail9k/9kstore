import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getPhotoDeps } from "@/lib/photos/bindings";
import { MESSAGES } from "@/lib/photos/process";
import { storeUpload } from "@/lib/photos/store";
import { INPUT_MAX_BYTES } from "@/lib/photos/variants";

import { checkUploadHeaders, mediaType, sameOrigin } from "./request-checks";

const KINDS = new Set(["color", "size-chart", "logo"]);
const CROSS_SITE = "This request didn't come from the admin.";

function json(status: number, body: object): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Upload one photo: the raw file as the body, `Content-Type` from the file,
 * optional `X-Photo-Kind` (logged only). Stores a master plus every variant
 * and answers `{ key, width?, height? }`, or `{ error }` with 401, 403, 400,
 * 413, 415 or 503. A Route Handler, not a Server Action: actions cap bodies
 * at 1 MB. Every response is `no-store`.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const started = Date.now();
  const kindHeader = request.headers.get("x-photo-kind") ?? "";
  const kind = KINDS.has(kindHeader) ? kindHeader : "unknown";
  const declaredType = mediaType(request.headers.get("content-type"));
  let byteLength = Number(request.headers.get("content-length") ?? NaN);

  const finish = (status: number, body: object, outcome: string): Response => {
    console.log(
      `photos: upload kind=${kind} type=${declaredType || "none"} bytes=${Number.isFinite(byteLength) ? byteLength : "?"} outcome=${outcome} status=${status} ms=${Date.now() - started}`,
    );
    return json(status, body);
  };

  try {
    if (!(await getSession())) return finish(401, { error: MESSAGES.loggedOut }, "logged-out");
    if (!sameOrigin(request.headers, request.url)) return finish(403, { error: CROSS_SITE }, "cross-site");
    const rejection = checkUploadHeaders(request.headers);
    if (rejection) return finish(rejection.status, { error: rejection.error }, "refused-headers");

    const bytes = await request.arrayBuffer();
    byteLength = bytes.byteLength;
    if (bytes.byteLength > INPUT_MAX_BYTES) return finish(413, { error: MESSAGES.tooBig }, "too-big");

    const result = await storeUpload(await getPhotoDeps(), bytes, declaredType);
    if (!result.ok) return finish(result.status, { error: result.error }, "refused");
    return finish(200, result.photo, `stored ${result.photo.key}`);
  } catch (cause) {
    console.error("photos: upload failed", cause);
    return finish(503, { error: MESSAGES.unavailable }, "failed");
  }
}
