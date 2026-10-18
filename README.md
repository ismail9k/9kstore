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
