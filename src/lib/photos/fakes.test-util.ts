/**
 * In-memory stand-ins for the R2 bucket and the Images binding, for the store
 * tests. Only the surface `store.ts` uses is implemented. Not a test file
 * itself: Vitest's include pattern matches `*.test.ts`, not `*.test-util.ts`.
 */
import type { ImageInfo } from "./process";

export type StoredObject = { bytes: Uint8Array; contentType: string; cacheControl?: string; etag: string };
export type FakeBucket = R2Bucket & { store: Map<string, StoredObject> };

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ReadableStream) return new Uint8Array(await new Response(value).arrayBuffer());
  throw new Error(`fakeBucket: unsupported value ${String(value)}`);
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

/** `failPut` makes `put` reject for the keys it returns true for; `failDelete` makes `delete` reject. */
export function fakeBucket(opts: { failPut?: (key: string) => boolean; failDelete?: boolean } = {}): FakeBucket {
  const store = new Map<string, StoredObject>();
  let counter = 0;

  const meta = (key: string, entry: StoredObject) => ({
    key,
    size: entry.bytes.byteLength,
    etag: entry.etag,
    httpEtag: `"${entry.etag}"`,
    httpMetadata: { contentType: entry.contentType, cacheControl: entry.cacheControl },
  });

  const bucket = {
    store,
    async head(key: string) {
      const entry = store.get(key);
      return entry ? meta(key, entry) : null;
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        ...meta(key, entry),
        body: streamOf(entry.bytes),
        arrayBuffer: async () => entry.bytes.slice().buffer,
      };
    },
    async put(key: string, value: unknown, options?: R2PutOptions) {
      if (opts.failPut?.(key)) throw new Error(`fakeBucket: put ${key} failed`);
      const http = (options?.httpMetadata ?? {}) as R2HTTPMetadata;
      counter += 1;
      const entry: StoredObject = {
        bytes: await toBytes(value),
        contentType: http.contentType ?? "application/octet-stream",
        cacheControl: http.cacheControl,
        etag: `etag-${counter}`,
      };
      store.set(key, entry);
      return meta(key, entry);
    },
    async delete(keys: string | string[]) {
      if (opts.failDelete) throw new Error("fakeBucket: delete failed");
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
  };
  return bucket as unknown as FakeBucket;
}

/** An error shaped like the runtime's `ImagesError`: an `Error` with a numeric `code`. */
export function imagesError(code: number, message = `IMAGES_INFO_ERROR ${code}`): ImagesError {
  return Object.assign(new Error(message), { code }) as ImagesError;
}

export type FakeImages = ImagesBinding & { outputs: { transform: ImageTransform; output: ImageOutputOptions }[] };

/**
 * `info` answers `info()` from the bytes it is given. Every `output()` yields
 * the bytes of `{"w": transform.width, "f": output.format}`, so a test can see
 * which plan produced each stored object. `fail: true` makes `output()` throw;
 * `infoError` makes `info()` throw an `ImagesError`-shaped error with that code.
 */
export function fakeImages(opts: { info: (bytes: Uint8Array) => ImageInfo; fail?: boolean; infoError?: number }): FakeImages {
  const outputs: FakeImages["outputs"] = [];
  const images = {
    outputs,
    async info(stream: ReadableStream<Uint8Array>) {
      if (opts.infoError !== undefined) {
        throw Object.assign(new Error(`IMAGES_INFO_ERROR ${opts.infoError}`), { code: opts.infoError });
      }
      return opts.info(await toBytes(stream));
    },
    input(stream: ReadableStream<Uint8Array>) {
      void stream;
      let transform: ImageTransform = {};
      const transformer = {
        transform(next: ImageTransform) {
          transform = { ...transform, ...next };
          return transformer;
        },
        async output(output: ImageOutputOptions) {
          if (opts.fail) throw new Error("fakeImages: processing failed");
          outputs.push({ transform, output });
          const bytes = new TextEncoder().encode(JSON.stringify({ w: transform.width, f: output.format }));
          return {
            contentType: () => output.format,
            image: () => streamOf(bytes),
            response: () => new Response(bytes, { headers: { "Content-Type": output.format } }),
          };
        },
      };
      return transformer;
    },
  };
  return images as unknown as FakeImages;
}

/** Decode the bytes `fakeImages` writes. */
export function decodeFake(bytes: Uint8Array): { w?: number; f: string } {
  return JSON.parse(new TextDecoder().decode(bytes)) as { w?: number; f: string };
}
