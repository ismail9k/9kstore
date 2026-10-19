# Catalog home page — design

Intent-Issue: #4 — https://github.com/ismail9k/9kstore/issues/4

Status: v1 · 2026-10-19 · planned unattended from the issue, the brief
(`docs/brief.md`, "Catalog (home)"), the brand guidelines
(`docs/brand/guidelines.md`, all of it, "The hanging rail" in particular)
and the three specs this branch builds on (`2026-10-19-owner-admin-design.md`,
`2026-10-19-bilingual-rtl-design.md`,
`2026-10-19-photo-upload-delivery-design.md`). Every choice the issue left
open is recorded under "Calls made while planning", with what it costs if it
turns out wrong.

## Intent

The link in the brand's Instagram bio lands here. A customer should see, in
one scroll on a phone, everything that is for sale, what it looks like, and
what it costs, without asking the owner. The page is the brand's shop wall:
off-white, quiet, the clothes doing the work. Its opening shot is the brand's
signature image, the tees hanging on a rail, which is also what keeps it from
looking like a store template.

This issue builds the home route and the footer, on top of what #2 (D1
catalog, `listProducts`, `isSoldOut`, `cardPhoto`), #6 (store root layout,
header with the language toggle, messages, `<Price>`/`<Ltr>`, the Plex font)
and #3 (`<Photo>`, `photoSrcSet`) left behind. The product page and its URL
belong to #5 and #7; the home page links to that URL.

## Goals

1. `/ar` and `/en` show the header, the hero (eyebrow, two-line headline,
   the rail with every color of the featured product, its name and price, a
   green pill button), then the product grid, then the footer.
2. Every published product is in the grid, in the owner's order, newest
   first by default. Each card shows the first photo of the first color, the
   name in the page's language, and the price in EGP. A product sold out in
   every color and size stays in the grid with a near-black "Sold out" pill.
3. The page is usable on a 4G phone in about 2 seconds: no JavaScript beyond
   what the layout already ships (the language toggle), photos at
   screen-fitting widths, the ones above the fold fetched first.
4. The owner's edits (new product, reorder, hide, sold out) show on the next
   request. Nothing is cached or built in.
5. A single corrupt product row does not blank the shop: the rest of the
   catalog renders and the bad row is logged.

## Non-goals

- The product page, gallery, color and size pickers, the WhatsApp order
  button — #5. The rail's tees and the hero button link to
  `/<lang>/p/<slug>[?color=<key>]`; until #5 lands, those links reach the
  localized not-found page.
- Open Graph tags and `hreflang` alternates for the home page — #7, which
  owns shareable links and link previews (Call 12).
- Categories, filters, search, pagination. One grid, under 50 products.
- A "featured product" field in the admin. The featured product is derived
  (Call 2).
- A logo file. The wordmark from #6's header stands in until the owner's
  files arrive, exactly as the issue says.

## Anti-goals

- A generic store template: cards with borders and shadows, a hero banner
  with a stock photo, a navigation bar, a cart icon, a search box, stock
  counts, "Only 3 left" badges, sale colors.
- Green anywhere but the places the guidelines list: the wordmark, the
  headline's second line, prices, the primary button, focus rings. No green
  bands or backgrounds.
- A photo that downloads at more than it displays, or a page that waits on
  JavaScript to show products.
- Arabic as flipped English: physical `left`/`right` classes, letter-spaced
  Arabic, Arabic-Indic digits, an untranslated label.
- The home page falling over because one row in D1 is malformed.
- A hidden product in the grid, or a sold-out product missing from it.

## Constraints (binding, from the issue)

- No categories, filters or search. One grid in the owner's order.
- Sold-out products stay visible, marked "Sold out". Hidden products do not
  appear.
- Mobile first, usable on 4G in about 2 seconds.
- Not a generic store template. The brand guidelines apply: the three
  colors and where green goes, IBM Plex Sans Arabic, the hanging rail as the
  home page's opening shot, flat photos on photo tiles in the grid, the
  shadcn/ui theme tokens.
- No customer accounts, cart or online payment.
- Existing Next.js 16 app on Cloudflare Workers through OpenNext. No new
  framework. `cacheComponents` stays off (AGENTS.md).
