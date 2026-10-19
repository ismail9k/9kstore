import { expect, test, vi } from "vitest";

import { decodeFake, fakeBucket, fakeImages } from "./fakes.test-util";
import { MESSAGES, type ImageInfo } from "./process";
import { newPhotoId, readVariant, storeUpload } from "./store";
import { INPUT_MAX_BYTES, OG_VARIANT, VARIANTS, masterKey, parseVariant, variantKey } from "./variants";

const IMMUTABLE = "public, max-age=31536000, immutable";
const ALL_FILES = ["1280.jpg", "1280.webp", "320.webp", "640.webp", "960.webp", "master"];
const filesOf = (key: string) => ALL_FILES.map((f) => `photos/${key}/${f}`).sort();
const bytesOf = (...values: number[]) => new Uint8Array(values).buffer;
const webp = (width: number, height: number, fileSize: number): ImageInfo => ({ format: "image/webp", width, height, fileSize });
const variant = (file: string) => {
  const found = parseVariant(file);
  if (!found) throw new Error(file);
  return found;
};
const read = async (body: ReadableStream | ArrayBuffer) => new Uint8Array(await new Response(body).arrayBuffer());

test("newPhotoId is 32 lowercase hex characters", () => {
  expect(newPhotoId()).toMatch(/^[0-9a-f]{32}$/);
  expect(newPhotoId()).not.toBe(newPhotoId());
});

test("a camera JPEG becomes a webp master plus five variants, with master dimensions", async () => {
  const bucket = fakeBucket();
  const images = fakeImages({
    info: (b) =>
      b.byteLength === 7
        ? { format: "image/jpeg", width: 6000, height: 4000, fileSize: 7 }
        : { format: "image/webp", width: 2560, height: 1707, fileSize: 1 },
  });
  const r = await storeUpload({ bucket, images, dev: false }, new Uint8Array(7).buffer, "image/jpeg");
  if (!r.ok) throw new Error(r.error);
  expect(r.photo).toMatchObject({ width: 2560, height: 1707 });
  expect(r.photo.key).toMatch(/^[0-9a-f]{32}$/);
  expect([...bucket.store.keys()].sort()).toEqual(filesOf(r.photo.key));

  const master = bucket.store.get(masterKey(r.photo.key));
  expect(master?.contentType).toBe("image/webp");
  expect(master?.cacheControl).toBe(IMMUTABLE);
  expect(decodeFake(master!.bytes)).toEqual({ w: 2560, f: "image/webp" });

  for (const v of VARIANTS) {
    const stored = bucket.store.get(variantKey(r.photo.key, v));
    expect(stored?.contentType).toBe(v.contentType);
    expect(stored?.cacheControl).toBe(IMMUTABLE);
    expect(decodeFake(stored!.bytes)).toEqual({ w: v.width, f: v.contentType });
  }
});

test("a small webp cutout is kept byte-for-byte as the master", async () => {
  const bucket = fakeBucket();
  const images = fakeImages({ info: () => webp(1200, 1500, 5) });
  const input = bytesOf(1, 2, 3, 4, 5);
  // The header is wrong on purpose: the stored type is the real format from info().
  const r = await storeUpload({ bucket, images, dev: false }, input, "image/png");
  if (!r.ok) throw new Error(r.error);
  expect(r.photo).toEqual({ key: r.photo.key, width: 1200, height: 1500 });

  const master = bucket.store.get(masterKey(r.photo.key));
  expect(master?.bytes).toEqual(new Uint8Array(input));
  expect(master?.contentType).toBe("image/webp");
  expect([...bucket.store.keys()].sort()).toEqual(filesOf(r.photo.key));
  expect(images.outputs).toHaveLength(VARIANTS.length); // no master re-encode
});

test("a gif is refused before anything is written", async () => {
  const bucket = fakeBucket();
  const images = fakeImages({ info: () => ({ format: "image/gif", width: 10, height: 10, fileSize: 3 }) });
  const r = await storeUpload({ bucket, images, dev: false }, bytesOf(1, 2, 3), "image/gif");
  expect(r).toEqual({ ok: false, status: 415, error: MESSAGES.badType });
  expect(bucket.store.size).toBe(0);
  expect(images.outputs).toHaveLength(0);
});

