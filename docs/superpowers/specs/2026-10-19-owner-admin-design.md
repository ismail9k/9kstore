# Owner admin for managing the catalog — design

Intent-Issue: #2 — https://github.com/ismail9k/9kstore/issues/2

Status: v1 · 2026-10-19 · planned unattended from the issue, the brief
(`docs/brief.md`) and the brand guidelines (`docs/brand/guidelines.md`).
Every choice the issue left open is recorded under "Calls made while
planning", with what it costs if it turns out wrong.

## Intent

The owner answers every WhatsApp enquiry today by sending photos and
prices by hand. The site needs a catalog the owner controls from a laptop,
with no code, no files to edit and no deploy step. This issue builds the
two things every later issue reads from: the **product data store** and
the **owner admin** that fills it. Later issues add photo upload (#3), the
bilingual routing (#6), the customer pages (#4, #5) and shareable links
(#7) on top of what this one leaves behind.

## Goals

1. From a laptop, the owner can add a product, edit it, mark a size as
   sold out per color, hide or publish it, and reorder products — each in a
   couple of minutes, with no technical knowledge.
2. The owner can edit the store settings: WhatsApp number, order greeting
   line in Arabic and English, Instagram link, store name, logo.
3. Product and settings data live in Cloudflare D1 and are read at request
   time, so a change is live within a minute with no deploy.
4. One owner login that is secure and easy to use.
5. A typed data-access layer that #3–#7 build on without touching the
   schema.

## Non-goals

- Photo **upload, resizing and serving**. That is #3. This issue defines
  where photos live in the data model and leaves a clearly marked slot in
  the admin form for #3 to fill.
- Customer-facing pages, routing, Arabic/English page rendering, Open Graph
  tags. Issues #4–#7.
- Multiple users, roles, password reset flows, two-factor.
- Deleting products. Hiding is the archive (see Calls).
- Stock counts, sale prices, categories, order tracking — all backlog in
  the brief.
- A phone-friendly admin. It must *work* in a phone browser, not be good
  there.

## Anti-goals

- The admin needs technical knowledge (slugs, JSON, keys, SQL, deploys).
- A product saved with a sold-out size later lets a customer order it
  (the data layer must give #5 an unambiguous stock answer).
- A change in the admin that does not show on the live site within a
  minute.
- dnd-kit or any admin-only code shipping in a customer page bundle.

## Constraints (binding, from the issue)

- Catalog managed through the admin page, not by editing files.
- One owner account. No other users or roles.
- Built for a laptop screen.
- Stock is in stock / sold out per color × size. No counts.
- One price per product, shared by all colors and sizes.
- Data read at request time, not built into the site.
- No order database.
- Hosting free or close to it.
- Existing Next.js 16 app on Cloudflare Workers through OpenNext. No new
  framework. `cacheComponents` stays off (see AGENTS.md).
- shadcn/ui (Radix primitives, copied into the repo) with Tailwind, for
  the admin and the customer pages. dnd-kit admin-only.
- AGENTS.md rules: bindings go in three places in `wrangler.jsonc`; run
  `pnpm cf-typegen` after; tests only for meaningful logic, as
  `*.test.ts(x)` next to the code; `@/` import alias.

## The product data

### Shape (TypeScript, validated with zod)

```ts
type Photo = { key: string; width?: number; height?: number };
// `key` is an object key in the photos bucket; #3 owns how it gets there
// and how it is served. Until #3 lands no UI writes photos.

type Color = {
  key: string;        // stable, URL-safe, unique within the product; used by ?color=
  nameAr: string;
  nameEn: string;
  swatch: string;     // "#RRGGBB", the garment's real color
  photos: Photo[];    // ordered; first photo of the first color is the card photo
};

type Product = {
  id: string;         // random id, never shown to the owner
  slug: string;       // URL-safe, unique; /<lang>/p/<slug>
  nameAr: string; nameEn: string;
  descriptionAr: string; descriptionEn: string;
  priceEgp: number;   // whole pounds, integer ≥ 0
  code: string | null;
  sizes: string[];    // ordered, unique, owner-defined, e.g. ["S","M","L"] or ["30","32"]
  colors: Color[];    // ordered, at least one
  soldOut: { color: string; size: string }[]; // color key + size; absent = in stock
  sizeChart: Photo | null;
  published: boolean;
  sortOrder: number;  // ascending = first in the catalog
  createdAt: string; updatedAt: string; // ISO 8601
};

type Settings = {
  storeName: string;        // default "9k Store"
  whatsappNumber: string;   // digits only, international format without "+", e.g. "2010xxxxxxxx"
  greetingAr: string;       // default "أهلاً 9k Store، حابب أطلب:"
  greetingEn: string;       // default "Hi 9k Store, I'd like to order:"
  instagramUrl: string;     // full URL or ""
  logo: Photo | null;
  updatedAt: string;
};
```

Validation rules (enforced on the server in the data layer, shown in the
form as inline messages):

- `nameAr`, `nameEn` required, ≤ 120 chars. Descriptions ≤ 1000 chars,
  may be empty.
- `priceEgp` integer, 0 ≤ price ≤ 1 000 000.
- `code` optional, ≤ 40 chars, trimmed; empty becomes `null`.
- `sizes`: 1–30 entries, each 1–20 chars, trimmed, unique
  (case-sensitive), no empty strings.
- `colors`: 1–20 entries. Each `nameAr`/`nameEn` required ≤ 60 chars,
  `swatch` matches `/^#[0-9a-f]{6}$/i`, `key` unique within the product.
- `soldOut`: every entry references an existing color key and size;
  unknown pairs are dropped on save, not rejected (the owner removed the
  size or color — that is the intent).
- `slug`: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, 1–80 chars, unique across
  products. The form sends `slugEdited: boolean` alongside the product.
  When the slug was auto-filled (`slugEdited` false) and collides, the
  server suffixes it with `uniqueSlug` and saves; when the owner typed it
  and it collides, the save fails with the inline error "Another product
  already uses this link name." The server never rewrites a slug the owner
  typed.

### Derived helpers the data layer exports (pure, unit-tested)

- `isInStock(product, colorKey, size): boolean` — false if the pair is in
  `soldOut`, false if the color or size does not exist. #5 calls this both
  when rendering the size picker and again when the order button is tapped.
- `isSoldOut(product): boolean` — true when every color × size pair is in
  `soldOut` (or the product has no sizes). #4 uses it for the "Sold out"
  pill.
- `cardPhoto(product): Photo | null` — first photo of the first color.
- `slugify(text): string` — lowercase, ASCII letters and digits, hyphens;
  non-Latin input (an Arabic-only name) yields `""` and the caller falls
  back to `"product"`.
- `colorKey(nameEn, existingKeys): string` — `slugify(nameEn)` or
  `"color"`, suffixed `-2`, `-3`… until unique.
- `uniqueSlug(base, existingSlugs): string` — same suffix rule.

### Storage (Cloudflare D1, SQLite)

Two tables. Nested structures (sizes, colors with photos, sold-out pairs)
are JSON text columns; the admin always saves a whole product, and no page
needs to query inside them. Scalars that pages sort or filter on are real
columns.

```sql
CREATE TABLE products (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name_ar        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  price_egp      INTEGER NOT NULL,
  code           TEXT,
  sizes          TEXT NOT NULL,              -- JSON string[]
  colors         TEXT NOT NULL,              -- JSON Color[]
  sold_out       TEXT NOT NULL DEFAULT '[]', -- JSON {color,size}[]
  size_chart     TEXT,                       -- JSON Photo or NULL
  published      INTEGER NOT NULL DEFAULT 0, -- 0/1
  sort_order     INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX products_catalog ON products (published, sort_order);

CREATE TABLE settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  store_name      TEXT NOT NULL DEFAULT '9k Store',
  whatsapp_number TEXT NOT NULL DEFAULT '',
  greeting_ar     TEXT NOT NULL DEFAULT 'أهلاً 9k Store، حابب أطلب:',
  greeting_en     TEXT NOT NULL DEFAULT 'Hi 9k Store, I''d like to order:',
  instagram_url   TEXT NOT NULL DEFAULT '',
  logo            TEXT,                      -- JSON Photo or NULL
  updated_at      TEXT NOT NULL
);
INSERT INTO settings (id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
```

Migrations are plain SQL files in `migrations/` applied with
`wrangler d1 migrations apply` (Wrangler's own migration tracking, no
ORM). The D1 binding is named `DB`, declared at the top level, in
`env.staging` and in `env.staging.previews` of `wrangler.jsonc`, with
`database_name` `9k-store` (production) and `9k-store-staging` (staging
and previews). Local `pnpm dev` and `pnpm preview` use Miniflare's local
D1, which needs no `database_id`.

Reads happen per request through `getCloudflareContext({ async: true })`
from `@opennextjs/cloudflare`. The data layer never caches; with
`cacheComponents` off and every admin page reading cookies, admin pages
render dynamically. Customer pages (later issues) must also opt out of
static rendering for product data — the data layer's module doc says so.

### Data-access layer (`src/lib/catalog/`)

Server-only module. Everything later issues need, nothing UI-specific:

```ts
listProducts(opts?: { publishedOnly?: boolean }): Promise<Product[]>  // by sortOrder asc
getProduct(id: string): Promise<Product | null>
getProductBySlug(slug: string): Promise<Product | null>              // includes hidden (for #7's "no longer available")
createProduct(input: ProductInput): Promise<Product>                 // sortOrder = min - 1 → new goes first
updateProduct(id: string, input: ProductInput): Promise<Product>
setPublished(id: string, published: boolean): Promise<void>
reorderProducts(idsInOrder: string[]): Promise<void>                 // sort_order = index, in one batch
getSettings(): Promise<Settings>
updateSettings(input: SettingsInput): Promise<Settings>
```

`ProductInput` is `Product` minus `id`, `sortOrder`, `createdAt`,
`updatedAt`. Row ↔ object mapping functions are pure and unit-tested; the
D1 calls themselves are not integration-tested (see Testing).

## The owner login

A single password and a signed cookie. No library beyond WebCrypto, which
Workers provide.

- Secrets: `ADMIN_PASSWORD` and `SESSION_SECRET` (≥ 32 random bytes,
  base64). Locally in `.dev.vars` (copy from `.dev.vars.example`, which
  lists both with placeholder values); on Cloudflare as Worker secrets for
  the production and staging Workers (`wrangler secret put`). Previews
  inherit the staging Worker's secrets.
- `/admin/login`: one password field, one button. Submits to a server
  action. The action compares with a constant-time comparison, waits
  about one second before answering a wrong password, and on success sets
  cookie `9k_admin`: `base64url(payload).base64url(HMAC-SHA256)` where the
  payload is `{ iat, exp }` with `exp` 30 days out. Cookie flags:
  `HttpOnly`, `Secure` (not on `localhost`), `SameSite=Lax`, `Path=/admin`.
- `src/proxy.ts` (Next 16's name for middleware) matches `/admin/:path*`:
  no valid cookie and not `/admin/login` → redirect to `/admin/login`;
  valid cookie on `/admin/login` → redirect to `/admin`. It also sets
  `X-Robots-Tag: noindex, nofollow` on every admin response.
- Defense in depth: every server action and every admin page calls
  `requireOwner()` from `src/lib/auth/session.ts`, which verifies the
  cookie again and `redirect`s to `/admin/login` when it fails. The proxy
  is an optimistic check only, as Next's docs advise.
- Logout: a button in the admin header clears the cookie.
- Brute force: constant-time compare plus the one-second delay. The owner
  is told, in the README, to set a long password; adding a Cloudflare WAF
  rate-limit rule on `/admin/login` is a follow-up for the owner, not code.

## The admin

All routes under `/admin`, English UI labels (the owner's working language
for tooling; Arabic *content* fields are RTL), laptop layout, shadcn/ui
components themed with the brand tokens from `docs/brand/guidelines.md`
(off-white page, near-black text, green only for primary buttons, selected
states and focus rings; no dark mode, so the scaffold's
`prefers-color-scheme` block goes). Admin pages set
`robots: { index: false }` metadata.

### `/admin` — products list

A table of every product, hidden ones included, in `sortOrder`:

| drag handle | photo (card photo, or an off-white placeholder tile until #3) | name — English above, Arabic below (`dir="rtl"`) | price "850 EGP" | status |

- Status: a shadcn `Switch` labeled Published/Hidden that calls
  `setPublished` at once (toast "Saved"), and a near-black "Sold out" badge
  when `isSoldOut`.
- Drag to reorder with dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`), imported only under `src/app/admin/`. Dropping
  calls `reorderProducts` with the full id list; the list updates
  optimistically and reverts with an error toast if the action fails.
- Header: store name, "New product" (primary, green pill), "Settings",
  "Log out".
- Clicking a row opens `/admin/products/<id>`.
- Empty state: one sentence and the "New product" button.

### `/admin/products/new` and `/admin/products/[id]` — product form

One page, one client component holding the draft, one "Save" (primary) and
one "Cancel". Sections top to bottom:

1. **Name and description** — English name, Arabic name (RTL), English
   description, Arabic description (RTL). Slug field below the English
   name: auto-filled from the English name while the owner has not edited
   it (and until the product is first saved); editable; helper text
   "Part of the product's link. Changing it after sharing breaks old
   links." Shown read-only after the product is published, with an "Edit
   anyway" link that unlocks it.
2. **Price and code** — price in EGP (integer input), product code.
3. **Sizes** — chips in order; an input with an "Add" button (Enter adds
   too); each chip has a remove ×; chips reorder by dragging (dnd-kit).
   Adding a size makes it in stock for every color.
4. **Colors** — a card per color, in order, reorderable by dragging:
   English name, Arabic name (RTL), swatch (`<input type="color">` next to
   a hex text field), a **Photos** strip that lists the color's existing
   photos as tiles with a drag handle and remove × when there are any, and
   otherwise reads "No photos yet — photo upload arrives with the next
   release." No upload control in this issue. "Remove color" with an
   `AlertDialog` confirm when the color has photos or sold-out marks. "Add
   color" appends a card with an empty name and a near-black swatch.
   Color keys are set when a color is added (from the English name typed at
   save time, or `color-N`) and never change afterwards; they are not shown
   to the owner.
5. **Availability** — a grid, colors as rows (swatch + English name), sizes
   as columns; each cell a `Checkbox` where checked means **in stock**.
   A row header toggle marks a whole color; a column header toggle marks a
   whole size. Appears only once there is at least one size and one color.
6. **Size chart** — a slot like a color's photo strip: shows the current
   image tile with remove × if one exists; otherwise "No size chart —
   upload arrives with the next release."
7. **Visibility** — a `Switch` Published/Hidden with the line "Hidden
   products don't appear on the site, but their links show a 'no longer
   available' page."

Save validates on the server (zod), returns per-field errors the form
renders inline (`aria-describedby`), and on success redirects to `/admin`
with a toast. A new product is **hidden** by default. Leaving the page with
unsaved edits asks for confirmation (`beforeunload`). The whole product is
sent as one JSON argument to one server action; it is far under Next's
1 MB action body limit.

### `/admin/settings`

A form with store name, WhatsApp number (digits only; helper text "Country
code first, no plus or spaces, e.g. 2010xxxxxxxx"), Instagram link (must
be a URL or empty), greeting line in Arabic (RTL) and English, and a logo
slot like the size-chart slot. Save → `updateSettings` → toast.

### Shared admin pieces

- `src/app/admin/layout.tsx`: slim header (store name, nav, Log out),
  `max-w-5xl` content column, `<Toaster>` (shadcn `sonner`).
- shadcn components installed for this issue: `button`, `input`,
  `textarea`, `label`, `badge`, `switch`, `checkbox`, `table`, `dialog`,
  `alert-dialog`, `separator`, `sonner`. Install with the CLI
  (`pnpm dlx shadcn@latest`), Radix base, CSS variables, into
  `src/components/ui/`.

## Local development and environments

- `pnpm dev` runs Next with Cloudflare bindings (already wired through
  `initOpenNextCloudflareForDev`), so D1 is Miniflare's local SQLite under
  `.wrangler/`. New scripts:
  - `pnpm db:migrate:local` → `wrangler d1 migrations apply DB --local`
  - `pnpm db:migrate:staging` → `wrangler d1 migrations apply DB --env staging --remote`
  - `pnpm db:migrate:prod` → `wrangler d1 migrations apply DB --remote`
  - `pnpm db:seed:local` → runs `migrations/seed/dev.sql` against the local
    DB: the oversized tee in grey, black, green and cream, sizes S–XL, no
    photos, one size sold out, published. For developers of #4/#5, not for
    production.
- Provisioning. The implementer, if their Wrangler login has D1
  permission, creates both databases (`wrangler d1 create 9k-store`,
  `wrangler d1 create 9k-store-staging`), commits their `database_id`s in
  `wrangler.jsonc`, and runs `pnpm db:migrate:staging` so the staging
  Worker and every branch preview have a working schema once this merges.
  Without that permission the ids stay as `TODO` comments and the PR lists
  the create and migrate steps as follow-ups.
- Secrets stay with the owner: `ADMIN_PASSWORD` and `SESSION_SECRET` on
  the staging Worker and on the production Worker (`wrangler secret put
  <NAME> [--env staging]`), and `pnpm db:migrate:prod` before the first
  production release. A password has to reach the owner through a channel
  the repository can't provide, so the implementer never sets one. The
  README gets a "First-time setup" section listing every step in order,
  and the PR body lists them as follow-ups.
- Until the secrets exist, `/admin` on that Worker renders a plain page
  reading "Admin is not set up yet. Set ADMIN_PASSWORD and SESSION_SECRET
  on this Worker." instead of a login form or an error. `requireOwner()`
  and the login action treat a missing secret as "not logged in".
- Remote migrations are applied by hand (Workers Builds does not run
  them). With one owner and a handful of migrations this is fine for v1.

## Testing

Unit tests in Vitest, next to the code, for logic only:

- zod schemas: accepts a full valid product; rejects empty sizes, duplicate
  sizes, bad swatch, duplicate color keys, bad slug; drops a `soldOut` pair
  whose size no longer exists; empty `code` → `null`.
- `slugify`, `colorKey`, `uniqueSlug`, `isInStock`, `isSoldOut`,
  `cardPhoto`.
- Row ↔ `Product` and row ↔ `Settings` mapping round-trips.
- Session: sign → verify round-trip; tampered signature, expired token and
  wrong secret all fail; constant-time compare on equal/unequal/different
  length.
- Reorder: `nextSortOrder(existing)` and the id → sort_order assignment.

No component tests, no D1 integration tests, no snapshot tests. Manual
check before the PR: `pnpm db:migrate:local && pnpm dev`, log in, create
the tee, reorder, toggle, save settings; then `pnpm preview` to confirm the
Worker build serves `/admin`.

## Calls made while planning (open to change)

Each with what it costs if the owner wants otherwise.

1. **Password + signed cookie, not Cloudflare Access or magic link.** No
   email sending, no Zero Trust setup, works on previews and locally. Cost
   if wrong: swapping to Access means deleting `proxy.ts`'s cookie check
   and the login page — a day, no data change.
2. **JSON columns for sizes, colors, photos and sold-out pairs** instead of
   normalized tables. Whole-product reads and writes, under 50 products, no
   cross-product queries into them. Cost if wrong (e.g. a later "all
   products in size M" filter): a migration that unpacks the JSON — the
   TypeScript shape and data layer API stay the same.
3. **Price as integer whole pounds.** Egyptian clothing prices are whole
   pounds. Cost: a column rename to piastres and a divide-by-100 if
   fractional prices are ever needed.
4. **No delete.** Hidden is the archive, and #7 promises a "no longer
   available" page for old links, which deleting would break. Cost: hidden
   drafts pile up; a delete with confirm is an hour's work later.
5. **Color keys and slugs are stable once created**, derived from the
   English name at creation, and the slug is locked after publishing with
   an explicit unlock. Protects links #7 will share. Cost: an owner who
   renames "Black" to "Jet Black" keeps `?color=black` — invisible to
   customers.
6. **Greeting lines are literal text**, default to the brief's examples,
   with no `{store}` templating. Simpler for the owner. Cost: renaming the
   store means editing three fields instead of one.
7. **WhatsApp number stored as digits only** (what `wa.me/` needs). The
   form strips spaces, dashes and a leading `+`. Cost: none for #5.
8. **Admin UI in English** with RTL Arabic inputs. Cost: an Arabic admin
   later means a labels file — the fields are already bilingual.
9. **New products go first** (`sortOrder = min − 1`), matching the brief's
   "new products go first by default".
10. **A new size is in stock for every color** by default; sold out is the
    exception the owner marks.
11. **Photos are `{ key, width?, height? }` objects, not strings**, so #3
    can add fields without a migration. #3 owns the key format and serving.
12. **No D1 integration tests.** The row mapping is pure and tested; the
    SQL is a handful of statements exercised by hand in `pnpm dev`.
13. **Session lasts 30 days**, path-scoped to `/admin`. Cost: none
    material; one line to change.
14. **Settings is a single row with `id = 1`**, created by the migration,
    so `getSettings()` always returns a row.
15. **Remote migrations by hand**, documented in the README, rather than a
    build-step migration. Cost: an owner-side step on each schema change;
    v1 has one migration.
16. **The implementer provisions D1 and migrates staging; the owner sets
    the secrets.** Previews then have a schema but no login until the
    owner runs two `wrangler secret put` commands. Cost: the PR cannot be
    tried in a browser preview until then — `pnpm dev` / `pnpm preview`
    cover the review.
17. **Slug collisions:** auto-suffix only an auto-filled slug; an owner-
    typed slug that collides is an inline error. Cost: none material.

## Left to the builder

- Exact component markup and spacing within the brand tokens.
- The id generator (`crypto.randomUUID()` is fine).
- How the form state is organized internally (reducer vs. nested state),
  as long as one server action receives one validated object.
- Error copy wording, as long as it is plain English with no technical
  terms (no "slug", "key", "JSON", "payload" in owner-facing text; the slug
  field is labeled "Link name").
