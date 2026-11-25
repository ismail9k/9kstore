# Product Photo Upload and Fast Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner drops full-size photos into the admin for each color, the size chart and the logo; the Worker resizes them once into phone-sized WebP copies in R2; customer pages render them through one `<Photo>` component with `srcset`/`sizes`.

**Architecture:** Two bindings — R2 `PHOTOS` for storage and Cloudflare Images `IMAGES` for processing. `POST /admin/photos` (a Route Handler, owner-only) normalizes the upload into a master and renders the fixed variant set into R2 at once; `GET /photos/<id>/<file>` streams a variant from R2 with immutable cache headers, lazily filling a missing one from the master. Workers Cache keeps repeats off the Worker. Pure modules under `src/lib/photos/` (variants, URLs, planning, HTTP headers, dev gate) hold the logic and the tests; the two routes and a thin server-only store module call the bindings.

**Tech Stack:** Next.js 16.4 App Router Route Handlers on Cloudflare Workers via `@opennextjs/cloudflare` 1.20; Cloudflare R2 and Images bindings (Wrangler 4.151); shadcn/ui + Tailwind 4 in the admin; dnd-kit (admin-only, already present); zod 4; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-photo-upload-delivery-design.md`

Intent-Issue: #3 — https://github.com/ismail9k/9kstore/issues/3

## Global Constraints

- Read `AGENTS.md` first and, before writing a Route Handler, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (`RouteContext<"/path">` is a generated global; `GET` handlers are dynamic by default). `cacheComponents` stays **off**.
- Bindings: R2 binding `PHOTOS` (buckets `9k-store-photos` / `9k-store-photos-staging`), Images binding `IMAGES`, and `cache: { enabled: true, cross_version_cache: true }` — each in **three** places in `wrangler.jsonc`: top level, `env.staging`, `env.staging.previews`. Then `pnpm cf-typegen`.
- `VARIANT_WIDTHS = [320, 640, 960, 1280]`; variant files `320.webp 640.webp 960.webp 1280.webp 1280.jpg`; WebP quality 82; JPEG quality 85 with `background: "#F1EDE7"`; master: ≤ 2560 px long edge, WebP quality 90; `fit: "scale-down"` everywhere. Input limit 20 MB; byte-for-byte master only for PNG/WebP ≤ 2560 px and ≤ 4 MB; every JPEG is re-encoded.
- R2 keys: `photos/<id>/master`, `photos/<id>/<file>`. Photo ids: 32 lowercase hex (`crypto.randomUUID()` without hyphens); `Photo.key` and the route's `id` param must match `/^[a-z0-9-]{1,64}$/`.
- Public photo URLs: `/photos/<key>/<file>`. Served variants: `Cache-Control: public, max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`. 404s and 503s: `Cache-Control: no-store`.
- Degraded paths (serve the master, upload without variants) run only when `env.NEXTJS_ENV === "development"`; a deployed Worker answers 503 instead.
- Owner-facing copy is fixed by the spec (quoted in the tasks): no "slug", "key", "bucket", "binding", "R2" in it.
- Accepted input types: `image/jpeg`, `image/png`, `image/webp`, checked client-side by `File.type` and server-side by `IMAGES.info()`.
- Customer-side code (`src/components/photo.tsx`, `src/lib/photos/urls.ts`, `variants.ts`) imports nothing from dnd-kit, React client hooks, or server-only modules. Admin-only code stays under `src/app/(admin)/`.
- Tests sit next to code as `*.test.ts(x)`, logic only; `noUncheckedIndexedAccess` is on; `@/` imports.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy` or `pnpm upload`. Never push.

## Review Focus

1. A request for `/photos/<id>/../master`, `/photos/<id>/641.webp` or `/photos/<id>/1280.png` must be a 404 with `no-store`, never a read of an arbitrary object or a fresh transformation — pinned in Task 2 (`parseVariant`) and Task 5 (route 404 test is manual; the parser is the gate).
2. A JPEG shot in portrait with an EXIF orientation tag must display upright with the right aspect box: the master is always re-encoded, and `width`/`height` are read from the **stored** master, not the input — pinned in Task 3 (`needsMaster` for every JPEG) and Task 4 (`storeUpload` fake test reads dimensions from the master bytes).
3. A cross-site page that POSTs to `/admin/photos` with the owner's cookie must get 403: `Sec-Fetch-Site: cross-site`, and an `Origin` that differs from the request host when `Sec-Fetch-Site` is absent — pinned in Task 6 (`sameOrigin`).
4. A deployed Worker whose `IMAGES` binding fails must never hand a customer the master: upload → 503, lazy fill → 503 `no-store`; only `NEXTJS_ENV=development` degrades — pinned in Task 3 (`isDevelopment`) and Task 4 (`storeUpload`/`readVariant` fakes with `dev: false`).
5. A 1200-wide cutout must not advertise a 1280 px copy as wider than it is, and a photo with no dimensions must still render: `photoSrcSet` keeps the first width at or above the master's width and stops; without a width it lists all four — pinned in Task 2.

---

### Task 1: Bindings, Workers Cache and the proxy matcher

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `cloudflare-env.d.ts` (regenerated)
- Modify: `src/proxy.ts:63` (the `matcher`)
- Modify: `open-next.config.ts` (comment only)

**Interfaces:**
- Produces: `env.PHOTOS: R2Bucket`, `env.IMAGES: ImagesBinding` on `CloudflareEnv` (via `getCloudflareContext({ async: true })`).

- [ ] **Step 1: Add the bindings and the cache block in all three places**

