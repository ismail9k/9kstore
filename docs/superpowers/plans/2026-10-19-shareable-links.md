# Shareable Product Links with Link Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every customer page Open Graph, Twitter, `canonical` and `hreflang` tags built from one public-origin rule, make the product page preview the shared color's photo with the name and price, and replace the hidden product's 404 with a "no longer available" page.

**Architecture:** Two pure helpers under `src/lib/site/` do the thinking: `siteOrigin` picks the configured `PUBLIC_ORIGIN` or the request's origin, and `storeMetadata` turns origin + locale + path + copy + photo into a Next `Metadata` object. The product page and the home page call them from `generateMetadata`, share their D1 reads with the page body through React's `cache()`, and the product page branches on `published` to render `unavailable.tsx`. `htmlLimitedBots: /.*/` keeps the tags in the server `<head>` for every fetcher.

**Tech Stack:** Next.js 16.4 App Router (`generateMetadata`, `next/headers`, `next/root-params`) on Cloudflare Workers via `@opennextjs/cloudflare`; React `cache()`; shadcn/ui `Button`; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-shareable-links-design.md`

Intent-Issue: #7 — https://github.com/ismail9k/9kstore/issues/7

## Global Constraints

- Read `AGENTS.md` first. Before Tasks 4–6 read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` ("Streaming metadata", `alternates`, `openGraph`, `twitter`, `robots`, `other`), `05-config/01-next-config-js/htmlLimitedBots.md` and `04-functions/headers.md`. `cacheComponents` stays **off**; no `generateStaticParams`; no `metadataBase`; catalog reads are never cached across requests (`cache()` from `react` is request-scoped and allowed).
- No URL changes: product pages stay `/<lang>/p/<slug>`, `?color=<key>` pre-selects; the order route and the not-found page keep their behavior; the order route still answers 404 for a hidden product.
- Absolute URLs come only from `getSiteOrigin()`; nothing reads `PUBLIC_ORIGIN` or `Host` elsewhere. `PUBLIC_ORIGIN` is **not** added to `wrangler.jsonc` or `cloudflare-env.d.ts`.
- Locale codes: `og:locale` `ar_AR` / `en_US`; `hreflang` `ar`, `en`, `x-default` (→ Arabic). Canonical URLs never carry a query; `og:url` carries `?color=<key>` only when the key names an existing color.
- Preview image: `/photos/<id>/1280.jpg` via `photoOgSrc`; dimensions via `ogImageSize` (width capped at 1280, never upscaled).
- Copy is fixed by the spec's "Messages" section; new keys go in both `src/lib/i18n/messages/en.ts` and `ar.ts` as plain strings (every leaf must stay a non-empty string for `messages.test.ts`).
- Customer pages: logical Tailwind classes only; no `"use client"` or hooks in `unavailable.tsx`; nothing from dnd-kit or `src/app/(admin)`.
- Tests next to the code as `*.test.ts`, logic only; `noUncheckedIndexedAccess` is on; `@/` imports. Before every commit: `pnpm lint && pnpm typecheck && pnpm test` pass.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy`/`pnpm upload`. Never push.

## Review Focus

1. `PUBLIC_ORIGIN` set to `https://shop.example/` or `https://shop.example/en` must yield `https://shop.example` (no trailing slash, no path) — pinned in Task 1.
2. `pnpm preview` sends no `x-forwarded-proto`; `host: localhost:8787` must give `http://localhost:8787`, while `host: 9k-store.example.workers.dev` gives `https://…` — pinned in Task 1.
3. A `?color=` naming an unknown color (or repeated, `?color=a&color=b`) must leave `og:url` canonical and preview the first color's photo — pinned in Task 4 through `colorByKey`/`initialColor` (existing tests) and the hand check.
4. A link that names a color with no photos must fall back to the catalog card photo (`cardPhoto`), and a product with no photos at all must render tags without an `og:image` rather than throw — pinned in Task 3 (`image: null` → no `images`) and Task 4's `preview()` (`chosen.photos[0] ?? cardPhoto(product)`), confirmed by hand in Task 4.
5. A hidden product's `generateMetadata` must not throw on a product with no description or no photos (it uses neither) — pinned in Task 4's hand check with the seed product hidden.

