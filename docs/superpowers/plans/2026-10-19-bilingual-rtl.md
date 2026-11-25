# Arabic and English with RTL Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every customer URL lives under `/ar` or `/en`, Arabic pages are real RTL HTML in IBM Plex Sans Arabic, a header toggle switches and remembers the language, and later issues get a typed message catalog plus bidi-safe price/size/code helpers.

**Architecture:** Two root layouts through route groups — `src/app/(store)/[lang]/layout.tsx` sets `<html lang dir>`, the font and the shared header; the admin moves unchanged to `src/app/(admin)/admin/` and gets its own LTR root layout. `src/proxy.ts` becomes the site's router: the admin gate as today, plus a pure `localeGate` that sends `/` and unprefixed paths to `/<remembered or ar>...`. A route handler `GET /lang/[lang]?to=` sets the `9k_lang` cookie and redirects; nothing else writes it. `src/lib/i18n` holds pure, Next-free modules (locales, gate, format, messages) that Vitest covers.

**Tech Stack:** Next.js 16.4 App Router (`next/root-params`, route groups, `proxy.ts`) on Cloudflare Workers via `@opennextjs/cloudflare` 1.20; `next/font/google` (IBM Plex Sans Arabic); Tailwind 4 logical utilities; shadcn/ui (Radix base) with `rtl: true`; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-bilingual-rtl-design.md`

Intent-Issue: #6 — https://github.com/ismail9k/9kstore/issues/6

## Global Constraints

- Read `AGENTS.md` and, before writing code, `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`, `.../03-api-reference/04-functions/next-root-params.md` and `.../03-api-reference/03-file-conventions/route-groups.md`. `cacheComponents` stays **off**; no `generateStaticParams` on `[lang]`; no `experimental.globalNotFound`.
- Locales are exactly `ar` and `en`; default `ar`; cookie `9k_lang`; toggle route `/lang/[lang]?to=`.
- `src/lib/i18n/*` never imports from `next` (so it runs in Vitest as plain functions). `next/root-params` is used only in Server Components, never in the route handler or Client Components.
- Customer-page Tailwind classes are logical only: `ps-/pe-/ms-/me-/start-/end-/text-start/text-end/rounded-s-/rounded-e-/border-s-/border-e-`. Directional icons get `rtl:-scale-x-100`. No `tracking-*` on anything that can be Arabic.
- Every size, code and price on a customer page renders through `<Ltr>`/`<Price>`; `formatPrice` uses `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })` so digits are Western.
- Message files: `en.ts` is the shape (`as const`), `ar.ts` is `satisfies Messages`; every leaf non-empty.
- Admin files are touched only in Task 1 (the `git mv`) and Task 3 (its `layout.tsx` becoming a root layout). The admin stays `lang="en" dir="ltr"`, `system-ui` font, `ml-auto` and all.
- Brand: off-white `#F1EDE7` page, near-black text, green `#1F4F34` only on the wordmark and primary buttons; pills; hairline `border-border` divider; 16px phone side padding (`px-4`). No dark mode.
- `noUncheckedIndexedAccess` is on. Import from `src` with `@/`. Tests sit next to code as `*.test.ts(x)`, logic only.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy` or `pnpm upload`. Never push.

## Review Focus

1. A `to` of `//evil.example`, `https://evil.example`, `p/tee` (no leading slash), `""` or missing must redirect to `/<lang>`, never off-site — pinned in Task 5 (`switchTarget` tests).
2. `/` with a cookie holding garbage (`fr`, `AR`, `""`) must land on `/ar`, and a request to `/lang/en` or `/photos/x.webp` must never be rewritten to `/ar/...` — pinned in Task 6 (`localeGate` tests) and the matcher.
3. A price of `1250` in Arabic must render `"1,250 جنيه"` with no Arabic-Indic digit in it, and `0` must render, not disappear — pinned in Task 2 (`formatPrice` tests).
4. An Arabic key left as `""` must fail the test suite, not ship as a blank label — pinned in Task 2 (`messages` test).
5. The toggle's `href` on `/ar/p/tee?color=black` must be `/lang/en?to=%2Fp%2Ftee%3Fcolor%3Dblack` (query preserved, locale stripped, encoded) — pinned in Task 5 (`toggleHref` tests).

---

### Task 1: Move the admin into a route group (pure rename)

**Files:**
- Move: `src/app/admin/**` → `src/app/(admin)/admin/**`

**Interfaces:**
- Produces: the admin at `src/app/(admin)/admin/` with the same URLs (`/admin`, `/admin/login`, `/admin/products/[id]`, `/admin/settings`). Nothing inside changes in this task; `src/app/layout.tsx` is still the single root layout, so the app builds as before.

- [ ] **Step 1: Move the folder**

Run: `mkdir -p "src/app/(admin)" && git mv src/app/admin "src/app/(admin)/admin"`

- [ ] **Step 2: Verify nothing referenced the old path**

Run: `grep -rn "app/admin" src --include='*.ts' --include='*.tsx'`
Expected: no output (relative imports inside the folder and `@/lib/...` imports are unaffected; `LayoutProps<"/admin">` is a URL, not a path).

- [ ] **Step 3: Typecheck, lint, test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; the admin tests run from `src/app/(admin)/admin/**`.

- [ ] **Step 4: Commit (this commit contains only the rename)**

```bash
git add -A src/app
git commit -m "refactor(admin): move the admin into the (admin) route group

Pure rename ahead of the store's own root layout; URLs are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Locale constants, price formatting and the message catalog

**Files:**
- Create: `src/lib/i18n/locales.ts`, `src/lib/i18n/locales.test.ts`
- Create: `src/lib/i18n/format.ts`, `src/lib/i18n/format.test.ts`
- Create: `src/lib/i18n/messages/en.ts`, `src/lib/i18n/messages/ar.ts`, `src/lib/i18n/messages.ts`, `src/lib/i18n/messages.test.ts`

**Interfaces:**
- Produces (`locales.ts`):
  ```ts
  export const LOCALES = ["ar", "en"] as const;
  export type Locale = (typeof LOCALES)[number];
  export const DEFAULT_LOCALE: Locale = "ar";
  export const LANG_COOKIE = "9k_lang";
  export const LOCALE_NAMES: Record<Locale, string>; // { ar: "العربية", en: "English" }
  export function isLocale(value: string | undefined | null): value is Locale;
  export function dirOf(locale: Locale): "rtl" | "ltr";
  export function otherLocale(locale: Locale): Locale;
  export function splitLocale(pathname: string): { locale: Locale | null; rest: string };
  export function withLocale(locale: Locale, rest: string, search?: string): string;
  export function toggleHref(current: Locale, pathname: string, search: string): string;
  ```
- Produces (`format.ts`): `formatPrice(priceEgp: number, locale: Locale): string`; `isolateLtr(text: string): string`.
- Produces (`messages.ts`): `export type Messages`; `getMessages(locale: Locale): Messages`.

- [ ] **Step 1: Write `locales.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { dirOf, isLocale, otherLocale, splitLocale, toggleHref, withLocale } from "./locales";

describe("isLocale", () => {
  test("accepts exactly ar and en", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("en")).toBe(true);
    for (const bad of ["fr", "AR", "", undefined, null]) expect(isLocale(bad)).toBe(false);
  });
});

test("dirOf and otherLocale", () => {
  expect(dirOf("ar")).toBe("rtl");
  expect(dirOf("en")).toBe("ltr");
  expect(otherLocale("ar")).toBe("en");
  expect(otherLocale("en")).toBe("ar");
});

describe("splitLocale", () => {
  test("strips a leading locale segment", () => {
    expect(splitLocale("/en/p/tee")).toEqual({ locale: "en", rest: "/p/tee" });
    expect(splitLocale("/ar")).toEqual({ locale: "ar", rest: "/" });
    expect(splitLocale("/en/")).toEqual({ locale: "en", rest: "/" });
  });
  test("leaves paths with no locale alone", () => {
    expect(splitLocale("/")).toEqual({ locale: null, rest: "/" });
    expect(splitLocale("/p/tee")).toEqual({ locale: null, rest: "/p/tee" });
    expect(splitLocale("/english/x")).toEqual({ locale: null, rest: "/english/x" });
  });
});

describe("withLocale", () => {
  test("prefixes and appends the search", () => {
    expect(withLocale("en", "/p/tee", "?color=black")).toBe("/en/p/tee?color=black");
    expect(withLocale("en", "/")).toBe("/en");
    expect(withLocale("ar", "/", "")).toBe("/ar");
  });
});

test("toggleHref points at the switch route with the locale-free path encoded", () => {
  expect(toggleHref("ar", "/ar/p/tee", "?color=black")).toBe("/lang/en?to=%2Fp%2Ftee%3Fcolor%3Dblack");
  expect(toggleHref("en", "/en", "")).toBe("/lang/ar?to=%2F");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/i18n/locales.test.ts`
Expected: FAIL — cannot resolve `./locales`.

- [ ] **Step 3: Implement `locales.ts`**

`splitLocale`: split on `/`, check the first segment with `isLocale`; `rest` is `"/" + remaining.join("/")` or `"/"`. `withLocale`: `rest === "/" ? `/${locale}` : `/${locale}${rest}``, then `search` appended when non-empty. `toggleHref`: `const { rest } = splitLocale(pathname); return `/lang/${otherLocale(current)}?to=${encodeURIComponent(rest + search)}``.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/lib/i18n/locales.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `messages/en.ts`, `messages/ar.ts`, `messages.ts`**

Copy the two objects verbatim from the spec's "Messages" section (`en` with `as const` and `export type Messages = typeof en`; `ar` with `satisfies Messages`). `messages.ts`:

```ts
import { ar } from "./messages/ar";
import { en } from "./messages/en";
import type { Locale } from "./locales";
export type { Messages } from "./messages/en";
export function getMessages(locale: Locale) { return locale === "ar" ? ar : en; }
```

- [ ] **Step 6: Write `messages.test.ts`**

```ts
import { expect, test } from "vitest";
import { ar } from "./messages/ar";
import { en } from "./messages/en";

function leaves(obj: unknown, prefix = ""): [string, unknown][] {
  if (typeof obj !== "object" || obj === null) return [[prefix, obj]];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

test("Arabic and English have the same keys", () => {
  expect(leaves(ar).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
});

test("every message is a non-empty string", () => {
  for (const [key, value] of [...leaves(ar), ...leaves(en)]) {
    expect(typeof value, key).toBe("string");
    expect((value as string).trim().length, key).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 7: Write `format.test.ts`**

```ts
import { expect, test } from "vitest";
import { formatPrice, isolateLtr } from "./format";

test("formatPrice uses Western digits, comma grouping and the locale's unit", () => {
  expect(formatPrice(850, "en")).toBe("850 EGP");
  expect(formatPrice(850, "ar")).toBe("850 جنيه");
  expect(formatPrice(1250, "en")).toBe("1,250 EGP");
  expect(formatPrice(1250, "ar")).toBe("1,250 جنيه");
  expect(formatPrice(0, "en")).toBe("0 EGP");
  expect(formatPrice(1250, "ar")).not.toMatch(/[٠-٩]/);
});

test("isolateLtr wraps text in LRI…PDI", () => {
  expect(isolateLtr("TEE-01")).toBe("⁦TEE-01⁩");
});
```

- [ ] **Step 8: Run both to verify they fail**

Run: `pnpm test src/lib/i18n`
Expected: `format.test.ts` fails to resolve `./format`; `messages.test.ts` passes (the files exist from Step 5) — if it fails, fix the catalog before moving on.

- [ ] **Step 9: Implement `format.ts`**

`formatPrice`: `new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(priceEgp)` + `" "` + `getMessages(locale).price.unit`. `isolateLtr`: `"⁦" + text + "⁩"`.

- [ ] **Step 10: Run all i18n tests**

Run: `pnpm test src/lib/i18n && pnpm typecheck`
Expected: PASS; typecheck passes (a missing Arabic key would fail here).

- [ ] **Step 11: Commit**

```bash
git add src/lib/i18n
git commit -m "feat(i18n): add locale constants, price formatting and the message catalog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Two root layouts: the store under `[lang]`, the admin on its own

**Files:**
- Create: `src/app/(store)/[lang]/layout.tsx`, `src/app/(store)/[lang]/page.tsx`, `src/app/(store)/[lang]/not-found.tsx`
- Create: `src/lib/i18n/font.ts`
- Modify: `src/app/(admin)/admin/layout.tsx`
- Modify: `src/app/globals.css` (body font-family)
- Delete: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `isLocale`, `dirOf`, `withLocale`, `getMessages` from Task 2; `getSettings` from `@/lib/catalog`.
- Produces: `plex` (`NextFontWithVariable`, variable `--font-plex`) in `src/lib/i18n/font.ts`; `lang()` from `next/root-params` available to every store Server Component; the admin root layout.

- [ ] **Step 1: Create `src/lib/i18n/font.ts`**

```ts
import { IBM_Plex_Sans_Arabic } from "next/font/google";
export const plex = IBM_Plex_Sans_Arabic({
  weight: ["400", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-plex",
});
```

(This file imports `next`; it is the one exception in `src/lib/i18n` and no test imports it.)

- [ ] **Step 2: Change the body font in `src/app/globals.css`**

Replace `font-family: system-ui, sans-serif;` with `font-family: var(--font-plex, system-ui), sans-serif;`.

- [ ] **Step 3: Write the store root layout `src/app/(store)/[lang]/layout.tsx`**

Server Component. `generateMetadata` and the default export both: `const locale = await lang(); if (!isLocale(locale)) notFound();` (`lang` from `next/root-params`, typed `string | undefined`). Metadata: `{ title: settings.storeName, description: getMessages(locale).meta.description }` with `settings = await getSettings()`. Render exactly the spec's markup (`<html lang dir className={`${plex.variable} h-full antialiased`}>`, `<body className="min-h-full flex flex-col">{children}</body>`) — the header is added in Task 5. Import `@/app/globals.css`. No `generateStaticParams`.

- [ ] **Step 4: Write the placeholder page `src/app/(store)/[lang]/page.tsx`**

Async Server Component: `const settings = await getSettings();` then `<main className="flex flex-1 items-center justify-center p-4"><h1 className="text-3xl font-bold">{settings.storeName}</h1></main>`. (`font-bold` = 700 per the brand table; no `tracking-*`.)

- [ ] **Step 5: Write `src/app/(store)/[lang]/not-found.tsx`**

Async Server Component: `const locale = await lang(); const t = getMessages(isLocale(locale) ? locale : DEFAULT_LOCALE);` then a centered `<main>` with `<h1>` `t.notFound.title`, `<p className="text-muted-foreground">` `t.notFound.body`, and `<Button asChild><Link href={withLocale(locale, "/")}>{t.notFound.back}</Link></Button>` (`Button` from `@/components/ui/button`, `Link` from `next/link`).

- [ ] **Step 6: Make the admin layout a root layout**

In `src/app/(admin)/admin/layout.tsx` add `import "@/app/globals.css";` and wrap the returned fragment: `<html lang="en" dir="ltr" className="h-full antialiased"><body className="min-h-full flex flex-col">…existing children…</body></html>`. Keep `metadata`, `getSession`, `getSettings`, `AdminHeader`, `Toaster` exactly as they are.

- [ ] **Step 7: Delete the old root files**

Run: `git rm src/app/layout.tsx src/app/page.tsx src/app/page.test.tsx`

- [ ] **Step 8: Typecheck, lint, test, dev smoke**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS (typegen generates `next/root-params` types for `lang`).
Run: `pnpm dev`, open `http://localhost:3000/ar` and `/en`: the store name renders; the document is `<html lang="ar" dir="rtl">` / `lang="en" dir="ltr"`; computed `font-family` begins with the Plex family. Open `/ar/nope`: the Arabic not-found page. Open `/admin/login`: unchanged, `system-ui`. (`/` 404s until Task 6 — expected.)

- [ ] **Step 9: Commit**

```bash
git add -A src/app src/lib/i18n/font.ts
git commit -m "feat(store): add the [lang] root layout with dir, font and a localized not-found page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: shadcn RTL mode and logical classes in the shared components

**Files:**
- Modify: `components.json` (`"rtl": true`)
- Modify: `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/table.tsx`, `src/components/ui/dialog.tsx`
- Create: `src/components/ltr.tsx`, `src/components/price.tsx`

**Interfaces:**
- Produces: `Ltr({ children, className? })` rendering `<bdi dir="ltr">`; `Price({ value, locale, className? })` rendering `<Ltr>{formatPrice(value, locale)}</Ltr>`.

- [ ] **Step 1: Set `"rtl": true` in `components.json`**

- [ ] **Step 2: Replace physical with logical classes**

- `button.tsx`: every `has-data-[icon=inline-end]:pr-N` → `has-data-[icon=inline-end]:pe-N`; every `has-data-[icon=inline-start]:pl-N` → `has-data-[icon=inline-start]:ps-N` (sizes `default`, `xs`, `sm`, `lg`).
- `badge.tsx`: the same two in the base class list.
- `table.tsx`: both `pr-0` → `pe-0`.
- `dialog.tsx`: `right-2` → `end-2`. Leave `left-1/2 -translate-x-1/2` in `dialog.tsx` and `alert-dialog.tsx`.

Run: `grep -nE "\b(pl|pr|ml|mr|left|right|text-left|text-right)-" src/components/ui/button.tsx src/components/ui/badge.tsx src/components/ui/table.tsx src/components/ui/dialog.tsx`
Expected: only the two `left-1/2` centering lines.

- [ ] **Step 3: Create `src/components/ltr.tsx` and `src/components/price.tsx`**

Exactly the spec's two components ("Bidi-safe values"); `Price` imports `formatPrice` from `@/lib/i18n/format` and `Locale` from `@/lib/i18n/locales`. Both are Server-Component-safe (no hooks) and importable from Client Components.

- [ ] **Step 4: Typecheck, lint, test, and eyeball the admin**

Run: `pnpm typecheck && pnpm lint && pnpm test`; then `pnpm dev`, log in to `/admin`, open a product form: buttons, badges, the table and the remove-color dialog look as before (LTR, so logical = physical).

- [ ] **Step 5: Commit**

```bash
git add components.json src/components
git commit -m "feat(ui): switch shared shadcn components to logical properties and add Ltr and Price

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared header, language toggle and the switch route

**Files:**
- Create: `src/components/site/site-header.tsx`, `src/components/site/language-toggle.tsx`
- Create: `src/lib/i18n/gate.ts` (`switchTarget` only in this task), `src/lib/i18n/gate.test.ts`
- Create: `src/app/lang/[lang]/route.ts`
- Modify: `src/app/(store)/[lang]/layout.tsx` (render the header)

**Interfaces:**
- Consumes: `toggleHref`, `otherLocale`, `LOCALE_NAMES`, `LANG_COOKIE`, `isLocale`, `splitLocale`, `withLocale`, `getMessages` from Task 2; `Button` from `@/components/ui/button`.
- Produces: `switchTarget(lang: Locale, to: string | null | undefined): string` in `gate.ts`; `SiteHeader({ locale, storeName })`; `LanguageToggle({ locale, label })` (Client Component; `label` is `t.header.switchLanguage`).

- [ ] **Step 1: Write the `switchTarget` tests in `gate.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { switchTarget } from "./gate";

describe("switchTarget", () => {
  test("prefixes a locale-free path and keeps the query", () => {
    expect(switchTarget("en", "/p/tee?color=black")).toBe("/en/p/tee?color=black");
    expect(switchTarget("ar", "/")).toBe("/ar");
  });
  test("strips a locale a caller sent anyway", () => {
    expect(switchTarget("en", "/ar/p/tee")).toBe("/en/p/tee");
  });
  test("falls back to the language home for anything that is not a same-origin path", () => {
    for (const bad of [undefined, null, "", "//evil.example", "https://evil.example", "p/tee", "/\\evil.example"]) {
      expect(switchTarget("ar", bad)).toBe("/ar");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/i18n/gate.test.ts`
Expected: FAIL — cannot resolve `./gate`.

- [ ] **Step 3: Implement `switchTarget` in `gate.ts`**

Accept `to` only when it matches `/^\/(?![\/\\])/` (one leading slash, not followed by `/` or `\`); split the path from the query at the first `?`; `splitLocale` the path; return `withLocale(lang, rest, search)`. Otherwise `withLocale(lang, "/")`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/i18n/gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/app/lang/[lang]/route.ts`**

```ts
export async function GET(request: NextRequest, ctx: RouteContext<"/lang/[lang]">): Promise<Response>
```

`const { lang } = await ctx.params; if (!isLocale(lang)) notFound();` → `const target = switchTarget(lang, request.nextUrl.searchParams.get("to"));` → `const res = NextResponse.redirect(new URL(target, request.url), 307); res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" }); return res;`. No `next/root-params` here.

- [ ] **Step 6: Write `language-toggle.tsx` (Client Component)**

`"use client"`. Props `{ locale: Locale; label: string }`. `const pathname = usePathname(); const search = useSearchParams().toString(); const href = toggleHref(locale, pathname, search ? `?${search}` : "");` `const other = otherLocale(locale);` Render `<Button asChild variant="outline" size="sm"><a href={href} aria-label={`${label}: ${LOCALE_NAMES[other]}`}><span lang={other} dir={dirOf(other)}>{LOCALE_NAMES[other]}</span></a></Button>`. A plain `<a>`, not `next/link`.

- [ ] **Step 7: Write `site-header.tsx` (Server Component)**

Props `{ locale: Locale; storeName: string }`. `const t = getMessages(locale);`

```tsx
<header className="border-b border-border">
  <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
    <Link href={withLocale(locale, "/")} dir="ltr" className="font-bold text-primary" aria-label={storeName}>9k store</Link>
    <div className="ms-auto">
      <Suspense fallback={null}><LanguageToggle locale={locale} label={t.header.switchLanguage} /></Suspense>
    </div>
  </div>
</header>
```

- [ ] **Step 8: Render the header in the store layout**

In `src/app/(store)/[lang]/layout.tsx` put `<SiteHeader locale={locale} storeName={settings.storeName} />` as the first child of `<body>`, before `{children}`; the layout already loads `settings`.

- [ ] **Step 9: Typecheck, lint, test, dev smoke**

Run: `pnpm typecheck && pnpm lint && pnpm test`. Then `pnpm dev`: on `/ar` the pill sits on the left and reads "English" (its `<span>` is `lang="en" dir="ltr"`); view source shows `href="/lang/en?to=%2F"` in the HTML before hydration. Click: land on `/en`, pill on the right reads "العربية". On `/en/p/x?color=black` (not-found page, header still shows) the pill's href is `/lang/ar?to=%2Fp%2Fx%3Fcolor%3Dblack`. DevTools → cookies: `9k_lang=en` after the click (dev is not `production`, so the cookie is stored over http).

- [ ] **Step 10: Commit**

```bash
git add src/components/site src/lib/i18n/gate.ts src/lib/i18n/gate.test.ts src/app/lang "src/app/(store)"
git commit -m "feat(store): add the shared header with a language toggle that remembers the choice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The proxy routes the bare domain and unprefixed paths

**Files:**
- Modify: `src/lib/i18n/gate.ts` (add `localeGate`), `src/lib/i18n/gate.test.ts`
- Modify: `src/proxy.ts`

**Interfaces:**
- Produces: `localeGate(pathname: string, remembered: string | undefined): { kind: "next" } | { kind: "redirect"; pathname: string }` in `gate.ts`.
- Consumes: `adminGate`, `isPageRequest`, `LOGIN_PATH` from `@/lib/auth/gate` (unchanged).

- [ ] **Step 1: Add `localeGate` tests to `gate.test.ts`**

```ts
describe("localeGate", () => {
  test("the bare domain goes to the remembered language, else Arabic", () => {
    expect(localeGate("/", undefined)).toEqual({ kind: "redirect", pathname: "/ar" });
    expect(localeGate("/", "en")).toEqual({ kind: "redirect", pathname: "/en" });
    for (const bad of ["fr", "AR", ""]) expect(localeGate("/", bad)).toEqual({ kind: "redirect", pathname: "/ar" });
  });
  test("unprefixed paths get the prefix, keeping the path", () => {
    expect(localeGate("/p/tee", "en")).toEqual({ kind: "redirect", pathname: "/en/p/tee" });
    expect(localeGate("/fr/p/tee", undefined)).toEqual({ kind: "redirect", pathname: "/ar/fr/p/tee" });
  });
  test("prefixed and reserved paths pass", () => {
    expect(localeGate("/ar/p/tee", "en")).toEqual({ kind: "next" });
    expect(localeGate("/en", undefined)).toEqual({ kind: "next" });
    expect(localeGate("/lang/en", undefined)).toEqual({ kind: "next" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/i18n/gate.test.ts`
Expected: FAIL — `localeGate` is not exported.

- [ ] **Step 3: Implement `localeGate`**

`if (splitLocale(pathname).locale) return { kind: "next" }; if (pathname === "/lang" || pathname.startsWith("/lang/")) return { kind: "next" }; const locale = isLocale(remembered) ? remembered : DEFAULT_LOCALE; return { kind: "redirect", pathname: withLocale(locale, pathname) };` (`withLocale` already maps `"/"` to `/ar`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/i18n/gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `src/proxy.ts`**

Keep today's admin branch verbatim inside `if (pathname === "/admin" || pathname.startsWith("/admin/")) { … return response; }` (session check, `adminGate` switch, `X-Robots-Tag`). After it:

```ts
const decision = localeGate(pathname, request.cookies.get(LANG_COOKIE)?.value);
if (decision.kind === "redirect") {
  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;          // search is preserved on the clone
  return NextResponse.redirect(url, 307);
}
return NextResponse.next();
```

and the matcher:

```ts
export const config = {
  matcher: ["/((?!_next|photos|.*\\..*).*)"],
};
```

Update the file's doc comment: it is now the site's router (locale redirect for customers, optimistic gate for the admin).

- [ ] **Step 6: Typecheck, lint, test, dev smoke**

Run: `pnpm typecheck && pnpm lint && pnpm test` (the existing `src/lib/auth/gate.test.ts` still passes). `pnpm dev`: `curl -sI localhost:3000/` → `307` with `location: /ar`; `curl -sI -H 'Cookie: 9k_lang=en' localhost:3000/` → `/en`; `curl -sI 'localhost:3000/p/tee?color=black'` → `/ar/p/tee?color=black`; `curl -sI localhost:3000/lang/en` → `307` to `/en` with a `set-cookie: 9k_lang=en` header; `curl -sI localhost:3000/admin` → `307` to `/admin/login` with `x-robots-tag`; `curl -sI localhost:3000/favicon.ico` → `200`.

- [ ] **Step 7: Commit**

```bash
git add src/proxy.ts src/lib/i18n/gate.ts src/lib/i18n/gate.test.ts
git commit -m "feat(routing): send the bare domain and unprefixed paths to the remembered or default language

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation and the Worker check

**Files:**
- Modify: `AGENTS.md`, `README.md`

- [ ] **Step 1: Update `AGENTS.md`**

"Architecture": replace the admin sentence so it reads that the app has two root layouts — customer pages under `src/app/(store)/[lang]/` (`lang` is a root param, `next/root-params`), the admin under `src/app/(admin)/admin/` — and that `src/proxy.ts` is the site's router (locale redirect for `/` and unprefixed paths, optimistic admin gate); `src/lib/i18n` holds locales, messages, `formatPrice`/`isolateLtr` and the gates; the toggle route is `/lang/[lang]`. "Things agents get wrong": extend the Arabic bullet with: logical Tailwind classes only (`ps-/pe-/ms-/me-/start-/end-`), `rtl:-scale-x-100` on directional icons, every size/code/price through `<Ltr>`/`<Price>` (`formatPrice`/`isolateLtr` for plain text), new strings go in both `src/lib/i18n/messages/*.ts`. Change the dnd-kit path to `src/app/(admin)/admin/`.

- [ ] **Step 2: Update `README.md`**

Under "Stack" add a short paragraph: URLs are `/ar/...` and `/en/...`; `/` and unprefixed paths redirect to the language in the `9k_lang` cookie (set only by the header toggle via `/lang/<ar|en>`), else Arabic; the font (IBM Plex Sans Arabic) is downloaded by `next/font` at build time, so builds need network access.

- [ ] **Step 3: Full check and Worker build**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm exec opennextjs-cloudflare build`
Expected: all pass; the build downloads the font and finishes.
Run: `pnpm preview`, then `curl -sI localhost:8787/` → `307` to `/ar`; `curl -s localhost:8787/ar | grep -o '<html[^>]*>'` → contains `lang="ar" dir="rtl"`; `curl -sI localhost:8787/lang/en` → `307` with `set-cookie`; `curl -sI localhost:8787/admin` → `307` to `/admin/login`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: describe the bilingual routing, RTL rules and the i18n module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
