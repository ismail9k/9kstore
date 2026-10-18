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

The app is a scaffold so far: Next.js 16 App Router under `src/app`, deployed
to Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`). Import from
`src` with the `@/` alias.

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
  Instagram's in-app browser.
- **Arabic is first-class, not mirrored English.** Use RTL layout, keep prices,
  sizes and codes readable inside RTL text, use Western digits (0–9) in both
  languages, and give every customer-facing string an Arabic version.
- **Sold-out products stay visible,** marked "Sold out", and a hidden
  product's link shows a "no longer available" page, not a 404, so old story
  links keep working.
- **Mobile weight matters.** Most visitors arrive in Instagram's in-app browser
  on 4G, and the catalog should be usable in about 2 seconds. Serve images in
  modern formats at screen-fitting sizes.

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