test("an input over 20 MB is refused with 413 and nothing written", async () => {
  const bucket = fakeBucket();
  const images = fakeImages({ info: () => webp(10, 10, 1) });
  const r = await storeUpload({ bucket, images, dev: false }, new ArrayBuffer(INPUT_MAX_BYTES + 1), "image/webp");
  expect(r).toEqual({ ok: false, status: 413, error: MESSAGES.tooBig });
  expect(bucket.store.size).toBe(0);
});

test("a file the processor can't read as an image is refused with 415; another info error is a 503", async () => {
  const notAnImage = fakeBucket();
  const pdf = fakeImages({ info: () => webp(10, 10, 1), infoError: 9412 });
  expect(await storeUpload({ bucket: notAnImage, images: pdf, dev: false }, bytesOf(37, 80, 68, 70), "image/jpeg")).toEqual({
    ok: false,
    status: 415,
    error: MESSAGES.badType,
  });
  expect(notAnImage.store.size).toBe(0);

  const outage = fakeBucket();
  const down = fakeImages({ info: () => webp(10, 10, 1), infoError: 9523 });
  expect(await storeUpload({ bucket: outage, images: down, dev: false }, bytesOf(1, 2, 3), "image/jpeg")).toEqual({
    ok: false,
    status: 503,
    error: MESSAGES.unavailable,
  });
  expect(outage.store.size).toBe(0);
});

test("an image in a format the processor doesn't support (a TIFF) is refused with 415", async () => {
  const bucket = fakeBucket();
  const tiff = fakeImages({ info: () => webp(10, 10, 1), infoError: 9520 });
  expect(await storeUpload({ bucket, images: tiff, dev: false }, bytesOf(73, 73, 42, 0), "image/jpeg")).toEqual({
    ok: false,
    status: 415,
    error: MESSAGES.badType,
  });
  expect(bucket.store.size).toBe(0);
});

test("an Images failure writes nothing and answers 503", async () => {
  const bucket = fakeBucket();
  const images = fakeImages({ info: () => ({ format: "image/jpeg", width: 800, height: 600, fileSize: 3 }), fail: true });
  const r = await storeUpload({ bucket, images, dev: false }, bytesOf(1, 2, 3), "image/jpeg");
  expect(r).toEqual({ ok: false, status: 503, error: MESSAGES.unavailable });
  expect(bucket.store.size).toBe(0);
});

test("a failed clean-up is logged with its keys and the upload still answers 503", async () => {
  const bucket = fakeBucket({ failPut: (key) => key.endsWith(OG_VARIANT.file), failDelete: true });
  const images = fakeImages({ info: () => webp(1200, 1200, 3) });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const r = await storeUpload({ bucket, images, dev: false }, bytesOf(1, 2, 3), "image/webp");
    expect(r).toEqual({ ok: false, status: 503, error: MESSAGES.unavailable });
    const cleanup = error.mock.calls.find(([msg]) => typeof msg === "string" && msg.includes("half-stored"));
    expect(cleanup).toBeDefined();
    const keys = cleanup![1] as string[];
    expect(keys).toHaveLength(ALL_FILES.length);
    expect(keys.some((k) => k.endsWith("/master"))).toBe(true);
    // The original put failure is what the upload reports, not the delete failure.
    const stored = error.mock.calls.find(([msg]) => msg === "photos: storing the upload failed");
    expect(String(stored?.[1])).toContain("put");
  } finally {
    error.mockRestore();
  }
});

test("a failed write removes what was already written and answers 503", async () => {
  const bucket = fakeBucket({ failPut: (key) => key.endsWith(OG_VARIANT.file) });
  const images = fakeImages({ info: () => webp(1200, 1200, 3) });
  const r = await storeUpload({ bucket, images, dev: false }, bytesOf(1, 2, 3), "image/webp");
  expect(r).toEqual({ ok: false, status: 503, error: MESSAGES.unavailable });
  expect(bucket.store.size).toBe(0);
});