---

### Task 1: The public origin

**Files:**
- Create: `src/lib/site/origin.ts`, `src/lib/site/origin.test.ts`
- Modify: `src/lib/order/decide.ts` (remove `requestOrigin`), `src/lib/order/decide.test.ts` (remove its `describe("requestOrigin")`), `src/app/(store)/[lang]/p/[slug]/order/route.ts:13,34`

**Interfaces:**
- Produces: `siteOrigin(configured: string | undefined, headers: Headers): string` (pure) and `getSiteOrigin(headers?: Headers): Promise<string>` (server; `import "server-only"`; reads `PUBLIC_ORIGIN` like `getSecrets` in `src/lib/auth/secrets.ts`, with `headers` defaulting to `await headers()` from `next/headers`). Tasks 4–5 call `getSiteOrigin()`; the order route calls `getSiteOrigin(request.headers)`.

- [ ] **Step 1: Write the failing tests** in `src/lib/site/origin.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
import { siteOrigin } from "./origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("siteOrigin", () => {
  test("a configured origin wins, reduced to its origin", () => {
    expect(siteOrigin("https://shop.example", h({ host: "x" }))).toBe("https://shop.example");
    expect(siteOrigin("https://shop.example/", h({ host: "x" }))).toBe("https://shop.example");
    expect(siteOrigin(" https://shop.example/en ", h({ host: "x" }))).toBe("https://shop.example");
  });
  test("a malformed configured value is ignored with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(siteOrigin("shop.example", h({ host: "shop.example" }))).toBe("https://shop.example");
    expect(siteOrigin("ftp://shop.example", h({ host: "shop.example" }))).toBe("https://shop.example");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  test("empty or undefined falls through to the request", () => {
    expect(siteOrigin("", h({ host: "shop.example" }))).toBe("https://shop.example");
    expect(siteOrigin(undefined, h({ host: "shop.example" }))).toBe("https://shop.example");
  });
  test("forwarded headers win over host", () =>
    expect(siteOrigin(undefined, h({ "x-forwarded-proto": "https", "x-forwarded-host": "9k.example", host: "internal" }))).toBe("https://9k.example"));
  test("no forwarded proto: http for local hosts, https otherwise", () => {
    expect(siteOrigin(undefined, h({ host: "localhost:8787" }))).toBe("http://localhost:8787");
    expect(siteOrigin(undefined, h({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(siteOrigin(undefined, h({ host: "[::1]:3000" }))).toBe("http://[::1]:3000");
    expect(siteOrigin(undefined, h({ host: "shop.localhost" }))).toBe("http://shop.localhost");
    expect(siteOrigin(undefined, h({ host: "9k-store.example.workers.dev" }))).toBe("https://9k-store.example.workers.dev");
  });
  test("no host at all", () => expect(siteOrigin(undefined, h({}))).toBe("http://localhost:3000"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/lib/site/origin.test.ts`
Expected: FAIL — cannot resolve `./origin`.

- [ ] **Step 3: Implement `siteOrigin` and `getSiteOrigin` in `src/lib/site/origin.ts`**

`siteOrigin`: trim `configured`; `new URL(...)` in a `try`; accept only `http:`/`https:` and return `.origin`; otherwise `console.warn(\`site: ignoring PUBLIC_ORIGIN "${configured}": not an http(s) URL\`)` when it was non-empty, then the request rule from the spec ("The public origin", point 2–3). A local host is `localhost`, `127.0.0.1` or `[::1]`, with or without `:port`, or any host ending in `.localhost` (strip the port before the `.localhost` test; `[::1]` keeps its brackets).

