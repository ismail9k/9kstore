# 9k Store

Catalog site for 9k Store. Customers browse products and send an order through
WhatsApp. See [`docs/brief.md`](docs/brief.md) for what it does and why; it is
the project's source of truth.

## Stack

- Next.js (App Router), strict TypeScript, Tailwind CSS
- Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare)
- pnpm, ESLint, Vitest

Requires Node 24+ and pnpm 11.

The store is bilingual: customer URLs are `/ar/...` and `/en/...`. The bare
domain redirects to the language in the `9k_lang` cookie, which only the
header's language toggle sets (through `/lang/<ar|en>`), and otherwise to
Arabic. Other unprefixed paths always redirect to Arabic. The font (IBM Plex Sans Arabic) is downloaded by
`next/font` at build time, so builds need network access.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (with Cloudflare bindings via `initOpenNextCloudflareForDev`) |
| `pnpm build` | `next build` |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generate route types, then `tsc --noEmit` |
| `pnpm test` | Run Vitest once (`pnpm test:watch` to watch) |
| `pnpm preview` | Build for Workers and serve locally in workerd (http://localhost:8787) |
| `pnpm deploy` | Build for Workers and deploy |
| `pnpm upload` | Build for Workers and upload a new version without deploying it |
| `pnpm cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing `wrangler.jsonc` |
| `pnpm db:migrate:local` | Apply the D1 migrations to the local database (under `.wrangler/`) |
| `pnpm db:migrate:staging` | Apply the D1 migrations to the staging database (`9k-store-staging`) |
| `pnpm db:migrate:prod` | Apply the D1 migrations to the production database (`9k-store`) |
| `pnpm db:seed:local` | Load a sample product (`migrations/seed/dev.sql`) into the local database; local only |
| `pnpm photos:seed:local` | Load the sample product's photos into the local photos bucket; local only |

Local Worker variables live in `.dev.vars` (git-ignored); copy
`.dev.vars.example` to create it.

## First-time setup

The owner admin is at `/admin`. Product and settings data live in Cloudflare
D1. Do these steps in order:

1. **Create the databases.** Already done for this repo: both ids are in
   `wrangler.jsonc`. For a new Cloudflare account, run
   `pnpm exec wrangler d1 create 9k-store` and
   `pnpm exec wrangler d1 create 9k-store-staging`, then paste each
   `database_id` into `wrangler.jsonc` (the staging id goes in both
   `env.staging` and `env.staging.previews`).
2. **Create the photo buckets.** Already done for this repo. For a new
   Cloudflare account, run
   ```sh
   pnpm exec wrangler r2 bucket create 9k-store-photos
   pnpm exec wrangler r2 bucket create 9k-store-photos-staging
   ```
   `wrangler.jsonc` names both buckets, and a deploy fails while the bucket
   it names doesn't exist.
3. **Apply the migrations.** `pnpm db:migrate:staging` (done for this
   repo's staging database up to `0002`; `0003` needs applying, see the
   note after these steps). Before the first production release, run
   `pnpm db:migrate:prod`; the production database exists but has no tables
   yet.
4. **Set the secrets** on the staging Worker:
   ```sh
   pnpm exec wrangler secret put ADMIN_PASSWORD --env staging
   pnpm exec wrangler secret put SESSION_SECRET --env staging
   ```
   and the same without `--env staging` for production. Use a long password
   of at least 12 characters (a shorter one leaves the admin on its "not set
   up" page). Generate `SESSION_SECRET` with `openssl rand -base64 32`; it
   must be at least 32 characters. Branch previews use the staging Worker's
   secrets. Changing `ADMIN_PASSWORD` signs out every session, and logging
   out signs out every device. Make the password long and random (a password
   manager's generated one): the login limits slow guessing but can't save a
   weak password.
5. **When the domain exists,** add
   ```jsonc
   "vars": { "PUBLIC_ORIGIN": "https://<domain>" }
   ```
   at the **top level only** of `wrangler.jsonc` (staging and branch previews
   keep using the request's origin), run `pnpm cf-typegen`, and commit both
   files. Link-preview tags and the WhatsApp message's link then use the
   domain. Until then, every absolute URL uses the origin the request came
   in on.
6. **Run it locally.** Copy `.dev.vars.example` to `.dev.vars` and fill in
   both secrets. The example values are deliberately too short and must be
   replaced (password at least 12 characters, secret at least 32), or the
   admin shows "not set up". Then:
   ```sh
   pnpm db:migrate:local
   pnpm db:seed:local   # optional: one sample product
   pnpm photos:seed:local   # optional: its photos
   pnpm dev
   ```
   and open http://localhost:3000/admin.

Remote migrations are run by hand on each schema change: Workers Builds does
not apply them. `migrations/0003_was_published.sql` adds
`products.was_published`. Without it, pages still render, but creating,
saving, publishing or hiding a product in the admin fails with "no such
column: was_published", and every hidden product's link answers 404 instead
of "no longer available". Branch previews share the staging database, so
run `pnpm db:migrate:staging` before this code's preview or merge into
`develop` is used, and `pnpm db:migrate:prod` before its first production
deploy.

Photos are processed on upload by Cloudflare Images; the binding needs no
resource. If the first upload on staging answers "Photo processing isn't
available right now" and the Worker log shows an Images permission error,
enable Images (Transformations) for the account in the Cloudflare dashboard.

### Owner follow-up: rate-limit the login

Each address gets 5 login tries in 15 minutes (an IPv6 /64 counts as one
address). Devices that have never logged in share 20 tries an hour between
them. A device that has logged in before keeps its own 5-tries limit, so it
can still log in while that shared limit holds; someone on the same Wi-Fi can
now only lock out a device that has never logged in. After this change ships,
log out and back in once on your laptop so it is remembered.
As an extra layer, add a Cloudflare WAF rate-limiting rule on
`POST /admin/login` for both Workers' domains.

### Owner follow-up: test the order button on real phones

Laptop browsers and `pnpm preview` can't stand in for Instagram's in-app
browser, so test the tap on real phones whenever the order path changes
(`src/lib/order`, the product page, or its `order` route). A phone can't reach
`localhost`, so use the branch's staging preview URL (or staging itself) with a
WhatsApp number set in `/admin/settings` there.

Test on four browsers: Safari and Instagram on an iPhone, and Chrome and
Instagram on an Android phone. To open a link in Instagram's browser, send the
product URL to yourself in an Instagram DM and tap it there. In each browser,
in both `/ar/p/<slug>` and `/en/p/<slug>`:

1. Pick a color, then a size. Tap "Order on WhatsApp". WhatsApp opens (the
   app, or its web page that offers to open the app) with the message already
   typed.
2. The message has every line: greeting, product and color, size, price, code
   and the link. The price matches the page.
3. In the Arabic message, the size, the price and the code read correctly
   inside the Arabic lines: no boxes, no stray marks, and nothing reordered.
   If a phone shows boxes, remove the three `isolateLtr` calls in
   `src/lib/order/message.ts` (spec Call 14).
4. Tap the link at the end of the message. It opens the same product with the
   same color selected.
5. Mark the size sold out in the admin, then tap the button on the page that
   is still open. The page reloads with "That size just sold out", and
   WhatsApp does not open. Mark the size in stock again afterwards.
6. Paste `/en/p/<slug>` and `/ar/p/<slug>` into a WhatsApp chat with
   yourself and into an Instagram DM. The preview shows the photo, the name
   and the price, in that link's language. With `?color=<key>` added, the
   photo is that color's. A link to a product that was published and is now
   hidden opens the "no longer available" page with the button back to the
   catalog.

WhatsApp and Facebook cache link previews, so a changed photo or price may not
show at once. Facebook's Sharing Debugger
(`https://developers.facebook.com/tools/debug/`) re-scrapes a link.

## Checks

`pnpm install` sets up a Husky pre-commit hook that runs lint-staged, which
runs `eslint --fix` on the staged files.

Every pull request into `main` or `develop` runs
[`.github/workflows/ci.yml`](.github/workflows/ci.yml): lint, typecheck, test
and build as separate jobs. The build job runs `opennextjs-cloudflare build`,
so it also checks the Worker bundle. The workflow only runs checks and never
deploys.

## Deploys

Cloudflare Workers Builds deploys from Git; no GitHub workflow in this repo
deploys.

| Worker | Wrangler env | Deploys from | Previews |
|---|---|---|---|
| `9k-store` | top level | `main` | off |
| `9k-store-staging` | `staging` | `develop` | every other branch |

Bindings are not inherited by `env.staging` or its `previews` block, so add
each new binding to all three in `wrangler.jsonc`.
