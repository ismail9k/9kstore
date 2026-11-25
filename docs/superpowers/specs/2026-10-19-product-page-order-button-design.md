# Product page and WhatsApp order button — design

Intent-Issue: #5 — https://github.com/ismail9k/9kstore/issues/5

Status: v1 · 2026-10-19 · planned unattended from the issue, the brief
(`docs/brief.md`, "Product page" and "The order message"), the brand
guidelines (`docs/brand/guidelines.md`, "Color", "Typography", "Shape and
components") and the four specs this branch builds on
(`2026-10-19-owner-admin-design.md`, `2026-10-19-bilingual-rtl-design.md`,
`2026-10-19-photo-upload-delivery-design.md`,
`2026-10-19-catalog-home-design.md`). Every choice the issue left open is
recorded under "Calls made while planning", with what it costs if it turns
out wrong.

## Intent

A customer taps a story link, lands on one product, picks a color and a
size, taps one button, and WhatsApp opens with the whole order already
written: product, color, size, price, a link back to exactly that product
and color, and the product code. The owner never asks "which one?" again.
This page is where the brief's success criterion is met or missed: under
30 seconds, on a phone, in Instagram's in-app browser, without help.

This issue builds the route `/<lang>/p/<slug>` that #4's cards, hero
button and rail already link to, and the order path behind its button, on
top of what #2 (D1 catalog, `getProductBySlug`, `isInStock`, settings with
the WhatsApp number and greeting lines), #6 (store root layout, header,
toggle, messages, `<Price>`/`<Ltr>`, `formatPrice`/`isolateLtr`) and #3
(`<Photo>`) left behind. Open Graph tags, the "no longer available" page
for hidden products and canonical/`hreflang` links are #7's.

## Goals

1. `/ar/p/<slug>` and `/en/p/<slug>` show a published product: a
   swipeable photo gallery that follows the selected color, the name, the
   price in EGP, the short description, a color picker (swatch and name),
   a size picker for the selected color with sold-out sizes visible,
   disabled and labeled, the size chart when the owner added one, and one
   green "Order on WhatsApp" / "اطلب على واتساب" button.
2. `?color=<key>` pre-selects that color; an unknown or missing key
   selects the first color. Changing the color updates the URL, so the
   language toggle and a copied address keep the color.
3. The button is disabled until a size is chosen and says so. Tapping it
   checks stock again on the server and then opens
   `https://wa.me/<owner number>?text=<message>`; a size that sold out
   meanwhile is reported on the page and WhatsApp does not open.
4. The message is in the page's language and holds the owner's greeting
   line, the product name and color, the size, the price in EGP (the same
   number the page shows), the product code when there is one, and a link
   to the product page with the color, in that language. Western digits
   throughout; size, price and code stay readable inside the Arabic text.
5. The tap works as a plain navigation: no popup, no `window.open`, no
   JavaScript between the tap and WhatsApp opening beyond following a
   redirect, so iOS, Android and Instagram's in-app browser treat it like
   any `wa.me` link.
6. The page's data is read at request time; an owner edit (price, stock,
   photos) shows on the next load and is honored at the next tap.
7. Unit tests pin the message builder, the order decision (availability
   rules) and the picker helpers.

## Non-goals

- Open Graph / Twitter tags, `canonical` and `hreflang` alternates, and
  the "no longer available" page for a hidden product — #7. Until #7
  lands a hidden product's URL is a 404 (Call 1).
