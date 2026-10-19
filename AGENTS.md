<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

Canonical instruction file for this repository, shared by all coding agents
(Claude Code, Codex, Cursor, and others). Claude Code reaches it through the
`@AGENTS.md` import in `CLAUDE.md`, which holds no guidance of its own.

## Source of truth

[`docs/brief.md`](docs/brief.md) defines what the site does and why. Read it
before any product or UX decision, and treat its non-goals and anti-goals as
hard limits: no customer accounts, no cart, no online payment, no order
database (the WhatsApp chat is the record). Ideas outside v1 go to the brief's
backlog, not into code.

[`docs/brand/guidelines.md`](docs/brand/guidelines.md) defines how the site
looks: the three colors and where green goes, the font, the hanging-rail
motif, how product photos are shot, and the shadcn/ui theme tokens. Read it
before any visual work.

## Commands

Node 24+ and pnpm 11 (`packageManager` pins the version).

- Dev server: `pnpm dev` (runs with Cloudflare bindings)
- Lint / typecheck / test: `pnpm lint`, `pnpm typecheck`, `pnpm test`
- Single test file: `pnpm test <path>`; by name: `pnpm test -t "<name>"`
- Worker build, as CI runs it: `pnpm exec opennextjs-cloudflare build`
- Run the Worker locally in workerd: `pnpm preview` (http://localhost:8787)
- After editing `wrangler.jsonc`: `pnpm cf-typegen` to regenerate
  `cloudflare-env.d.ts`
- D1: `pnpm db:migrate:local`, `pnpm db:seed:local` (sample product, local
  only), `pnpm photos:seed:local` (its photos, into the local photos bucket);
  remote: `pnpm db:migrate:staging`, `pnpm db:migrate:prod`, run by
  hand on each schema change. Setup steps: README "First-time setup".

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and the Worker
build on PRs into `main` and `develop`, and never deploys. The pre-commit hook
runs `eslint --fix` on staged files.

## Environments

Cloudflare Workers Builds deploys from Git. No GitHub workflow deploys.

| Environment | Worker | Wrangler env | Deploys from | Branch previews |
|---|---|---|---|---|
| Production | `9k-store` | top level | `main` | off |
| Staging | `9k-store-staging` | `staging` | `develop` | every other branch |
| Local | — | — | `pnpm dev` / `pnpm preview` | — |

- `pnpm deploy` and `pnpm upload` target the top-level Worker, which is
  production. Don't run them unless asked; merging is how code ships.
- **Bindings are not inherited.** Each new binding (D1, R2, Images) goes in
  three places in `wrangler.jsonc`: top level, `env.staging`, and
  `env.staging.previews`. Then run `pnpm cf-typegen`.
- Previews run under the staging Worker and leave out
  `WORKER_SELF_REFERENCE`, because a preview's service binding resolves to the
  deployed staging Worker rather than to the preview itself.
- Local Worker variables live in `.dev.vars` (git-ignored); copy
  `.dev.vars.example`.

## Testing

Write focused unit tests for meaningful logic only, such as building the order
message, availability rules and locale handling. No snapshot tests, and no
tests for presentational components. Tests run in Vitest (jsdom) and sit next
to the code as `*.test.ts(x)`.

## Architecture

Next.js 16 App Router under `src/app`, deployed to Cloudflare Workers through
OpenNext (`@opennextjs/cloudflare`). Import from `src` with the `@/` alias.
Product and settings data live in D1 behind `src/lib/catalog` (server-only;
never cache its reads).

The app has two root layouts. Customer pages live under
`src/app/(store)/[lang]/`, where `lang` is a root param read with
`next/root-params`; the layout sets `lang` and `dir` on `<html>`. The admin
lives under `src/app/(admin)/admin/` with its own LTR English root layout, and
dnd-kit stays admin-only there. `src/proxy.ts` is the site's router: it
redirects `/` to the language in the `9k_lang` cookie (else Arabic), sends
other unprefixed paths to Arabic (the remembered choice applies only to the
bare domain), and runs the optimistic admin gate for `/admin`, which pages
back with `requireOwner()`; auth lives in `src/lib/auth`, with the
login-attempt and session-version tables from `migrations/0002_auth.sql`.
`src/lib/i18n` holds the locales, the message catalog
(`src/lib/i18n/messages/*.ts`), `formatPrice`/`isolateLtr` and the gates
(`localeGate`, `switchTarget`). The header's language toggle goes through the
route `/lang/[lang]`, which sets the cookie and redirects back. Product pages
live at `src/app/(store)/[lang]/p/[slug]/`, and the order button is a
redirecting `GET …/order` route built on `src/lib/order`. Absolute URLs —
Open Graph and canonical tags, the message's link — come from
`getSiteOrigin()` in `src/lib/site/origin.ts`, which prefers the
`PUBLIC_ORIGIN` Worker variable (unset until the domain exists) over the
request origin; `storeMetadata()` beside it builds every customer page's
tags.

Photos live in R2 (`PHOTOS`) as `photos/<id>/master` plus the variants
listed in `src/lib/photos/variants.ts`. `POST /admin/photos` processes each
upload through the Images binding (`IMAGES`) and stores the master and every
variant; `GET /photos/[id]/[file]` serves variants as immutable and fills a
missing one from the master. Customer pages render photos through
`src/components/photo.tsx` (`photoSrcSet`/`sizes`), and link previews use
`photoOgSrc`. The degraded paths (serving the master, uploading without
variants) run only under `NEXTJS_ENV=development`; a deployed Worker answers
503 instead. Workers Cache is on (`cache` in `wrangler.jsonc`), so any new
response that must not be cached has to carry `private` or `no-store` (Next
pages already do).

The brief's suggested target, which the config is set up for:

- **Data is read at request time, not built in.** The owner's admin edits must
  reach the live site within a minute without a deploy, so product data comes
  from D1 and photos from R2, not from static generation or files in the repo.
- **Routes are language-prefixed:** `/ar/...` and `/en/...`, product pages at
  `/<lang>/p/<slug>`, with `?color=` pre-selecting a color. Arabic is the
  default for the bare domain. The URL language wins over a remembered
  choice.
- **Admin** lives at a hidden path behind a single owner login, built for a
  laptop.

## Things agents get wrong

- **Don't enable `cacheComponents`** (or `partialPrefetching`) in
  `next.config.ts`: with `@opennextjs/cloudflare` 1.20 the Worker hangs on
  every request in workerd. `pnpm dev` won't show the problem; check the
  Worker with `pnpm preview`.
- **`LayoutProps` / `PageProps` are generated globals** from `next typegen`,
  which is why `pnpm typecheck` runs it before `tsc`.
- **`noUncheckedIndexedAccess` is on,** so indexed reads are `T | undefined`.
- **The order message must match the page.** The price in the WhatsApp message
  must equal the price shown. Stock is checked again when the order button is
  tapped, and a sold-out size never opens WhatsApp. The button must work in
  Instagram's in-app browser: the tap is a plain link to the order route,
  never `window.open`.
- **Arabic is first-class, not mirrored English.** Use RTL layout, keep prices,
  sizes and codes readable inside RTL text, use Western digits (0–9) in both
  languages, and give every customer-facing string an Arabic version.
  - Logical Tailwind classes only on customer pages (`ps-`/`pe-`/`ms-`/`me-`/
    `start-`/`end-`, never `pl-`/`left-`), and `rtl:-scale-x-100` on
    directional icons.
  - Every size, code and price goes through `<Ltr>`/`<Price>`; use
    `formatPrice`/`isolateLtr` for plain text such as titles and messages.
  - New strings go in both `src/lib/i18n/messages/en.ts` and `ar.ts`.
- **Sold-out products stay visible,** marked "Sold out", and a hidden
  product's link shows a "no longer available" page, not a 404, so old story
  links keep working (`p/[slug]/page.tsx` branches on `linkState()` and
  renders `unavailable.tsx` with a 200 and `noindex`; the order route still
  answers 404). That page is for once-published products only
  (`products.was_published` from `migrations/0003_was_published.sql`, set in
  SQL on first publish and never lowered); a draft that was never published
  answers 404 like an unknown slug, so its name stays secret.
- **Streaming metadata is off** (`htmlLimitedBots: /.*/` in `next.config.ts`)
  so link-preview tags land in `<head>` for every fetcher, not only Next's bot
  list. Don't remove it to shave TTFB; the pages block on D1 anyway.
- **Mobile weight matters.** Most visitors arrive in Instagram's in-app browser
  on 4G, and the catalog should be usable in about 2 seconds. Serve images in
  modern formats at screen-fitting sizes.
- **A page-level `notFound()` returns 404, but the server HTML is Next's
  `__next_error__` shell;** the localized not-found page and header render
  from the RSC payload once JavaScript runs. Unknown URLs under `/<lang>/`
  reach it through `src/app/(store)/[lang]/[...rest]/page.tsx`, which must
  stay; keep `experimental.globalNotFound` off.

## Agent configuration

Skill-managed settings live under `docs/agents/` as small, focused files rather
than inline here, so each can be read by only the skill that needs it:

- `docs/agents/issue-tracker.md` — where issues and intents live for this repo,
  how to read them, and how finished work links back to them (written by the
  `setup-issue-tracker` skill)

As more skills are adopted, each may add its own file under `docs/agents/`.
List those files here so this section remains a table of contents rather than
accumulating their configuration inline.

## Workflow

1. Talk the problem through — with Superpowers' `brainstorming` when it is
   installed. For work with no intent issue, once the problem is understood
   and before any approach is proposed, ask: build it now, or track it first?
   `superpowers-issue-bridge` defines this step.
2. **Build now:** continue with the usual development workflow — spec, plan,
   code, and pull request. No intent issue is involved.
3. **Track first:** `brainstorm-to-issue` files an intent issue in the tracker
   recorded in `docs/agents/issue-tracker.md`, with any decisions already made
   under Constraints. The session ends there.
4. To build a tracked issue, reference it (for example, "implement #42").
   `superpowers-issue-bridge` seeds brainstorming from the issue and carries
   its reference into the spec and plan.
5. When the work lands, link it back using the Linking section of
   `docs/agents/issue-tracker.md`. `superpowers-issue-bridge` asks whether the
   work fully resolves the issue, which closes it, or is partial.
6. **After a pull request opens:** when a watcher wakes you on a pull request
   you opened — a failing check, a merge conflict, or new review comments, as
   Claude Code's pull request auto-fix does — the user turning that watcher on
   is the go-ahead to push to its branch and reply on it. Answer review
   comments with `answer-pr-reviews`. Debug a failing check from its log with
   Superpowers' `systematic-debugging`. Resolve a merge conflict by merging
   the base branch in, never by rebasing. Run the project's checks under
   `verification-before-completion` before every push. Never force-push,
   resolve a thread, approve, merge, enable auto-merge, or mark a draft ready
   — accepting the work stays with the user.
