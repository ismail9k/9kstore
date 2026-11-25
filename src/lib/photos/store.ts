/**
 * The photo store: the upload pipeline (a master plus the variants, through
 * the Images binding, into R2) and variant reads with lazy fill. Bindings are
 * injected so the logic runs under Vitest with in-memory fakes; only the
 * upload and delivery routes import this module. No "server-only" import, so
 * Vitest can load it.
 */
import { checkInput, MASTER_PLAN, MESSAGES, needsMaster, variantPlans, type ImageInfo, type VariantPlan } from "./process";
import { ACCEPTED_TYPES, INPUT_MAX_BYTES, masterKey, variantKey, type Variant } from "./variants";

export type Deps = { bucket: R2Bucket; images: ImagesBinding | undefined; dev: boolean };
export type StoredPhoto = { key: string; width?: number; height?: number };
export type StoreError = { status: 413 | 415 | 503; error: string };
export type Served = {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  etag: string;
  cache: "immutable" | "short";
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const UNAVAILABLE: StoreError = { status: 503, error: MESSAGES.unavailable };
/** `ImagesError.code` when the input is not an image at all. */
const NOT_AN_IMAGE = 9412;
/** `ImagesError.code` when the input is an image in a format the processor can't read (a TIFF, for one). */
const UNSUPPORTED_FORMAT = 9520;

/** Whether `info()` failed because of the owner's file rather than the processor. */
function isNotAnImage(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === NOT_AN_IMAGE || error.code === UNSUPPORTED_FORMAT)
  );
}

/** A fresh photo id: 32 lowercase hex characters. */
export function newPhotoId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function streamOf(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

type Rendered = { bytes: ArrayBuffer; contentType: string };

async function render(images: ImagesBinding, source: ArrayBuffer, plan: Pick<VariantPlan, "transform" | "output">): Promise<Rendered> {
  const result = await images.input(streamOf(source)).transform(plan.transform).output(plan.output);
  return { bytes: await new Response(result.image()).arrayBuffer(), contentType: result.contentType() };
}

async function infoOf(images: ImagesBinding, bytes: ArrayBuffer): Promise<ImageInfo | { format: "image/svg+xml" }> {
  const info = await images.info(streamOf(bytes));
  return "width" in info ? info : { format: "image/svg+xml" };
}

function isAccepted(type: string): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(type);
}

function putOptions(contentType: string): R2PutOptions {
  return { httpMetadata: { contentType, cacheControl: IMMUTABLE } };
}

/**
 * Writes the master first, then the variants in parallel. A failed write
 * removes every key of this upload (best effort), so no half-stored id is
 * left behind, and is rethrown.
 */
async function writeAll(bucket: R2Bucket, master: { key: string } & Rendered, variants: ({ key: string } & Rendered)[]): Promise<void> {
  try {
    await bucket.put(master.key, master.bytes, putOptions(master.contentType));
    await Promise.all(variants.map((v) => bucket.put(v.key, v.bytes, putOptions(v.contentType))));
  } catch (cause) {
    const keys = [master.key, ...variants.map((v) => v.key)];
    await bucket.delete(keys).catch((deleteError: unknown) => {
      console.error("photos: removing a half-stored upload failed", keys, deleteError);
    });
    throw cause;
  }
}

let warnedNoProcessor = false;

/** Development only: the original bytes as the master, no variants, no dimensions. */
async function storeWithoutProcessor(bucket: R2Bucket, bytes: ArrayBuffer, declaredType: string) {
  if (!isAccepted(declaredType)) return { ok: false as const, status: 415 as const, error: MESSAGES.badType };
  if (!warnedNoProcessor) {
    warnedNoProcessor = true;
    console.warn("photos: no Images binding; storing uploads as the master only (development mode)");
  }
  const key = newPhotoId();
  try {
    await writeAll(bucket, { key: masterKey(key), bytes, contentType: declaredType }, []);
  } catch (cause) {
    console.error("photos: storing the master failed", cause);
    return { ok: false as const, ...UNAVAILABLE };
  }
  return { ok: true as const, photo: { key } };
}

/**
 * Store an upload as a master plus every variant. All processing runs before
 * the first write, so a refused input or an Images failure writes nothing.
 */