- A cart, quantity, online payment, delivery fees or address collection
  (the brief's non-goals). One button, one product.
- Stock counts, sale prices, "notify me" — backlog.
- Order analytics (counting taps) — backlog.
- A product page with no JavaScript. The pickers and the button's
  enabled state are client state; the in-app browsers the brief targets
  run JavaScript. The page's HTML still shows the product, photos, price
  and description before hydration (Call 13).
- Real-device testing. The builder checks in Chrome's device mode and
  `pnpm preview`; the owner tests on an iPhone and an Android phone, in
  Safari, Chrome and Instagram, as the PR body's follow-up.

## Anti-goals

- WhatsApp opening with an empty, truncated, mis-encoded or wrong-language
  message, or a message whose price differs from the page.
- A sold-out size that can be ordered: through a stale page, a tampered
  link, or a race between the owner marking it and the customer tapping.
- A popup blocker, a `window.open` after an `await`, or an in-app browser
  quirk standing between the tap and WhatsApp.
- A generic store template: bordered cards, red "sold out", WhatsApp's
  bright green, a sticky bar of buttons, breadcrumbs, star ratings.
- Arabic as flipped English: physical Tailwind classes, Arabic-Indic
  digits, a size or code that reorders inside Arabic text, an
  untranslated label.
- A carousel library, dnd-kit, or any admin code in the customer bundle.
- Catalog reads cached anywhere, including the order redirect (Workers
  Cache is on; every response here is `private, no-store` or a Next page).

## Constraints (binding, from the issue)

- One order button sends one product. No cart, quantity, online payment,
  delivery fees or address collection.
- The price in the message equals the price on the page.
- Stock is checked again when the button is tapped; a sold-out size never
  opens WhatsApp, and the customer is told.
- Works in iOS and Android browsers and in Instagram's in-app browser;
  never opens WhatsApp with a broken or empty message. Real devices are
  the owner's follow-up.
- Western digits (0–9) in both languages; price, size and code readable
  inside Arabic text.
- `?color=` pre-selects that color.
- Existing Next.js 16 app on Cloudflare Workers through OpenNext. No new
  framework. `cacheComponents` stays off (AGENTS.md).
- shadcn/ui (Radix primitives in the repo) with Tailwind; components from
  shadcn/ui, not built from scratch. dnd-kit stays admin-only.
- The gallery uses CSS scroll-snap, not a carousel library.
- AGENTS.md rules: logical Tailwind classes only on customer pages; every
  size, code and price through `<Ltr>`/`<Price>` in HTML and
  `formatPrice`/`isolateLtr` in plain text; new strings in both `en.ts`
  and `ar.ts`; tests for logic only, next to the code; `@/` imports;
  `noUncheckedIndexedAccess`; catalog reads never cached; slugs dot-free;
  `[...rest]/page.tsx` stays and `globalNotFound` stays off.

## The shape of the solution

Two routes under `src/app/(store)/[lang]/p/[slug]/`:

```
src/app/(store)/[lang]/p/[slug]/
  page.tsx            Server Component: reads D1, renders the page, 404s
  product-view.tsx    Client Component: color + size state, gallery, pickers, button
  gallery.tsx         the scroll-snap photo strip (client, used by product-view)
  order/
    route.ts          GET: checks stock, redirects to wa.me or back to the page
src/lib/order/
  message.ts          buildOrderMessage, whatsappUrl (pure)
  decide.ts           decideOrder, parseNotice, requestOrigin (pure)
src/lib/catalog/helpers.ts   colorByKey, initialColor, sizeAvailability, isColorSoldOut
```

The **page** renders everything from one `getProductBySlug` read and one
`getSettings` read. The **client component** owns two values, the
selected color key and the selected size, and derives the gallery, the
size chips and the button from the product it was given. The **order
route** is where the tap lands: a plain `GET` navigation that reads D1
again, decides, and answers with a redirect — to WhatsApp when the pair
is in stock and the price still matches, back to the product page with a
notice otherwise. The browser follows the redirect like any `wa.me` link,
which is what makes goal 5 hold in in-app browsers: the only JavaScript
involved is the state that built the link's `href`.

## The page: `GET /<lang>/p/<slug>`

`page.tsx` is a Server Component typed `PageProps<"/[lang]/p/[slug]">`.
It reads `lang` with `next/root-params` (the layout already 404s an
unknown locale), `slug` from `params`, `color` and `notice` from
`searchParams`.

1. `slug` must match the catalog's slug rule
   (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, 1–80 chars) → else `notFound()`
   before touching D1. Slugs are dot-free, so the proxy's "no file
   extension" exclusion never catches a real product URL.
2. `product = await getProductBySlug(slug)`; `null` or `!published` →
   `notFound()` (Call 1). `getProductBySlug` throws on a corrupt row, and
   that stays a 500: one product's page failing loudly is right, the
   catalog spec's skip-and-log is for lists.
3. `settings = await getSettings()`.
4. `initialColor(product, color)` picks the color (below);
   `parseNotice(notice)` picks the notice to show, if any.

`generateMetadata` runs the same slug and product checks and returns
`title: "<name in locale> — <storeName>"` and `description` the product's
description in the locale, or `t.meta.description` when it is empty. No
Open Graph (#7).

### Layout

On a 390 px phone, inside the layout's header and footer, in a
`mx-auto w-full max-w-5xl px-4 pb-16` column; from `md` a two-column grid
(`md:grid md:grid-cols-2 md:gap-10`) with the gallery in the first column
and everything else in the second, so the button sits beside the photos
on a laptop. Top to bottom on the phone:

1. **Gallery** — the selected color's photos, in the owner's order (flat
   shot first, hanger second, as the seed and the admin hint have it).
   See "Gallery".
2. **Name** (`h1`, weight 700, `text-2xl`) and **price** (weight 600,
   green, `<Price>`), in the page language. When `isSoldOut(product)`,
   the near-black "Sold out" pill from `product-card.tsx`'s
   `SoldOutBadge` sits next to the name.
3. **Description** — `descriptionAr`/`descriptionEn` by locale, muted
   text, `whitespace-pre-line`; omitted when empty.
4. **Color** — a label line "Color: Black" / "اللون: أسود" (the message
   key `product.color` plus the selected color's name in the locale),
   then the color picker: one round swatch per color, hidden when the
   product has one color (the label line stays, Call 4). See "Pickers".
5. **Size** — the label line "Size" / "المقاس", the size chips for the
   selected color, and, when any of them is sold out, one muted line
   naming them: `"<t.product.soldOut>: S, XL"` with each size in an
   `<Ltr>` (Call 5). When the owner added a size chart, a native
   `<details>` directly under the chips with the summary
   `t.product.sizeChart` ("Size chart" / "جدول المقاسات") and the chart as
   a `<Photo sizes="(min-width: 768px) 50vw, 100vw">` inside, lazy
   (Call 6).
6. **Order** — the hint line and the button. See "The order button".
7. **Notice** — when the order route sent the customer back, the notice
   (near-black text, `role="status"`) directly above the button. The
   client component shows it until the customer picks a size, then hides
   it (Call 21).

Every label, hint and notice string comes from the message catalog
(below). Spacing, exact type sizes and the chips' corner radius (8–10 px,
per the guidelines) are the builder's.

### Gallery

`gallery.tsx` (client, no library): a `dir="ltr"` strip (Call 7)

```
<div class="relative aspect-square overflow-hidden rounded-[10px] bg-muted">
  <ul class="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none]"
      ref={strip} onScroll={…}>
    <li class="h-full w-full shrink-0 snap-center"> <Photo … /> </li>  × photos
  </ul>
  dots (when photos.length > 1)
</div>
```

- The photos are the selected color's `photos`; when the color changes
  the list is replaced and the strip scrolls back to the first photo
  (`strip.scrollTo({ left: 0, behavior: "instant" })`; the strip has
  `scroll-smooth` for swipes, so the reset says `instant` explicitly).
- Each `<Photo>` fills its slide (`size-full object-contain`), `alt`
  `"<product name> — <color name>"` in the locale (Call 8),
  `sizes="(min-width: 768px) 50vw, 100vw"`. The first photo of the
  initially selected color is `priority` (it is the first screen's
  photo); every other slide is lazy, so switching colors fetches only
  what is shown.
- **Dots:** a row of small round dots (`size-1.5 rounded-full`) centered
  under the strip, the current one `bg-foreground`, the rest
  `bg-foreground/40` (the "faded" shade). The current index is
  `Math.round(strip.scrollLeft / strip.clientWidth)`, updated in
  `onScroll`. Dots are `aria-hidden`; the strip is a plain list, and the
  slide `alt`s carry the meaning.
- No arrows, no thumbnails, no zoom, no autoplay. A color with no photos
  shows the empty tile.

### Pickers

Both pickers are shadcn **`ToggleGroup`** (`type="single"`), installed
with the shadcn CLI into `src/components/ui/toggle-group.tsx` (and its
`toggle.tsx` dependency; `components.json` has `rtl: true`, so the
generated classes are logical). Radix renders a single-select
`ToggleGroup` as `role="group"` of `role="radio"` items with
`aria-checked`, and gives arrow-key roving focus; the group gets
`dir={dirOf(locale)}` so the arrows follow the page direction (Call 9).
`onValueChange` fires `""` when the pressed item is pressed again; the
component ignores that, so a selection cannot be cleared.

**Color picker** — `aria-label={t.product.color}`. Each item is the
color's swatch: a `size-9 rounded-full border border-border` disc whose
`background` is `color.swatch` (the hairline keeps the cream swatch
visible on the off-white page), `aria-label` the color's name in the
locale, with the selected state as the guidelines' **offset ring**:
`data-[state=on]:ring-2 data-[state=on]:ring-primary
data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-background`.
No fill or shadow changes; green is the only selection mark. A color whose
every size is sold out (`isColorSoldOut`) stays selectable (the customer
may want to see its photos) and its chips are all disabled; the hint
under the button then reads `t.product.colorSoldOut`.

**Size picker** — `aria-label={t.product.size}`. One chip per size in
`product.sizes`, in order, `min-h-11 min-w-11 px-3 rounded-[8px]
text-sm font-semibold` with the size in `<Ltr>`:

| State | Look |
|---|---|
| In stock, unselected | hairline border (`border border-border`), near-black text, `bg-background` |
| Selected | `data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary` |
| Sold out | `disabled`, text struck through (`<s>` around the size), faded (`text-foreground/40`), border `border-border/60`, `aria-label="<size> — <t.product.soldOut>"` |

Selecting a color whose stock does not include the chosen size clears
the size (Call 10). No size is pre-selected, ever: the brief wants the
customer to choose (Call 11).

### The order button

One primary green pill, `Button size="lg"`, full width on phones
(`w-full md:w-auto`), label `t.product.orderOnWhatsapp`. It has three
states, decided by the client component:

| Condition | Button | Hint line (`text-sm text-muted-foreground`, `id` referenced by `aria-describedby`) |
|---|---|---|
| `settings.whatsappNumber === ""` | `<Button disabled>` | `t.product.orderingUnavailable` |
| selected color sold out in every size | `<Button disabled>` | `t.product.colorSoldOut` |
| no size selected | `<Button disabled>` | `t.product.chooseSize` |
| size selected | `<Button asChild><a href={orderHref}>` | none |

`orderHref` is `/<lang>/p/<slug>/order?color=<key>&size=<size>&price=<priceEgp>`
(`URLSearchParams` does the encoding; the price the page shows travels
with the tap so the route can refuse a stale page, below). The anchor has
no `target`: the tap is a same-tab navigation (Call 2) and no `onClick`.

Before hydration the HTML carries the "no size" state (disabled button
plus the hint), which is exactly right: nothing can be chosen yet.

### URL and color state

`product-view.tsx` holds `colorKey` (initial: `initialColor`) and `size`
(initial `null`). On a color change it calls
`window.history.replaceState(null, "", "?color=<key>")` — Next integrates
native `replaceState` with its router, so `useSearchParams` in the
language toggle sees the new color and the toggle's `href` carries it.
On mount, when the URL has a `notice` (the customer was sent back), the
same `replaceState` drops it, so a reload or the toggle does not repeat
the notice (Call 12). Nothing is pushed: the color is a view state, not
a page.

## The order route: `GET /<lang>/p/<slug>/order`

`order/route.ts`, a Route Handler typed with the generated
`RouteContext<"/[lang]/p/[slug]/order">` (its `params` resolve to `{ lang,
slug }`; root-params are not available in Route Handlers, and the segment
params carry the same values). Every response sets
`Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`.

1. `lang` not a locale, or `slug` failing the slug rule → 404.
2. `product = await getProductBySlug(slug)`; `null` or `!published` →
   404.
3. `settings = await getSettings()`.
4. `origin = requestOrigin(request.headers, request.url)`.
5. `decideOrder({ product, settings, locale, origin, query })` where
   `query` is `{ color, size, price }` from `request.nextUrl.searchParams`
   (each `string | null`). Then:
   - `{ kind: "whatsapp", url }` → `302` to `url`.
   - `{ kind: "back", path }` → `302` to `path` (same origin).

`decideOrder` (pure, `src/lib/order/decide.ts`), in this order:

| Check | Result |
|---|---|
| `color` is not one of `product.colors[].key` | back to `/<lang>/p/<slug>?notice=failed` (a tampered or broken link; the page selects its first color) |
| `size` is not in `product.sizes` | back to `/<lang>/p/<slug>?color=<key>&notice=failed` |
| `!isInStock(product, color, size)` | back to `…?color=<key>&notice=sold-out` |
| `price` is a number and `≠ product.priceEgp` | back to `…?color=<key>&notice=changed` |
| `settings.whatsappNumber === ""` | back to `…?color=<key>&notice=failed` |
| otherwise | `whatsapp` with `whatsappUrl(settings.whatsappNumber, buildOrderMessage(…))` |

`price` missing or not an integer → the price check is skipped (the page
always sends it; a hand-typed link without it is still a valid order at
the current price). The `back` path is built with `withLocale(locale,
"/p/<slug>", search)` so it is always a same-origin path, never an open
redirect.

`requestOrigin(headers, url)`: `<proto>://<host>` where `host` is
`X-Forwarded-Host`, else the `Host` header, else the URL's host, and
`proto` is `X-Forwarded-Proto`, else the URL's protocol without the colon.
The link in the message is this origin plus the product path: the domain
is still an open question for the owner, and the request already knows
the hostname it was reached on, so nothing has to be configured
(Call 3).

`parseNotice(value: string | null): Notice | null` accepts exactly
`"sold-out"`, `"changed"`, `"failed"`.

## The message

`src/lib/order/message.ts` (pure, client-safe, no `next` imports):

```ts
export type OrderDetails = {
  greeting: string;        // settings.greetingAr / greetingEn by locale
  productName: string;     // nameIn(product, locale)
  colorName: string;       // nameIn(color, locale)
  size: string;
  priceEgp: number;
  code: string | null;
  link: string;            // `${origin}/<lang>/p/<slug>?color=<key>`
};

/** The message in the given locale, lines joined with "\n". */
export function buildOrderMessage(d: OrderDetails, locale: Locale): string;

/** `https://wa.me/<digits>?text=<encodeURIComponent(message)>` */
export function whatsappUrl(number: string, message: string): string;
```

Lines, in order (the brief's examples, plus the code line the brief lists
as content but leaves out of the example):

```
<greeting>
<productName> — <colorName>
<t.product.size>: <size>
<t.product.price>: <formatPrice(priceEgp, locale)>
<t.order.code>: <code>            ← only when code is not null
<link>
```

English, with the seed:

```
Hi 9k Store, I'd like to order:
Oversized Tee — Black
Size: L
Price: 850 EGP
Code: TEE-01
https://example.com/en/p/oversized-tee?color=black
```

Arabic:

```
أهلاً 9k Store، حابب أطلب:
تيشيرت أوفر سايز — أسود
المقاس: ⁦L⁩
السعر: ⁦850 جنيه⁩
الكود: ⁦TEE-01⁩
https://example.com/ar/p/oversized-tee?color=black
```

In Arabic the size, the formatted price and the code are wrapped with
`isolateLtr` (LRI … PDI, invisible characters) so a size such as "XL/2"
or a code such as "TEE-01" cannot reorder next to the Arabic words
(Call 14). The link is its own line and needs no isolation. The English
message has no isolates. `formatPrice` already gives Western digits with
comma grouping in both languages ("1,250 جنيه"). The greeting is the
owner's literal text from settings (owner-admin Call 6); it is never
empty because the schema requires it.

`whatsappUrl` uses `encodeURIComponent`, which encodes newlines as
`%0A`, the em dash, Arabic letters and the isolates, and leaves the
digits-only number as the path. The number is already digits only
(owner-admin Call 7); the route never reaches `whatsappUrl` with an
empty one.

## Catalog helpers (pure, `src/lib/catalog/helpers.ts`)

```ts
/** The color with this key, or null. */
export function colorByKey(p: Pick<Product, "colors">, key: string): Color | null;

/** The color `?color=` names when it exists, else the first color. */
export function initialColor(p: Pick<Product, "colors">, key: string | string[] | undefined): Color;

/** Every size in order with its stock for one color. */
export function sizeAvailability(p: StockFields, colorKey: string): { size: string; inStock: boolean }[];

/** True when no size of this color is in stock (also for an unknown color). */
export function isColorSoldOut(p: StockFields, colorKey: string): boolean;
```

`StockFields` (today a private type alias in `helpers.ts`) is exported so
the signatures above and their tests can name it.

`initialColor` takes `searchParams.color` as Next hands it over
(`string | string[] | undefined`): an array (`?color=a&color=b`) counts as
unknown. `colors` has at least one entry by schema, so the fallback is
total; the `noUncheckedIndexedAccess` read is narrowed with a throw that
can only fire on a corrupt product, which `rowToProduct` already rejects.

## Messages

Added to `src/lib/i18n/messages/en.ts` (shape) and `ar.ts`; the existing
`product.size`, `product.color`, `product.price`, `product.soldOut` and
`product.orderOnWhatsapp` are reused as the brief and the #6 spec fixed
them:

```ts
product: {
  …existing,
  chooseSize: "Choose a size first",                 // "اختر المقاس أولاً"
  colorSoldOut: "This color is sold out",            // "هذا اللون نفدت كميته"
  sizeChart: "Size chart",                           // "جدول المقاسات"
  orderingUnavailable: "Ordering isn't available right now",
                                                     // "الطلب غير متاح حاليًا"
},
order: {
  code: "Code",                                      // "الكود"
  soldOut: "That size just sold out — pick another one.",
                                                     // "نفد هذا المقاس للتو — اختر مقاسًا آخر."
  changed: "The price has changed — check it before ordering.",
                                                     // "تغيّر السعر — راجع السعر قبل الطلب."
  failed: "Something went wrong. Try again.",        // "حدث خطأ. حاول مرة أخرى."
},
```

The wording is mine; the owner rewords in these two files. The messages
test from #6 checks both files have the same keys and no empty strings.

## Weight

The page adds one client component tree (the pickers, the gallery and the
button: `product-view.tsx`, `gallery.tsx`, Radix `ToggleGroup`) to the
Next runtime #6 already ships; no new dependency beyond the two shadcn
files copied into the repo. The first screen fetches the HTML, the CSS,
the fonts (cached from the home page), and one gallery photo at
`640.webp` or `960.webp` on a 390 px phone at 2–3× (`fetchpriority=high`).
Other slides and other colors' photos load on demand. The builder confirms
in `pnpm preview` with "Fast 4G" throttling that the first photo, name,
price and button are painted under about 2 s.

## Testing

Vitest, next to the code, logic only (no component or snapshot tests):

- `src/lib/order/message.test.ts`: `buildOrderMessage` in English equals
  the six-line example above exactly; in Arabic equals the Arabic example
  (LRI/PDI around size, price and code, `"850 جنيه"`); `code: null` drops
  the code line in both; `priceEgp: 1250` gives `"1,250 EGP"`; the Arabic
  message contains no `[٠-٩]`; `whatsappUrl("2010xxxxxxxx", "a\nب")` →
  `"https://wa.me/2010xxxxxxxx?text=a%0A%D8%A8"`.
- `src/lib/order/decide.test.ts`: `decideOrder` with the seed product
  and `{ color: "black", size: "L", price: "850" }` → `whatsapp`, URL
  starts with `https://wa.me/<number>?text=` and decodes to a message
  ending in `https://example.com/en/p/oversized-tee?color=black`; the
  Arabic locale puts `/ar/` in the link; `size: "S"` (sold out in the
  seed) → back `/en/p/oversized-tee?color=black&notice=sold-out`;
  `price: "900"` → `notice=changed`; `price: null` → `whatsapp`;
  unknown color → `/en/p/oversized-tee?notice=failed`; unknown size →
  `…?color=black&notice=failed`; empty WhatsApp number →
  `notice=failed`; a `back` path never contains `//` or a scheme.
  `parseNotice`: the three values pass, `"x"`, `""`, `null` → null.
  `requestOrigin`: forwarded headers win; `Host` next; the URL last;
  the result has no trailing slash.
- `src/lib/catalog/helpers.test.ts`: `colorByKey` hit and miss;
  `initialColor` with a known key, an unknown key, `undefined` and an
  array → first color for the last three; `sizeAvailability` of the seed
  `black` → `S` false, `M`/`L`/`XL` true, in order; `isColorSoldOut`
  true when every size of the color is in `soldOut`, false otherwise,
  true for an unknown color.
- `messages.test.ts` already covers the new keys.

Manual check before the PR (recorded in the PR body): `pnpm db:migrate:local
&& pnpm db:seed:local && pnpm photos:seed:local && pnpm dev`, then in a
390 px device viewport:

1. `/ar/p/oversized-tee` → gallery with the grey tee (flat, then hanger
   on swipe, two dots), "تيشيرت أوفر سايز", "850 جنيه" in green, the
   color label "اللون: رمادي", four swatches with the green offset ring on
   grey, chips S M L XL, the button disabled with "اختر المقاس أولاً".
2. Tap the black swatch → URL becomes `?color=black`, gallery shows the
   black tee from its first photo, "S" struck through and faded with
   "نفدت الكمية: S" under the chips; tap "M" → the button is enabled;
   tap the language pill → `/en/p/oversized-tee?color=black`.
3. Tap the button → the browser lands on `wa.me/<number>?text=…` (set a
   number in `/admin/settings` first) and the decoded text equals the
   English example with "Size: M".
4. In the admin mark black/M sold out; back on the page (still showing M
   selected) tap the button → back on the page with "That size just sold
   out — pick another one.", M struck through, no size selected; reload →
   no notice.
5. Change the price in the admin; on the stale page pick a size and tap →
   "The price has changed…" and the new price shows.
6. Clear the WhatsApp number in settings → the button is disabled with
   "Ordering isn't available right now". Restore it.
7. Hide the product → `/ar/p/oversized-tee` is the Arabic not-found page.
   `/ar/p/nope` and `/ar/p/Bad.Slug` → not-found.
8. `pnpm exec opennextjs-cloudflare build && pnpm preview` → steps 1–3
   again at `http://localhost:8787`; the order response in DevTools is a
   `302` with `Cache-Control: private, no-store`.

## Calls made while planning (open to change)

1. **A hidden product is a 404 until #7.** #7 owns the "no longer
   available" page, and building half of it here would be redone. The
   page and the order route both treat `!published` like an unknown
   slug. Cost: between this merging and #7 merging, an old story link to
   a hidden product shows the localized not-found page (which already
   links back to the catalog) instead of the friendlier page — days, at
   most; #7 changes two `notFound()` calls.
2. **The tap is a same-tab navigation to a redirecting route, not a
   `window.open` after a stock check.** A `GET` link the browser follows
   is the one mechanism every in-app browser treats like a plain `wa.me`
   link; popup blockers and WKWebView's missing `window.open` never
   enter. The server does the stock check inside the same request, so
   nothing can race between "checked" and "opened". Cost: when a size
   sold out, the customer sees a full page reload with the notice rather
   than an in-place message (one round trip on 4G); and the product page
   leaves the history stack's top — WhatsApp's `wa.me` page offers Back.
   If the owner prefers the product page to stay, add `target="_blank"`
   to the anchor (the sold-out notice then opens in a new tab).
3. **The link in the message comes from the request origin**, not a
   config value. The domain is undecided; the request already carries
   it, and previews, staging and production each get their own correct
   link. `X-Forwarded-*` win over `Host` so a proxy in front still yields
   the public origin. Cost if #7 settles a canonical domain: one line
   swaps `requestOrigin(...)` for the configured value (and a
   `wrangler.jsonc` var in three places).
4. **One color: picker hidden, label kept.** The brief allows hidden or
   pre-selected; a lone swatch is noise, but the customer should still
   read which color they are ordering. Cost: none.
5. **Sold-out sizes are labeled once under the chips**, not inside each
   chip: the chip keeps the strike-through and the fade the guidelines
   prescribe, the chips stay one line tall and uniform, and a visible
   "Sold out: S, XL" line satisfies "labeled as sold out" for the eye
   while each chip's `aria-label` does it for screen readers. Cost: a
   per-chip caption instead is a class change in one component.
6. **The size chart is a native `<details>` under the size picker.** It
   is reachable before choosing a size (its purpose), does not push the
   button down when closed, needs no JavaScript and no new component; the
   image is lazy and fetched only when opened. Cost: if the owner wants
   it always open, drop the `<details>` wrapper.
7. **The gallery strip is `dir="ltr"` in both languages**, like the rail:
   the swipe-to-see-the-next-photo gesture is then the same in both
   languages, and `scrollLeft` math is one-directional. Cost: one
   attribute to flip, plus RTL `scrollLeft` handling.
8. **Slide `alt` is "<product> — <color>"**, not empty: a screen reader
   hears what color the photos show. The first slide carries the
   `<h1>`'s name too, which is mild redundancy. Cost: none.
9. **`ToggleGroup`, not `RadioGroup`, for both pickers.** shadcn's
   `RadioGroup` item renders a dot indicator and no children, so chips
   would mean re-styling it from scratch; shadcn's `ToggleGroup` items
   take children, and Radix renders a single-select group as radios with
   roving focus. Two files copied by the CLI. Cost: none.
10. **Changing the color clears a size the new color has sold out**,
    rather than keeping it selected and disabled: a disabled selected
    chip and an enabled button would be a lie. A size in stock in both
    colors stays selected. Cost: none.
11. **No size is pre-selected**, even when only one is in stock: the
    brief's button is "disabled until a size is chosen", so the choice
    is the customer's. Cost: one tap for single-size products; a
    one-line change if the owner wants otherwise.
12. **The URL mirrors the color with `replaceState`** and drops the
    `notice` on mount. The toggle and a copied address keep the color,
    which is what the rail links and #7's shares rely on; nothing is
    pushed so Back leaves the page. Cost: none.
13. **The pickers need JavaScript.** The HTML already shows the product,
    photos, price, description and a disabled button with "Choose a size
    first", so a slow 4G load is still a readable page; only choosing
    waits for hydration. A no-JS form fallback would need server-rendered
    radios and a second code path for the same rules. Cost: on a
    JavaScript-off browser the button never enables; the footer's
    WhatsApp link still reaches the owner.
14. **Arabic messages isolate size, price and code with LRI/PDI**, per
    AGENTS.md's `isolateLtr` rule; English messages do not. The isolates
    are invisible format characters that iOS, Android and WhatsApp render
    as nothing. Cost if a device shows them as boxes: delete the three
    `isolateLtr` calls — the lines render acceptably without them
    because each value sits at a line end.
15. **The page sends the displayed price with the tap**, and the route
    refuses a mismatch with a "price changed" notice instead of silently
    ordering at the new price or the old one. Keeps "the price in the
    message equals the price on the page" literally true even for a tab
    left open overnight. Cost: one query parameter.
16. **An unset WhatsApp number disables the button** with a customer
    facing "Ordering isn't available right now", and the route treats a
    tampered link to it as `failed`. The alternative, hiding the button,
    would make the page look finished when it is not. Cost: none; the
    owner sets the number once.
17. **The empty-color and empty-size cases are `failed`, not 404.** A
    broken link should land the customer on the product, not on a
    not-found page. Cost: none.
18. **Gallery photos use `sizes="(min-width: 768px) 50vw, 100vw"`**: the
    phone shows the slide full-width (less 32 px of margins, rounded up),
    the laptop shows it in half the column. Cost: one string.
19. **Description sits under the price, before the pickers**, as the
    brief lists it, clamped by nothing: descriptions are capped at 1000
    characters by the admin. Cost: none.
20. **Label and notice wording is mine**, short, in both languages; the
    owner rewords in `messages/*.ts`.
21. **The notice hides once the customer picks a size.** It answered the
    tap that was refused; once the customer acts again it is stale, and a
    "just sold out" line above a freshly enabled button would read as a
    warning about the new choice. Cost: none.

## Left to the builder

- Exact spacing, type sizes and the vertical rhythm, within the brand
  tokens; the gap between swatches and between chips (at least 8 px so
  the offset ring never touches a neighbor).
- Whether `product-view.tsx` holds the pickers inline or splits them into
  `color-picker.tsx` and `size-picker.tsx` (split preferred past ~120
  lines).
- How the gallery resets its scroll on a color change (an effect keyed
  on the color key is fine), and how it hides the scrollbar.
- The `Photo` placement inside a slide (`object-contain` on a square
  tile, as the cards do).
- The route's redirect status, 302 or 303, and the exact log line when
  `getProductBySlug` throws.
- Test factories: reuse `helpers.test.ts`'s `color()`/`product()` and the
  seed's values.