- shadcn/ui (Radix primitives in the repo) with Tailwind; dnd-kit stays
  admin-only. The rail is the guidelines' one sanctioned custom piece.
- AGENTS.md rules: logical Tailwind classes only on customer pages; every
  price through `<Price>`; new strings in both `en.ts` and `ar.ts`; tests
  for logic only, next to the code; `@/` imports; `noUncheckedIndexedAccess`
  is on; catalog reads never cached.

## The page

`src/app/(store)/[lang]/page.tsx` replaces #6's placeholder. It is a Server
Component: it reads `lang` from `next/root-params`, calls `listProducts({
publishedOnly: true })` once, derives the featured product and the rail
from that list, and renders the sections below. The store root layout
(`layout.tsx`) keeps the header and gains the footer, so #5's product page
gets both for free.

Top to bottom, on a 390 px phone with 16 px side margins (`px-4`) and a
`max-w-5xl` centered column on wider screens:

### 1. Header

Unchanged from #6: the wordmark (green, always LTR), the language pill at
the row's end, a hairline below.

### 2. Hero

Rendered only when there is a featured product (below). Order and content
follow the guidelines' "The hanging rail":

- **Eyebrow** — one short line, muted text, weight 600. In English it is
  uppercase and letter-spaced (`uppercase tracking-[0.2em]`); in Arabic the
  same text is set at normal spacing and case (Arabic has neither). The
  element carries the classes under `[lang=en]`-style gating by rendering
  them only when `locale === "en"`, so Arabic is never letter-spaced.
- **Headline** — two lines, weight 700, tight leading (`leading-[1.05]`),
  large (`text-4xl` on phones, `text-6xl` from `md`). Line one near-black,
  line two green (`text-primary`). Two message keys, one per line, so the
  break is deliberate in each language and nothing wraps mid-phrase on a
  phone.
- **The rail** — full-bleed (it breaks out of the side margins to the
  viewport edges: a wrapper with `w-screen` centered via
  `relative inset-x-1/2 -mx-[50vw]`, or the builder's equivalent, with
  `overflow-x-hidden`). The **bar** is drawn in CSS: 3 px high, full width,
  `rounded-full`, a vertical gradient from mid-grey to near-black
  (`bg-gradient-to-b from-[#8a8a8a] to-foreground`; the guidelines allow
  this one gradient). The **tees** hang below it: a flex row, centered,
  one `<a>` per rail photo, each tee `--tee` wide: 46vw on phones, 30vw from
  `sm`, 224px from `lg` with up to four tees, narrower with more (Call 3),
  with a negative horizontal margin of a fixed fraction of `--tee` (4vw at
  the full widths, 16px from `lg`) so they overlap slightly and the outer
  ones run off the phone's edges, as in the reference. The row is `dir="ltr"` regardless of
  page language: it is a picture of a rail, not text, and should look the
  same in both languages. Each tee is aligned by its own hook: it is pulled
  up by `hookOffset(photo) × --tee` plus the bar's 3px, so the top of its
  hook meets the bar's top edge (Call 5). Each `<a>` links to
  `/<lang>/p/<slug>?color=<colorKey>` and has `aria-label` "<product name>
  — <color name>" in the page language; its `<Photo>` has `alt=""` (the
  label carries the meaning), `priority`, and
  `sizes="(min-width: 1024px) 224px, (min-width: 640px) 30vw, 46vw"`.
- **Name and price** — the featured product's name (700) and price (600,
  green, through `<Price>`), centered. When `isSoldOut(product)`, the
  "Sold out" pill (below) sits next to the name.
- **Button** — one green pill (`<Button asChild>` around a `next/link`),
  label `home.viewProduct`, to `/<lang>/p/<slug>`. It is the screen's one
  primary button.

### 3. Grid

A heading is not needed; the grid starts after the hero with vertical
space. `grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4`.
Each card is one `next/link` to `/<lang>/p/<slug>` containing:

- a **photo tile**: `aspect-square rounded-[10px] bg-muted overflow-hidden`
  (the photo-tile shade from the guidelines), with the card photo
  (`cardPhoto(product)`, the first photo of the first color, normally the
  flat shot) as `<Photo>` filling it (`size-full object-contain`), `alt`
  the product name in the page language, `sizes="(min-width: 1024px) 25vw,
  (min-width: 640px) 33vw, 50vw"`, lazy (no `priority`; Call 6). A product
  with no photo shows the empty tile.