test("without the processor: dev stores the master only; deployed answers 503", async () => {
  const dev = fakeBucket();
  const input = bytesOf(9, 8, 7);
  const r = await storeUpload({ bucket: dev, images: undefined, dev: true }, input, "image/png");
  if (!r.ok) throw new Error(r.error);
  expect(r.photo).toEqual({ key: r.photo.key });
  expect([...dev.store.keys()]).toEqual([masterKey(r.photo.key)]);
  expect(dev.store.get(masterKey(r.photo.key))).toMatchObject({ bytes: new Uint8Array(input), contentType: "image/png" });

  const devGif = fakeBucket();
  expect(await storeUpload({ bucket: devGif, images: undefined, dev: true }, input, "image/gif")).toEqual({
    ok: false,
    status: 415,
    error: MESSAGES.badType,
  });
  expect(devGif.store.size).toBe(0);

  const deployed = fakeBucket();
  expect(await storeUpload({ bucket: deployed, images: undefined, dev: false }, input, "image/png")).toEqual({
    ok: false,
    status: 503,
    error: MESSAGES.unavailable,
  });
  expect(deployed.store.size).toBe(0);
});

test("readVariant serves a stored variant immutable, lazily fills a missing one, 404s without a master, 503s when deployed and the fill fails, serves the master short in dev", async () => {
  const seeded = async () => {
    const bucket = fakeBucket();
    await bucket.put(masterKey("p1"), bytesOf(1, 1, 1), { httpMetadata: { contentType: "image/png" } });
    await bucket.put(variantKey("p1", variant("320.webp")), bytesOf(3, 2, 0), { httpMetadata: { contentType: "image/webp" } });
    return bucket;
  };
  const working = fakeImages({ info: () => webp(1200, 1200, 3) });
  const broken = fakeImages({ info: () => webp(1200, 1200, 3), fail: true });

  // A stored variant is served as it is, immutable, with its ETag.
  const bucket = await seeded();
  const stored = await readVariant({ bucket, images: working, dev: false }, "p1", variant("320.webp"));
  if (!stored.ok) throw new Error(String(stored.status));
  expect(stored.served).toMatchObject({ contentType: "image/webp", cache: "immutable" });
  expect(stored.served.etag).toBe(`"${bucket.store.get(variantKey("p1", variant("320.webp")))!.etag}"`);
  expect(await read(stored.served.body)).toEqual(new Uint8Array([3, 2, 0]));
  expect(working.outputs).toHaveLength(0);

  // A missing variant is rendered from the master with its own plan, stored, and served.
  const filled = await readVariant({ bucket, images: working, dev: false }, "p1", OG_VARIANT);
  if (!filled.ok) throw new Error(String(filled.status));
  expect(filled.served).toMatchObject({ contentType: "image/jpeg", cache: "immutable" });
  expect(decodeFake(await read(filled.served.body))).toEqual({ w: 1280, f: "image/jpeg" });
  const written = bucket.store.get(variantKey("p1", OG_VARIANT));
  expect(written).toMatchObject({ contentType: "image/jpeg", cacheControl: IMMUTABLE });
  expect(filled.served.etag).toBe(`"${written!.etag}"`);
  expect(working.outputs.at(-1)?.output).toMatchObject({ format: "image/jpeg", background: "#F1EDE7" });

  // No master: 404, whatever the mode.
  for (const dev of [true, false]) {
    expect(await readVariant({ bucket, images: working, dev }, "nope", variant("640.webp"))).toEqual({ ok: false, status: 404 });
  }

  // Deployed and the fill can't run or fails: 503, and nothing is stored.
  for (const images of [broken, undefined]) {
    const b = await seeded();
    expect(await readVariant({ bucket: b, images, dev: false }, "p1", variant("640.webp"))).toEqual({ ok: false, status: 503 });
    expect(b.store.has(variantKey("p1", variant("640.webp")))).toBe(false);
  }

  // Development and the fill can't run or fails: the master, with the short cache.
  for (const images of [broken, undefined]) {
    const b = await seeded();
    const served = await readVariant({ bucket: b, images, dev: true }, "p1", variant("640.webp"));
    if (!served.ok) throw new Error(String(served.status));
    expect(served.served).toMatchObject({ contentType: "image/png", cache: "short", etag: `"${b.store.get(masterKey("p1"))!.etag}"` });
    expect(await read(served.served.body)).toEqual(new Uint8Array([1, 1, 1]));
    expect(b.store.has(variantKey("p1", variant("640.webp")))).toBe(false);
  }
});
