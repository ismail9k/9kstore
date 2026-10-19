# 9k Store

Catalog site for 9k Store. Customers browse products and send an order through
WhatsApp. See [`docs/brief.md`](docs/brief.md) for what it does and why; it is
the project's source of truth.

## Stack

- Next.js (App Router), strict TypeScript, Tailwind CSS
- Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare)
- pnpm, ESLint, Vitest

Requires Node 24+ and pnpm 11.

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
2. **Apply the migrations.** `pnpm db:migrate:staging` (already done for
   this repo's staging database). Before the first production release, run
   `pnpm db:migrate:prod`; the production database exists but has no tables
   yet.
3. **Set the secrets** on the staging Worker:
   ```sh
   pnpm exec wrangler secret put ADMIN_PASSWORD --env staging
   pnpm exec wrangler secret put SESSION_SECRET --env staging
   ```
   and the same without `--env staging` for production. Use a long password
   of at least 12 characters (a shorter one leaves the admin on its "not set
   up" page). Generate `SESSION_SECRET` with `openssl rand -base64 32`; it
   must be at least 32 characters. Branch previews use the staging Worker's
   secrets. Changing `ADMIN_PASSWORD` signs out every session, and logging
   out signs out every device.
4. **Run it locally.** Copy `.dev.vars.example` to `.dev.vars` and fill in
   both secrets, then:
   ```sh
   pnpm db:migrate:local
   pnpm db:seed:local   # optional: one sample product
   pnpm dev
   ```
   and open http://localhost:3000/admin.

Remote migrations are run by hand on each schema change: Workers Builds does
not apply them.

### Owner follow-up: rate-limit the login

The login already locks a client IP out for 15 minutes after 5 tries within
15 minutes. As an extra layer, add a Cloudflare WAF rate-limiting rule on
`POST /admin/login` for both Workers' domains. The built-in lockout is per
IP, so someone sharing the owner's IP (the same Wi-Fi or mobile carrier NAT)
can lock the owner out for 15 minutes.

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
