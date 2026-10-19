# Shareable product links with link previews — design

Intent-Issue: #7 — https://github.com/ismail9k/9kstore/issues/7

Status: v1 · 2026-10-19 · planned unattended from the issue, the brief
(`docs/brief.md`, "Sharing", "The order message", "Calls made by Claude"),
`AGENTS.md` and the five specs this branch builds on
(`2026-10-19-owner-admin-design.md`, `2026-10-19-bilingual-rtl-design.md`,
`2026-10-19-photo-upload-delivery-design.md`,
`2026-10-19-catalog-home-design.md`,
`2026-10-19-product-page-order-button-design.md`). Every choice the issue
left open is recorded under "Calls made while planning", with what it costs
if it turns out wrong.

## Intent

The owner shares products in Instagram stories, the link in bio and
WhatsApp chats. A link has to open the right product in the right language
and color, look like the product when pasted, and keep working after the
product is hidden, because old stories stay up.

Most of the URL half already exists: `/<lang>/p/<slug>` with `?color=`
pre-selection (#5), stable dot-free slugs and color keys locked after
publishing (#2), the URL language winning over the remembered choice (#6),
and `photoOgSrc()` giving a 1280-wide JPEG flattened onto the page's
off-white for previews (#3). This issue adds what the earlier specs handed
to #7: Open Graph and Twitter tags on the product page and the home page,
`canonical` and `hreflang` links, the "no longer available" page for a
hidden product, and one place that knows the site's public origin.

## Goals

1. Pasting `/<lang>/p/<slug>` into WhatsApp, Instagram, Messenger or
   Telegram shows the product photo, the product name and the price, in
   that language. With `?color=<key>` naming one of the product's colors,
   the photo is that color's first photo.
2. The tags are in the server HTML's `<head>` for every fetcher, whatever
   its user agent, so no preview depends on JavaScript or on Next's bot
   list.
3. Every customer page carries `<link rel="canonical">` and
   `<link rel="alternate" hreflang>` for `ar`, `en` and `x-default`
   (Arabic), so search engines and share targets see the two languages as
   one product.
4. A hidden product's link, in either language, shows a friendly "no
   longer available" page in the store layout that names the product and
   links back to the catalog. It is not a 404 and is not indexed. The
   order route keeps refusing a hidden product.
5. Sold-out products stay reachable and keep their preview (unchanged
   from #5).
6. The absolute URLs in the tags and in the WhatsApp message's link come
   from one helper: the configured public origin when the owner has set
   one, else the origin the request arrived on.
7. Unit tests pin the origin rule, the metadata builder and the preview
   image's dimensions.

## Non-goals

- A sitemap, `robots.txt`, structured data (JSON-LD) — not asked for;
  backlog candidates.
- A generated Open Graph image (text over the photo). The preview image is
  the product photo as stored; WhatsApp and Instagram show the name and
  price as text next to it.
- Previews for admin pages (they are `noindex` already) and for the order
  route (a redirect; `noindex, nofollow`).
- Deciding the domain. The owner's open question stays open; this design
  works before and after it is answered (Call 1).
- A 410 status for a hidden product (Call 3).
- Any change to the admin, the catalog schema or the photo pipeline.

## Anti-goals

- A preview that shows the wrong color, or the first color when the link
  named another one.
- A hidden product's link showing Next's error shell, a 404, or a preview
  that still sells it.
- Tags whose URLs point at `localhost`, a preview hostname or a Worker's
  `*.workers.dev` hostname once the real domain is configured.
- Slower product pages: nothing here adds a request or a D1 read to the
  customer path beyond what the page already does.
- Any JavaScript shipped to customer pages for this (metadata is server
  HTML).

## Constraints (from the issue and the brief)

- Product URLs are stable and exist in both languages
  (`/<lang>/p/<slug>`); a shared link opens in the language it was shared
  in; `?color=` pre-selects the color. All already true; nothing here may
  change a URL.
- A hidden product's link shows a "no longer available" page, not a 404.
- Sold-out products stay reachable by their links.
- Next.js 16.4 App Router on Cloudflare Workers through OpenNext; shadcn/ui
  for any UI; dnd-kit stays admin-only.
- `AGENTS.md`: `cacheComponents` stays off; catalog reads are never
  cached; a page-level `notFound()` serves Next's error shell as the server
  HTML; customer strings exist in both `en.ts` and `ar.ts`; logical
  Tailwind classes only on customer pages; `noUncheckedIndexedAccess` is
  on.

## The pieces

```
src/lib/site/origin.ts            siteOrigin(configured, headers), getSiteOrigin()   (new)
src/lib/site/origin.test.ts
src/lib/site/metadata.ts          storeMetadata(...) → Metadata                       (new, pure)
src/lib/site/metadata.test.ts
src/lib/photos/urls.ts            + ogImageSize(photo)
src/lib/order/decide.ts           requestOrigin moves to site/origin.ts
src/app/(store)/[lang]/p/[slug]/page.tsx        metadata + hidden-product branch
src/app/(store)/[lang]/p/[slug]/unavailable.tsx the "no longer available" view (new)
src/app/(store)/[lang]/p/[slug]/order/route.ts  origin from getSiteOrigin
src/app/(store)/[lang]/page.tsx                 home metadata
src/lib/i18n/messages/en.ts, ar.ts              unavailable.*
next.config.ts                                  htmlLimitedBots: /.*/
.dev.vars.example, README.md, AGENTS.md         PUBLIC_ORIGIN, checklist, notes
```

## The public origin

`src/lib/site/origin.ts`:

```ts
/** `<proto>://<host>` for absolute URLs: the configured public origin, else the request's. */
export function siteOrigin(configured: string | undefined, headers: Headers): string
/** siteOrigin() with PUBLIC_ORIGIN from the Worker env (or process.env) and this request's headers. */
export async function getSiteOrigin(headers?: Headers): Promise<string>
```

`siteOrigin` is pure:

1. `configured`, trimmed, is used when it parses as a URL with an `http:`
   or `https:` protocol; its origin is returned (`new URL(...).origin`, so
   a trailing slash or a path is dropped). Anything else — empty,
   undefined, `example.com` without a scheme — is ignored (a bad value
   logs one `console.warn` naming it, and falls through).
2. Otherwise the request: host is `x-forwarded-host`, else `host`;
   protocol is `x-forwarded-proto`, else `http` when the host is
   `localhost`, `127.0.0.1`, `[::1]` or ends in `.localhost` (with or
   without a port), else `https`. Cloudflare sets `x-forwarded-proto`;
   `next dev` sets both forwarded headers; `pnpm preview` (workerd) sets
   neither, and the localhost rule keeps it `http://localhost:8787`.
3. No host at all (cannot happen for an HTTP request, but the type allows
   it): `http://localhost:3000`.

`getSiteOrigin` reads the env like `getSecrets` does: `getCloudflareContext`
in a `try`, then `env.PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN`. The
binding is **not** declared in `wrangler.jsonc` or `cloudflare-env.d.ts`
yet, so the env is read through a `Partial<CloudflareEnv> &
{ PUBLIC_ORIGIN?: string }` type. `headers` defaults to `await headers()`
from `next/headers` (pages and `generateMetadata`); Route Handlers pass
`request.headers`.

`requestOrigin(headers, url)` and its tests move out of
`src/lib/order/decide.ts` and `decide.test.ts`; the order route calls
`getSiteOrigin(request.headers)` and passes the result as `origin` to
`decideOrder`, whose signature does not change. So once the owner sets the
domain, the link in the WhatsApp message and the tags agree.

When the domain exists the owner (or a later issue) adds, at the **top
level only** of `wrangler.jsonc`, `"vars": { "PUBLIC_ORIGIN":
"https://<domain>" }` and runs `pnpm cf-typegen`; staging and previews
leave it unset and keep the request origin, which is right for them.
`.dev.vars.example` gets a commented `# PUBLIC_ORIGIN=` line explaining
this. The README's setup section gets the step.

## The metadata builder

`src/lib/site/metadata.ts` is pure (no `next/headers`, no D1) and returns a
`Metadata` object pages spread into theirs:

```ts
export type PreviewImage = { src: string; width?: number; height?: number; alt: string };  // src is a site path

export function storeMetadata(input: {
  origin: string;        // from getSiteOrigin()
  locale: Locale;
  path: string;          // locale-less, as withLocale takes it: "/" or "/p/<slug>"
  ogQuery?: Record<string, string>;  // appended to og:url only (e.g. { color: "black" })
  title: string;         // <title>
  ogTitle?: string;      // og:title when it differs from <title>
  description: string;
  siteName: string;
  image?: PreviewImage | null;
  noindex?: boolean;
  other?: Record<string, string>;
}): Metadata
```

It produces:

- `title`, `description`.
- `alternates.canonical`: `${origin}${withLocale(locale, path)}` — never
  the query. `alternates.languages`: `ar` → `/ar…`, `en` → `/en…`,
  `x-default` → the Arabic URL, all absolute. (Color is view state; the
  canonical product is the slug.)
- `openGraph`: `title` (`ogTitle ?? title`), `description`, `url` (the
  canonical URL plus `?` + `URLSearchParams(ogQuery)` when given and
  non-empty), `siteName`, `locale` (`ar_AR` / `en_US` — Facebook's documented codes; Arabic has no `ar_EG` there), `alternateLocale`
  (the other), `type: "website"`, and `images: [{ url: origin + src,
  width, height, alt }]` when `image` is set (width/height omitted when
  unknown). No `images` key when there is no image, so Next emits no empty
  tag.
- `twitter`: `{ card: "summary_large_image", title: ogTitle ?? title,
  description, images: [origin + src] }` (no `images` key without an
  image). Set explicitly rather than relying on Next deriving it from
  `openGraph`; Telegram and X read these.
- `robots: { index: false, follow: true }` when `noindex`.
- `other` passed through as given.

`og:url` carries the color on purpose: Facebook's and WhatsApp's fetchers
treat `og:url` as the identity of what was shared, and a story about the
black tee must preview the black tee, not the first color. The canonical
`<link>` stays color-free so search engines see one page.

Tests (`metadata.test.ts`): canonical excludes the query while `og:url`
includes it; three `hreflang` entries with `x-default` on Arabic; Arabic
gives `ar_AR` with `alternateLocale` `en_US`; the image URL is absolute and
carries dimensions when known; no image → no `images`; `noindex` →
`robots.index === false`; `ogQuery: {}` adds no `?`.

## The preview image

`src/lib/photos/urls.ts` gains:

```ts
/** The 1280.jpg's size: the master scaled down to 1280 wide (never up), or null when unknown. */
export function ogImageSize(photo: Photo): { width: number; height: number } | null
```

`width = min(1280, photo.width)`, `height = round(photo.height × width /
photo.width)`; null when either dimension is unknown. Tests: a 2000×3000
master → 1280×1920; a 1000×1000 master → 1000×1000 (the variant pipeline
is `scale-down`); unknown → null.

Which photo:

- Product page: the color `?color=` names when it exists
  (`initialColor(product, color)` — the same rule the page uses to open
  the gallery), its first photo; if that color has no photos,
  `cardPhoto(product)`; if that is null too, no image. `alt` is
  `"<name> — <color name>"` in the page's language.
- Home page: the first published product in catalog order that has a card
  photo (`cardPhoto`), `alt` the product's name; else the store logo
  (`settings.logo`, `alt` the store name); else no image (Call 5).
- Hidden product: no image (Call 4).

The `og:image` URL is `${origin}${photoOgSrc(photo)}`, the immutable
`/photos/<id>/1280.jpg` route from #3 — JPEG because WhatsApp and
Instagram do not reliably render WebP previews.

## The product page

`src/app/(store)/[lang]/p/[slug]/page.tsx`:

- `load(slug)` keeps its checks (locale, slug shape, then
  `getProductBySlug`, then `getSettings`) and is wrapped in React's
  `cache()` so `generateMetadata` and the page body share one pair of D1
  reads per request instead of two (the reads stay uncached across
  requests; `cache()` is request-scoped). An unknown slug stays
  `notFound()`. A **hidden** product no longer 404s: `load` returns it and
  the two callers branch on `product.published`.
- `generateMetadata` for a published product:
  - `title`: `"<name> — <storeName>"` (unchanged).
  - `ogTitle`: `"<name> — <formatPrice(priceEgp, locale)>"`, e.g.
    `Oversized Tee — 850 EGP` / `تيشيرت أوفر سايز — 850 جنيه`. The price is
    in the title because WhatsApp shows title, description and image, and
    the title is what the eye reads first; the brief's "photo, name and
    price" lands in the first two lines.
  - `description`: the product's description in the page's language, else
    `t.meta.description` (unchanged).
  - `path`: `/p/<slug>`; `ogQuery`: `{ color: initialColor(product,
    color).key }` **only when** `?color=` named an existing color
    (`colorByKey` non-null); otherwise no query, so a plain link's `og:url`
    is the canonical URL.
  - `image`: as "The preview image" says.
  - `other`: `{ "product:price:amount": String(priceEgp),
    "product:price:currency": "EGP" }` — read by Facebook and Pinterest,
    harmless elsewhere.
  - `generateMetadata` receives `searchParams`; `color` is read the same
    way the page reads it (`string | string[] | undefined` → `initialColor`
    accepts that union).
- `generateMetadata` for a hidden product:
  - `title`: `"<t.unavailable.title> — <storeName>"`;
    `description`: `"<name> — <t.unavailable.body>"`; `noindex: true`;
    canonical and `hreflang` as usual (the URL exists in both languages);
    no image, no `ogTitle`, no `other`.
- The page body for a hidden product renders `<Unavailable>` instead of
  `<ProductView>`; `searchParams` are ignored.

`unavailable.tsx` (Server Component, no `"use client"`, no hooks):

```
<main class="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
  <p class="text-sm font-semibold text-muted-foreground">{name}</p>
  <h1 class="text-3xl font-bold">{t.unavailable.title}</h1>
  <p class="text-muted-foreground">{t.unavailable.body}</p>
  <Button asChild><Link href={withLocale(locale, "/")}>{t.unavailable.back}</Link></Button>
</main>
```

The product's name (`nameIn(product, locale)`) is its own line above the
heading, so no message needs interpolation: `messages.test.ts` requires
every leaf of the catalog to be a non-empty string, and that stays true.
Otherwise the same shape as `not-found.tsx`, so the two pages read as
siblings. The header's language toggle still works on it (same path, other
language, same page). Response status is 200 (Call 3).

### Messages

`en.ts`:

```ts
unavailable: { title: "This product is no longer available",
               body: "It has left the shop. Have a look at what's in now.",
               back: "See what's in the shop" },
```

`ar.ts`:

```ts
unavailable: { title: "هذا المنتج لم يعد متاحًا",
               body: "لم يعد في المتجر. شاهد المنتجات المتاحة الآن.",
               back: "شاهد المنتجات المتاحة" },
```

`Messages`' `Widen` type and the two existing tests are untouched.

## The home page

`src/app/(store)/[lang]/page.tsx`'s `generateMetadata` becomes
`storeMetadata({ origin, locale, path: "/", title: storeName,
description: t.meta.description, siteName: storeName, image })` with the
image rule above. It reads `listProducts({ publishedOnly: true })` for the
image — the same read the body does; wrap the body's and metadata's reads
in one `cache()`d `load()` as the product page does, so the home page still
makes one D1 round for products and one for settings.

The store layout's `generateMetadata` stays as it is (title, description).
No `metadataBase`: every URL this design emits is already absolute, so Next
never falls back to `localhost`.

## Streaming metadata off

`next.config.ts` gets `htmlLimitedBots: /.*/` with a comment. Next 16
streams `generateMetadata`'s tags into the `<body>` after the shell unless
the user agent is on its bot list; WhatsApp and Facebook are on it, but
Telegram, iMessage, Snapchat and whatever the owner pastes into next are
not, and a tag in the body is a missing preview for them. Blocking costs
nothing here: every customer page already awaits the same D1 reads before
its first byte (the layout reads settings; the page reads the product),
and `cache()` makes the metadata reads the page's own.

## The order route

`order/route.ts`: `origin: await getSiteOrigin(request.headers)`; the
import of `requestOrigin` goes. The hidden-product branch stays a 404
with `private, no-store` (the dispatcher's instruction: the route refuses
hidden products; the page is where the explanation lives).

## Docs

- `AGENTS.md`, Architecture: one sentence after the product-page sentence:
  absolute URLs (Open Graph, canonical, the message link) come from
  `getSiteOrigin()` in `src/lib/site`, which prefers the `PUBLIC_ORIGIN`
  Worker variable (unset until the domain exists) over the request origin;
  `storeMetadata()` next to it builds every customer page's tags.
  "Things agents get wrong": the hidden-product bullet gains "(`page.tsx`
  branches on `published`; `unavailable.tsx`; the order route still
  404s)"; a new bullet: streaming metadata is off (`htmlLimitedBots:
  /.*/`) so previews work for every fetcher — don't remove it to shave
  TTFB.
- `README.md`: a "When the domain exists" step (the `vars` line, top level
  only, then `pnpm cf-typegen`); and the real-phone checklist gains a
  "paste a product link into a WhatsApp chat with yourself and into an
  Instagram DM: the preview shows the photo, name and price; with
  `?color=` the photo is that color's; a hidden product's link opens the
  'no longer available' page" item, plus the note that Facebook's Sharing
  Debugger (`developers.facebook.com/tools/debug/`) re-scrapes a cached
  preview.

## Checks by hand (before the PR)

1. `pnpm dev`, seeded. `curl -s http://localhost:3000/en/p/oversized-tee |
   grep -o '<meta property="og:[^>]*>\|<link rel="[^>]*>'` — in `<head>`,
   before `<body>`: `og:title` with the price, `og:image` ending in
   `/photos/<id>/1280.jpg`, `og:url` without `?color`, `canonical`, three
   `hreflang`s. Same with `?color=<second color>`: `og:url` has it and
   `og:image` is that color's photo. Same for `/ar/…`: Arabic name,
   `850 جنيه`, `og:locale` `ar_AR`.
2. The same `curl` with `-A "Mozilla/5.0"` (not a bot UA): tags still in
   `<head>`. Repeat it against `pnpm preview` (step 5) to confirm OpenNext
   honours `htmlLimitedBots` in workerd.
3. Hide the product in `/admin`: `/en/p/oversized-tee` → 200, the
   "no longer available" page inside the header and footer, `robots`
   `noindex`, no `og:image`; the button goes to `/en`; the toggle goes to
   `/ar/p/oversized-tee`. `/en/p/oversized-tee/order?...` → 404. Show it
   again.
4. `/en/p/nope` → 404 and the existing not-found page.
5. `pnpm exec opennextjs-cloudflare build && pnpm preview`: the tags on
   `http://localhost:8787` use `http://localhost:8787` as origin. Then with
   `PUBLIC_ORIGIN=https://shop.example` in `.dev.vars`: every absolute URL
   and the message link use `https://shop.example`.
6. On the branch's staging preview URL, paste the link into WhatsApp (chat
   with yourself) and an Instagram DM: photo, name, price. This is the one
   check that cannot run locally; it goes on the README checklist.

## Calls made while planning (open to change)

1. **The origin is a configured value when set, else the request's.**
   The domain is the owner's open question, and this must ship before it
   is answered. A `PUBLIC_ORIGIN` variable that is empty today costs
   nothing, and when the domain exists one `vars` line in `wrangler.jsonc`
   makes production's tags and message links canonical while staging and
   previews keep their own hostnames. Not declared in `wrangler.jsonc` yet,
   so `cf-typegen` has nothing to type; the code reads it loosely. Cost if
   wrong (the owner would rather hard-code the domain): one constant
   replaces the env read.
2. **Streaming metadata is turned off for the whole site.** The default
   bot list misses Telegram, iMessage and others; a missing preview is the
   issue's failure mode and TTFB is unaffected because the pages already
   block on D1. Cost if wrong: if a future static page wants its shell
   streamed first, scope the regex back to a list.
3. **The hidden-product page answers 200, `noindex`.** A `410 Gone` would
   be the exact status, but a Next page can only return 404 (via
   `notFound()`, whose server HTML is the error shell, which is what the
   issue forbids) or 200. Fetchers show the page's own tags either way;
   `noindex` keeps it out of search. Cost if wrong: a Route Handler could
   serve the page with 410 later; nothing else depends on the status.
4. **A hidden product's preview has no image and says it's gone.** A link
   pasted after the product was hidden should not advertise it; old
   stories keep the preview they were posted with. Cost if wrong: one
   `image:` line brings the product photo back.
5. **The home page's preview image is the first catalog card photo, then
   the logo.** The catalog is the product, and the brand guidelines put
   the clothes forward; the logo is a fallback for an empty shop. Cost if
   wrong: swap the two lines.
6. **`og:title` carries the price; `<title>` carries the store name.** Tab
   titles and bookmarks want the store; a pasted preview wants the price
   right under the photo. Cost if wrong: `ogTitle` is optional; drop it.
7. **The order route keeps answering 404 for a hidden product** rather
   than redirecting to the product page. The dispatcher asked for it, and
   the button is never rendered for a hidden product, so only a stale tab
   can reach it. Cost if wrong: a one-line redirect to the slug's page.
8. **The `Unavailable` view mirrors `not-found.tsx`** rather than reusing
   it. The two differ in wording, status and metadata; sharing a component
   for three lines of markup would couple them. Cost: none.
9. **`cache()` around the pages' `load`.** Purely a dedupe within one
   request (metadata + body). Cost if wrong: remove the wrapper; two D1
   reads per request, as today.

## Left to the builder

- Exact test fixtures and file layout inside `src/lib/site/`.
- Whether `ogImageSize` lives in `urls.ts` or `variants.ts` (both pure).
- Reading `searchParams` in `generateMetadata` (`PageProps<...>` already
  types it).
- The `console.warn` wording for a malformed `PUBLIC_ORIGIN`.