`getSiteOrigin(headers?)`: `import "server-only"`; env via `getCloudflareContext({ async: true })` in a `try` (as `getSecrets`), typed `Partial<CloudflareEnv> & { PUBLIC_ORIGIN?: string }`; `configured = env.PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN`; `headers ??= await (await import("next/headers")).headers()` — or a static import of `headers` from `next/headers`, which is fine in a server-only module. Doc comment: who calls it with what (pages/`generateMetadata` → no argument; Route Handlers → `request.headers`).

- [ ] **Step 4: Move `requestOrigin` out**

Delete `requestOrigin` from `src/lib/order/decide.ts` and its `describe` block from `decide.test.ts` (drop `requestOrigin` from that import). In `order/route.ts`: import `getSiteOrigin` from `@/lib/site/origin`, drop `requestOrigin` from the `@/lib/order/decide` import, and set `origin: await getSiteOrigin(request.headers)` inside the existing `try`.

- [ ] **Step 5: Run the checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass; `origin.test.ts` 7 tests green; `decide.test.ts` still green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/site/origin.ts src/lib/site/origin.test.ts src/lib/order/decide.ts src/lib/order/decide.test.ts "src/app/(store)/[lang]/p/[slug]/order/route.ts"
git commit -m "feat(site): one public-origin rule (PUBLIC_ORIGIN, else the request) for the order link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The preview image's size

**Files:**
- Modify: `src/lib/photos/urls.ts`, `src/lib/photos/urls.test.ts`

**Interfaces:**
- Produces: `ogImageSize(photo: Photo): { width: number; height: number } | null`. Task 4–5 pass its result (spread) into `PreviewImage`.