In `wrangler.jsonc`: top level gets
```jsonc
"r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "9k-store-photos" }],
"images": { "binding": "IMAGES" },
"cache": { "enabled": true, "cross_version_cache": true },
```
`env.staging` and `env.staging.previews` get the same with `bucket_name` `9k-store-photos-staging`. Replace the "R2 … and the Images binding are still to come" comment with one line saying the photos bucket and processor are bound here and that `cache` is Workers Cache for the photo variants (pages opt out through Next's own `Cache-Control`). Keep the existing comments about non-inheritance.

- [ ] **Step 2: Regenerate the types**

Run: `pnpm cf-typegen`
Expected: `cloudflare-env.d.ts` now lists `PHOTOS: R2Bucket;` and `IMAGES: ImagesBinding;` in both `__BaseEnv_CloudflareEnv` and `Cloudflare.StagingEnv`.

- [ ] **Step 3: Tighten the proxy matcher**

In `src/proxy.ts` change the matcher to `"/((?!_next|photos/|.*\\..*).*)"` and add to the doc comment: photo files under `/photos/` are served by their own route and skip the router.

- [ ] **Step 4: Reword the OpenNext comment**

In `open-next.config.ts`, the comment becomes: the incremental cache is not configured (nothing is statically generated); the `PHOTOS` bucket holds product photos and is not the OpenNext cache bucket.

- [ ] **Step 5: Verify the Worker still builds and the local bindings exist**

Run: `pnpm typecheck && pnpm lint && pnpm exec opennextjs-cloudflare build`
Expected: all pass. Then run `pnpm preview` briefly and request `http://localhost:8787/ar` — 200 as before (the cache block changes nothing visible). Stop it.

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc cloudflare-env.d.ts src/proxy.ts open-next.config.ts
git commit -m "chore(cf): bind the photos bucket and the Images processor, enable Workers Cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Variant names and photo URLs

**Files:**
- Create: `src/lib/photos/variants.ts`, `src/lib/photos/variants.test.ts`
- Create: `src/lib/photos/urls.ts`, `src/lib/photos/urls.test.ts`
- Delete: `src/lib/catalog/photo-src.ts`
- Modify: `src/app/(admin)/admin/photo-tile.tsx:2,13`

**Interfaces:**
- Produces (`variants.ts`, pure, client-safe):
  ```ts
  export const VARIANT_WIDTHS = [320, 640, 960, 1280] as const;
  export type VariantWidth = (typeof VARIANT_WIDTHS)[number];
  export type VariantFormat = "webp" | "jpeg";
  export type Variant = { width: VariantWidth; format: VariantFormat; file: string; contentType: "image/webp" | "image/jpeg" };
  export const VARIANTS: readonly Variant[];               // the 4 WebP + "1280.jpg"
  export const OG_VARIANT: Variant;                          // "1280.jpg"
  export const OG_BACKGROUND = "#F1EDE7";
  export const WEBP_QUALITY = 82; export const JPEG_QUALITY = 85; export const MASTER_QUALITY = 90;
  export const MASTER_MAX_EDGE = 2560; export const KEEP_MAX_BYTES = 4 * 1024 * 1024; export const INPUT_MAX_BYTES = 20 * 1024 * 1024;
  export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
  export const PHOTO_ID = /^[a-z0-9-]{1,64}$/;
  export function isPhotoId(value: string): boolean;
  export function parseVariant(file: string): Variant | null;  // exact match on `file` only
  export function masterKey(id: string): string;               // `photos/${id}/master`
  export function variantKey(id: string, variant: Variant): string;
  ```
- Produces (`urls.ts`): `photoSrc(photo: Photo, width?: VariantWidth): string` (default 640); `photoSrcSet(photo: Photo): string`; `photoOgSrc(photo: Photo): string`; `photoAspect(photo: Photo): { width: number; height: number } | null`.

- [ ] **Step 1: Write `variants.test.ts`**

```ts
test("parseVariant accepts exactly the five files", () => {
  expect(parseVariant("640.webp")).toMatchObject({ width: 640, format: "webp", contentType: "image/webp" });
  expect(parseVariant("1280.jpg")).toMatchObject({ width: 1280, format: "jpeg", contentType: "image/jpeg" });
  for (const bad of ["1281.webp", "640.png", "640.WEBP", "../master", "master", "", "640.webp/"]) expect(parseVariant(bad)).toBeNull();
});
test("isPhotoId", () => {
  expect(isPhotoId("a".repeat(32))).toBe(true);
  expect(isPhotoId("seed-tee-black-flat")).toBe(true);
  for (const bad of ["", "A1", "a/b", "a".repeat(65), "x y"]) expect(isPhotoId(bad)).toBe(false);
});
test("keys", () => {
  expect(masterKey("abc")).toBe("photos/abc/master");
  expect(variantKey("abc", OG_VARIANT)).toBe("photos/abc/1280.jpg");
});
```

- [ ] **Step 2: Write `urls.test.ts`**

```ts
const p = (w?: number, h?: number) => ({ key: "k", ...(w && { width: w }), ...(h && { height: h }) });
test("photoSrc", () => {
  expect(photoSrc(p())).toBe("/photos/k/640.webp");
  expect(photoSrc(p(), 320)).toBe("/photos/k/320.webp");
});
test("photoSrcSet stops at the first width that covers the master", () => {
  expect(photoSrcSet(p(1200, 1200))).toBe("/photos/k/320.webp 320w, /photos/k/640.webp 640w, /photos/k/960.webp 960w, /photos/k/1280.webp 1280w");
  expect(photoSrcSet(p(500, 700))).toBe("/photos/k/320.webp 320w, /photos/k/640.webp 640w");
  expect(photoSrcSet(p(320, 320))).toBe("/photos/k/320.webp 320w");
  expect(photoSrcSet(p())).toContain("1280w");
});
test("photoOgSrc and photoAspect", () => {
  expect(photoOgSrc(p())).toBe("/photos/k/1280.jpg");
  expect(photoAspect(p(1200, 900))).toEqual({ width: 1200, height: 900 });
  expect(photoAspect(p(1200))).toBeNull();
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm test src/lib/photos`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `variants.ts` and `urls.ts`**

`parseVariant` looks the string up in `VARIANTS` by `file` (no regex parsing, no normalization). `photoSrcSet` iterates `VARIANT_WIDTHS`, emits `${photoSrc(photo, w)} ${w}w`, and after emitting a width `>= photo.width` stops; with no `photo.width` it emits all.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/lib/photos`
Expected: PASS.

- [ ] **Step 6: Switch `PhotoTile` to the new helper and delete the placeholder**

In `photo-tile.tsx` import `photoSrc` from `@/lib/photos/urls`, call `photoSrc(photo, 320)`, and change the comment to say photos are served by `/photos/[id]/[file]`. Delete `src/lib/catalog/photo-src.ts`. Run `grep -rn "photo-src" src` — expected: no output.

- [ ] **Step 7: Typecheck, lint, test, commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
```bash
git add src/lib/photos src/app/\(admin\)/admin/photo-tile.tsx
git rm src/lib/catalog/photo-src.ts
git commit -m "feat(photos): define the variant set and the public photo URLs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Processing plan, dev gate and HTTP helpers (pure)

**Files:**
- Create: `src/lib/photos/env.ts`, `src/lib/photos/env.test.ts`
- Create: `src/lib/photos/process.ts`, `src/lib/photos/process.test.ts`
- Create: `src/lib/photos/http.ts`, `src/lib/photos/http.test.ts`

**Interfaces:**
- Produces (`env.ts`): `isDevelopment(env: { NEXTJS_ENV?: string }): boolean`.
- Produces (`process.ts`):
  ```ts
  export type ImageInfo = { format: string; width: number; height: number; fileSize: number };
  export type AcceptedType = (typeof ACCEPTED_TYPES)[number];
  export type UploadRejection = { status: 413 | 415; error: string };
  export function checkInput(info: ImageInfo | { format: "image/svg+xml" }): UploadRejection | null;
  export function needsMaster(info: ImageInfo): boolean;
  export type MasterPlan = { transform: ImageTransform; output: ImageOutputOptions };  // from cloudflare-env.d.ts globals
  export const MASTER_PLAN: MasterPlan;        // { width: 2560, height: 2560, fit: "scale-down" } → image/webp q90
  export type VariantPlan = { variant: Variant; transform: ImageTransform; output: ImageOutputOptions };
  export function variantPlans(): VariantPlan[];   // 5 entries; JPEG output has background OG_BACKGROUND
  export const MESSAGES = {
    loggedOut: "You were logged out. Log in again in a new tab, then try again.",
    tooBig: "This photo is over 20 MB. Export it smaller and try again.",
    badType: "Use a JPG, PNG or WebP photo.",
    tooLarge: "This photo is too large to process.",
    unavailable: "Photo processing isn't available right now. Try again in a minute.",
    network: "Couldn't upload. Check your connection and try again.",
    perColor: "Up to 20 photos per color",
  } as const;
  ```
- Produces (`http.ts`): `immutableHeaders(contentType: string, etag: string): HeadersInit`; `noStore(): HeadersInit`; `isNotModified(ifNoneMatch: string | null, etag: string): boolean`.

- [ ] **Step 1: Write `env.test.ts`**

```ts
test("isDevelopment only for the literal development", () => {
  expect(isDevelopment({ NEXTJS_ENV: "development" })).toBe(true);
  for (const v of [undefined, "", "production", "Development"]) expect(isDevelopment({ NEXTJS_ENV: v })).toBe(false);
});
```

- [ ] **Step 2: Write `process.test.ts`**

```ts
const jpeg = (w: number, h: number, size = 1_000_000) => ({ format: "image/jpeg", width: w, height: h, fileSize: size });
const webp = (w: number, h: number, size = 1_000_000) => ({ format: "image/webp", width: w, height: h, fileSize: size });

test("checkInput refuses formats other than jpeg/png/webp with the owner message", () => {
  expect(checkInput({ format: "image/gif", width: 10, height: 10, fileSize: 1 })).toEqual({ status: 415, error: MESSAGES.badType });
  expect(checkInput({ format: "image/svg+xml" })).toEqual({ status: 415, error: MESSAGES.badType });
  expect(checkInput(jpeg(12_001, 10))).toEqual({ status: 415, error: MESSAGES.tooLarge });
  expect(checkInput(jpeg(10_001, 10_000))).toEqual({ status: 415, error: MESSAGES.tooLarge }); // > 100 MP
  expect(checkInput(jpeg(6000, 4000))).toBeNull();
});
test("needsMaster: every JPEG; PNG/WebP only when big", () => {
  expect(needsMaster(jpeg(800, 600, 100_000))).toBe(true);
  expect(needsMaster(webp(2560, 2560, KEEP_MAX_BYTES))).toBe(false);
  expect(needsMaster(webp(2561, 100))).toBe(true);
  expect(needsMaster(webp(100, 2561))).toBe(true);
  expect(needsMaster(webp(1200, 1200, KEEP_MAX_BYTES + 1))).toBe(true);
  expect(needsMaster({ ...webp(1200, 1200), format: "image/png" })).toBe(false);
});
test("variantPlans renders the five files from the constants", () => {
  const plans = variantPlans();
  expect(plans.map((p) => p.variant.file)).toEqual(["320.webp", "640.webp", "960.webp", "1280.webp", "1280.jpg"]);
  expect(plans.every((p) => p.transform.fit === "scale-down")).toBe(true);
  expect(plans[4]?.output).toEqual({ format: "image/jpeg", quality: JPEG_QUALITY, background: OG_BACKGROUND });
  expect(plans[0]?.output).toEqual({ format: "image/webp", quality: WEBP_QUALITY });
});
```

- [ ] **Step 3: Write `http.test.ts`**

```ts
test("immutableHeaders", () => {
  expect(new Headers(immutableHeaders("image/webp", '"abc"')).get("cache-control")).toBe("public, max-age=31536000, immutable");
  const h = new Headers(immutableHeaders("image/webp", '"abc"'));
  expect(h.get("etag")).toBe('"abc"');
  expect(h.get("x-content-type-options")).toBe("nosniff");
  expect(h.get("content-disposition")).toBe("inline");
  expect(h.get("content-type")).toBe("image/webp");
});
test("noStore", () => expect(new Headers(noStore()).get("cache-control")).toBe("no-store"));
test("isNotModified: exact, weak, list, star", () => {
  expect(isNotModified('"abc"', '"abc"')).toBe(true);
  expect(isNotModified('W/"abc"', '"abc"')).toBe(true);
  expect(isNotModified('"x", "abc"', '"abc"')).toBe(true);
  expect(isNotModified("*", '"abc"')).toBe(true);
  expect(isNotModified(null, '"abc"')).toBe(false);
  expect(isNotModified('"abd"', '"abc"')).toBe(false);
});
```

- [ ] **Step 4: Run to verify they fail, implement the three modules, run to verify they pass**

Run: `pnpm test src/lib/photos` — FAIL, then PASS. `ImageTransform`/`ImageOutputOptions` are the ambient types from `cloudflare-env.d.ts`; `process.ts` has no imports from Next or React.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photos
git commit -m "feat(photos): plan the master and variants, gate degraded paths to development

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The store: upload pipeline and variant reads against injected bindings

**Files:**
- Create: `src/lib/photos/store.ts`, `src/lib/photos/store.test.ts`, `src/lib/photos/fakes.test-util.ts`

**Interfaces:**
- Consumes: Task 2 keys and `VARIANTS`; Task 3 `checkInput`, `needsMaster`, `MASTER_PLAN`, `variantPlans`, `MESSAGES`.
- Produces (`store.ts`, **no** `"server-only"` import so Vitest can load it; it is only ever imported by the two routes):
  ```ts
  export type Deps = { bucket: R2Bucket; images: ImagesBinding | undefined; dev: boolean };
  export type StoredPhoto = { key: string; width?: number; height?: number };
  export type StoreError = { status: 413 | 415 | 503; error: string };
  export function newPhotoId(): string;  // crypto.randomUUID() without "-"
  export async function storeUpload(deps: Deps, bytes: ArrayBuffer, declaredType: string): Promise<{ ok: true; photo: StoredPhoto } | ({ ok: false } & StoreError)>;
  export type Served = { body: ReadableStream | ArrayBuffer; contentType: string; etag: string; cache: "immutable" | "short" };
  export async function readVariant(deps: Deps, id: string, variant: Variant): Promise<{ ok: true; served: Served } | { ok: false; status: 404 | 503 }>;
  ```
- Behavior fixed by the spec: `storeUpload` writes nothing on failure; writes master first, then the five variants in parallel (`Promise.all`), each `put` with `httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }`; `width`/`height` come from `images.info()` on the **stored master bytes**. With `images` undefined: `dev` true → store the bytes as master (type = `declaredType`, which must be in `ACCEPTED_TYPES`, else 415), no variants, no dimensions; `dev` false → 503 `MESSAGES.unavailable`. Any thrown Images error → 503. `readVariant`: variant object → `immutable`; else master present → lazy fill (`images` available: render one variant via its plan, `put`, return it `immutable`; otherwise or on failure: `dev` → master `short`; not dev → 503); no master → 404.

- [ ] **Step 1: Write the fakes**

`fakes.test-util.ts`: `fakeBucket()` — an in-memory `Map<string, { bytes: Uint8Array; contentType: string }>` implementing `get`/`put`/`head` well enough (return objects with `body`, `arrayBuffer()`, `httpMetadata`, `httpEtag`) typed as `R2Bucket` through `as unknown as`; `fakeImages(opts: { info: (bytes) => ImageInfo; fail?: boolean })` — `info` echoes the given function, `input().transform().output()` returns a result whose `image()` yields bytes `new TextEncoder().encode(JSON.stringify({ w: transform.width, f: output.format }))` so tests can see which plan produced each object; `fail: true` throws from `output`.

- [ ] **Step 2: Write `store.test.ts`**

```ts
test("a camera JPEG becomes a webp master plus five variants, with master dimensions", async () => {
  const bucket = fakeBucket();
  const images = fakeImages({ info: (b) => (b.byteLength === 7 ? { format: "image/jpeg", width: 6000, height: 4000, fileSize: 7 } : { format: "image/webp", width: 2560, height: 1707, fileSize: 1 }) });
  const r = await storeUpload({ bucket, images, dev: false }, new Uint8Array(7).buffer, "image/jpeg");
  expect(r.ok && r.photo).toMatchObject({ width: 2560, height: 1707 });
  const keys = [...bucket.store.keys()].sort();
  expect(keys).toEqual(["1280.jpg", "1280.webp", "320.webp", "640.webp", "960.webp", "master"].map((f) => `photos/${(r as any).photo.key}/${f}`).sort());
  expect(bucket.store.get(`photos/${(r as any).photo.key}/master`)?.contentType).toBe("image/webp");
});
test("a small webp cutout is kept byte-for-byte as the master", ...);  // master bytes === input bytes, contentType image/webp, variants still written
test("a gif is refused before anything is written", ...);              // 415 badType, bucket empty
test("an Images failure writes nothing and answers 503", ...);        // fail: true
test("without the processor: dev stores the master only; deployed answers 503", ...);
test("readVariant serves a stored variant immutable, lazily fills a missing one, 404s without a master, 503s when deployed and the fill fails, serves the master short in dev", ...);
```
Write each `...` as a full test with the assertions its sentence states.

- [ ] **Step 3: Run to verify they fail, implement `store.ts`, run to verify they pass**

Run: `pnpm test src/lib/photos/store.test.ts` — FAIL, then PASS. Read Images output with `await new Response(result.image()).arrayBuffer()` so the same bytes can be both stored and inspected.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add src/lib/photos
git commit -m "feat(photos): store uploads as a master plus variants and read variants with lazy fill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Serving route `GET /photos/[id]/[file]`

**Files:**
- Create: `src/app/photos/[id]/[file]/route.ts`
- Create: `src/lib/photos/bindings.ts`

**Interfaces:**
- Produces (`bindings.ts`, `import "server-only"`): `getPhotoDeps(): Promise<Deps>` — reads `env.PHOTOS`, `env.IMAGES`, `isDevelopment(env)` from `getCloudflareContext({ async: true })`.
- Consumes: Task 2 `isPhotoId`, `parseVariant`; Task 3 `immutableHeaders`, `noStore`, `isNotModified`; Task 4 `readVariant`.

- [ ] **Step 1: Implement the route**

`export async function GET(request: NextRequest, ctx: RouteContext<"/photos/[id]/[file]">): Promise<Response>`. Flow: `await ctx.params`; `!isPhotoId(id) || !parseVariant(file)` → 404 `noStore()`; `readVariant` → 404/503 with `noStore()` (503 adds `Retry-After: 60`); `isNotModified(request.headers.get("if-none-match"), etag)` → 304 with the same headers and no body; otherwise 200 with the body and `immutableHeaders` (`cache === "short"` swaps `Cache-Control` for `public, max-age=300`).

- [ ] **Step 2: Verify by hand in `pnpm dev`**

Run `pnpm dev`. Put a test object in the local bucket: `pnpm exec wrangler r2 object put 9k-store-photos/photos/devtest/master --file docs/brand/photos/tee-black-flat.webp --content-type image/webp --local`. Then `curl -sI http://localhost:3000/photos/devtest/320.webp` — expected `200`, `content-type: image/webp`, `cache-control: public, max-age=31536000, immutable`, an `etag`; repeat with `-H 'If-None-Match: <etag>'` — expected `304`. `curl -sI http://localhost:3000/photos/devtest/641.webp` — `404`, `cache-control: no-store`. If the local Images binding is missing in `pnpm dev`, the response is the master with `max-age=300` and a logged warning (development mode); note it in the PR body.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add src/app/photos src/lib/photos/bindings.ts
git commit -m "feat(photos): serve photo variants from R2 with immutable caching and lazy fill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Upload route `POST /admin/photos`

**Files:**
- Create: `src/app/(admin)/admin/photos/route.ts`
- Create: `src/app/(admin)/admin/photos/request-checks.ts`, `src/app/(admin)/admin/photos/request-checks.test.ts`

**Interfaces:**
- Produces (`request-checks.ts`, pure): `sameOrigin(headers: Headers, requestUrl: string): boolean`; `checkUploadHeaders(headers: Headers): { status: 400 | 413 | 415; error: string } | null` (content-length present, integer, `<= INPUT_MAX_BYTES`; content-type in `ACCEPTED_TYPES` after stripping parameters).
- Produces (route): `POST /admin/photos` → 200 `{ key, width?, height? }` or `{ error }` with status 401/403/400/413/415/503. Request: raw body, `Content-Type` of the file, optional `X-Photo-Kind`.
- Consumes: `getSession` from `@/lib/auth/session`; Task 4 `storeUpload`; Task 5 `getPhotoDeps`; Task 3 `MESSAGES`.

- [ ] **Step 1: Write `request-checks.test.ts`**

```ts
const h = (o: Record<string, string>) => new Headers(o);
test("sameOrigin by Sec-Fetch-Site, else by Origin", () => {
  expect(sameOrigin(h({ "sec-fetch-site": "same-origin" }), "https://x.test/admin/photos")).toBe(true);
  expect(sameOrigin(h({ "sec-fetch-site": "cross-site", origin: "https://x.test" }), "https://x.test/admin/photos")).toBe(false);
  expect(sameOrigin(h({ origin: "https://x.test" }), "https://x.test/admin/photos")).toBe(true);
  expect(sameOrigin(h({ origin: "https://evil.test" }), "https://x.test/admin/photos")).toBe(false);
  expect(sameOrigin(h({}), "https://x.test/admin/photos")).toBe(false);
});
test("checkUploadHeaders", () => {
  expect(checkUploadHeaders(h({ "content-type": "image/jpeg", "content-length": "1000" }))).toBeNull();
  expect(checkUploadHeaders(h({ "content-type": "image/webp; charset=x", "content-length": "1000" }))).toBeNull();
  expect(checkUploadHeaders(h({ "content-type": "image/jpeg", "content-length": String(INPUT_MAX_BYTES + 1) }))).toEqual({ status: 413, error: MESSAGES.tooBig });
  expect(checkUploadHeaders(h({ "content-type": "image/jpeg" }))?.status).toBe(400);
  expect(checkUploadHeaders(h({ "content-type": "application/pdf", "content-length": "10" }))).toEqual({ status: 415, error: MESSAGES.badType });
});
```

- [ ] **Step 2: Run to verify it fails, implement `request-checks.ts`, run to verify it passes**

- [ ] **Step 3: Implement the route**

`export async function POST(request: NextRequest): Promise<Response>`: `getSession()` falsy → 401 `{ error: MESSAGES.loggedOut }`; `!sameOrigin` → 403 `{ error: "This request didn't come from the admin." }`; `checkUploadHeaders` → its status; `const bytes = await request.arrayBuffer()`; `bytes.byteLength > INPUT_MAX_BYTES` → 413; `storeUpload(await getPhotoDeps(), bytes, contentType)`; map the result to JSON. One `console.log` line per upload with kind, declared type, byte length, outcome and ms; `console.error` with the cause on 503. Every response carries `Cache-Control: no-store`.

- [ ] **Step 4: Verify by hand**

With `pnpm dev` running and logged in to `/admin` in the browser, from the DevTools console on an admin page:
`fetch("/admin/photos", { method: "POST", body: await (await fetch("/favicon.ico")).blob(), headers: { "content-type": "image/png" } }).then(r => r.json())` — expected `{ error: "Use a JPG, PNG or WebP photo." }` (an .ico is not accepted by `info()`), and `curl -X POST http://localhost:3000/admin/photos -H 'content-type: image/jpeg' --data-binary @docs/brand/photos/tee-black-flat.webp` — expected 401 (no cookie).

- [ ] **Step 5: Typecheck, lint, test, commit**

```bash
git add "src/app/(admin)/admin/photos"
git commit -m "feat(admin): accept photo uploads from the owner and process them into variants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Schema limits and form-state actions

**Files:**
- Modify: `src/lib/catalog/schema.ts:30-42`, `src/lib/catalog/schema.test.ts`
- Modify: `src/app/(admin)/admin/products/form-state.ts`, `src/app/(admin)/admin/products/form-state.test.ts`

**Interfaces:**
- Produces: `photoSchema.key` = `z.string().regex(PHOTO_ID)` (import `PHOTO_ID` from `@/lib/photos/variants` — type-only-safe, pure module); `colorSchema.photos` = `.max(20, MESSAGES.perColor)` (import `MESSAGES` from `@/lib/photos/process`, pure).
- Produces (`form-state.ts` `Action`): `| { type: "addPhoto"; key: string; photo: Photo } | { type: "setSizeChart"; photo: Photo }`.

- [ ] **Step 1: Add the failing schema tests**

In `schema.test.ts`: a product whose first color has 21 photos fails with the message `"Up to 20 photos per color"` at path `["colors", 0, "photos"]`; a photo key `"a/b"` fails; `"seed-tee-black-flat"` and 32 hex pass.

- [ ] **Step 2: Add the failing form-state tests**

```ts
test("addPhoto appends to the named color and ignores a duplicate key", () => {
  let d = reduce(emptyDraft(), { type: "addPhoto", key: "new:1", photo: { key: "p1", width: 10, height: 10 } });
  d = reduce(d, { type: "addPhoto", key: "new:1", photo: { key: "p2" } });
  d = reduce(d, { type: "addPhoto", key: "new:1", photo: { key: "p1" } });
  expect(d.colors[0]?.photos.map((p) => p.key)).toEqual(["p1", "p2"]);
});
test("setSizeChart replaces", () => {
  const d = reduce({ ...emptyDraft(), sizeChart: { key: "old" } }, { type: "setSizeChart", photo: { key: "new" } });
  expect(d.sizeChart).toEqual({ key: "new" });
});
```

- [ ] **Step 3: Run to verify they fail, implement, run to verify they pass**

Run: `pnpm test src/lib/catalog src/app`

- [ ] **Step 4: Commit**

```bash
git add src/lib/catalog "src/app/(admin)/admin/products/form-state.ts" "src/app/(admin)/admin/products/form-state.test.ts"
git commit -m "feat(catalog): cap photos per color, pin the photo key shape, add photo actions to the draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Upload control in `PhotoSlot`, wired into colors, size chart and logo

**Files:**
- Create: `src/app/(admin)/admin/photos/upload.ts`, `src/app/(admin)/admin/photos/upload.test.ts`
- Modify: `src/app/(admin)/admin/products/photo-slot.tsx`
- Modify: `src/app/(admin)/admin/products/colors-editor.tsx:211,365-374`
- Modify: `src/app/(admin)/admin/products/product-form.tsx:37,313-320,352-353`
- Modify: `src/app/(admin)/admin/settings/settings-form.tsx:31,932-940`

**Interfaces:**
- Produces (`upload.ts`, client-safe, no React):
  ```ts
  export type PhotoKind = "color" | "size-chart" | "logo";
  export function precheckFile(file: { type: string; size: number }): string | null;  // MESSAGES.badType / MESSAGES.tooBig / null
  export async function uploadPhoto(file: File, kind: PhotoKind, fetchImpl?: typeof fetch): Promise<Photo>;  // throws Error(message) with the server's `error`, or MESSAGES.network on a thrown fetch / non-JSON body
  export function takeUpTo<T>(items: T[], room: number): { taken: T[]; dropped: number };
  ```
- Produces (`PhotoSlot` props): as the spec's block — `photos, label, max?, onAdd, onRemove, onMove?, kind`; `emptyText` removed.
- Consumes: Task 7 actions; Task 3 `MESSAGES`; Task 2 `ACCEPTED_TYPES`, `INPUT_MAX_BYTES`.

- [ ] **Step 1: Write `upload.test.ts`**

```ts
test("precheckFile", () => {
  expect(precheckFile({ type: "image/jpeg", size: 1 })).toBeNull();
  expect(precheckFile({ type: "application/pdf", size: 1 })).toBe(MESSAGES.badType);
  expect(precheckFile({ type: "image/png", size: INPUT_MAX_BYTES + 1 })).toBe(MESSAGES.tooBig);
});
test("uploadPhoto posts the raw file with its type and kind, returns the photo", async () => {
  const calls: RequestInit[] = [];
  const fetchImpl = (async (_u: unknown, init?: RequestInit) => { calls.push(init!); return Response.json({ key: "k", width: 1, height: 2 }); }) as typeof fetch;
  const file = new File([new Uint8Array(3)], "a.jpg", { type: "image/jpeg" });
  await expect(uploadPhoto(file, "color", fetchImpl)).resolves.toEqual({ key: "k", width: 1, height: 2 });
  expect(new Headers(calls[0]?.headers).get("x-photo-kind")).toBe("color");
  expect(new Headers(calls[0]?.headers).get("content-type")).toBe("image/jpeg");
});
test("uploadPhoto surfaces the server message, and the network message otherwise", async () => {
  const bad = (async () => Response.json({ error: "Nope" }, { status: 415 })) as typeof fetch;
  await expect(uploadPhoto(new File([""], "a", { type: "image/jpeg" }), "logo", bad)).rejects.toThrow("Nope");
  const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  await expect(uploadPhoto(new File([""], "a", { type: "image/jpeg" }), "logo", down)).rejects.toThrow(MESSAGES.network);
});
test("takeUpTo", () => expect(takeUpTo([1, 2, 3], 2)).toEqual({ taken: [1, 2], dropped: 1 }));
```

- [ ] **Step 2: Run to verify it fails, implement `upload.ts`, run to verify it passes**

- [ ] **Step 3: Rebuild `PhotoSlot`**

Keep the existing tile, sortable tile and `onMove` logic. Add local state `uploads: { id: string; file: File; url: string; status: "queued" | "uploading" | "failed"; error?: string }[]`; an effect (or a small reducer) keeps at most 3 in `"uploading"`, calls `uploadPhoto(file, kind)`, on success `onAdd(photo)`, removes the entry and `URL.revokeObjectURL(url)`; on failure sets `"failed"` with the message. Render, after the tiles: one upload tile per entry (72 px, `<img src={url}>` at `opacity-50` with a centered `Loader2` spinner from lucide for queued/uploading; for failed, the message in `text-xs text-destructive` with "Retry" and a dismiss ×), then the add tile — a `<button type="button">` 72 px square, `border border-dashed border-border rounded-lg bg-muted text-sm`, label "Add photos" (`max > 1`), "Add image" (`max === 1`, none yet) or "Replace" (`max === 1`, one present), hidden when `photos.length + uploads.length >= max`; it clicks a hidden `<input type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1}>`. The strip `<div>` handles `onDragOver`/`onDragLeave`/`onDrop` (`preventDefault`, `ring-2 ring-ring` while over). `addFiles(files)`: `precheckFile` each (failed ones become failed tiles immediately), `takeUpTo(ok, max - photos.length - uploads.length)`; when `dropped > 0`, `toast.error(MESSAGES.perColor)` (`max > 1`) — for `max === 1`, the newest file replaces the queue. When `max === 1`, `onAdd` is the replacement; the parent drops the old photo. Expose `onPendingChange?: (pending: boolean) => void` and call it whenever `uploads.length > 0` flips.

- [ ] **Step 4: Wire the callers**

- `colors-editor.tsx`: delete `NO_PHOTOS`; pass `kind="color"`, `onAdd={(photo) => dispatch({ type: "addPhoto", key: color.key, photo })}`, `onPendingChange` → a prop `onPendingChange` lifted to `ColorsEditor` → `ProductForm`.
- `product-form.tsx`: delete `NO_SIZE_CHART`; size chart slot gets `kind="size-chart" max={1} onAdd={(photo) => dispatch({ type: "setSizeChart", photo })}`; a `pendingUploads` count in state (incremented/decremented per slot via `onPendingChange`); `dirty` becomes `dirty || pendingUploads > 0`; the Save button `disabled={saving || pendingUploads > 0}` with, when pending, a `<p className="text-sm text-muted-foreground">Wait for the photos to finish uploading.</p>` beside it.
- `settings-form.tsx`: delete `NO_LOGO`; logo slot gets `kind="logo" max={1} onAdd={(photo) => setValues((v) => ({ ...v, logo: photo }))}` and the same pending guard on its Save.

- [ ] **Step 5: Verify by hand in `pnpm dev`**

Log in, open a product: add two JPEGs and one transparent WebP to a color via the picker, then drop a fourth; see spinners, then tiles; reorder; remove one; Save disabled while uploading; save; reopen — photos present in order. Drop a PDF — refused inline. Size chart: add then Replace. Settings: logo add. `pnpm lint` reports no `@next/next/no-img-element` errors beyond the existing disabled line (add the same disable comment on the preview `<img>`).

- [ ] **Step 6: Typecheck, lint, test, commit**

```bash
git add "src/app/(admin)/admin"
git commit -m "feat(admin): upload photos from the computer with drag-and-drop, per color, size chart and logo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The `<Photo>` component for customer pages

**Files:**
- Create: `src/components/photo.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export function Photo(props: { photo: Photo; alt: string; sizes: string; priority?: boolean; className?: string }): JSX.Element;
  ```
  Renders `<img src={photoSrc(photo)} srcSet={photoSrcSet(photo)} sizes={sizes} alt={alt} className={className} width/height={photoAspect(photo) ?? undefined} loading={priority ? undefined : "lazy"} decoding={priority ? undefined : "async"} fetchPriority={priority ? "high" : undefined} />`. No `"use client"`, no hooks, no dnd-kit. Doc comment: how #4 should set `sizes` for cards (`"(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"`, first four `priority`) and #5 for the gallery (`"100vw"`), and that `photoOgSrc` is the `og:image` for #7.

- [ ] **Step 1: Implement the component**

Import the type `Photo` from `@/lib/catalog/schema` under an alias (`type Photo as PhotoData`) to avoid clashing with the component name. Add the `eslint-disable-next-line @next/next/no-img-element` comment with the reason (our own variant route; see Call 4 in the spec).

- [ ] **Step 2: Show it once in the store home to prove it renders**

Temporarily render `<Photo>` for `cardPhoto(product)` of the first published product in `src/app/(store)/[lang]/page.tsx` with `sizes="50vw"` and the seed photos from Task 10, confirm in the browser that the request is for `320.webp` or `640.webp` and the box has the aspect ratio, then **revert the page change** (the home is #4's). Do not commit the temporary change.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add src/components/photo.tsx
git commit -m "feat(store): add the Photo component that picks a screen-fitting WebP copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Seed photos for local development

**Files:**
- Create: `scripts/seed-photos.sh`
- Modify: `migrations/seed/dev.sql:17` (the colors JSON)
- Modify: `package.json` (`"photos:seed:local"`)

**Interfaces:**
- Produces: eight local R2 objects `photos/seed-tee-<color>-<shot>/master` and a seed product whose colors each list `{ "key": "seed-tee-<color>-flat", "width": 1200, "height": 1200 }` then `…-hanger`.

- [ ] **Step 1: Write the script**

`scripts/seed-photos.sh` (`set -euo pipefail`, run from the repo root): loops over `docs/brand/photos/*.webp` and runs `pnpm exec wrangler r2 object put "9k-store-photos/photos/seed-${name}/master" --file "$f" --content-type image/webp --local` where `name` is the file name without `.webp`. Add `"photos:seed:local": "sh scripts/seed-photos.sh"` to `package.json`.

- [ ] **Step 2: Update the seed SQL**

Each color's `"photos"` becomes the two seed photos (flat first). Keep the rest of the row unchanged.

- [ ] **Step 3: Verify**

Run: `pnpm photos:seed:local && pnpm db:migrate:local && pnpm db:seed:local` (re-running the seed may need the existing row removed first — check how `dev.sql` inserts; if it is a plain `INSERT`, make it `INSERT OR REPLACE`). With `pnpm dev`: `/admin` shows the tee's card photo; `curl -sI localhost:3000/photos/seed-tee-black-flat/320.webp` → 200 `image/webp` (lazily filled) and a second call hits the stored variant.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-photos.sh migrations/seed/dev.sql package.json
git commit -m "chore(dev): seed the brand's cutouts as the sample product's photos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Provisioning, docs and the Worker check

**Files:**
- Modify: `README.md` ("First-time setup", step 4 and a new buckets step)
- Modify: `AGENTS.md` ("Commands", "Architecture")
- Modify: `docs/brief.md` ("Backlog": one line)

- [ ] **Step 1: Try to create the buckets**

Run: `pnpm exec wrangler r2 bucket create 9k-store-photos && pnpm exec wrangler r2 bucket create 9k-store-photos-staging`. If both succeed, say so in the README step ("Already done for this repo"); if not permitted (login or permission error), write the two commands as the owner's step and list them in the PR body as follow-ups. Never retry with a different account.

- [ ] **Step 2: README**

Insert step 2 "Create the photo buckets" (the two commands; note that a deploy fails while the config names a missing bucket) and renumber. In the local step add `pnpm photos:seed:local   # optional: the sample product's photos`. Add a paragraph: the first upload on staging returning "Photo processing isn't available right now" with an Images permission error in the Worker log means Images (Transformations) needs enabling for the account in the Cloudflare dashboard.

- [ ] **Step 3: AGENTS.md**

Commands: add `pnpm photos:seed:local`. Architecture: one paragraph — photos live in R2 (`PHOTOS`) as `photos/<id>/master` plus the variants from `src/lib/photos/variants.ts`; `POST /admin/photos` processes on upload through the Images binding; `GET /photos/[id]/[file]` serves variants immutable and fills missing ones; customer pages render through `src/components/photo.tsx` (`photoSrcSet`/`sizes`), `photoOgSrc` for link previews; degraded paths only under `NEXTJS_ENV=development`; Workers Cache is on, so any new response that should not be cached must carry `private`/`no-store` (Next pages already do).

- [ ] **Step 4: Brief backlog**

Add: "**Photo storage sweep:** delete R2 objects no product references (removed photos keep their files in v1)."

- [ ] **Step 5: Full verification in workerd**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm preview`. In the preview: log in, upload one JPEG to a color, save, request its `640.webp` twice (200 then 304), confirm `/admin` still reflects an edit immediately (no stale page from Workers Cache). Record the outcomes in the PR body under "Checked by hand".

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md docs/brief.md
git commit -m "docs: photo buckets setup, photo pipeline architecture, storage sweep backlog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
