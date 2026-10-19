# Catalog Home Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder home route with the brand's catalog page — header, the hanging-rail hero for the featured product, a grid of every published product (sold-out ones marked, hidden ones absent) in the owner's order, and a footer with Instagram and WhatsApp links — fast on a 4G phone and correct in Arabic and English.

**Architecture:** A Server Component page under `src/app/(store)/[lang]/` reads `listProducts({ publishedOnly: true })` once per request and derives the featured product and rail from pure helpers in `src/lib/catalog/helpers.ts`. The hero, rail and card are small server components next to the page; the footer is a site component rendered by the store root layout. `listProducts` learns to skip and log a corrupt row through a pure `parseProductRows`. No new client JavaScript, no new dependency.

**Tech Stack:** Next.js 16.4 App Router (Server Components, `next/root-params`, `next/link`) on Cloudflare Workers via `@opennextjs/cloudflare`; Tailwind 4 with the brand tokens in `globals.css`; shadcn/ui `Badge` and `Button`; the existing `<Photo>`, `<Price>`, `<Ltr>`; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-catalog-home-design.md`

Intent-Issue: #4 — https://github.com/ismail9k/9kstore/issues/4

## Global Constraints

- Read `AGENTS.md` first. Before touching `page.tsx`/`layout.tsx`, read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` and `next-root-params.md`. `cacheComponents` stays **off**; no `generateStaticParams`; catalog reads are never cached.
- Customer pages: logical Tailwind classes only (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`, never `pl-`/`pr-`/`left-`/`right-`/`text-left`); every price through `<Price>`; no `"use client"` added anywhere in this plan; nothing from dnd-kit or `src/app/(admin)` imported by customer code.
- Brand: green (`text-primary`/`bg-primary`) only on the wordmark, the headline's second line, prices, the one primary button and focus rings. Sold out is near-black on off-white (`bg-foreground text-background`), never red. Photo tiles are `bg-muted` with `rounded-[10px]`. No borders or shadows on cards. Arabic is never letter-spaced: `uppercase tracking-[0.2em]` only when `locale === "en"`.
- Copy is fixed by the spec's "Messages" section, in both `src/lib/i18n/messages/en.ts` and `ar.ts`; `product.soldOut` and `price.unit` are reused, not re-added.
- Links: product page `withLocale(locale, "/p/<slug>")`; rail tee `withLocale(locale, "/p/<slug>", "?color=<colorKey>")`; Instagram `settings.instagramUrl`; WhatsApp `https://wa.me/<settings.whatsappNumber>`; external links `target="_blank" rel="noopener"`.
- `<Photo>` `sizes`: rail `"(min-width: 1024px) 224px, (min-width: 640px) 30vw, 46vw"` with `priority`; card `"(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"` lazy.
- `RAIL_MAX = 4`. Rail photo = a color's second photo when it has two or more, else its first.
- Tests next to the code as `*.test.ts`, logic only; `noUncheckedIndexedAccess` is on; `@/` imports. Before every commit: `pnpm lint && pnpm typecheck && pnpm test` pass.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy`/`pnpm upload`. Never push.

## Review Focus

1. A product whose first color has no photos but whose second color does must still show a card with the empty tile (not crash, not show the second color's photo): `cardPhoto` already returns `null`; the card renders the bare tile — pinned by the `ProductCard` null branch in Task 4 and checked by hand in Task 6.
2. A product with one photo per color must still hang on the rail (the flat shot), and a color with no photos must be skipped without shifting the others' `?color=` keys — pinned in Task 1 (`railPhoto` one-photo case, `railItems` skips photoless).
3. The first product in order with no photos at all must not blank the hero; the next product with photos is featured — pinned in Task 1 (`featuredProduct` skips).
4. One row with invalid JSON or a negative price must not take down `/ar`, `/en` or `/admin`; the other products render and the Worker log names the id — pinned in Task 2 (`parseProductRows`), plus the manual check in Task 6.
5. Empty settings (`instagramUrl === ""`, `whatsappNumber === ""`) must not render a dead link: the footer omits that link and still shows the hairline and store name — pinned by the `SiteFooter` conditionals in Task 5 and checked by hand in Task 6.

---

### Task 1: Catalog helpers for the home page

**Files:**
- Modify: `src/lib/catalog/helpers.ts`
- Test: `src/lib/catalog/helpers.test.ts`

**Interfaces:**
- Consumes: `Color`, `Photo`, `Product` from `./schema`; `type Locale` from `@/lib/i18n/locales`.
- Produces:
  - `export const RAIL_MAX = 4;`
  - `export function nameIn(item: { nameAr: string; nameEn: string }, locale: Locale): string`
  - `export function railPhoto(color: Color): Photo | null`
  - `export function railItems(product: Pick<Product, "colors">): { color: Color; photo: Photo }[]`
  - `export function featuredProduct(products: Product[]): Product | null`

- [ ] **Step 1: Write the failing tests**

Append to `helpers.test.ts`, reusing its `color(key, photos)` factory (add a `product(colors)` factory that fills the other `Product` fields with the values from `rows.test.ts`'s `fullProduct()`):

```ts
describe("nameIn", () => {
  test("picks Arabic for ar", () => expect(nameIn({ nameAr: "أسود", nameEn: "Black" }, "ar")).toBe("أسود"));
  test("picks English for en", () => expect(nameIn({ nameAr: "أسود", nameEn: "Black" }, "en")).toBe("Black"));
});

describe("railPhoto", () => {
  const flat = { key: "flat" }, hanger = { key: "hanger" };
  test("is the second photo when there are two", () => expect(railPhoto(color("c", [flat, hanger]))).toEqual(hanger));
  test("is the first photo when there is one", () => expect(railPhoto(color("c", [flat]))).toEqual(flat));
  test("is null with no photos", () => expect(railPhoto(color("c"))).toBeNull());
});

describe("railItems", () => {
  test("skips photoless colors and keeps the owner's order", () => {
    const items = railItems({ colors: [color("a"), color("b", [{ key: "b1" }]), color("c", [{ key: "c1" }, { key: "c2" }])] });
    expect(items.map((i) => [i.color.key, i.photo.key])).toEqual([["b", "b1"], ["c", "c2"]]);
  });
  test("caps at RAIL_MAX", () => {
    const colors = ["a", "b", "c", "d", "e"].map((k) => color(k, [{ key: k }]));
    expect(railItems({ colors }).map((i) => i.color.key)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("featuredProduct", () => {
  test("is the first product with a rail item", () => {
    const bare = product([color("a")]);
    const shot = product([color("a", [{ key: "a1" }])]);
    expect(featuredProduct([bare, shot])).toBe(shot);
  });
  test("is null when no product has a photo", () => expect(featuredProduct([product([color("a")])])).toBeNull());
  test("is null for an empty catalog", () => expect(featuredProduct([])).toBeNull());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/catalog/helpers.test.ts`
Expected: FAIL — `nameIn`, `railPhoto`, `railItems`, `featuredProduct` are not exported.

- [ ] **Step 3: Implement the four functions and `RAIL_MAX` in `helpers.ts`**

`railPhoto`: `color.photos[1] ?? color.photos[0] ?? null`. `railItems`: map colors to `{ color, photo }` where `railPhoto` is non-null, then `slice(0, RAIL_MAX)`. `featuredProduct`: `products.find((p) => railItems(p).length > 0) ?? null`. Import `type Locale` from `@/lib/i18n/locales` (a type-only import keeps the module pure).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/catalog/helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/helpers.ts src/lib/catalog/helpers.test.ts
git commit -m "feat(catalog): name by locale, rail photos and the featured product

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `listProducts` tolerates a corrupt row

**Files:**
- Modify: `src/lib/catalog/rows.ts` (add `parseProductRows`; reword the header comment: a corrupt row throws from `rowToProduct`, and `parseProductRows` collects such failures for list reads)
- Modify: `src/lib/catalog/repo.ts:110-117` (`listProducts`)
- Test: `src/lib/catalog/rows.test.ts`

**Interfaces:**
- Produces: `export function parseProductRows(rows: ProductRow[]): { products: Product[]; rejected: { id: string; reason: string }[] }`

- [ ] **Step 1: Write the failing tests**

Append to `rows.test.ts`, reusing `fullProduct()` and `productToRow`:

```ts
describe("parseProductRows", () => {
  test("returns every good row with nothing rejected", () => {
    const row = productToRow(fullProduct());
    expect(parseProductRows([row])).toEqual({ products: [fullProduct()], rejected: [] });
  });
  test("skips a row with invalid JSON and names it", () => {
    const good = productToRow(fullProduct());
    const bad = { ...productToRow(fullProduct()), id: "bad-json", colors: "{not json" };
    const result = parseProductRows([bad, good]);
    expect(result.products.map((p) => p.id)).toEqual([good.id]);
    expect(result.rejected).toEqual([{ id: "bad-json", reason: expect.stringContaining("colors") }]);
  });
  test("skips a row that fails the schema", () => {
    const bad = { ...productToRow(fullProduct()), id: "bad-price", price_egp: -1 };
    const result = parseProductRows([bad]);
    expect(result.products).toEqual([]);
    expect(result.rejected[0]?.id).toBe("bad-price");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/catalog/rows.test.ts`
Expected: FAIL — `parseProductRows` is not exported.

- [ ] **Step 3: Implement `parseProductRows` in `rows.ts`**

Loop the rows; `try { products.push(rowToProduct(row)) } catch (err) { rejected.push({ id: row.id, reason: err instanceof Error ? err.message : String(err) }) }`. A zod error's `message` already names the failing path.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/catalog/rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in `listProducts`**

In `repo.ts`, replace `results.map(rowToProduct)` with `parseProductRows(results)`; for each rejected entry `console.error(\`catalog: skipping product ${id}: ${reason}\`)`; return `products`. Update the function's doc comment: a row that fails to parse is skipped and logged so one bad row cannot blank the catalog; `getProduct`/`getProductBySlug` still throw.

- [ ] **Step 6: Verify the whole suite, lint and types**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog/rows.ts src/lib/catalog/rows.test.ts src/lib/catalog/repo.ts
git commit -m "fix(catalog): skip and log a corrupt row instead of failing the whole list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Messages for the home page and footer

**Files:**
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ar.ts`
- Test: `src/lib/i18n/messages.test.ts` (existing; no change)

**Interfaces:**
- Produces on `Messages`: `home.eyebrow`, `home.headlineTop`, `home.headlineAccent`, `home.viewProduct`, `home.empty`, `footer.instagram`, `footer.whatsapp`.

- [ ] **Step 1: Add the English keys to `en.ts`**

```ts
home: { eyebrow: "New drop", headlineTop: "Made for", headlineAccent: "every day.",
        viewProduct: "View product", empty: "Nothing here yet — follow us on Instagram." },
footer: { instagram: "Instagram", whatsapp: "WhatsApp" },
```

- [ ] **Step 2: Run the message test to see the Arabic side fail**

Run: `pnpm typecheck`
Expected: FAIL — `ar` no longer satisfies `Messages` (missing `home`, `footer`).

- [ ] **Step 3: Add the Arabic keys to `ar.ts`**

```ts
home: { eyebrow: "إصدار جديد", headlineTop: "صُنع", headlineAccent: "لكل يوم.",
        viewProduct: "شاهد المنتج", empty: "لا توجد منتجات بعد — تابعونا على إنستجرام." },
footer: { instagram: "إنستجرام", whatsapp: "واتساب" },
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test src/lib/i18n/messages.test.ts`
Expected: PASS (same keys in both, no empty strings).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/messages/en.ts src/lib/i18n/messages/ar.ts
git commit -m "feat(i18n): home page and footer strings in both languages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The home page — hero, rail and grid

**Files:**
- Modify: `src/app/(store)/[lang]/page.tsx`
- Create: `src/app/(store)/[lang]/hero.tsx`
- Create: `src/app/(store)/[lang]/rail.tsx`
- Create: `src/app/(store)/[lang]/product-card.tsx`
- Modify: `src/components/photo.tsx` (doc comment only: catalog cards are lazy; the rail's photos are the `priority` ones)

**Interfaces:**
- Consumes: Task 1's `nameIn`, `railItems`, `featuredProduct`; `cardPhoto`, `isSoldOut`, `listProducts`, `getSettings` from `@/lib/catalog`; `withLocale`, `isLocale`, `type Locale` from `@/lib/i18n/locales`; `getMessages`; `<Photo>`, `<Price>`, `Badge`, `Button`; Task 3's keys.
- Produces (server components, no `"use client"`):
  - `Hero({ product, locale, t }: { product: Product; locale: Locale; t: Messages })` in `hero.tsx`
  - `Rail({ product, locale }: { product: Product; locale: Locale })` in `rail.tsx`
  - `ProductCard({ product, locale, soldOutLabel }: { product: Product; locale: Locale; soldOutLabel: string })` in `product-card.tsx`
  - `SoldOutBadge({ label }: { label: string })` exported from `product-card.tsx` (used by the hero too)

- [ ] **Step 1: Write `product-card.tsx`**

`SoldOutBadge`: `<Badge className="bg-foreground text-background">{label}</Badge>`.
`ProductCard`: a `next/link` to `withLocale(locale, \`/p/${product.slug}\`)` with `className="group block rounded-[10px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"`. Inside: `<div className="relative aspect-square overflow-hidden rounded-[10px] bg-muted">` holding `<Photo photo={photo} alt={name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="size-full object-contain" />` when `cardPhoto(product)` is non-null (nothing otherwise), and `<div className="absolute top-2 start-2"><SoldOutBadge … /></div>` when `isSoldOut(product)`; then `<p className="mt-2 line-clamp-2 text-sm font-bold">{name}</p>` and `<Price value={product.priceEgp} locale={locale} className="mt-0.5 block text-sm font-semibold text-primary" />`.

- [ ] **Step 2: Write `rail.tsx`**

A `<div dir="ltr" className="relative inset-x-1/2 -mx-[50vw] w-screen overflow-x-hidden">` (full bleed). Inside, the bar: `<div aria-hidden className="h-[3px] w-full rounded-full bg-gradient-to-b from-[#8a8a8a] to-foreground" />`. Below it, `<div className="flex justify-center">` with one `<Link>` per `railItems(product)` entry: `href={withLocale(locale, \`/p/${product.slug}\`, \`?color=${color.key}\`)}`, `aria-label={\`${nameIn(product, locale)} — ${nameIn(color, locale)}\`}`, `className="-mx-[4vw] block w-[46vw] shrink-0 sm:w-[30vw] lg:-mx-4 lg:w-56"`, containing `<Photo photo={photo} alt="" sizes="(min-width: 1024px) 224px, (min-width: 640px) 30vw, 46vw" priority className="w-full" />`. The tees' box tops sit directly under the bar (no gap), so the hook at the top center of each cutout meets the bar.

- [ ] **Step 3: Write `hero.tsx`**

`<section className="flex flex-col items-center gap-4 pt-8 text-center">`:
- eyebrow `<p className={cn("text-sm font-semibold text-muted-foreground", locale === "en" && "uppercase tracking-[0.2em]")}>{t.home.eyebrow}</p>` (`cn` from `cn`, as the ui components do);
- headline `<h1 className="text-4xl font-bold leading-[1.05] md:text-6xl">{t.home.headlineTop}<br />
  <span className="text-primary">{t.home.headlineAccent}</span></h1>`;
- `<Rail product={product} locale={locale} />`;
- name row: `<p className="flex items-center gap-2 text-xl font-bold">{nameIn(product, locale)}{isSoldOut(product) && <SoldOutBadge label={t.product.soldOut} />}</p>`;
- `<Price value={product.priceEgp} locale={locale} className="font-semibold text-primary" />`;
- `<Button asChild size="lg"><Link href={withLocale(locale, \`/p/${product.slug}\`)}>{t.home.viewProduct}</Link></Button>`.

- [ ] **Step 4: Rewrite `page.tsx`**

```tsx
export async function generateMetadata(): Promise<Metadata>  // storeName + t.meta.description, as layout.tsx does
export default async function Home()
```
Body: `const locale = await lang(); if (!isLocale(locale)) notFound();` then `const [t, products] = [getMessages(locale), await listProducts({ publishedOnly: true })]`, `const featured = featuredProduct(products)`. Render `<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-16">`: `featured && <Hero … />`; then, if `products.length === 0`, `<p className="py-16 text-center text-muted-foreground">{t.home.empty}</p>`, else `<ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">` with an `<li>` per product holding `<ProductCard … soldOutLabel={t.product.soldOut} />`.

- [ ] **Step 5: Update the `<Photo>` doc comment**

In `src/components/photo.tsx`, change the `sizes` guidance bullet for catalog cards to say they are lazy, and add that the home page's rail tees use `"(min-width: 1024px) 224px, (min-width: 640px) 30vw, 46vw"` with `priority`.

- [ ] **Step 6: Verify in the dev server**

Run: `pnpm db:migrate:local && pnpm db:seed:local && pnpm photos:seed:local && pnpm dev`, open `http://localhost:3000/ar` at a 390 px viewport.
Expected: eyebrow in Arabic at normal spacing; two-line headline, second line green; the bar across the full width; four tees hanging from it, overlapping, the outer two cut by the viewport edges, no horizontal page scroll; "تيشيرت أوفر سايز" then "850 جنيه" in green; the pill "شاهد المنتج"; one card with the flat grey tee on a `#E7E2DA` tile, the name and "850 جنيه". `/en`: eyebrow uppercase and letter-spaced, "850 EGP". Tapping a tee goes to `/ar/p/oversized-tee?color=grey` (the not-found page until #5). In DevTools, the four rail requests are `640.webp` or smaller with `fetchpriority=high`; the card request is lazy.

- [ ] **Step 7: Lint, types, tests**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(store)/[lang]/page.tsx" "src/app/(store)/[lang]/hero.tsx" "src/app/(store)/[lang]/rail.tsx" "src/app/(store)/[lang]/product-card.tsx" src/components/photo.tsx
git commit -m "feat(store): catalog home with the hanging-rail hero and the product grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The footer and the admin's photo hint

**Files:**
- Create: `src/components/site/site-footer.tsx`
- Modify: `src/app/(store)/[lang]/layout.tsx`
- Modify: `src/app/(admin)/admin/products/colors-editor.tsx:202-204` (the "Photos" label)

**Interfaces:**
- Consumes: `Settings` from `@/lib/catalog`; `getMessages`; `type Locale`.
- Produces: `SiteFooter({ locale, settings }: { locale: Locale; settings: Settings })`.

- [ ] **Step 1: Write `site-footer.tsx`**

`<footer className="mt-auto border-t border-border">` → `<div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">`. Children: `<span>{settings.storeName}</span>`; when `settings.instagramUrl !== ""`, `<a href={settings.instagramUrl} target="_blank" rel="noopener">{t.footer.instagram}</a>`; when `settings.whatsappNumber !== ""`, `<a href={\`https://wa.me/${settings.whatsappNumber}\`} target="_blank" rel="noopener">{t.footer.whatsapp}</a>`. Links get `hover:text-foreground` and the focus ring classes used in Task 4.

- [ ] **Step 2: Render it from the store layout**

In `layout.tsx`, after `{children}`: `<SiteFooter locale={locale} settings={settings} />` (the layout already holds `settings`).

- [ ] **Step 3: Add the admin hint**

In `colors-editor.tsx`, directly under `<span className="text-sm font-medium">Photos</span>`, add `<p className="text-xs text-muted-foreground">Photo 1 is the catalog card. Photo 2 hangs on the home page rail.</p>`.

- [ ] **Step 4: Verify in the dev server**

Run: `pnpm dev`; in `/admin/settings` set the Instagram link and WhatsApp number, open `/ar` and `/en`.
Expected: the footer under the grid with a hairline above, store name, "إنستجرام"/"واتساب" (or "Instagram"/"WhatsApp") in muted text; the links open in a new tab to the stored URL and to `https://wa.me/<digits>`. Clear both fields → only the store name remains. The not-found page (`/ar/x`) also shows the footer at the bottom. In `/admin/products/<id>` the hint shows under "Photos".

- [ ] **Step 5: Lint, types, tests**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/site-footer.tsx "src/app/(store)/[lang]/layout.tsx" "src/app/(admin)/admin/products/colors-editor.tsx"
git commit -m "feat(store): footer with Instagram and WhatsApp links; name the rail photo in the admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Worker build and the manual checks

**Files:**
- None (verification only; fix anything found inline and commit it).

- [ ] **Step 1: Sold-out, hidden and empty states**

In `pnpm dev`: in the admin mark every size of the seeded tee sold out → `/ar` shows "نفدت الكمية" on the card's tile and next to the hero name. Hide the product → `/ar` shows the header, the empty line "لا توجد منتجات بعد — تابعونا على إنستجرام." and the footer, no hero. Publish it again.

- [ ] **Step 2: A corrupt row does not blank the catalog**

Run: `pnpm exec wrangler d1 execute DB --local --command "INSERT INTO products (id, slug, name_ar, name_en, price_egp, sizes, colors, sold_out, published, sort_order, created_at, updated_at) VALUES ('corrupt', 'corrupt', 'x', 'x', 1, '[\"S\"]', '{not json', '[]', 1, 5, '2026-10-19T00:00:00.000Z', '2026-10-19T00:00:00.000Z')"`.
Expected: `/ar` still renders the seeded tee; the dev server log prints `catalog: skipping product corrupt: …colors…`; `/admin` lists the seeded tee only. Then delete the row: `pnpm exec wrangler d1 execute DB --local --command "DELETE FROM products WHERE id = 'corrupt'"`.

- [ ] **Step 3: Worker build and 4G check**

Run: `pnpm exec opennextjs-cloudflare build && pnpm preview`, open `http://localhost:8787/ar` and `/en`.
Expected: both render as in `pnpm dev`. In Chrome DevTools, Network with "Fast 4G" throttling and cache disabled: the headline and the rail bar paint under about 2 s; no image request is wider than its slot's variant (rail ≤ `640.webp` on a 390 px viewport at 2×; cards ≤ `640.webp`); the page document's `Cache-Control` is `private`/`no-store` (Workers Cache does not keep it). Stop the preview.

- [ ] **Step 4: Full check**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. Record the results of Steps 1–3 for the PR body.