- when `isSoldOut(product)`: the **Sold out pill** overlaid on the tile at
  its top-start corner (`absolute top-2 start-2`): shadcn `<Badge>` with
  `className="bg-foreground text-background"` (near-black on off-white, the
  guidelines' sold-out mark), text `product.soldOut`.
- the **name** below the tile, weight 700, `text-sm`, in the page language,
  clamped to two lines.
- the **price**, weight 600, green, through `<Price>`.

Cards have no border, no shadow and no hover transform; focus-visible shows
the green ring on the whole link (`focus-visible:ring-3 ring-ring/50
rounded-[10px]`).

### 4. Empty state

No published products: the hero is absent (it needs a product) and in the
grid's place one centered muted line, `home.empty` ("Nothing here yet —
follow us on Instagram." / "لا توجد منتجات بعد — تابعونا على إنستجرام.").

### 5. Footer

`src/components/site/site-footer.tsx`, rendered by the store root layout
below `{children}` (`mt-auto` on the footer keeps it at the bottom of a
short page), on every customer page. Per the guidelines: a hairline divider
above, then Instagram and WhatsApp links in muted text (`text-sm
text-muted-foreground`), side by side with a gap, in the `max-w-5xl px-4`
column. The layout passes the settings it already reads:

- Instagram: shown when `settings.instagramUrl` is non-empty; `href` is the
  URL as stored; label `footer.instagram`.
- WhatsApp: shown when `settings.whatsappNumber` is non-empty; `href`
  `https://wa.me/<number>`; label `footer.whatsapp`.
- Both `target="_blank" rel="noopener"`. When neither is set, the footer
  still renders the hairline and the store name in muted text, so a page
  never ends on nothing.

## Data and derivations

All pure, in `src/lib/catalog/helpers.ts` unless noted, unit-tested:

```ts
/** The name in the page language. */
export function nameIn(item: { nameAr: string; nameEn: string }, locale: Locale): string;

/** The photo that hangs on the rail for a color: the second photo when the
 *  color has two or more (the hanger shot, by the guidelines' convention),
 *  else the first, else null. */
export function railPhoto(color: Color): Photo | null;

/** Every color with a rail photo, in the owner's order. */
export function railItems(product: Product): { color: Color; photo: Photo }[];

/** Assumed hook top for a photo without a measured one: 0.10. */
export const DEFAULT_HOOK_TOP: number;

/** How far below its box top a tee's hook starts, as a fraction of the box
 *  width: (photo.hookTop ?? DEFAULT_HOOK_TOP) × height / width (1 if unsized). */
export function hookOffset(photo: Photo): number;

/** The first product in catalog order with at least one rail item, or null. */
export function featuredProduct(products: Product[]): Product | null;
```

`Locale` comes from `@/lib/i18n/locales` (pure, client-safe), so
`helpers.ts` stays importable anywhere.

The photo convention the rail relies on — photo 1 of a color is the flat
shot for the card, photo 2 is the hanger shot for the rail — is what the
brand guidelines and the dev seed already do. The admin states it: under
the color's "Photos" label in `colors-editor.tsx`, a muted one-line hint
"Photo 1 is the catalog card. Photo 2 hangs on the home page rail." (Call
4.)

### Tolerating a corrupt row

`listProducts` today maps every row through `rowToProduct`, which throws
on the first row that fails the zod schema, so one bad row blanks the home
page and the admin list alike. This issue changes `listProducts` to skip
such rows:

- `src/lib/catalog/rows.ts` gains
  `parseProductRows(rows: ProductRow[]): { products: Product[]; rejected: { id: string; reason: string }[] }`
  (pure, tested): each row through `rowToProduct`, failures collected with
  the row's `id` and the error message instead of thrown.
- `listProducts` uses it, logs one `console.error` per rejected row
  (`catalog: skipping product <id>: <reason>`) and returns the good ones.
  The admin's products table therefore also skips the row; the owner sees
  the error in the Worker log, which is the only place a malformed row can
  be diagnosed anyway.
- `getProduct` and `getProductBySlug` keep throwing: a single-product read
  that fails should fail loudly, not pretend the product is missing.

## Messages

Added to `src/lib/i18n/messages/en.ts` (shape) and `ar.ts`:

```ts
home: {
  eyebrow: "New drop",                        // "إصدار جديد"
  headlineTop: "Made for",                    // "صُنع"
  headlineAccent: "every day.",               // "لكل يوم."
  viewProduct: "View product",                // "شاهد المنتج"
  empty: "Nothing here yet — follow us on Instagram.",
                                              // "لا توجد منتجات بعد — تابعونا على إنستجرام."
},
footer: {
  instagram: "Instagram",                     // "إنستجرام"
  whatsapp: "WhatsApp",                       // "واتساب"
},
```

The headline and eyebrow wording is mine (the guidelines list it as an
open item); the owner rewords it in these two files. The existing
`product.soldOut` ("Sold out" / "نفدت الكمية") and `price.unit` are reused,
not re-translated. The messages test from #6 already checks both files
have the same keys and no empty strings.

## Metadata

The home page sets `generateMetadata` to the store name and
`meta.description` as the layout does today — no change in effect, kept
explicit so #7 has one place to add Open Graph and alternates for the home
page.

## Weight budget (how goal 3 is met)

On a 390 px phone the first screen fetches: the HTML (dynamic, ~15 KB),
the CSS, Next's runtime for the toggle (already shipped by #6), the three
Plex weights in two subsets (already shipped by #6), and the rail tees (four when seeded)
at `640.webp` (cutouts, 20–40 KB each, `fetchpriority=high`). Grid
photos are `loading="lazy"` and the browser fetches the first row as it
nears the viewport, at `320.webp` or `640.webp` by `sizes`. Nothing on the
page adds a client component, a font weight or a third-party request.
The builder confirms in Chrome DevTools with "Fast 4G" throttling that the
rail and headline are painted under 2 s and that no image request exceeds
the slot's width class (`pnpm preview`, seeded data).

## Testing

Vitest, next to the code, logic only (no component or snapshot tests):

- `helpers.test.ts`: `nameIn` picks by locale; `railPhoto` → second photo
  with two, first with one, null with none; `railItems` skips photoless
  colors, keeps owner order, keeps every photographed color (more than four too); `featuredProduct` → first product
  with a rail item (skips one without photos), null for an empty list.
- `helpers.test.ts` also: `hookOffset` → `hookTop` scaled by height / width,
  `DEFAULT_HOOK_TOP` without one; `hook.test.ts`: `firstOpaqueRow` and
  `hookTopOf`; `upload.test.ts`: a color upload carries the measured
  `hookTop`, a failed measurement doesn't fail it; `schema.test.ts`: `hookTop`
  bounded to 0..1 and kept through a save.
- `rows.test.ts`: `parseProductRows` returns the good rows and the bad
  row's id and reason for a row with invalid JSON in `colors` and for a
  row whose `price_egp` is negative; all good → `rejected` empty.
- `messages.test.ts` already covers the new keys.

Manual check before the PR (recorded in the PR body): `pnpm db:migrate:local
&& pnpm db:seed:local && pnpm photos:seed:local && pnpm dev`; `/ar` shows
header, Arabic eyebrow at normal spacing, two-line headline with the
second line green, the rail with four tees hanging on the bar and the outer
two running off a phone-width viewport, name, "850 جنيه" in green, the
pill; the grid with one card; the footer. `/en` the same with the eyebrow
letter-spaced. Hide the product in the admin → the empty state. Mark every
size sold out → the pill on the card and next to the hero name. Then
`pnpm exec opennextjs-cloudflare build && pnpm preview` for the Worker and
the DevTools throttling check above.

## Calls made while planning (open to change)

1. **The rail is in scope and is the hero.** The issue binds the
   guidelines, which name the rail as the home page's opening shot. Cost:
   it is the bulk of the visual work; if the owner wants the grid alone,
   delete the hero section — the data helpers stay for the product page.
2. **Featured product = the first product in the owner's order that has a
   photo**, which is the newest by default and whatever the owner drags to
   the top otherwise. No admin field. Cost if a "feature this one" switch
   is wanted later: a boolean column and a migration — an hour; the page
   then prefers it over the order.
3. **The rail hangs every photographed color**, as the guidelines say
   (reversed from "up to four" in review). Up to four tees keep the full
   widths (46vw, 30vw from `sm`, 224px from `lg`) and the outer two run off a
   phone's edges; with more, each tee shrinks to the smaller of two bounds:
   n - 1 pitches span the viewport (the first and last tees at least half
   on screen), and the first tee, half under the second, keeps 44px on
   screen to tap. CSS only: the row carries `--n`, and `--tee` and the
   overlap margins derive from it (formulas in `rail.tsx`). Cost: past
   eight colors a 390px phone cannot give every tee a 44px tap target; a
   product with that many would need a scrolling rail.
4. **Photo 2 is the hanger shot**, by convention, stated in the admin. The
   data model has no shot kind, adding one needs admin UI that is not this
   issue's, and the guidelines already prescribe two shots per color with
   the flat one first (the card). With one photo the rail hangs it anyway.
   Cost if wrong: a `shot` field on `Photo` and a toggle in the photo
   strip — half a day; `railPhoto` becomes a one-line lookup.
5. **Each tee is aligned by its own hook** (reversed from "by the image
   box" in review). `Photo` gains an optional `hookTop`: the first row from
   the top with a pixel whose alpha is above 16, as a fraction of the image
   height (0..1, 4 decimals). The admin measures it in the browser while a
   color photo uploads (`admin/photos/hook.ts`, `createImageBitmap` and an
   `OffscreenCanvas`) and stores it on the photo; the schema bounds it, and a
   failed decode leaves it out without failing the upload. The rail sets
   `--hook` per tee from `hookOffset`, so the customer page ships no
   JavaScript. Photos uploaded before this get `DEFAULT_HOOK_TOP` (0.10)
   until re-uploaded; the dev seed carries the measured values. Cost: none
   beyond re-uploading old photos if their hooks look off.
6. **Rail photos are `priority`; grid photos are lazy.** The hero fills a
   phone's first screen, so the grid is below the fold; marking cards
   `priority` would compete with the tees for bandwidth. Cost: none
   material; flip the flag.
7. **The rail row is LTR in both languages.** It is a picture; mirroring
   it would reorder the colors between languages for no reason. Cost: none.
8. **No `Card` component from shadcn.** Its bordered, padded box is the
   template look the brief forbids; the card here is a link around a
   tile, a name and a price, and the only components it needs are `Badge`
   and `<Photo>`. Cost: none.
9. **A corrupt row is skipped and logged in `listProducts`**, for every
   caller, while single reads still throw. The home page is where
   Instagram bursts land; one bad row must not blank it. Cost: an admin
   row silently absent from the table until the owner reads the log;
   acceptable because nothing in the UI could repair that row anyway.
10. **The footer lives in the store root layout**, not the home page, so
    #5 inherits it. Cost: none.
11. **Footer links open in a new tab.** From Instagram's in-app browser,
    the Instagram link should return to the app and WhatsApp should open
    the app; `_blank` is the reliable way in that browser. Cost: none.
12. **No Open Graph tags on the home page.** #7 owns link previews;
    doing half of it here would be redone. Cost: a shared home link has no
    image preview until #7 — days, at most.
13. **Headline, eyebrow, button and empty-state wording are mine**, plain
    and short, in both languages. The owner rewords in `messages/*.ts`.
14. **Flat photos use `object-contain` on the tile**, never cropped, since
    cutouts are square and centered already. Cost: none.

## Left to the builder

- Exact spacing, type sizes and the rail's vertical rhythm within the
  values above; the bar's exact gradient stops.
- How the full-bleed wrapper is written, as long as there is no horizontal
  page scroll on a phone (`overflow-x-hidden` on the rail wrapper, not on
  `body`).
- Whether the hero and the grid are inline in `page.tsx` or split into
  `hero.tsx`, `product-card.tsx` and `rail.tsx` under
  `src/app/(store)/[lang]/` — split is preferred for files over ~120 lines.
- The line-clamp utility for the card name (Tailwind's `line-clamp-2`).
- The DevTools throttling check's exact numbers; the bar is "painted under
  about 2 s on Fast 4G".
