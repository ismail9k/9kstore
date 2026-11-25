# Product Page and WhatsApp Order Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/<lang>/p/<slug>` — gallery, name, price, description, color and size pickers, size chart, one "Order on WhatsApp" button — and the order route behind the button that re-checks stock on the server and redirects to `wa.me` with the bilingual order message.

**Architecture:** A Server Component page reads one product and the settings from D1 per request and hands them to one Client Component that owns the selected color and size, renders the scroll-snap gallery and the two shadcn `ToggleGroup` pickers, and builds the button's `href`. That `href` is a same-origin `GET` Route Handler which reads D1 again, runs a pure `decideOrder`, and answers `302` either to `https://wa.me/...` (message from a pure `buildOrderMessage`) or back to the page with a `notice`. No `window.open`, no fetch on tap.

**Tech Stack:** Next.js 16.4 App Router (Server Components, `next/root-params`, Route Handlers, native `history.replaceState`) on Cloudflare Workers via `@opennextjs/cloudflare`; Tailwind 4 with the brand tokens; shadcn/ui `ToggleGroup`, `Button`, `Badge`; the existing `<Photo>`, `<Price>`, `<Ltr>`, `formatPrice`, `isolateLtr`; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-product-page-order-button-design.md`

Intent-Issue: #5 — https://github.com/ismail9k/9kstore/issues/5

## Global Constraints

- Read `AGENTS.md` first. Before Tasks 5–7 read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, `route.md` (`RouteContext`, `request.nextUrl.searchParams`), `04-functions/next-root-params.md` (not usable in Route Handlers) and `01-getting-started/04-linking-and-navigating.md` ("Native History API"). `cacheComponents` stays **off**; no `generateStaticParams`; catalog reads are never cached.
- Customer pages: logical Tailwind classes only (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`, never `pl-`/`pr-`/`left-`/`right-`/`text-left`); every size and price in HTML through `<Ltr>`/`<Price>`; plain-text size/price/code in the Arabic message through `isolateLtr`; nothing from dnd-kit or `src/app/(admin)` imported by customer code; no carousel library.
- Brand: green (`bg-primary`/`text-primary`/`ring-primary`) only on the price, the selected swatch's offset ring, the selected size chip, the one primary button and focus rings. Sold out is near-black (`text-foreground/40` + `<s>`), never red. Photo tiles `bg-muted rounded-[10px]`. Buttons are pills (the shadcn `Button` already is).
- Copy is fixed by the spec's "Messages" section, in both `src/lib/i18n/messages/en.ts` and `ar.ts`; `product.size/color/price/soldOut/orderOnWhatsapp` are reused, never re-added.
- URLs: product page `withLocale(locale, "/p/<slug>", "?color=<key>")`; order route `/<lang>/p/<slug>/order?color=<key>&size=<size>&price=<priceEgp>`; WhatsApp `https://wa.me/<digits>?text=<encodeURIComponent(message)>`. Every order-route response carries `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`.
- The slug rule is the catalog's `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (1–80 chars). A hidden (`published === false`) or unknown product is `notFound()` / 404 in this issue (#7 replaces it).
- `<Photo>` `sizes` on this page: `"(min-width: 768px) 50vw, 100vw"` (gallery slides and the size chart). Only the first slide of the initial color is `priority`.
- Tests next to the code as `*.test.ts`, logic only (no component tests); `noUncheckedIndexedAccess` is on; `@/` imports. Before every commit: `pnpm lint && pnpm typecheck && pnpm test` pass.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy`/`pnpm upload`. Never push.

## Review Focus

1. A size with characters that need encoding (`"XL/2"`, `"32 Long"`) must round-trip through the order link and land in the message unchanged — pinned in Task 2 (`decideOrder` with `size: "32 Long"`) via `URLSearchParams` on the client and `searchParams.get` on the server.
2. A product whose only in-stock sizes belong to a non-first color must still open with the first color (all chips disabled, hint "This color is sold out") and let the customer switch — pinned in Task 3 (`isColorSoldOut`, `initialColor` fallback) and checked by hand in Task 8.
3. A `?color=` naming a color whose `photos` is empty must show the empty tile, not crash on `photos[0]` — pinned by the gallery's empty-list branch in Task 6 and `initialColor` accepting any existing key in Task 3.
4. A `?price=` that is not an integer (`"abc"`, `"850.5"`, `""`) must not block the order or throw — pinned in Task 2 (`price: "abc"` → whatsapp).
5. The Arabic message must contain Western digits only and keep `"850 جنيه"` as one LTR run even when the price has grouping (`1,250`) — pinned in Task 1 (`priceEgp: 1250`, `[٠-٩]` absent, LRI/PDI around the formatted price).

---

### Task 1: The order message builder

**Files:**
- Create: `src/lib/order/message.ts`
- Test: `src/lib/order/message.test.ts`

**Interfaces:**
- Consumes: `formatPrice`, `isolateLtr` from `@/lib/i18n/format`; `getMessages` from `@/lib/i18n/messages`; `type Locale` from `@/lib/i18n/locales`; the new `order.code` key from Task 4 (write the message key first in this task, see Step 3).
- Produces:
  - `export type OrderDetails = { greeting: string; productName: string; colorName: string; size: string; priceEgp: number; code: string | null; link: string }`
  - `export function buildOrderMessage(d: OrderDetails, locale: Locale): string`
  - `export function whatsappUrl(number: string, message: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { buildOrderMessage, whatsappUrl, type OrderDetails } from "./message";

const details: OrderDetails = {
  greeting: "Hi 9k Store, I'd like to order:",
  productName: "Oversized Tee",
  colorName: "Black",
  size: "L",
  priceEgp: 850,
  code: "TEE-01",
  link: "https://example.com/en/p/oversized-tee?color=black",
};

describe("buildOrderMessage", () => {
  test("English matches the brief's example plus the code line", () => {
    expect(buildOrderMessage(details, "en")).toBe(
      "Hi 9k Store, I'd like to order:\nOversized Tee — Black\nSize: L\nPrice: 850 EGP\nCode: TEE-01\nhttps://example.com/en/p/oversized-tee?color=black",
    );
  });
  test("Arabic isolates size, price and code", () => {
    const ar = buildOrderMessage(
      { ...details, greeting: "أهلاً 9k Store، حابب أطلب:", productName: "تيشيرت أوفر سايز", colorName: "أسود",
        link: "https://example.com/ar/p/oversized-tee?color=black" },
      "ar",
    );
    expect(ar).toBe(
      "أهلاً 9k Store، حابب أطلب:\nتيشيرت أوفر سايز — أسود\nالمقاس: ⁦L⁩\nالسعر: ⁦850 جنيه⁩\nالكود: ⁦TEE-01⁩\nhttps://example.com/ar/p/oversized-tee?color=black",
    );
    expect(ar).not.toMatch(/[٠-٩]/);
  });
  test("drops the code line when there is no code", () => {
    expect(buildOrderMessage({ ...details, code: null }, "en")).not.toContain("Code:");
    expect(buildOrderMessage({ ...details, code: null }, "ar")).not.toContain("الكود");
    expect(buildOrderMessage({ ...details, code: null }, "en").split("\n")).toHaveLength(5);
  });
  test("groups thousands with a comma and isolates the whole price in Arabic", () => {
    expect(buildOrderMessage({ ...details, priceEgp: 1250 }, "en")).toContain("Price: 1,250 EGP");
    expect(buildOrderMessage({ ...details, priceEgp: 1250 }, "ar")).toContain("السعر: ⁦1,250 جنيه⁩");
  });
});

test("whatsappUrl encodes the message as the text parameter", () => {
  expect(whatsappUrl("201011111111", "a\nب")).toBe("https://wa.me/201011111111?text=a%0A%D8%A8");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/order/message.test.ts`
Expected: FAIL — cannot resolve `./message`.

- [ ] **Step 3: Add the `order.code` message key**

In `src/lib/i18n/messages/en.ts` add `order: { code: "Code" }` after `footer`; in `ar.ts` add `order: { code: "الكود" }`. (Task 4 adds the other `order.*` keys.)

- [ ] **Step 4: Implement `buildOrderMessage` and `whatsappUrl` in `src/lib/order/message.ts`**

Lines in order: greeting; `${productName} — ${colorName}`; `${t.product.size}: ${size}`; `${t.product.price}: ${formatPrice(priceEgp, locale)}`; `${t.order.code}: ${code}` only when `code !== null`; `link`. Joined with `"\n"`. When `locale === "ar"`, the size, the formatted price and the code are each wrapped with `isolateLtr`. `whatsappUrl` returns `` `https://wa.me/${number}?text=${encodeURIComponent(message)}` ``. No `next` imports; a module doc comment saying it is pure and client-safe.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/lib/order/message.test.ts src/lib/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/order/message.ts src/lib/order/message.test.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ar.ts
git commit -m "feat(order): build the bilingual WhatsApp order message

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The order decision

**Files:**
- Create: `src/lib/order/decide.ts`
- Test: `src/lib/order/decide.test.ts`

**Interfaces:**
- Consumes: `isInStock`, `nameIn`, `colorByKey` (Task 3 — write Task 3's `colorByKey` first if Task 2 is implemented before it; the two tasks are independent otherwise) from `@/lib/catalog/helpers`; `type Product`, `type Settings` from `@/lib/catalog/schema`; `withLocale`, `type Locale` from `@/lib/i18n/locales`; `buildOrderMessage`, `whatsappUrl` from `./message`.
- Produces:
  - `export type Notice = "sold-out" | "changed" | "failed"`
  - `export function parseNotice(value: string | string[] | null | undefined): Notice | null`
  - `export type OrderQuery = { color: string | null; size: string | null; price: string | null }`
  - `export type OrderDecision = { kind: "whatsapp"; url: string } | { kind: "back"; path: string }`
  - `export function decideOrder(input: { product: Product; settings: Settings; locale: Locale; origin: string; query: OrderQuery }): OrderDecision`
  - `export function requestOrigin(headers: Headers, url: string): string`

- [ ] **Step 1: Write the failing tests**

Build `product` from the dev seed's values (`slug: "oversized-tee"`, `code: "TEE-01"`, `priceEgp: 850`, `sizes: ["S","M","L","XL"]`, colors `grey`/`black`/`green`/`cream` with Arabic and English names, `soldOut: [{ color: "black", size: "S" }]`, `published: true`) and `settings` with `whatsappNumber: "201011111111"`, the default greetings, `storeName: "9k Store"`.

```ts
const base = { product, settings, locale: "en" as const, origin: "https://example.com" };
const q = (over: Partial<OrderQuery>): OrderQuery => ({ color: "black", size: "L", price: "850", ...over });

describe("decideOrder", () => {
  test("in stock → WhatsApp with the full message and the color link", () => {
    const d = decideOrder({ ...base, query: q({}) });
    expect(d.kind).toBe("whatsapp");
    const url = new URL((d as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://wa.me/201011111111");
    expect(url.searchParams.get("text")).toBe(
      "Hi 9k Store, I'd like to order:\nOversized Tee — Black\nSize: L\nPrice: 850 EGP\nCode: TEE-01\nhttps://example.com/en/p/oversized-tee?color=black",
    );
  });
  test("Arabic uses the Arabic greeting, names and link", () => {
    const d = decideOrder({ ...base, locale: "ar", query: q({}) }) as { url: string };
    const text = new URL(d.url).searchParams.get("text")!;
    expect(text.startsWith("أهلاً 9k Store، حابب أطلب:\nتيشيرت أوفر سايز — أسود\n")).toBe(true);
    expect(text.endsWith("https://example.com/ar/p/oversized-tee?color=black")).toBe(true);
  });
  test("a size with a space survives the round trip", () => {
    const p = { ...product, sizes: ["32 Long"], soldOut: [] };
    const d = decideOrder({ ...base, product: p, query: q({ size: "32 Long" }) }) as { url: string };
    expect(new URL(d.url).searchParams.get("text")).toContain("Size: 32 Long");
  });
  test("sold out → back with notice=sold-out", () =>
    expect(decideOrder({ ...base, query: q({ size: "S" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=sold-out" }));
  test("price mismatch → back with notice=changed", () =>
    expect(decideOrder({ ...base, query: q({ price: "900" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=changed" }));
  test("missing or non-integer price skips the price check", () => {
    for (const price of [null, "", "abc", "850.5"]) expect(decideOrder({ ...base, query: q({ price }) }).kind).toBe("whatsapp");
  });
  test("unknown color → back to the page with notice=failed and no color", () =>
    expect(decideOrder({ ...base, query: q({ color: "pink" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?notice=failed" }));
  test("unknown size → back with the color and notice=failed", () =>
    expect(decideOrder({ ...base, query: q({ size: "XXL" }) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=failed" }));
  test("no WhatsApp number → back with notice=failed", () =>
    expect(decideOrder({ ...base, settings: { ...settings, whatsappNumber: "" }, query: q({}) })).toEqual({ kind: "back", path: "/en/p/oversized-tee?color=black&notice=failed" }));
  test("a back path is always a same-origin path", () => {
    for (const color of ["//evil.example", "https://evil.example", "black"]) {
      const d = decideOrder({ ...base, query: q({ color, size: "nope" }) });
      expect(d.kind).toBe("back");
      expect((d as { path: string }).path).toMatch(/^\/en\/p\/oversized-tee(\?|$)/);
    }
  });
});

describe("parseNotice", () => {
  test.each(["sold-out", "changed", "failed"])("accepts %s", (v) => expect(parseNotice(v)).toBe(v));
  test.each(["x", "", null, undefined, ["sold-out"]])("rejects %j", (v) => expect(parseNotice(v as never)).toBeNull());
});

describe("requestOrigin", () => {
  test("forwarded headers win", () =>
    expect(requestOrigin(new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "9k.example", host: "internal" }), "http://internal/x")).toBe("https://9k.example"));
  test("host header next", () => expect(requestOrigin(new Headers({ host: "shop.example" }), "https://ignored/x")).toBe("https://shop.example"));
  test("the URL last, with no trailing slash", () => expect(requestOrigin(new Headers(), "http://localhost:3000/ar/p/tee/order?x=1")).toBe("http://localhost:3000"));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/order/decide.test.ts`
Expected: FAIL — cannot resolve `./decide`.

- [ ] **Step 3: Implement `decide.ts`**

`decideOrder` applies the spec's table in order: unknown color → `back` to `withLocale(locale, "/p/<slug>", "?notice=failed")`; unknown size → `back` with `?color=<key>&notice=failed`; `!isInStock` → `notice=sold-out`; `price` parses as an integer (`/^\d+$/`) and differs from `priceEgp` → `notice=changed`; empty number → `notice=failed`; else `whatsapp` with `whatsappUrl(settings.whatsappNumber, buildOrderMessage({ greeting: locale === "ar" ? settings.greetingAr : settings.greetingEn, productName: nameIn(product, locale), colorName: nameIn(color, locale), size, priceEgp: product.priceEgp, code: product.code, link: `${origin}${withLocale(locale, "/p/<slug>", "?color=<key>")}` }, locale))`. Build every `back` search string with `URLSearchParams` so a color key is encoded (keys are URL-safe by schema, so the output equals the literal paths in the tests). `requestOrigin`: proto = `x-forwarded-proto` ?? URL protocol without `:`; host = `x-forwarded-host` ?? `host` ?? URL host. `parseNotice`: a `string` equal to one of the three, else `null`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/order`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/order/decide.ts src/lib/order/decide.test.ts
git commit -m "feat(order): decide between WhatsApp and a notice from fresh stock and price

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Picker helpers in the catalog

**Files:**
- Modify: `src/lib/catalog/helpers.ts` (export `StockFields`; add four functions)
- Test: `src/lib/catalog/helpers.test.ts`

**Interfaces:**
- Produces:
  - `export type StockFields = Pick<Product, "sizes" | "colors" | "soldOut">` (today private)
  - `export function colorByKey(p: Pick<Product, "colors">, key: string): Color | null`
  - `export function initialColor(p: Pick<Product, "colors">, key: string | string[] | undefined): Color`
  - `export function sizeAvailability(p: StockFields, colorKey: string): { size: string; inStock: boolean }[]`
  - `export function isColorSoldOut(p: StockFields, colorKey: string): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `helpers.test.ts`, reusing its `color()` and `product()` factories:

```ts
describe("colorByKey", () => {
  const p = product([color("grey"), color("black")]);
  test("finds a color", () => expect(colorByKey(p, "black")?.key).toBe("black"));
  test("is null for an unknown key", () => expect(colorByKey(p, "pink")).toBeNull());
});

describe("initialColor", () => {
  const p = product([color("grey"), color("black")]);
  test("picks the named color", () => expect(initialColor(p, "black").key).toBe("black"));
  test.each([undefined, "pink", ["black", "grey"]])("falls back to the first color for %j", (key) =>
    expect(initialColor(p, key).key).toBe("grey"));
});

describe("sizeAvailability", () => {
  const p = { sizes: ["S", "M", "L", "XL"], colors: [color("black")], soldOut: [{ color: "black", size: "S" }] };
  test("lists every size in order with its stock", () =>
    expect(sizeAvailability(p, "black")).toEqual([
      { size: "S", inStock: false }, { size: "M", inStock: true }, { size: "L", inStock: true }, { size: "XL", inStock: true },
    ]));
  test("marks every size out for an unknown color", () =>
    expect(sizeAvailability(p, "pink").every((s) => !s.inStock)).toBe(true));
});

describe("isColorSoldOut", () => {
  const p = { sizes: ["S", "M"], colors: [color("black"), color("grey")], soldOut: [{ color: "black", size: "S" }, { color: "black", size: "M" }] };
  test("true when every size of the color is sold out", () => expect(isColorSoldOut(p, "black")).toBe(true));
  test("false when a size is in stock", () => expect(isColorSoldOut(p, "grey")).toBe(false));
  test("true for an unknown color", () => expect(isColorSoldOut(p, "pink")).toBe(true));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/catalog/helpers.test.ts`
Expected: FAIL — the four functions are not exported.

- [ ] **Step 3: Implement them in `helpers.ts`**

`initialColor`: `typeof key === "string"` and `colorByKey` hits → that color; else `p.colors[0]`, and if that is `undefined` (impossible by schema) `throw new Error("A product has no colors")`. `sizeAvailability`: `p.sizes.map((size) => ({ size, inStock: isInStock(p, colorKey, size) }))`. `isColorSoldOut`: `sizeAvailability(p, colorKey).every((s) => !s.inStock)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/catalog/helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/helpers.ts src/lib/catalog/helpers.test.ts
git commit -m "feat(catalog): color lookup and per-color size availability for the product page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Messages and the shadcn ToggleGroup

**Files:**
- Modify: `src/lib/i18n/messages/en.ts`, `src/lib/i18n/messages/ar.ts`
- Create (via CLI): `src/components/ui/toggle-group.tsx`, `src/components/ui/toggle.tsx`

**Interfaces:**
- Produces: message keys `product.chooseSize`, `product.colorSoldOut`, `product.sizeChart`, `product.orderingUnavailable`, `order.soldOut`, `order.changed`, `order.failed` (with `order.code` from Task 1); `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`.

- [ ] **Step 1: Add the keys**

`en.ts`:
```ts
product: { …existing, chooseSize: "Choose a size first", colorSoldOut: "This color is sold out",
           sizeChart: "Size chart", orderingUnavailable: "Ordering isn't available right now" },
order: { code: "Code", soldOut: "That size just sold out — pick another one.",
         changed: "The price has changed — check it before ordering.", failed: "Something went wrong. Try again." },
```
`ar.ts`:
```ts
product: { …existing, chooseSize: "اختر المقاس أولاً", colorSoldOut: "هذا اللون نفدت كميته",
           sizeChart: "جدول المقاسات", orderingUnavailable: "الطلب غير متاح حاليًا" },
order: { code: "الكود", soldOut: "نفد هذا المقاس للتو — اختر مقاسًا آخر.",
         changed: "تغيّر السعر — راجع السعر قبل الطلب.", failed: "حدث خطأ. حاول مرة أخرى." },
```

- [ ] **Step 2: Run the messages test**

Run: `pnpm test src/lib/i18n/messages.test.ts`
Expected: PASS (same keys, no empty strings).

- [ ] **Step 3: Install the component**

Run: `pnpm exec shadcn add toggle-group` (answer yes to overwriting nothing; it adds `toggle.tsx` too). Confirm the generated files use `radix-ui` imports like the other components, and that any `pl-`/`pr-`/`ml-`/`mr-` class in them is replaced with its logical twin (`components.json` has `rtl: true`, so there should be none). Do not edit them otherwise.

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm typecheck`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/messages src/components/ui/toggle-group.tsx src/components/ui/toggle.tsx
git commit -m "feat(store): product page strings and the shadcn toggle group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The order route

**Files:**
- Create: `src/app/(store)/[lang]/p/[slug]/order/route.ts`

**Interfaces:**
- Consumes: `decideOrder`, `requestOrigin` (Task 2); `getProductBySlug`, `getSettings` from `@/lib/catalog`; `isLocale` from `@/lib/i18n/locales`.
- Produces: `GET /<lang>/p/<slug>/order?color=&size=&price=` → `302` to WhatsApp or back to the page; `404` for an unknown locale, slug or hidden product.

- [ ] **Step 1: Implement `export async function GET(request: NextRequest, ctx: RouteContext<"/[lang]/p/[slug]/order">): Promise<Response>`**

`const { lang, slug } = await ctx.params`. `!isLocale(lang)` or slug failing `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (length ≤ 80) → `new Response(null, { status: 404, headers })`. `product = await getProductBySlug(slug)`; `!product || !product.published` → 404. `settings = await getSettings()`. `decision = decideOrder({ product, settings, locale: lang, origin: requestOrigin(request.headers, request.url), query: { color: sp.get("color"), size: sp.get("size"), price: sp.get("price") } })` with `sp = request.nextUrl.searchParams`. Return `new Response(null, { status: 302, headers: { Location: decision.kind === "whatsapp" ? decision.url : decision.path, ...headers } })`. `headers` is `{ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }` on every response. Module doc: why a redirecting GET (the spec's "shape of the solution", Call 2).

Define the slug regex once: export `SLUG` from `src/lib/catalog/schema.ts` (today the private `URL_SAFE`) and reuse it here and in Task 7.

- [ ] **Step 2: Verify by hand**

Run: `pnpm db:migrate:local && pnpm db:seed:local && pnpm dev`; set a WhatsApp number in `/admin/settings`. Then:
`curl -sI "http://localhost:3000/en/p/oversized-tee/order?color=black&size=L&price=850"` → `302`, `location: https://wa.me/<number>?text=Hi%209k%20Store…`, `cache-control: private, no-store`.
`…size=S…` → `location: /en/p/oversized-tee?color=black&notice=sold-out`.
`…price=900` → `notice=changed`. `/fr/p/oversized-tee/order` and `/en/p/nope/order` → `404`.

- [ ] **Step 3: Checks and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test` → pass.

```bash
git add "src/app/(store)/[lang]/p/[slug]/order/route.ts" src/lib/catalog/schema.ts
git commit -m "feat(store): the order route re-checks stock and redirects to WhatsApp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The gallery and the product view (client)

**Files:**
- Create: `src/app/(store)/[lang]/p/[slug]/gallery.tsx`
- Create: `src/app/(store)/[lang]/p/[slug]/product-view.tsx`

**Interfaces:**
- Consumes: `Photo` component (`@/components/photo`), `Ltr`, `Price`, `Button`, `ToggleGroup`/`ToggleGroupItem`; `colorByKey`, `sizeAvailability`, `isColorSoldOut`, `nameIn` from `@/lib/catalog/helpers`; `type Product`, `type Color` from `@/lib/catalog/schema`; `dirOf`, `withLocale`, `type Locale` from `@/lib/i18n/locales`; `type Messages` from `@/lib/i18n/messages`; `type Notice` from `@/lib/order/decide`.
- Produces:
  - `export function Gallery({ photos, alt, locale, priorityFirst }: { photos: Photo[]; alt: string; locale: Locale; priorityFirst: boolean }): JSX.Element` (`"use client"`)
  - `export function ProductView({ product, locale, initialColorKey, notice, canOrder, t }: { product: Product; locale: Locale; initialColorKey: string; notice: Notice | null; canOrder: boolean; t: Pick<Messages, "product" | "order"> }): JSX.Element` (`"use client"`)

- [ ] **Step 1: Implement `gallery.tsx`**

Per the spec's "Gallery": a `dir="ltr"` square `bg-muted rounded-[10px] overflow-hidden` tile containing a `flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none]` list, one `h-full w-full shrink-0 snap-center` slide per photo with `<Photo photo alt sizes="(min-width: 768px) 50vw, 100vw" className="size-full object-contain" priority={priorityFirst && i === 0} />`. An effect keyed on `photos[0]?.key` calls `strip.scrollTo({ left: 0, behavior: "instant" })` and resets the index. `onScroll` sets `index = Math.round(scrollLeft / clientWidth)`. Dots when `photos.length > 1`: `aria-hidden`, `size-1.5 rounded-full`, current `bg-foreground`, others `bg-foreground/40`, centered in a row over the tile's bottom edge (`absolute bottom-2 inset-x-0`). Empty `photos` → the bare tile.

- [ ] **Step 2: Implement `product-view.tsx`**

State: `colorKey` (initial `initialColorKey`), `size: string | null` (initial `null`), `shownNotice` (initial `notice`). Derived: `color = colorByKey(product, colorKey) ?? product.colors[0]!`-style narrowing via `colorByKey` then fallback to `initialColor`; `sizes = sizeAvailability(product, colorKey)`; `colorOut = isColorSoldOut(product, colorKey)`.

- On mount, when `notice !== null`: `window.history.replaceState(null, "", `?${new URLSearchParams({ color: colorKey })}`)`.
- `onColorChange(key)`: ignore `""`; set `colorKey`; if `size !== null && !isInStock(product, key, size)` set `size` to `null`; `replaceState` to `?color=<key>`.
- `onSizeChange(v)`: ignore `""`; set `size`; set `shownNotice` to `null`.
- Render, in order: `<Gallery photos={color.photos} alt={`${nameIn(product, locale)} — ${nameIn(color, locale)}`} priorityFirst={colorKey === initialColorKey} />`, then the details column: `<h1 class="text-2xl font-bold">` name (+ `SoldOutBadge` from `../../product-card` when `isSoldOut(product)`), `<Price className="text-lg font-semibold text-primary">`, the description `<p class="text-muted-foreground whitespace-pre-line">` when non-empty, the color label `${t.product.color}: ${nameIn(color, locale)}`, the color `ToggleGroup` when `product.colors.length > 1` (`type="single" value={colorKey} onValueChange dir={dirOf(locale)} aria-label={t.product.color}`; items: `size-9 rounded-full border border-border` with `style={{ background: c.swatch }}`, `aria-label={nameIn(c, locale)}`, selected `data-[state=on]:ring-2 data-[state=on]:ring-primary data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-background`), the size label, the size `ToggleGroup` (`value={size ?? ""}`; items per the spec's table: `min-h-11 min-w-11 px-3 rounded-[8px] text-sm font-semibold border border-border bg-background data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary`, sold out `disabled` with `<s>` around the `<Ltr>` size, `text-foreground/40 border-border/60`, `aria-label={`${size} — ${t.product.soldOut}`}`), the muted sold-out line `${t.product.soldOut}: ` + the struck sizes each in `<Ltr>` joined by `, ` when any, the `<details>` size chart when `product.sizeChart` (summary `t.product.sizeChart`, `<Photo sizes="(min-width: 768px) 50vw, 100vw" alt={t.product.sizeChart}>`), then the notice `<p role="status">` with `t.order[shownNotice === "sold-out" ? "soldOut" : shownNotice]` when `shownNotice`, then the button block.
- Button block: `hint = !canOrder ? t.product.orderingUnavailable : colorOut ? t.product.colorSoldOut : size === null ? t.product.chooseSize : null`. With a hint: `<Button size="lg" disabled aria-describedby="order-hint" className="w-full md:w-auto">{t.product.orderOnWhatsapp}</Button>` and `<p id="order-hint" class="text-sm text-muted-foreground">`. Without: `<Button size="lg" asChild className="w-full md:w-auto"><a href={orderHref}>…</a></Button>` where `orderHref = withLocale(locale, `/p/${product.slug}/order`, `?${new URLSearchParams({ color: colorKey, size, price: String(product.priceEgp) })}`)`. No `target`, no `onClick`.

The layout wrapper: `<div class="md:grid md:grid-cols-2 md:gap-10">` with the gallery first and a `flex flex-col gap-4 mt-6 md:mt-0` details column. Logical classes only.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck` → pass (the page in Task 7 is what renders it; nothing else to run yet).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(store)/[lang]/p/[slug]/gallery.tsx" "src/app/(store)/[lang]/p/[slug]/product-view.tsx"
git commit -m "feat(store): product view with the scroll-snap gallery, color and size pickers and the order button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The product page

**Files:**
- Create: `src/app/(store)/[lang]/p/[slug]/page.tsx`

**Interfaces:**
- Consumes: `ProductView` (Task 6); `getProductBySlug`, `getSettings`, `initialColor`, `nameIn`, `SLUG` from `@/lib/catalog`; `parseNotice` (Task 2); `lang` from `next/root-params`; `isLocale` from `@/lib/i18n/locales`; `getMessages`.
- Produces: `GET /<lang>/p/<slug>[?color=&notice=]`.

- [ ] **Step 1: Implement `page.tsx`**

A shared `async function load(slug: string)` returns `{ locale, product, settings }` or calls `notFound()`: `locale = await lang()` (`!isLocale` → `notFound()`), `!SLUG.test(slug) || slug.length > 80` → `notFound()`, `product = await getProductBySlug(slug)`; `!product || !product.published` → `notFound()`; `settings = await getSettings()`.

`export async function generateMetadata({ params }: PageProps<"/[lang]/p/[slug]">): Promise<Metadata>` → `{ title: `${nameIn(product, locale)} — ${settings.storeName}`, description: (locale === "ar" ? product.descriptionAr : product.descriptionEn) || getMessages(locale).meta.description }`.

`export default async function ProductPage({ params, searchParams }: PageProps<"/[lang]/p/[slug]">)`: `const { slug } = await params; const { color, notice } = await searchParams;` then `load(slug)`, `const t = getMessages(locale)`, and render
```tsx
<main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">
  <ProductView product={product} locale={locale} initialColorKey={initialColor(product, color).key}
               notice={parseNotice(notice)} canOrder={settings.whatsappNumber !== ""} t={{ product: t.product, order: t.order }} />
</main>
```

- [ ] **Step 2: Verify by hand**

`pnpm dev` with the seed and photos seeded (`pnpm photos:seed:local`): `/ar/p/oversized-tee` renders the gallery, name, price, swatches, chips and the disabled button with "اختر المقاس أولاً"; `/en/p/oversized-tee?color=black` opens on black with "S" struck through; `/en/p/nope`, `/en/p/Bad.Slug` → the localized not-found page; the browser tab title is "Oversized Tee — 9k Store".

- [ ] **Step 3: Checks and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test` → pass.

```bash
git add "src/app/(store)/[lang]/p/[slug]/page.tsx"
git commit -m "feat(store): product page at /<lang>/p/<slug> with ?color= pre-selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Documentation, Worker build and the manual checks

**Files:**
- Modify: `AGENTS.md` ("Architecture": one sentence that product pages live at `src/app/(store)/[lang]/p/[slug]/` and the order button is a redirecting `GET …/order` route built on `src/lib/order`; "Things agents get wrong": extend the order-message bullet with "the tap is a plain link to the order route, never `window.open`").
- Modify: `src/components/photo.tsx` doc comment: the product gallery's `sizes` is `"(min-width: 768px) 50vw, 100vw"` (it says `"100vw"` today).

- [ ] **Step 1: Documentation edits above**

- [ ] **Step 2: The spec's manual check, steps 1–7**

In `pnpm dev` at a 390 px device viewport, run the eight-step manual check from the spec's "Testing" section (color switch updates the URL and the toggle's link; the tap lands on `wa.me` with the exact English message; marking black/M sold out in the admin then tapping sends the customer back with "That size just sold out — pick another one." and no size selected; a price change sends "The price has changed…"; an empty WhatsApp number disables the button; a hidden product and bad slugs are not-found). Record each result for the PR body.

- [ ] **Step 3: Worker build and 4G check**

Run: `pnpm exec opennextjs-cloudflare build && pnpm preview`; at `http://localhost:8787/ar/p/oversized-tee` repeat manual steps 1–3; in DevTools the order response is `302` with `cache-control: private, no-store`; with "Fast 4G" throttling the first photo, name, price and button paint under about 2 s and the gallery requests no variant wider than `960.webp` on a 390 px viewport at 3×. Stop the preview.

- [ ] **Step 4: Full check and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test` → pass.

```bash
git add AGENTS.md src/components/photo.tsx
git commit -m "docs: product page and the order route in AGENTS.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR body follow-ups for the owner (not partial work): set the WhatsApp number in `/admin/settings` on staging and production; test the tap on an iPhone (Safari and Instagram) and an Android phone (Chrome and Instagram), checking the message's Arabic lines render without boxes (spec Call 14).