- [ ] **Step 1: Write the failing test** in `urls.test.ts` (reuse the file's `p(w, h)` helper)

```ts
test("ogImageSize scales the master down to 1280 wide, never up, null when unknown", () => {
  expect(ogImageSize(p(2000, 3000))).toEqual({ width: 1280, height: 1920 });
  expect(ogImageSize(p(1000, 1000))).toEqual({ width: 1000, height: 1000 });
  expect(ogImageSize(p(1500, 1000))).toEqual({ width: 1280, height: 853 });
  expect(ogImageSize(p(1000))).toBeNull();
  expect(ogImageSize(p())).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/photos/urls.test.ts`
Expected: FAIL — `ogImageSize` is not exported.

- [ ] **Step 3: Implement `ogImageSize` in `urls.ts`** next to `photoOgSrc`, using `OG_VARIANT.width` as the cap and `Math.round` for the height.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/lib/photos/urls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photos/urls.ts src/lib/photos/urls.test.ts
git commit -m "feat(photos): ogImageSize for the link-preview JPEG's dimensions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The metadata builder

**Files:**
- Create: `src/lib/site/metadata.ts`, `src/lib/site/metadata.test.ts`

**Interfaces:**
- Consumes: `withLocale`, `otherLocale`, `LOCALES`, `DEFAULT_LOCALE`, `Locale` from `@/lib/i18n/locales`; `Metadata` from `next`.
- Produces:

```ts
export type PreviewImage = { src: string; width?: number; height?: number; alt: string };
export type StoreMetadataInput = {
  origin: string; locale: Locale; path: string; ogQuery?: Record<string, string>;
  title: string; ogTitle?: string; description: string; siteName: string;
  image?: PreviewImage | null; noindex?: boolean; other?: Record<string, string>;
};
export function storeMetadata(input: StoreMetadataInput): Metadata;
export const OG_LOCALES: Record<Locale, string>;   // { ar: "ar_AR", en: "en_US" }
```

- [ ] **Step 1: Write the failing tests** in `metadata.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { storeMetadata } from "./metadata";

const base = { origin: "https://shop.example", title: "Oversized Tee — 9k Store", description: "A tee.", siteName: "9k Store" };
const og = (m: ReturnType<typeof storeMetadata>) => m.openGraph as Record<string, unknown>;

describe("storeMetadata", () => {
  test("canonical and hreflang are absolute and query-free; og:url carries the query", () => {
    const m = storeMetadata({ ...base, locale: "en", path: "/p/oversized-tee", ogQuery: { color: "black" } });
    expect(m.alternates?.canonical).toBe("https://shop.example/en/p/oversized-tee");
    expect(m.alternates?.languages).toEqual({
      ar: "https://shop.example/ar/p/oversized-tee",
      en: "https://shop.example/en/p/oversized-tee",
      "x-default": "https://shop.example/ar/p/oversized-tee",
    });
    expect(og(m).url).toBe("https://shop.example/en/p/oversized-tee?color=black");
  });
  test("no query or an empty query leaves og:url canonical; the home path is /<lang>", () => {
    expect(og(storeMetadata({ ...base, locale: "ar", path: "/" })).url).toBe("https://shop.example/ar");
    expect(og(storeMetadata({ ...base, locale: "ar", path: "/", ogQuery: {} })).url).toBe("https://shop.example/ar");
  });
  test("locales", () => {
    const m = storeMetadata({ ...base, locale: "ar", path: "/" });
    expect(og(m).locale).toBe("ar_AR");
    expect(og(m).alternateLocale).toEqual(["en_US"]);
    expect(og(m).siteName).toBe("9k Store");
    expect(og(m).type).toBe("website");
  });
  test("titles: og:title and twitter:title follow ogTitle, <title> does not", () => {
    const m = storeMetadata({ ...base, locale: "en", path: "/p/t", ogTitle: "Oversized Tee — 850 EGP" });
    expect(m.title).toBe("Oversized Tee — 9k Store");
    expect(og(m).title).toBe("Oversized Tee — 850 EGP");
    expect((m.twitter as Record<string, unknown>).title).toBe("Oversized Tee — 850 EGP");
    expect((m.twitter as Record<string, unknown>).card).toBe("summary_large_image");
  });
  test("image: absolute, with dimensions when known, in both og and twitter; absent otherwise", () => {
    const withSize = storeMetadata({ ...base, locale: "en", path: "/p/t", image: { src: "/photos/k/1280.jpg", width: 1280, height: 1920, alt: "Oversized Tee — Black" } });
    expect(og(withSize).images).toEqual([{ url: "https://shop.example/photos/k/1280.jpg", width: 1280, height: 1920, alt: "Oversized Tee — Black" }]);
    expect((withSize.twitter as Record<string, unknown>).images).toEqual(["https://shop.example/photos/k/1280.jpg"]);
    const noSize = storeMetadata({ ...base, locale: "en", path: "/p/t", image: { src: "/photos/k/1280.jpg", alt: "x" } });
    expect(og(noSize).images).toEqual([{ url: "https://shop.example/photos/k/1280.jpg", alt: "x" }]);
    const none = storeMetadata({ ...base, locale: "en", path: "/p/t", image: null });
    expect(og(none)).not.toHaveProperty("images");
    expect(none.twitter).not.toHaveProperty("images");
  });
  test("noindex and other", () => {
    const m = storeMetadata({ ...base, locale: "en", path: "/p/t", noindex: true, other: { "product:price:amount": "850" } });
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.other).toEqual({ "product:price:amount": "850" });
    expect(storeMetadata({ ...base, locale: "en", path: "/p/t" })).not.toHaveProperty("robots");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/lib/site/metadata.test.ts`
Expected: FAIL — cannot resolve `./metadata`.

- [ ] **Step 3: Implement `storeMetadata` in `metadata.ts`** exactly as the spec's "The metadata builder" lists: build `canonical = origin + withLocale(locale, path)`; `languages` from `LOCALES` plus `"x-default"` → `DEFAULT_LOCALE`'s URL; `og:url` = canonical + (`ogQuery` with at least one key ? `?${new URLSearchParams(ogQuery)}` : ``); `openGraph` with `title: ogTitle ?? title`, `description`, `url`, `siteName`, `locale: OG_LOCALES[locale]`, `alternateLocale: [OG_LOCALES[otherLocale(locale)]]`, `type: "website"`, and `images` only when `image` is set (`url: origin + image.src`, `alt`, `width`/`height` only when defined); `twitter` with `card`, `title`, `description`, and `images: [url]` only when `image` is set; `robots: { index: false, follow: true }` only when `noindex`; `other` only when given. Pure: no `next/headers`, no catalog imports.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test src/lib/site/metadata.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/site/metadata.ts src/lib/site/metadata.test.ts
git commit -m "feat(site): storeMetadata builds canonical, hreflang, Open Graph and Twitter tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The product page: previews and the "no longer available" page

**Files:**
- Create: `src/app/(store)/[lang]/p/[slug]/unavailable.tsx`
- Modify: `src/app/(store)/[lang]/p/[slug]/page.tsx`, `src/lib/i18n/messages/en.ts`, `src/lib/i18n/messages/ar.ts`

**Interfaces:**
- Consumes: `getSiteOrigin()` (Task 1), `ogImageSize` (Task 2), `storeMetadata`/`PreviewImage` (Task 3); `initialColor`, `colorByKey`, `cardPhoto`, `nameIn` from `@/lib/catalog`; `photoOgSrc` from `@/lib/photos/urls`; `formatPrice` from `@/lib/i18n/format`; `cache` from `react`.
- Produces: `Unavailable({ name, locale }: { name: string; locale: Locale })` (Server Component, default `<main>` as the spec's markup); `Messages.unavailable: { title; body; back }`.

- [ ] **Step 1: Add the messages**

`en.ts`, after `notFound`:
```ts
unavailable: { title: "This product is no longer available",
               body: "It has left the shop. Have a look at what's in now.",
               back: "See what's in the shop" },
```
`ar.ts`, same position:
```ts
unavailable: { title: "هذا المنتج لم يعد متاحًا",
               body: "لم يعد في المتجر. شاهد المنتجات المتاحة الآن.",
               back: "شاهد المنتجات المتاحة" },
```

Run: `pnpm test src/lib/i18n/messages.test.ts` — Expected: PASS (same keys, all strings).

- [ ] **Step 2: Create `unavailable.tsx`**

The spec's markup under "The product page": `<main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">` with the name line (`text-sm font-semibold text-muted-foreground`), `<h1 className="text-3xl font-bold">`, the body `<p className="text-muted-foreground">`, and `<Button asChild><Link href={withLocale(locale, "/")}>…</Link></Button>` — the same imports as `not-found.tsx`. `t = getMessages(locale)`.

- [ ] **Step 3: Rework `page.tsx`**

- `load = cache(async (slug: string) => …)`: keep the locale and slug checks and `notFound()` for an unknown product; **drop** the `!product.published` 404. Return `{ locale, product, settings }`.
- A small local `preview(product, locale, color)`: `const named = typeof color === "string" ? colorByKey(product, color) : null; const chosen = named ?? initialColor(product, undefined); const photo = chosen.photos[0] ?? cardPhoto(product);` → `{ ogQuery: named ? { color: named.key } : undefined, image: photo ? { src: photoOgSrc(photo), ...(ogImageSize(photo) ?? {}), alt: \`${nameIn(product, locale)} — ${nameIn(chosen, locale)}\` } : null }`.
- `generateMetadata({ params, searchParams })`: `const { color } = await searchParams;` then `const origin = await getSiteOrigin();` and:
  - published: `storeMetadata({ origin, locale, path: \`/p/${product.slug}\`, ...preview(...), title: \`${name} — ${settings.storeName}\`, ogTitle: \`${name} — ${formatPrice(product.priceEgp, locale)}\`, description: (locale === "ar" ? product.descriptionAr : product.descriptionEn) || t.meta.description, siteName: settings.storeName, other: { "product:price:amount": String(product.priceEgp), "product:price:currency": "EGP" } })`.
  - hidden: `storeMetadata({ origin, locale, path, title: \`${t.unavailable.title} — ${settings.storeName}\`, description: \`${name} — ${t.unavailable.body}\`, siteName: settings.storeName, noindex: true })`.
- The page body: `if (!product.published) return <Unavailable name={nameIn(product, locale)} locale={locale} />;` before the existing `<main>`.

- [ ] **Step 4: Run the checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 5: Check by hand** (`pnpm dev`, local D1 seeded with `pnpm db:seed:local` and `pnpm photos:seed:local`)

```sh
curl -s http://localhost:3000/en/p/oversized-tee | tr '>' '>\n' | grep -E 'og:|twitter:|rel="(canonical|alternate)"|name="robots"|<body'
```
Expected, all **before** the `<body` line: `og:title` `Oversized Tee — 850 EGP`; `og:url` `http://localhost:3000/en/p/oversized-tee` (no query); `og:image` ending in `/1280.jpg` with `og:image:width`/`height`; `og:locale` `en_US`; `canonical`; `hreflang="ar"`, `"en"`, `"x-default"` (→ `/ar/…`); `twitter:card` `summary_large_image`; `product:price:amount` `850`. Then with `?color=<the seed's second color key>`: `og:url` carries `?color=…` and `og:image` is that color's photo. Then `/ar/p/oversized-tee`: the Arabic name, `850 جنيه`, `og:locale` `ar_AR`. Then `?color=nope`: `og:url` has no query. Then hide the product in `/admin`: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/en/p/oversized-tee` → `200`; the page shows the name line, the heading, the body and the button to `/en` inside the header and footer; the head has `name="robots" content="noindex, follow"` and no `og:image`; the toggle goes to `/ar/p/oversized-tee`; `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/en/p/oversized-tee/order?color=black&size=M&price=850'` → `404`. Show the product again. `/en/p/nope` → `404` with the existing not-found page.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(store)/[lang]/p/[slug]/page.tsx" "src/app/(store)/[lang]/p/[slug]/unavailable.tsx" src/lib/i18n/messages/en.ts src/lib/i18n/messages/ar.ts
git commit -m "feat(store): product link previews with the shared color's photo; hidden products say no longer available

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The home page's tags

**Files:**
- Modify: `src/app/(store)/[lang]/page.tsx`

**Interfaces:**
- Consumes: `getSiteOrigin()`, `storeMetadata`, `ogImageSize`, `cardPhoto`, `photoOgSrc`, `cache`.

- [ ] **Step 1: Share the reads** — `const load = cache(async () => { locale check; const [settings, products] = await Promise.all([getSettings(), listProducts({ publishedOnly: true })]); return { locale, settings, products }; })`, used by both `generateMetadata` and `Home`.

- [ ] **Step 2: The image rule** — a local `homePreview(products, settings, locale): PreviewImage | null`: the first product in `products` with a non-null `cardPhoto` → `{ src: photoOgSrc(photo), ...(ogImageSize(photo) ?? {}), alt: nameIn(product, locale) }`; else `settings.logo` → the same with `alt: settings.storeName`; else `null`.

- [ ] **Step 3: `generateMetadata`** → `storeMetadata({ origin: await getSiteOrigin(), locale, path: "/", title: settings.storeName, description: t.meta.description, siteName: settings.storeName, image: homePreview(...) })`.

- [ ] **Step 4: Run the checks and look**

Run: `pnpm lint && pnpm typecheck && pnpm test`, then the Task 4 `curl` against `http://localhost:3000/ar` and `/en`.
Expected: `canonical` `…/ar` and `…/en`, three `hreflang`s, `og:image` the seed tee's first photo, `og:title` the store name, no `robots` tag.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(store)/[lang]/page.tsx"
git commit -m "feat(store): home page canonical, hreflang and Open Graph tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tags in the head for every fetcher, and the docs

**Files:**
- Modify: `next.config.ts`, `.dev.vars.example`, `README.md` (First-time setup; "Owner follow-up: test the order button on real phones"), `AGENTS.md` (Architecture; "Things agents get wrong")

- [ ] **Step 1: `next.config.ts`** — add `htmlLimitedBots: /.*/,` with a comment: streaming metadata would put `generateMetadata`'s tags in the `<body>` for user agents off Next's bot list (Telegram, iMessage…), and a tag outside `<head>` is a missing link preview; every customer page already blocks on D1 before its first byte, so this costs no TTFB.

- [ ] **Step 2: `.dev.vars.example`** — append:
```
# The site's public origin for link-preview tags and the WhatsApp message's
# link, e.g. https://shop.example. Leave unset to use the request's origin
# (right for local, previews and staging). Production sets it in
# wrangler.jsonc's top-level "vars" once the domain exists.
# PUBLIC_ORIGIN=
```

- [ ] **Step 3: README** — in "First-time setup", a new numbered step after the secrets step: **When the domain exists**, add `"vars": { "PUBLIC_ORIGIN": "https://<domain>" }` at the **top level only** of `wrangler.jsonc` (staging and previews keep the request origin), run `pnpm cf-typegen`, and commit both. In the real-phone checklist, a new item: paste `/en/p/<slug>` and `/ar/p/<slug>` into a WhatsApp chat with yourself and into an Instagram DM — the preview shows the photo, name and price in that language; with `?color=<key>` the photo is that color's; a hidden product's link opens the "no longer available" page with the catalog button. Note that WhatsApp and Facebook cache previews; Facebook's Sharing Debugger (`https://developers.facebook.com/tools/debug/`) re-scrapes one.

- [ ] **Step 4: AGENTS.md** — Architecture, after the product-page/order-route sentence: "Absolute URLs — Open Graph and canonical tags, the message's link — come from `getSiteOrigin()` in `src/lib/site/origin.ts`, which prefers the `PUBLIC_ORIGIN` Worker variable (unset until the domain exists) over the request origin; `storeMetadata()` beside it builds every customer page's tags." "Things agents get wrong": extend the sold-out/hidden bullet with "(`p/[slug]/page.tsx` branches on `published` and renders `unavailable.tsx` with a 200 and `noindex`; the order route still answers 404)"; add a bullet: "**Streaming metadata is off** (`htmlLimitedBots: /.*/` in `next.config.ts`) so link-preview tags land in `<head>` for every fetcher, not only Next's bot list. Don't remove it to shave TTFB; the pages block on D1 anyway."

- [ ] **Step 5: Verify in dev and in workerd**

Run: `pnpm lint && pnpm typecheck && pnpm test`. Then `pnpm dev` and the Task 4 `curl` with `-A "Mozilla/5.0"` — Expected: the tags still precede `<body`. Then `pnpm exec opennextjs-cloudflare build && pnpm preview` and the same two `curl`s against `http://localhost:8787/en/p/oversized-tee` — Expected: tags in `<head>` for both user agents; every absolute URL starts with `http://localhost:8787`. Then add `PUBLIC_ORIGIN=https://shop.example` to `.dev.vars`, rerun `pnpm preview` — Expected: every absolute URL starts with `https://shop.example`, and the order route's `Location` (`curl -sI '…/order?color=…&size=…&price=850'`) carries a `wa.me` text with `https://shop.example/en/p/oversized-tee?color=…`. Remove the line again.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts .dev.vars.example README.md AGENTS.md
git commit -m "feat(site): link-preview tags block in the head for every fetcher; PUBLIC_ORIGIN and the sharing checklist documented

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
