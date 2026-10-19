# Product photo upload and fast delivery — design

Intent-Issue: #3 — https://github.com/ismail9k/9kstore/issues/3

Status: v1 · 2026-10-19 · planned unattended from the issue, the brief
(`docs/brief.md`, "Owner experience (admin)" and "Constraints"), the brand
guidelines (`docs/brand/guidelines.md`, "Photography") and the two specs this
branch builds on (`2026-10-19-owner-admin-design.md`,
`2026-10-19-bilingual-rtl-design.md`). Every choice the issue left open is
recorded under "Calls made while planning", with what it costs if it turns
out wrong.

## Intent

The photos carry the site. The owner shoots them as full-size camera photos,
or exports them as 1200 × 1200 WebP cutouts on a transparent background (the
brand's house style), and must be able to drop them into the admin as they
are. Most customers open the site in Instagram's in-app browser on mobile
data, so serving those files as uploaded would make the catalog slow, which
the brief lists as a v1 failure.

This issue fills the slot #2 left open: the upload control and drag-to-
reorder in the admin for each color's photos, the size chart and the store
logo; storage; and the delivery path — resized, compressed copies in a
modern format, picked by the customer's screen — that #4 (catalog grid),
#5 (product gallery) and #7 (link previews) render with a shared component.

## Goals

1. From the add/edit product screen the owner adds photos to a color from
   the computer (file picker or drag-and-drop), sees them appear as tiles
   within seconds, reorders them by dragging and removes them, with no
   preparation of the files. The size chart and the store logo use the same
   control for a single image.
2. Every photo is resized and compressed once, on upload, into a fixed set
   of phone-sized WebP copies. Customers never download an original.
3. Customer pages render photos through one component that emits `srcset`
   and `sizes`, so the browser fetches the smallest copy that fits, and
   reserves the space (no layout shift). The catalog grid built by #4 on top
   of it fits the "usable on 4G in about 2 seconds" budget.
4. A new photo is live the moment the product is saved; no deploy.
5. Hosting stays within Cloudflare's free allowances for a catalog of this
   size (under 50 products).
6. Works locally (`pnpm dev`, `pnpm preview`) without any Cloudflare
   account, and keeps working in a degraded way when the image processor is
   unavailable.

## Non-goals

- Editing photos (crop, rotate, background removal). The owner prepares
  cutouts in their own tools; the site only resizes and converts.
- Deleting files from storage when a photo is removed from a product or a
  product is hidden. See Call 9.
- A media library shared between products, or re-using a photo in two
  colors.
- Video.
- The catalog grid, the product gallery, the Open Graph tags and the rail.
  Those are #4, #5, #7; this issue hands them the component and the URLs.
- `next/image`. See Call 4.

## Anti-goals

- The owner having to resize, convert or rename files before uploading.
- A customer page that downloads a 1200 px or camera-sized image.
- The customer pages depending on the image processor at request time: a
  processing outage or an exhausted free quota must not break photos that
  are already on the site.
- dnd-kit or any upload code in a customer page bundle.
- Camera metadata (GPS position, device, timestamps) reaching the public
  site.

## Constraints (binding, from the issue)

- Full-size camera photos upload without preparation.
- Photos are served in modern formats at screen-fitting sizes.
- Catalog usable on 4G in about 2 seconds, including in Instagram's in-app
  browser.
- New photos reach the live site within a minute without a deploy.
- Hosting free or close to it.
- Existing Next.js 16 app on Cloudflare Workers through OpenNext; no new
  framework. `cacheComponents` stays off (AGENTS.md).
- shadcn/ui with Tailwind for the admin and customer pages; dnd-kit stays
  admin-only.
- AGENTS.md rules: each new binding goes in three places in
  `wrangler.jsonc` (top level, `env.staging`, `env.staging.previews`), then
  `pnpm cf-typegen`; tests only for meaningful logic, next to the code;
  `@/` imports; `noUncheckedIndexedAccess` is on.

## The shape of the solution

Two Cloudflare bindings, both free at this scale:

- **R2** bucket, binding `PHOTOS`: `9k-store-photos` for production,
  `9k-store-photos-staging` for staging and previews. Stores the processed
  master and its variants. Free tier: 10 GB stored, 1 M writes and 10 M
  reads a month, no egress fees.
- **Images** binding, binding `IMAGES`: Cloudflare's image processor,
  called from the Worker on upload (and, rarely, on a cache-miss read, see
  below). Free tier: 5,000 unique transformations a month, hard stop with
  no charge beyond it.

Processing happens **once, at upload**: the Worker normalizes the file into
a master and renders every variant into R2 right away. Delivery is **a plain
read from R2**: the Worker streams the stored file with a one-year immutable
cache header, and Workers Cache keeps repeat requests off the Worker. That
split is what keeps the customer pages independent of the image processor.

### Storage layout

Each upload gets an opaque id (`crypto.randomUUID()` without hyphens, 32
lowercase hex characters). It is the `Photo.key` #2 defined and the only
thing the product row stores about the file.

| R2 object | What it is |
|---|---|
| `photos/<id>/master` | The source for variants. Content type in `httpMetadata`. Never served to customers except as a last-resort fallback. |
| `photos/<id>/320.webp` `640.webp` `960.webp` `1280.webp` | The variants customers download. Widths are the long-edge-fitting widths `fit: "scale-down"` (never upscaled). |
| `photos/<id>/1280.jpg` | One JPEG for link previews (#7): WhatsApp and Instagram do not reliably render WebP in `og:image`. Transparency is flattened onto the page's off-white `#F1EDE7`. |

`VARIANT_WIDTHS = [320, 640, 960, 1280]` and the JPEG spec live in one
module (`src/lib/photos/variants.ts`) that both the upload and the serving
route import; nothing else hard-codes a width.

Why these four: a card in a two-column phone grid is about 170 CSS px wide
(up to 510 device px at 3×); a full-width gallery on a 390 px phone is up to
1170 device px; a desktop card is 250–300 CSS px. Four steps cover those
with at most ~30 % waste, and keep the per-photo transformation count at 6
(master + 4 WebP + 1 JPEG): 400 photos uploaded in one month cost 2,400 of
the 5,000 free transformations, and nothing in later months.

### Upload: `POST /admin/photos`

A Route Handler at `src/app/(admin)/admin/photos/route.ts`. Not a Server
Action: actions have a 1 MB body limit and buffer through React's RPC
layer; a camera JPEG is 5–15 MB.

Request: the raw file as the body (`fetch(url, { method: "POST", body:
file })`), `Content-Type` set by the browser from the file. Headers:
`X-Photo-Kind: color | size-chart | logo` (for the log line only; the
pipeline is the same).

Checks, in order, each a JSON `{ error: "<plain English>" }`:

1. `getSession()` → else 401 "You were logged out. Log in again in a new
   tab, then try again." (same wording as the form's `LOGGED_OUT`).
2. Same-origin: `Sec-Fetch-Site` is `same-origin`, or, when the header is
   absent, `Origin` matches the request's origin → else 403. Server Actions
   get this check from Next; a Route Handler does not, and the admin cookie
   is `SameSite=Lax`.
3. `Content-Length` present and ≤ 20 MB (the Images binding input limit)
   → else 413 "This photo is over 20 MB. Export it smaller and try again."
   The body is read into memory (`arrayBuffer()`) and its real length is
   checked again.
4. `IMAGES.info()` on the bytes → format must be `image/jpeg`, `image/png`
   or `image/webp`, else 415 "Use a JPG, PNG or WebP photo." (HEIC, AVIF,
   GIF, SVG and camera RAW are refused: HEIC/AVIF input needs an Enterprise
   plan, the rest are not product photos.) Width and height each ≤ 12,000
   and area ≤ 100 MP, else 415 "This photo is too large to process."
   `info()` is not billed.

Pipeline (all through the Images binding):

5. **Master.** A **JPEG is always re-encoded**: transformed `{ width: 2560,
   height: 2560, fit: "scale-down" }` and output as `image/webp` quality 90.
   The processor drops EXIF (GPS, device, timestamps) and bakes the EXIF
   orientation into the pixels, so the stored master has no metadata and its
   `info()` dimensions are the displayed ones. A **PNG or WebP** that is
   already ≤ 2560 px on its long edge and ≤ 4 MB is stored byte-for-byte
   (the brand's 1200 px cutouts, exported with care from a design tool,
   carry no camera metadata and no orientation tag, and are not re-encoded);
   a larger PNG or WebP is re-encoded like a JPEG. The master's width and
   height come from `info()` on the stored bytes; they become
   `Photo.width`/`Photo.height`.
6. **Variants.** From the master bytes, in parallel: four WebP
   `{ width: w, fit: "scale-down" }` at quality 82, and the JPEG `{ width:
   1280, fit: "scale-down" }` output `image/jpeg` quality 85 with
   `background: "#F1EDE7"`. Each `put` sets `httpMetadata.contentType` and
   `cacheControl: "public, max-age=31536000, immutable"`.
7. Response 200 `{ key, width, height }`.

Failure of any Images call → 503 "Photo processing isn't available right
now. Try again in a minute." with the cause logged. Nothing is written to
R2 on failure, so no half-processed ids exist. The one exception is the
**no-processor mode** (below), which is a deliberate degraded path for local
development.

The Worker has 128 MB of memory per request; a 20 MB input plus a ~1.5 MB
master plus variants fits with room. Uploads run one request per file;
the client limits itself to three in flight.

### Delivery: `GET /photos/<id>/<file>`

A Route Handler at `src/app/photos/[id]/[file]/route.ts` (outside both
route groups; a Route Handler needs no layout).

- `id` must match `/^[a-z0-9-]{1,64}$/`; `file` must be one of the allowed
  variant names (`320.webp`, `640.webp`, `960.webp`, `1280.webp`,
  `1280.jpg`). Anything else is 404 with `Cache-Control: no-store`. The
  allowlist bounds what the route will ever generate or cache.
- Found in R2 → 200 streaming the body, `Content-Type` from
  `httpMetadata`, `Cache-Control: public, max-age=31536000, immutable`,
  `ETag` from `httpEtag`, `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline`. `If-None-Match` matching the ETag → 304.
- Variant missing but master present → **lazy fill**: render that one
  variant from the master, store it, then serve it. This covers photos
  uploaded before a change to `VARIANT_WIDTHS`, and the local seed photos
  (below), without a re-processing script. If the processor fails here:
  in a deployed Worker, 503 with `Retry-After: 60` and `Cache-Control:
  no-store`, the cause logged — a broken image for a minute, never a
  customer download of the master; in development only (see the next
  section), the master is served as-is with `Cache-Control: public,
  max-age=300` so work can continue.
- Master missing → 404 (`no-store`).

The route reads nothing but `params` and the request's `If-None-Match`, so
it is dynamic (Next 15+ default for `GET` handlers) and sets its own cache
headers.

**Workers Cache.** `wrangler.jsonc` gets `"cache": { "enabled": true,
"cross_version_cache": true }` at the top level, in `env.staging` and in
`env.staging.previews` (Wrangler 4.151 supports it; the Images docs
recommend it). Cloudflare then caches responses by their `Cache-Control`
per RFC 9111, keyed by path, so repeat photo requests never reach the
Worker or R2 — the difference between an Instagram burst costing thousands
of Worker requests and costing a handful. `cross_version_cache` keeps the
photo cache across deploys: a photo URL's content never changes (keys are
unique and never overwritten), so a merge to `develop` or `main` must not
empty the cache right before the next burst. Everything else the app
serves is unaffected: Next marks dynamic pages `private, no-cache,
no-store`, the `/lang` route sets a cookie (never cached), and
`_next/static` is already immutable, and its URLs are content-hashed. The
builder verifies this in `pnpm preview` and in the staging preview after
merge: pages still reflect admin edits within a minute. Rollback is
deleting the three blocks, which stops cache lookups at once (existing
entries are simply never consulted again); the photo route works without
it (Call 6).

The proxy's matcher excludes the prefix `photos`; it becomes `photos/` so
that a future `/photoshoot` page is not skipped. The matcher still excludes
`_next` and anything with a dot.

### Development mode (degraded paths, local only)

`pnpm dev` and `pnpm preview` run Miniflare: R2 is a local bucket under
`.wrangler/`, and the Images binding is a low-fidelity local version that
supports `width`, `height`, `rotate` and `format` only (`fit`, `quality`
and `background` are ignored there, which is fine for development).

A single predicate, `isDevelopment(env)` in `src/lib/photos/env.ts`, is
true only when `env.NEXTJS_ENV === "development"` — the variable `.dev.vars`
sets for `pnpm dev` and `pnpm preview` and that no deployed Worker has (it
is not in `wrangler.jsonc`'s `vars`). Only when it is true may the code
degrade instead of failing:

- Should `env.IMAGES` be undefined (a Wrangler without local Images
  support), upload stores the original bytes as the master (after checking
  the content type header is one of the three accepted types, and the
  20 MB limit), writes no variants, and returns `{ key }` with no
  width/height (the fields #2 made optional for exactly this). One warning
  is logged per process.
- Delivery serves the master for any allowed variant name when the lazy
  fill cannot run or fails, with the five-minute cache header.

In a deployed Worker (`isDevelopment` false) the same conditions are
errors: a missing `IMAGES` binding or a failed processor call makes the
upload answer 503 "Photo processing isn't available right now…" and makes
a lazy fill answer 503, as described above. The master is never served to
a customer from a deployed Worker, so neither the metadata anti-goal nor
the weight budget depends on the processor being up.

### URLs and the customer-side component

`src/lib/photos/urls.ts` (pure, client-safe, replaces
`src/lib/catalog/photo-src.ts`; `VARIANT_WIDTHS` and `VariantWidth` come
from `variants.ts`):

```ts

/** `/photos/<key>/<w>.webp` */
export function photoSrc(photo: Photo, width: VariantWidth = 640): string;
/** `"/photos/k/320.webp 320w, /photos/k/640.webp 640w, …"`, skipping widths above the master's own width (the last one at or above it is kept). */
export function photoSrcSet(photo: Photo): string;
/** `/photos/<key>/1280.jpg` — the link-preview image for #7. */
export function photoOgSrc(photo: Photo): string;
/** `{ width, height }` for the layout, or `null` when the photo has none. */
export function photoAspect(photo: Photo): { width: number; height: number } | null;
```

`src/components/photo.tsx` — `<Photo>` — a Server-Component-safe function
component (no hooks, no `"use client"`), rendering a single `<img>`:

```tsx
<Photo
  photo={photo}
  alt={product.nameAr}            // caller's responsibility; "" for decorative
  sizes="(min-width: 768px) 25vw, 50vw"  // required: the slot's CSS width
  priority                        // optional: above the fold → eager + fetchpriority="high"
  className="…"
/>
```

It emits `src` (the 640 variant), `srcset` from `photoSrcSet`, `sizes`,
`width`/`height` from `photoAspect` when known (so the browser reserves the
box), `loading="lazy"` and `decoding="async"` unless `priority`, and passes
`className` through. One format only — WebP — so no `<picture>`: every
browser the brief targets (iOS 14+ Safari and WebKit in-app browsers,
Chrome, Android WebView) decodes WebP (Call 3). The component ships no
JavaScript to the customer.

Guidance for #4 (recorded here so the budget is met by design): card
photos use `sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw,
50vw"`, the first four cards `priority`, the rest lazy. A 320–640 px WebP
cutout is 15–40 KB; a first screen of eight cards is well under 400 KB,
inside a 2-second 4G budget alongside the HTML, CSS and fonts.

The admin's `PhotoTile` keeps a plain `<img>` with `photoSrc(photo, 320)`
(72 px and 48 px tiles, so 320 is the smallest useful variant on a 2×
laptop screen).

### The admin: upload and reorder

`PhotoSlot` (`src/app/(admin)/admin/products/photo-slot.tsx`) grows the
upload control; its callers pass what they already pass plus `onAdd`.

Props:

```ts
{
  photos: Photo[];
  label: string;                  // "Black photo", "Size chart", "Logo"
  emptyText?: string;             // dropped: the add control is the empty state
  max?: number;                   // 1 for the size chart and the logo; default 20
  onAdd: (photo: Photo) => void;  // called once per finished upload
  onRemove: (photoKey: string) => void;
  onMove?: (from: number, to: number) => void;  // present for colors only
  kind: "color" | "size-chart" | "logo";       // sent as X-Photo-Kind
}
```

Behavior:

- The strip shows existing tiles (with the drag handle and remove × from
  #2), then the upload tiles, then an **add tile**: a dashed, tile-sized
  button reading "Add photos" (or "Add image" when `max` is 1) that opens a
  file picker (`accept="image/jpeg,image/png,image/webp"`, `multiple` when
  `max > 1`). The whole strip is a drop target: dragging files over it
  outlines it in green; dropping starts the same uploads. Keyboard users
  reach the add tile with Tab.
- Each chosen file becomes an **upload tile** at once: an object-URL
  preview of the file at reduced opacity with a spinner, so the owner sees
  which photo is in flight. At most three uploads run at a time; the rest
  queue. On success the tile is replaced by a real tile through `onAdd`;
  the object URL is revoked. On failure the tile shows the server's message
  (or "Couldn't upload. Check your connection and try again." for a network
  error) with a "Retry" and a dismiss ×.
- When `max` is 1 and a photo exists, the add tile reads "Replace"; the new
  upload replaces the old on success (the old key is simply dropped from
  the draft).
- When `photos.length + inFlight >= max` the add tile is hidden, and a
  drop that would exceed `max` uploads only the first files that fit and
  shows a toast "Up to 20 photos per color."
- Files with a type outside the three accepted types are refused client-
  side with the same "Use a JPG, PNG or WebP photo." message, before any
  request. Files over 20 MB likewise, with the 20 MB message.
- Uploads in flight make the form dirty: the `beforeunload` guard from #2
  covers it, and Save is disabled with the hint "Wait for the photos to
  finish uploading." while any upload is pending (so a product is never
  saved without photos the owner thinks are on it).

Form state (`form-state.ts`) gains `{ type: "addPhoto"; key: string;
photo: Photo }` (appends to the color, ignoring a duplicate photo key) and
`{ type: "setSizeChart"; photo: Photo }`. The settings form sets `logo`
directly, as it does today for removal. `colorSchema.photos` gets
`.max(20, "Up to 20 photos per color")`; `photoSchema.key` gets the same
regex as the serving route (`/^[a-z0-9-]{1,64}$/`), so a tampered draft
cannot smuggle a path.

Copy changes: the three "upload arrives with the next release" strings go
away; the empty state is the add tile alone.

The products table's photo column and the color card tiles keep working
unchanged, since `PhotoTile` is the only place that resolves a URL.

### Local seed photos

The brand's eight 1200 × 1200 cutouts in `docs/brand/photos/` become the
dev seed's photos so #4 and #5 can be built against real images:

- `pnpm photos:seed:local` runs eight `wrangler r2 object put
  9k-store-photos/photos/seed-<name>/master --file docs/brand/photos/<name>.webp
  --content-type image/webp --local` (a small shell script in
  `scripts/seed-photos.sh`; `9k-store-photos` is the local bucket because
  Miniflare names local buckets after the top-level `bucket_name`).
- `migrations/seed/dev.sql` references them as `{ "key": "seed-tee-black-flat",
  "width": 1200, "height": 1200 }` — the flat shot first (the card photo),
  the hanger shot second, per color.
- Variants are rendered by the serving route's lazy fill on first request.
  Nothing from `docs/brand/photos/` is served in production or copied
  into `public/`.

The README's "First-time setup" step 4 gains the seed command.

### Provisioning and environments

- `wrangler.jsonc`: `r2_buckets` (`PHOTOS`) and `images` (`IMAGES`) in all
  three places; `cache.enabled` likewise; then `pnpm cf-typegen`
  (`PHOTOS: R2Bucket`, `IMAGES: ImagesBinding` appear in
  `cloudflare-env.d.ts`). The comment in `wrangler.jsonc` announcing R2 and
  Images "still to come" goes.
- The implementer, if their Wrangler login may, creates both buckets
  (`pnpm exec wrangler r2 bucket create 9k-store-photos` and
  `…-staging`) so that staging and previews work from the first deploy after
  merge; a deploy whose config names a missing bucket fails. Without
  permission, the README lists the two commands as the owner's step and
  the PR body repeats them. Nothing else needs creating: the Images binding
  has no resource. If the first staging upload returns the 503 with an
  Images permission error in the log, the owner enables Images
  (Transformations) for the account in the Cloudflare dashboard; the README
  says so.
- The README "First-time setup" gets a step for the buckets (between the
  databases and the secrets) and the note above. `.dev.vars.example` is
  unchanged: the bindings need no secrets.
- `open-next.config.ts` stays as it is. The incremental cache is not this
  issue's concern (nothing is statically generated), and its "add the R2
  cache once the bucket exists" comment is reworded to say the photos
  bucket is not it.

### Testing

Vitest, next to the code, logic only:

- `src/lib/photos/urls.test.ts`: `photoSrc` default and explicit width;
  `photoSrcSet` for a 1200-wide photo (320, 640, 960, 1280 descriptors with
  the last kept), a 500-wide photo (320, 640), a photo without width (all
  four); `photoOgSrc`; `photoAspect` null without dimensions.
- `src/lib/photos/variants.test.ts`: `parseVariant("640.webp")` →
  `{ width: 640, format: "webp" }`, `"1280.jpg"` ok, `"1281.webp"`,
  `"640.png"`, `"../x"` → null; `isPhotoId`.
- `src/lib/photos/process.test.ts`: the pure planning functions —
  `checkInput(info)` (format and dimension limits, mapped to the owner
  messages), `needsMaster(info)` (every JPEG; PNG/WebP by the 2560/4 MB rule
  on either edge, exact boundaries) and `variantPlans()` (the five outputs
  with their options). The Images and R2 calls take injected interfaces and are
  not integration-tested; the builder exercises them in `pnpm dev` and
  `pnpm preview`.
- `src/lib/photos/env.test.ts`: `isDevelopment` true only for
  `"development"`; undefined, `""`, `"production"` → false.
- `form-state.test.ts`: `addPhoto` appends and ignores duplicates;
  `setSizeChart` replaces.
- `src/app/photos/[id]/[file]/headers.test.ts` (or similar pure module):
  `cacheHeaders(etag)`; `isNotModified(ifNoneMatch, etag)` (exact, weak
  `W/`, `*`, list).
- Schema tests: a 21st photo rejected; a key with `/` rejected.

Manual check before the PR (the builder records the results in the PR
body): `pnpm dev`, upload a 10+ MB JPEG and a transparent WebP to a color,
reorder, remove, save, open the product again; upload a size chart and the
logo; try a PDF (refused), a 25 MB file (refused); confirm `/photos/<id>/
640.webp` serves with the one-year header and 304 on re-request; `pnpm
photos:seed:local` then `/photos/seed-tee-black-flat/320.webp`; `pnpm
preview` repeats the upload once in workerd.

## Calls made while planning (open to change)

1. **Process on upload, serve from storage** rather than transforming on
   every request. Customers never depend on the processor or its 5,000-a-
   month free cap, and a cache miss costs an R2 read, not a decode. Cost if
   wrong: ~2.5 MB of storage per photo (fine until ~4,000 photos), and a
   width change needs the lazy fill rather than a config edit.
2. **A normalized master, not the original.** Every JPEG is re-encoded to
   a ≤ 2560 px WebP master (strips GPS, bakes orientation, bounds size); a
   PNG or WebP already ≤ 2560 px and ≤ 4 MB is kept byte-for-byte because
   design-tool exports carry no camera metadata and re-encoding a cutout
   would only lose edge quality. Cost if wrong (an owner later wants the
   originals back): they are not here; the owner keeps them on the
   computer, which they do anyway. Cost of the PNG/WebP exception being too
   trusting: re-encode those too, one line in `needsMaster`, at one more
   transformation per cutout.
3. **WebP only for `<img>`, JPEG only for link previews.** AVIF would save
   roughly a quarter more bytes on photographic content but is slow to
   encode, gains little on flat cutouts, and would double the transformation
   count and the storage. Cost if wrong: add `"avif"` to the variant list
   and a `<picture>` wrapper in `<Photo>`; existing photos fill lazily.
4. **A plain `<img>` component, not `next/image`.** `next/image` needs a
   client-side loader, cannot emit a `<picture>`, and ships JavaScript to
   every customer page; our URLs are already a fixed set. Cost if wrong: a
   loader file that maps `src`/`width` onto `photoSrc` — an hour.
5. **Widths 320/640/960/1280 and quality 82.** Picked for the two-column
   phone grid and a full-width phone gallery at up to 3×. Cost if wrong:
   edit `VARIANT_WIDTHS`; the serving route fills new widths on demand.
6. **Workers Cache on for the whole Worker, kept across versions.**
   Simplest way to keep bursts off the Worker and R2; Next's own headers
   keep pages out of it, and photo URLs are immutable so surviving a deploy
   is safe. Cost if wrong (a page turns out cacheable and stale): delete the
   three `cache` blocks, which stops lookups at once; photos are then served
   by the Worker from R2 on every request, still correct, and still under
   the free request allowance for this site's traffic.
7. **Raw-body Route Handler, three concurrent uploads, 20 MB limit.** No
   multipart parsing, no Server Action limit. Cost if wrong: none material;
   the limit is one constant and matches the processor's own.
8. **Accepted inputs: JPEG, PNG, WebP.** HEIC needs an Enterprise plan to
   decode; the rest are not photos. Cost if wrong (the owner shoots on an
   iPhone and uploads HEIC from the laptop): macOS converts on export, and
   the admin tells them which formats work.
9. **No deletion from R2 in v1.** Removing a photo from a product removes
   the reference; the files stay. Keys are unique, so nothing is ever
   overwritten, and the free 10 GB is thousands of photos away. Cost: an
   orphan sweep later (a script that lists `photos/` and compares with the
   products' keys), a couple of hours, listed in the brief's backlog by the
   PR.
10. **Up to 20 photos per color.** Keeps the draft under Next's 1 MB action
    limit by a wide margin and the gallery sane. Cost: one number.
11. **Same-origin check by `Sec-Fetch-Site`/`Origin`** instead of a CSRF
    token. The admin is a modern laptop browser; the cookie is already
    `SameSite=Lax`. Cost: none material.
12. **Lazy fill on the read path** for missing variants, in addition to
    eager rendering on upload. Makes width changes and the dev seed work
    without a script. Cost: one branch in the route; a bounded allowlist
    keeps it from being an open resizer.
13. **Seed photos from `docs/brand/photos/`**, uploaded to the local bucket
    by a script, referenced by the dev seed. Cost: none for production;
    `pnpm photos:seed:local` is optional.
14. **The implementer creates the buckets when permitted**, mirroring #2's
    D1 call. Cost: if not permitted, the owner runs two commands before
    merging, listed in the PR.
15. **Save is disabled while uploads are pending.** Prevents saving a
    product the owner believes has photos it does not yet have. Cost: a
    few seconds' wait on a slow connection.
16. **Degraded paths gated on `NEXTJS_ENV === "development"`.** A deployed
    Worker fails loudly (503) rather than serving masters; local work never
    blocks on the processor. Raised by the builder check. Cost if wrong (a
    deployed Worker someday needs the fallback): none — the fallback is
    exactly what the anti-goals forbid in production.

## Left to the builder

- The exact look of the add tile, the upload tile and the drop outline,
  within the brand tokens (dashed `border-border`, green `ring` on drag-
  over, `bg-muted` tile).
- How the upload queue is implemented in the client (a small hook or plain
  state), as long as three run at a time and each tile reports its own
  state.
- Whether `info()` on the master is a second call or read back from the
  transform output's known dimensions (the processor reports `width` and
  `height` only through `info()`; a second call is fine and unbilled).
- The log line format.
- Error copy wording beyond the messages fixed above, as long as it is
  plain English with no technical terms.
