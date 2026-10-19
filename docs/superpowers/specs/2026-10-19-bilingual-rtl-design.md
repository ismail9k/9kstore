# Arabic and English with right-to-left layout — design

Intent-Issue: #6 — https://github.com/ismail9k/9kstore/issues/6

Status: v1 · 2026-10-19 · planned unattended from the issue, the brief
(`docs/brief.md`, "Language"), the brand guidelines
(`docs/brand/guidelines.md`, "Typography" and "Shape and components") and
the owner-admin spec this branch builds on
(`docs/superpowers/specs/2026-10-19-owner-admin-design.md`). Every choice
the issue left open is recorded under "Calls made while planning", with
what it costs if it turns out wrong.

## Intent

Customers in Egypt read Arabic or English. If Arabic is bolted on later —
English layouts flipped over, prices scrambled by mixed-direction text,
labels left untranslated — v1 fails even when every feature works. This
issue lays the bilingual foundation the customer pages (#4 catalog home,
#5 product page and order button, #7 shareable links) are built on, so
that none of them has to invent routing, direction, fonts or translation
handling on its own.

The issue is infrastructure plus the one piece of UI every page shares:
the slim header with the language toggle. The catalog grid, the product
page, the footer and Open Graph tags are *not* here.

## Goals

1. Every customer URL carries its language: `/ar/...` and `/en/...`. A
   bare-domain visit lands on Arabic, or on the language the customer last
   chose with the toggle.
2. Arabic pages are right-to-left in HTML (`<html lang="ar" dir="rtl">`),
   not CSS-mirrored English. English pages are `lang="en" dir="ltr"`.
3. A language toggle on every customer page switches to the same page in
   the other language and remembers the choice.
4. One typed message catalog with an Arabic and an English version of every
   customer-facing string, checked so a key cannot exist in one language
   only.
5. Prices, sizes and product codes render as left-to-right runs inside
   Arabic text, with Western digits (0–9) in both languages, through
   helpers every later page uses.
6. IBM Plex Sans Arabic loads on customer pages for both scripts, served
   from the site's own domain.
7. A later issue can get the current language anywhere on the server
   without prop drilling, and can add a translated string by adding one key
   to two files.

## Non-goals

- The catalog home page (grid, hanging rail, footer) — #4. The home route
  in this issue is a placeholder that shows the store name under the shared
  header.
- The product page, color/size pickers, the WhatsApp order message — #5.
  `formatPrice` and `isolateLtr` from this issue are what #5 will use to
  write the message's price line, but the message itself is #5's.
- Product URLs, Open Graph tags, `hreflang` alternates, the "no longer
  available" page — #7 (and #4 for the home page's own metadata).
- Photo serving — #3. This issue only keeps `/photos/*` out of the locale
  redirect so #3's route is not rewritten.
- Translating the admin. It stays in English (owner-admin call 8); its
  Arabic *content* fields are already RTL.
- Browser-language (`Accept-Language`) negotiation. The issue fixes Arabic
  as the first-visit default.
- Any locale beyond `ar` and `en`, regional variants, or a translation
  management tool.

## Anti-goals

- Arabic rendered as flipped English: a layout that uses `left`/`right`
  classes and breaks in RTL, or English-first copy machine-translated.
- A price such as "850 جنيه" or a code such as "TEE-01" that reorders its
  characters inside Arabic text, or Arabic-Indic digits (٨٥٠) anywhere.
- A customer-facing label with no Arabic version, or one that silently
  falls back to English.
- A shared link that opens in a different language from the one it was
  shared in.
- The toggle, or a link prefetch, changing the remembered language without
  the customer choosing it.
- Admin-only code (dnd-kit, admin forms) reaching a customer page bundle.
- Any dependency on a translation framework (next-intl, i18next, …). The
  catalog is two small TypeScript files.

## Constraints (binding, from the issue)

- Each language has its own URL: `/ar/...` and `/en/...`.
- Arabic is the default for a first visit to the bare domain.
- The language in the URL wins over a remembered choice. The remembered
  choice only applies to visits to the bare domain.
- Western digits (0–9) in both languages, for prices and sizes.
- No untranslated customer-facing labels.
- Existing Next.js 16 app on Cloudflare Workers through OpenNext. No new
  framework. `cacheComponents` stays off (AGENTS.md).
- shadcn/ui (Radix primitives, copied into the repo) with Tailwind, for
  customer pages and the admin. Components come from shadcn/ui rather than
  being built from scratch. dnd-kit stays admin-only.
- AGENTS.md rules: tests only for meaningful logic, as `*.test.ts(x)` next
  to the code; `@/` import alias; the admin as #2 left it except where this
  issue needs it; product data read at request time, never cached.

## Routing

### Two root layouts

Next.js puts `lang` and `dir` on `<html>` only from a root layout, and the
admin must stay LTR English while customer pages switch. So the app gets
two root layouts through route groups, which is the documented Next.js
way to do this (`route-groups.md`, "Defining multiple root layouts"):

```
src/app/
  globals.css                    (unchanged location)
  favicon.ico                    (unchanged; metadata files work at app root)
  (store)/
    [lang]/
      layout.tsx                 root layout: <html lang dir>, font, header
      page.tsx                   placeholder home (store name) until #4
      not-found.tsx              localized 404 for unknown customer URLs
  (admin)/
    admin/                       git mv of today's src/app/admin, unchanged inside
      layout.tsx                 becomes a root layout: <html lang="en" dir="ltr">
      ...
  lang/
    [lang]/
      route.ts                   the toggle's target: remembers, then redirects
```

`src/app/layout.tsx`, `src/app/page.tsx` and `src/app/page.test.tsx` are
deleted. Navigating between the two groups is a full page load, which is
fine: nothing links from the store to the admin.

Because every customer route is under `[lang]` and that folder sits above
the store's root layout, `lang` is a **root parameter**: any Server
Component or server-side utility reads it with
`import { lang } from "next/root-params"` (types are generated by
`next typegen`, which `pnpm typecheck` already runs). Client Components
receive it as a prop. The store layout validates it: an unknown value
calls `notFound()`.

No `generateStaticParams` on `[lang]`. Customer pages must read D1 at
request time, and with `cacheComponents` off nothing requires it. The
store layout reads `getSettings()` for the store name, which also keeps
every customer page dynamic.

### The proxy

`src/proxy.ts` grows from the admin gate to the site's router. Its
matcher becomes every path except Next internals, `/photos/*` (#3's
serving route) and paths with a file extension:

```ts
export const config = {
  matcher: ["/((?!_next|photos|.*\\..*).*)"],
};
```

Decision order, with the admin branch exactly as it is today:

1. `pathname` starts with `/admin` → today's `adminGate` logic, including
   `X-Robots-Tag: noindex, nofollow`. Nothing changes for the admin.
2. Otherwise `localeGate(pathname, rememberedCookie)` (pure, in
   `src/lib/i18n/gate.ts`, unit-tested) decides:
   - `/ar`, `/ar/...`, `/en`, `/en/...` → `next`.
   - `/lang/...` → `next` (the toggle's route handler).
   - anything else, `/` included → `redirect` to `/<locale><pathname>`,
     where `<locale>` is, for `/` only, the `9k_lang` cookie when it is
     `ar` or `en`, else `ar`; every other path gets `ar`, because the
     remembered choice applies only to bare-domain visits. `/` becomes
     `/ar` (no trailing slash). The query string is
     kept. Status 307: the target depends on a cookie, so it must not be
     cached as permanent.

The proxy sets no cookies. `/fr/p/tee` is "anything else" and lands on
`/ar/fr/p/tee`, which the `[lang]` segment answers with the localized
not-found page — unknown URLs get a 404 in the customer's language rather
than Next's bare default.

### Remembering the choice

The remembered language changes only when the customer uses the toggle.
The toggle is a link to `GET /lang/<other>?to=<path>`, handled by
`src/app/lang/[lang]/route.ts`:

- `[lang]` must be `ar` or `en`; otherwise 404.
- `to` is the current path *without* its locale prefix, plus its query
  string, URL-encoded by the toggle (e.g. `to=%2Fp%2Ftee%3Fcolor%3Dblack`).
  `switchTarget(lang, to)` (pure, tested) returns the redirect path: it
  accepts only a `to` that starts with a single `/` (not `//`, no scheme),
  strips a leading `/ar` or `/en` if a caller sent one anyway, and falls
  back to `/<lang>` when `to` is missing or malformed. The result is always
  a same-origin path, so there is no open redirect.
- The response sets `9k_lang=<lang>`; `Path=/`; `Max-Age` one year;
  `SameSite=Lax`; `HttpOnly`; `secure: process.env.NODE_ENV ===
  "production"` — the admin cookie's exact rule in
  `src/lib/auth/session.ts`, so the two cookies behave the same
  everywhere (under `pnpm preview` the Worker runs as production over
  plain http, so the cookie is not stored there; the manual check for
  preview is that the handler redirects, not that it remembers); then
  redirects 307 to the target.

Visiting `/en/...` from a shared link does **not** set the cookie: the URL
wins for that visit, and the customer's earlier choice still applies to
the next bare-domain visit — the issue's constraint, read literally.

## Direction and script

### The store root layout

`src/app/(store)/[lang]/layout.tsx`:

```tsx
<html lang={locale} dir={dirOf(locale)} className={`${plex.variable} h-full antialiased`}>
  <body className="min-h-full flex flex-col">
    <SiteHeader locale={locale} storeName={settings.storeName} />
    {children}
  </body>
</html>
```

`generateMetadata` returns `{ title: settings.storeName, description:
t.meta.description }`. No `alternates`: #4 and #7 own page-level metadata.

### Font

IBM Plex Sans Arabic from `next/font/google` (it is in Next's font list,
weights 100–700, subsets `arabic` and `latin`), self-hosted at build time
and served from the site's domain, so no request goes to Google:

```ts
const plex = IBM_Plex_Sans_Arabic({
  weight: ["400", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-plex",
});
```

`globals.css` changes `body { font-family: system-ui, sans-serif }` to
`font-family: var(--font-plex, system-ui), sans-serif;`. The admin's
`<html>` does not carry the variable, so it keeps `system-ui` as the
owner-admin spec decided. Fonts download at build; CI and Workers Builds
have network access.

### Layout rules for RTL (for this issue and every later one)

- Direction comes from `dir` on `<html>`. Customer components never set
  `dir` themselves except on deliberate exceptions below.
- Tailwind classes are **logical**: `ps-`/`pe-`, `ms-`/`me-`, `start-`/
  `end-`, `text-start`/`text-end`, `rounded-s-`/`rounded-e-`,
  `border-s-`/`border-e-`. Never `pl-`/`pr-`/`ml-`/`mr-`/`left-`/`right-`/
  `text-left`/`text-right` on customer pages. Flexbox and grid reverse on
  their own.
- Icons with a direction (arrows, chevrons) get `rtl:-scale-x-100`.
  Symmetric icons need nothing.
- `components.json` sets `"rtl": true`, so components added with the
  shadcn CLI from now on come with logical properties. The components
  already in the repo that customer pages will use are edited by hand to
  match: `button.tsx` (`has-data-[icon=inline-end]:pr-*` → `pe-*`,
  `inline-start]:pl-*` → `ps-*`), `badge.tsx` (same two), `table.tsx`
  (`pr-0` → `pe-0`), `dialog.tsx` (`right-2` → `end-2`). `left-1/2
  -translate-x-1/2` centering in `dialog.tsx` and `alert-dialog.tsx` is
  direction-neutral and stays. The admin's `ml-auto` stays: the admin is
  LTR.
- Arabic is never letter-spaced (`tracking-*` only on English-only
  elements, which this issue has none of).
- The wordmark "9k store" is always `dir="ltr"`, even on Arabic pages
  (brand guidelines, "Logo").

### Bidi-safe values

`src/components/ltr.tsx`:

```tsx
export function Ltr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <bdi dir="ltr" className={className}>{children}</bdi>;
}
```

`<bdi>` isolates its content from the surrounding direction, so "TEE-01"
stays "TEE-01" and "XL" stays "XL" in an Arabic sentence. Every size,
code and price on a customer page goes through it.

`src/components/price.tsx`:

```tsx
export function Price({ value, locale, className }: { value: number; locale: Locale; className?: string })
// renders <Ltr className={className}>{formatPrice(value, locale)}</Ltr>
```

`src/lib/i18n/format.ts` (pure):

- `formatPrice(priceEgp: number, locale: Locale): string` — the integer
  formatted with `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })`
  (Western digits, comma grouping) followed by a space and the unit from
  the messages: `"850 EGP"`, `"1,250 EGP"`, `"850 جنيه"`. `en-US` for both
  locales is deliberate: `ar-EG` would produce Arabic-Indic digits.
- `isolateLtr(text: string): string` — `"⁦" + text + "⁩"`
  (LRI … PDI), for plain-text contexts with no HTML, such as the WhatsApp
  message #5 writes. Not used by this issue's UI.

## Messages

`src/lib/i18n/messages/en.ts` is the shape; `ar.ts` must have every key:

```ts
// en.ts
export const en = {
  meta: { description: "9k Store — browse the catalog and order on WhatsApp." },
  header: { switchLanguage: "Switch language" },            // aria-label on the toggle
  price: { unit: "EGP" },
  product: { soldOut: "Sold out", size: "Size", color: "Color", price: "Price",
             orderOnWhatsapp: "Order on WhatsApp" },
  notFound: { title: "Page not found",
              body: "This page doesn't exist or has moved.",
              back: "Back to the catalog" },
} as const;
export type Messages = typeof en;

// ar.ts
export const ar = {
  meta: { description: "9k Store — تصفح المنتجات واطلب على واتساب." },
  header: { switchLanguage: "تغيير اللغة" },
  price: { unit: "جنيه" },
  product: { soldOut: "نفدت الكمية", size: "المقاس", color: "اللون", price: "السعر",
             orderOnWhatsapp: "اطلب على واتساب" },
  notFound: { title: "الصفحة غير موجودة",
              body: "هذه الصفحة غير موجودة أو تم نقلها.",
              back: "الرجوع إلى المتجر" },
} satisfies Messages;
```

The `product` and `price` keys are seeded now because the brief and the
brand guidelines already fix their wording in both languages ("Order on
WhatsApp" / "اطلب على واتساب", "Sold out" / "نفدت الكمية", "850 جنيه",
"المقاس: L", "السعر: 850 جنيه"). #4 and #5 add their own keys the same
way; they do not invent translations for these.

`src/lib/i18n/messages.ts`: `getMessages(locale: Locale): Messages`.
Pure, no `server-only`, so a Client Component may import it; in practice
Server Components read it and pass strings down. Two checks keep the
"no untranslated labels" constraint honest:

- The type: `ar` is declared `satisfies Messages`, so a key missing in
  Arabic fails `pnpm typecheck`.
- A unit test walks both objects and asserts the same key paths exist in
  each and every leaf is a non-empty string, so an empty `""` placeholder
  fails `pnpm test`.

Language names for the toggle are not messages; they are constants in
`locales.ts`: `LOCALE_NAMES = { ar: "العربية", en: "English" }`, each in
its own script.

### `src/lib/i18n/locales.ts` (pure, client-safe)

```ts
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LANG_COOKIE = "9k_lang";
export const LOCALE_NAMES: Record<Locale, string>;
export function isLocale(value: string | undefined | null): value is Locale;
export function dirOf(locale: Locale): "rtl" | "ltr";
export function otherLocale(locale: Locale): Locale;
/** "/en/p/tee" → { locale: "en", rest: "/p/tee" }; "/p/tee" → { locale: null, rest: "/p/tee" }; "/en" → rest "/" */
export function splitLocale(pathname: string): { locale: Locale | null; rest: string };
/** withLocale("en", "/p/tee", "?color=black") → "/en/p/tee?color=black"; rest "/" → "/en" */
export function withLocale(locale: Locale, rest: string, search?: string): string;
/** toggleHref("ar", "/ar/p/tee", "?color=black") → "/lang/en?to=%2Fp%2Ftee%3Fcolor%3Dblack" */
export function toggleHref(current: Locale, pathname: string, search: string): string;
```

`gate.ts` holds the two pure gates:

```ts
export function localeGate(pathname: string, remembered: string | undefined):
  { kind: "next" } | { kind: "redirect"; pathname: string };
export function switchTarget(lang: Locale, to: string | null | undefined): string;
```

None of these import from `next`, so they run in Vitest as plain
functions. `src/lib/i18n/font.ts` (the `next/font` declaration) is the
one file in the folder that imports `next`; no test imports it.

## The shared header and the toggle

`src/components/site/site-header.tsx` (Server Component): the brand
guidelines' slim header — wordmark, language pill, hairline divider below.
`max-w` content column, 16px side padding on phones (`px-4`), `py-3`,
`border-b border-border`. The wordmark is "9k store" in brand green,
weight 700, `dir="ltr"`, linking to `/<locale>`. The pill sits at the end
of the row (`ms-auto`), which puts it on the left in Arabic and on the
right in English. #4 keeps this component and may add to it; the footer is
#4's.

`src/components/site/language-toggle.tsx` (Client Component):

- Reads `usePathname()` and `useSearchParams()` (wrapped in `<Suspense>`
  by the header, as Next requires) and renders one shadcn `Button`
  `variant="outline" size="sm" asChild` around a plain `<a>` whose `href`
  is `toggleHref(locale, pathname, search)`. A plain anchor, not
  `next/link`: the target is a route handler that sets a cookie and must
  not be prefetched.
- Label: the *other* language's name from `LOCALE_NAMES`, with `lang` and
  `dir` of that language on the label (`<span lang="en" dir="ltr">English</span>`
  on Arabic pages; `<span lang="ar" dir="rtl">العربية</span>` on English
  pages), and `aria-label` from `header.switchLanguage` plus the name.
- No icon. Lucide's globe icons are symmetric and would add nothing but
  width on a phone.

`usePathname` and `useSearchParams` resolve during server rendering, so
the anchor's `href` is correct in the HTML before hydration and the toggle
works with JavaScript off or slow (Instagram's in-app browser on 4G).

## Placeholder home and not-found

`src/app/(store)/[lang]/page.tsx`: `<main className="flex flex-1 items-center
justify-center p-4"><h1 …>{settings.storeName}</h1></main>` — the same
content today's `/` shows, now under the header, in both languages. #4
replaces the body of this file.

`src/app/(store)/[lang]/not-found.tsx`: reads `lang()` from
`next/root-params`, renders `t.notFound.title` as `<h1>`, `t.notFound.body`,
and a `Button asChild` link with `t.notFound.back` to `/<locale>`. #7's
"no longer available" page is a different page (it is a 200 for a known
product), not this one.

## The admin

Moves as a whole from `src/app/admin/` to `src/app/(admin)/admin/`
(`git mv`; URLs unchanged; relative imports inside the folder unchanged;
`@/` imports unchanged). `layout.tsx` becomes a root layout: it imports
`@/app/globals.css` and wraps today's content in
`<html lang="en" dir="ltr" className="h-full antialiased"><body className="min-h-full flex flex-col">`.
Everything else in the admin is untouched: owner-admin spec, call 8 (admin
in English) and its RTL Arabic inputs stand.

### Stacking on #2

This branch is cut from `feat/2-owner-admin-for-managing-the-catalog`
(PR #8), which is not merged yet, and its pull request stacks on that
branch; the dispatcher that chains the v1 issues owns the base. The admin
move touches every admin file, so it is the **first, isolated commit** on
this branch, with nothing else in it; if #2 takes review fixes after that,
they are brought in by merging #2's branch into this one (AGENTS.md: merge,
never rebase), where a pure rename resolves cleanly with
`git merge` rename detection. Later commits never edit admin files.

The store root layout calls `getSettings()`, which throws when the
settings row is missing, so a Worker whose D1 is not migrated answers every
customer URL with a 500. Migrating is already the first by-hand setup step
in the README; this issue adds no "store not set up" page.

## Documentation

- `AGENTS.md` "Architecture": the two root layouts and where the admin now
  lives; `src/lib/i18n` as the locale module; the proxy as the site's
  router. "Things agents get wrong" gains two lines: logical Tailwind
  classes only on customer pages, `rtl:-scale-x-100` on directional icons;
  and every size, code and price through `<Ltr>`/`<Price>`, with
  `formatPrice`/`isolateLtr` for plain text. The dnd-kit path mention
  updates to `src/app/(admin)/admin/`.
- `README.md`: one paragraph under the stack on the URL scheme and the
  `9k_lang` cookie, and a line that `next/font` downloads the font at
  build time.

## Testing

Unit tests in Vitest, next to the code, for logic only:

- `locales.test.ts`: `isLocale` (`"ar"`, `"en"` true; `"fr"`, `"AR"`,
  `""`, `undefined` false); `dirOf`; `otherLocale`; `splitLocale` for
  `/`, `/ar`, `/en/`, `/en/p/tee`, `/p/tee`, `/english/x` (not a locale);
  `withLocale` including `rest === "/"` → `/en` and search appended;
  `toggleHref` encoding example above.
- `gate.test.ts`: `localeGate`: `/` with no cookie → redirect `/ar`; with
  `en` → `/en`; with `fr` → `/ar`; `/p/tee` with `en` → `/ar/p/tee`;
  `/ar/p/tee` → next; `/en` → next; `/lang/en` → next; `/fr/p/tee` →
  redirect `/ar/fr/p/tee`. `switchTarget`: `("en", "/p/tee?color=black")`
  → `/en/p/tee?color=black`; `("en", "/ar/p/tee")` → `/en/p/tee`;
  `("ar", undefined)`, `("ar", "")`, `("ar", "//evil.example")`,
  `("ar", "https://evil.example")`, `("ar", "p/tee")` → `/ar`.
- `format.test.ts`: `formatPrice(850, "en")` → `"850 EGP"`;
  `formatPrice(850, "ar")` → `"850 جنيه"`; `1250` → `"1,250 EGP"`; `0` →
  `"0 EGP"`; result contains no character in `[٠-٩]`; `isolateLtr("TEE-01")`
  → `"⁦TEE-01⁩"`.
- `messages.test.ts`: same key paths in `ar` and `en`; every leaf a
  non-empty string.
- Existing tests keep passing after the admin move (`pnpm test` runs them
  from their new paths; nothing in them references the old path).

No component tests. Manual check before the PR: `pnpm db:migrate:local &&
pnpm db:seed:local && pnpm dev`; visit `/` → lands on `/ar`, page is RTL
in Plex, toggle on the left reads "English"; click → `/en`, LTR, toggle
on the right reads "العربية"; visit `/` again → lands on `/en`; open
`/ar/p/whatever` → Arabic not-found page; `/admin` still logs in and
looks as before. Then `pnpm exec opennextjs-cloudflare build && pnpm
preview` to confirm the Worker serves `/ar`, `/en`, `/lang/en` and `/admin`.

## Calls made while planning (open to change)

Each with what it costs if the owner wants otherwise.

1. **Two root layouts through route groups, moving the admin folder**,
   rather than one root layout that reads a request header for `dir`. The
   documented pattern; `dir` lives in HTML with no header coupling; `lang`
   becomes a root param. Cost: a `git mv` of the admin folder now (URLs
   and imports unchanged), and a full page load between store and admin,
   which nothing does.
2. **The toggle remembers; page visits do not.** A visit to `/en/...`
   from a shared link leaves the remembered choice alone. Matches the
   issue's "remembered *choice*" and keeps prefetches from flipping it.
   Cost if the owner prefers "remember the last language seen": drop the
   route handler, set the cookie in the proxy on full-document GETs
   (skipping RSC and prefetch requests), and make the toggle a plain link
   to the swapped URL — about two hours.
3. **A route handler, not a Server Action, for the toggle.** Works as a
   plain link with no JavaScript, which matters in Instagram's in-app
   browser. Cost: one extra 307 on toggle only.
4. **Unprefixed deep paths redirect to the default language**
   (`/p/tee` → `/ar/p/tee`, whatever the cookie holds), not 404. The
   remembered choice applies only to the bare domain (issue constraint;
   amended after PR #9's review). Old links and typed URLs
   keep working. Cost: none material.
5. **Unknown locale prefixes 404 in Arabic** (`/fr/x` → `/ar/fr/x` →
   not-found). Simpler than a second validation step in the proxy, and the
   customer sees a real page. Cost: none material.
6. **No `Accept-Language` negotiation.** The issue fixes Arabic as the
   first-visit default. Cost if wanted later: one branch in `localeGate`
   reading the header when there is no cookie.
7. **Font weights 400, 600, 700 — not 500.** The brand's role table uses
   only those three; dropping 500 saves two font files on a 4G first
   load. Cost: add `"500"` to the weight array if a later design uses it.
8. **Typed TypeScript message objects, not JSON or a library.** `en` is
   the shape, `ar` `satisfies` it, a test checks for empty strings. Two
   languages and under a hundred strings need nothing more. Cost if a
   third language or a translator workflow appears: convert the two files
   to JSON and add a loader — half a day.
9. **`formatPrice` uses `en-US` grouping for both languages** ("1,250
   جنيه"). Western digits are a constraint; comma grouping is the common
   Egyptian retail convention. Cost: a one-line change to drop grouping.
10. **`<bdi dir="ltr">` for prices, sizes and codes**, as the brand
    guidelines prescribe, via `<Ltr>` and `<Price>`. Cost: none.
11. **Seeded `product.*` and `price.unit` messages** now, with the
    brief's and brand's exact wording, so #4/#5 reuse rather than
    retranslate. Cost: none; later issues may rename keys.
12. **Hand-edit the four shadcn components to logical classes and set
    `rtl: true`**, instead of re-running the CLI with `--overwrite`, so
    nothing else in those files changes under #2's admin. Cost: none;
    future `shadcn add` output comes RTL-ready.
13. **The proxy matcher excludes `/photos/*` already**, reserving the
    path `photo-src.ts` returns, so #3 does not have to touch the proxy.
    Cost: none.
14. **The placeholder home shows only the store name.** No "coming soon"
    copy to translate and later delete. Cost: none.
15. **Cookie `9k_lang`, one year, `HttpOnly`, `SameSite=Lax`, `Secure`
    off `localhost`.** Nothing client-side reads it. Cost: none.
16. **No `globalNotFound` experiment.** Unknown customer URLs already get
    the `[lang]` not-found page; the only URLs that reach Next's built-in
    404 are extension-bearing paths the matcher skips. Cost: none.
17. **Meta description copy** is mine, plain and short, in both
    languages; the owner may reword it in `messages/*.ts`.

## Left to the builder

- Exact spacing and type sizes in the header and the not-found page,
  within the brand tokens (off-white page, near-black text, green only on
  the wordmark and the primary button, pill buttons, hairline divider).
- Whether `LanguageToggle` takes `locale` as a prop or derives it from
  `usePathname()` (both are correct; the prop is simpler to test).
- Internal organization of `src/lib/i18n` beyond the exported names
  above.
- Whether the proxy's admin branch stays inline or moves to a small
  function; its behavior is pinned by the existing `gate.test.ts`.