export async function storeUpload(
  deps: Deps,
  bytes: ArrayBuffer,
  declaredType: string,
): Promise<{ ok: true; photo: StoredPhoto } | ({ ok: false } & StoreError)> {
  if (bytes.byteLength > INPUT_MAX_BYTES) return { ok: false, status: 413, error: MESSAGES.tooBig };
  const { bucket, images, dev } = deps;
  if (!images) {
    if (!dev) {
      console.error("photos: the Images binding is missing");
      return { ok: false, ...UNAVAILABLE };
    }
    return storeWithoutProcessor(bucket, bytes, declaredType);
  }

  let info: ImageInfo | { format: "image/svg+xml" };
  try {
    info = await infoOf(images, bytes);
  } catch (cause) {
    // A renamed PDF, a corrupt file or an unreadable format: the owner's file, not the processor.
    if (isNotAnImage(cause)) return { ok: false, status: 415, error: MESSAGES.badType };
    console.error("photos: reading the upload's format failed", cause);
    return { ok: false, ...UNAVAILABLE };
  }
  const rejection = checkInput(info);
  if (rejection) return { ok: false, ...rejection };
  if (!("width" in info)) return { ok: false, status: 415, error: MESSAGES.badType };

  const key = newPhotoId();
  let master: Rendered;
  let width: number;
  let height: number;
  let variants: ({ key: string } & Rendered)[];
  try {
    // A kept PNG/WebP is stored under its real format, not the declared header.
    master = needsMaster(info) ? await render(images, bytes, MASTER_PLAN) : { bytes, contentType: info.format };
    // Dimensions of the stored master: a re-encode bakes in the EXIF orientation.
    const masterInfo = await infoOf(images, master.bytes);
    if (!("width" in masterInfo)) throw new Error(`photos: master reported as ${masterInfo.format}`);
    ({ width, height } = masterInfo);

    const source = master.bytes;
    variants = await Promise.all(
      variantPlans().map(async (plan) => ({ key: variantKey(key, plan.variant), ...(await render(images, source, plan)) })),
    );
  } catch (cause) {
    console.error("photos: processing the upload failed", cause);
    return { ok: false, ...UNAVAILABLE };
  }

  try {
    await writeAll(bucket, { key: masterKey(key), ...master }, variants);
  } catch (cause) {
    console.error("photos: storing the upload failed", cause);
    return { ok: false, ...UNAVAILABLE };
  }
  return { ok: true, photo: { key, width, height } };
}

/**
 * One variant of a photo. A stored variant is served immutable. A missing one
 * is rendered from the master, stored and served (lazy fill). When the fill
 * can't run or fails, development serves the master with the short cache and
 * a deployed Worker answers 503; the master is never served from production.
 */
export async function readVariant(
  deps: Deps,
  id: string,
  variant: Variant,
): Promise<{ ok: true; served: Served } | { ok: false; status: 404 | 503 }> {
  const { bucket, images, dev } = deps;
  const stored = await bucket.get(variantKey(id, variant));
  if (stored) {
    return {
      ok: true,
      served: {
        body: stored.body,
        contentType: stored.httpMetadata?.contentType ?? variant.contentType,
        etag: stored.httpEtag,
        cache: "immutable",
      },
    };
  }

  const master = await bucket.get(masterKey(id));
  if (!master) return { ok: false, status: 404 };
  const masterBytes = await master.arrayBuffer();

  const plan = variantPlans().find((p) => p.variant.file === variant.file);
  if (images && plan) {
    try {
      const rendered = await render(images, masterBytes, plan);
      const written = await bucket.put(variantKey(id, variant), rendered.bytes, putOptions(rendered.contentType));
      return {
        ok: true,
        served: { body: rendered.bytes, contentType: rendered.contentType, etag: written.httpEtag, cache: "immutable" },
      };
    } catch (cause) {
      console.error(`photos: lazy fill of ${variant.file} for ${id} failed`, cause);
    }
  } else if (!images) {
    console.error(`photos: no Images binding to fill ${variant.file} for ${id}`);
  }

  if (!dev) return { ok: false, status: 503 };
  return {
    ok: true,
    served: {
      body: masterBytes,
      contentType: master.httpMetadata?.contentType ?? "application/octet-stream",
      etag: master.httpEtag,
      cache: "short",
    },
  };
}
