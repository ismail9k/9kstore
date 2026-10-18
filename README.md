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

Local Worker variables live in `.dev.vars` (git-ignored); copy
`.dev.vars.example` to create it.

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
