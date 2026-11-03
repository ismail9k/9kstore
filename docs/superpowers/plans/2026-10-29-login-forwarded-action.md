# Owner Login Only From the Login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A password guess is checked only when it is posted straight to `/admin/login`, so every checked guess is counted under the IP Cloudflare's edge reports, and a WAF rule on `POST /admin/login` covers every checked guess.

**Architecture:** A small pure module reads two things from the request headers: whether Next forwarded this Server Action from another page (`x-action-forwarded`), and the client IP from `cf-connecting-ip` alone. The login action refuses forwarded calls before it reads secrets, counts anything, or compares the password. The `x-forwarded-for` fallback is removed: with no `cf-connecting-ip`, every attempt shares the one key `unknown`.

**Tech Stack:** Next.js 16.4.2 App Router Server Actions on Cloudflare Workers via `@opennextjs/cloudflare`; Vitest.

**Spec:** none, because this is a small change. The description and the questions answered below open the plan.

Intent-Issue: #16 — https://github.com/ismail9k/9kstore/issues/16

## Description (small change)

The issue is right, and this run reproduced it locally. `pnpm exec next build`, then `next start`, then a `curl` fetch-action POST carrying the login action's ID ran the login action at `/admin/login`, `/ar`, and `/admin`. The installed handler (`node_modules/next/dist/server/app-render/action-handler.js`, around line 486) does this. When the page that received a fetch action (one with a `Next-Action` header) isn't listed for that action in the manifest, `selectWorkerForForwarding` picks a page that is listed. `createForwardedActionResponse` then `fetch`es `<initURL origin>/admin/login` with the client's headers plus `x-action-forwarded: 1`. A request that already carries `x-action-forwarded` is never forwarded again.

Other routes were checked too, and they fail:
- The no-JS form route (`$ACTION_ID_<id>` in the body) posted to `/ar` answers 409, "Failed to find Server Action". The module map looks up the action under the current page only (`createServerModuleMap` in `manifests-singleton.js`).
- A client that sets `x-action-forwarded` itself on `/ar` also gets 409.

So the only way to reach the login action from another page is Next's own forwarded self-fetch, and that request always carries `x-action-forwarded`.

The fix is for the login action to refuse any request that carries that header. The owner's form only ever posts on `/admin/login`: the proxy redirects there, and nothing rewrites it. So her login never carries the header, and refusing costs her nothing. A guess sent through another page is never compared with the password, so it gives an attacker nothing. Because it isn't counted either, its unreliable IP header no longer matters. A guess posted straight to `/admin/login` always passes Cloudflare's edge, which sets `cf-connecting-ip` and overwrites any value the client sends. That IP becomes the only source. `x-forwarded-for` is dropped, because its first entry is whatever the client wrote. Missing `cf-connecting-ip` happens only off Cloudflare (`next dev`, `next start`), and there everything falls into the one shared `unknown` key. That way, no header value lets a client pick a fresh key.

### Questions answered on the owner's behalf

1. **What `cf-connecting-ip` does Cloudflare set on the Worker's self-fetch?** The design doesn't depend on the answer. Forwarded calls are refused before anything is counted, so whatever IP they carry is never used. The `wrangler tail` check on staging becomes optional (owner follow-ups).
2. **Does the README's WAF rule exist, and does it count the forwarded second request?** That can't be known from here, so it goes to the owner as a follow-up. After this change it doesn't matter whether the rule counts the forwarded copy. The copy is refused anyway, and if the rule blocks it, only the attacker's request is blocked. The rule on `POST /admin/login` now covers every guess that gets checked.
3. **Which pages does the built action manifest list for the login action?** Checked in `.next/server/server-reference-manifest.json` after `next build`: `login` lists only `app/(admin)/admin/login/page`. `logout`, `saveOrder` and `togglePublished` list every admin page, `saveProduct` lists the two product pages, and `saveSettings` lists the settings page. This plan leaves the other actions alone. They all start with `requireOwner()`, and forwarding them changes nothing.
4. **Should a forwarded attempt be counted?** No. Its IP can't be trusted, and counting it under a shared key would let anyone lock the owner out with requests that are never checked. It is refused without being counted, with no 1-second wait and no password comparison.
5. **Should the proxy block forwarded or cross-page action POSTs instead?** No. The proxy can't tell Next's own forwarded fetch from a client request, and the action is the security boundary anyway (the `gate.ts` comment says so). The check goes in the action.
6. **What does a refused forwarded call answer?** `{ error: "Log in from the login page." }` (only an attacker ever sees it), plus one `console.warn("login: refused an attempt forwarded from another page")` so it shows in `wrangler tail`. No IP is logged.
7. **What does local development do without `cf-connecting-ip`?** It uses the single key `unknown`, with no warning and no `NEXTJS_ENV` branch. One developer locking themselves out locally is fine (clear `login_attempts`).

### How this composes with #17 (issue #15, branch `origin/feat/15-owner-login-lockout-can-be-bypassed-by-r`)

#17 keeps `clientIp()` and its signature (`async function clientIp(): Promise<string>`) and passes the result to `clientKey()` through `attemptSteps(...)`. This plan changes only the body and doc comment of `clientIp()`, so it works whichever PR merges first. Under #17, `clientKey("unknown")` gives `ip:unknown`, the shared local key.

The edits are placed so they don't touch the lines #17 changes. A three-way `git merge-file` of the planned `actions.ts` and README edits against #17 merged cleanly:
- The new import goes after `@/lib/auth/password`, and the module is named `request-source` so it sorts there. #17 changed the `attempts` import and added `device`.
- The forwarded check is the first statement in `login()`'s body. #17 rewrote the JSDoc above the signature and the lines after `if (!secrets)`, so the JSDoc is left alone.
- The README gets a new paragraph after the existing "rate-limit the login" paragraph, which is left as it is. #17 rewrote that paragraph and kept its WAF sentence.

Task 2 re-runs this merge check.

### Owner follow-ups (need a live Cloudflare deploy; not done here)

- On staging, after deploy, confirm with the `curl` from Task 2 Step 5 (pointed at the staging domain, with the action ID from that build) that `POST /ar` answers `Log in from the login page.` and `wrangler tail --env staging` shows the warning.
- Optionally, while tailing, note what `cf-connecting-ip` the forwarded request carries. This answers the issue's first open question, but nothing depends on it.
- Create (or confirm) the Cloudflare WAF rate-limiting rule on `POST /admin/login`, counting by IP, on both Workers' domains (production and staging).

## Global Constraints

- Read `AGENTS.md` first. `headers()` is async. `noUncheckedIndexedAccess` is on.
- Forwarded marker: request header `x-action-forwarded`. Any value, including empty, counts as forwarded (`Headers.get` returns non-null).
- Client IP: `cf-connecting-ip`, trimmed. If it's missing, empty or only whitespace, use exactly `unknown`. Never read `x-forwarded-for`.
- Refusal copy, exact: `Log in from the login page.` Warning, exact: `login: refused an attempt forwarded from another page`.
- A forwarded call is refused before `getSecrets()`, before any attempt is recorded, and before the password is read, with no `wait()`.
- Keep the conflict surface with #17 small. In `src/app/(admin)/admin/login/actions.ts`, do not edit `login()`'s JSDoc, the `attempts` import line, the constants, or anything after `if (!secrets)`. Keep `clientIp()`'s name and signature.
- In `README.md`, do not edit the existing "rate-limit the login" paragraph. Only add a paragraph after it.
- Tests sit next to code as `*.test.ts`, logic only.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy` or `pnpm upload`.

## Review Focus

1. A client must not get past the per-IP limit by changing `x-forwarded-for` when `cf-connecting-ip` is missing. Every such attempt shares `unknown`. Pinned in Task 1 (`ignores x-forwarded-for`) and checked by hand in Task 2 Step 5.
2. The owner's real login (straight to `/admin/login`, no `x-action-forwarded`) must still check the password and log in. Checked by hand in Task 2 Step 5 (the direct POST answers `Wrong password.`, and a browser login with the right password reaches `/admin`).
3. A client that sends `x-action-forwarded` itself, straight to `/admin/login`, must be refused without a password check, not treated as a normal attempt. Pinned in Task 1 (any value counts) and checked in Task 2 Step 5.
4. A `cf-connecting-ip` that is present but blank must not become an empty-string key. Pinned in Task 1 (`blank cf-connecting-ip is unknown`).
5. Merging after #17 must leave `clientIp()` feeding `attemptSteps` unchanged. Checked by the merge-tree step in Task 2.

---

### Task 1: Request source helpers

**Files:**
- Create: `src/lib/auth/request-source.ts`
- Test: `src/lib/auth/request-source.test.ts`

**Interfaces:**
- Produces:
  - `export const FORWARDED_ACTION_HEADER = "x-action-forwarded"`
  - `export const UNKNOWN_CLIENT_IP = "unknown"`
  - `export type HeaderReader = { get(name: string): string | null }` (a `Headers` / `ReadonlyHeaders` from `headers()` fits)
  - `export function isForwardedAction(headers: HeaderReader): boolean`
  - `export function connectingIp(headers: HeaderReader): string`

The module is pure: no `server-only` import, no Next import. Its file comment says why the header is trusted. Next sets `x-action-forwarded` on the self-fetch it makes when a Server Action is posted to a page that doesn't own it (`action-handler.js`, `createForwardedActionResponse`). The comment also says why `x-forwarded-for` is never read.

- [ ] **Step 1: Write the failing tests** in `src/lib/auth/request-source.test.ts`, building inputs with `new Headers({...})`:

```ts
describe("isForwardedAction", () => {
  test("Next's forwarded self-fetch is forwarded", () => {
    expect(isForwardedAction(new Headers({ "x-action-forwarded": "1" }))).toBe(true);
  });
  test("any value, even empty, counts as forwarded", () => {
    expect(isForwardedAction(new Headers({ "x-action-forwarded": "" }))).toBe(true);
    expect(isForwardedAction(new Headers({ "X-Action-Forwarded": "no" }))).toBe(true);
  });
  test("a direct request is not forwarded", () => {
    expect(isForwardedAction(new Headers({ "cf-connecting-ip": "203.0.113.7" }))).toBe(false);
  });
});

describe("connectingIp", () => {
  test("uses cf-connecting-ip, trimmed", () => {
    expect(connectingIp(new Headers({ "cf-connecting-ip": " 203.0.113.7 " }))).toBe("203.0.113.7");
    expect(connectingIp(new Headers({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  test("prefers cf-connecting-ip over x-forwarded-for", () => {
    const h = new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.9" });
    expect(connectingIp(h)).toBe("203.0.113.7");
  });
  test("ignores x-forwarded-for: without cf-connecting-ip every client is unknown", () => {
    expect(connectingIp(new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }))).toBe(UNKNOWN_CLIENT_IP);
    expect(connectingIp(new Headers({ "x-forwarded-for": "198.51.100.10" }))).toBe(UNKNOWN_CLIENT_IP);
    expect(UNKNOWN_CLIENT_IP).toBe("unknown");
  });
  test("blank cf-connecting-ip is unknown", () => {
    expect(connectingIp(new Headers({ "cf-connecting-ip": "   " }))).toBe("unknown");
    expect(connectingIp(new Headers())).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/auth/request-source.test.ts`
Expected: FAIL, because the module `./request-source` can't be resolved.

- [ ] **Step 3: Implement `isForwardedAction` and `connectingIp` in `src/lib/auth/request-source.ts`** with the constants and type from Interfaces.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/auth/request-source.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/request-source.ts src/lib/auth/request-source.test.ts
git commit -m "feat(auth): read the login's client IP from cf-connecting-ip only and spot forwarded actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Refuse forwarded logins; README

**Files:**
- Modify: `src/app/(admin)/admin/login/actions.ts` (the imports, `clientIp()` at lines 22–27, and the top of `login()` at line 36)
- Modify: `README.md` (a new paragraph after line 120, the end of the "Owner follow-up: rate-limit the login" paragraph)

**Interfaces:**
- Consumes: `isForwardedAction`, `connectingIp` from `@/lib/auth/request-source` (Task 1).
- Produces: nothing new. `clientIp(): Promise<string>` keeps its name and signature for #17.

- [ ] **Step 1: Wire the action.** In `actions.ts`:
  - Add `import { connectingIp, isForwardedAction } from "@/lib/auth/request-source";` on the line directly after the `@/lib/auth/password` import.
  - Replace `clientIp()`'s doc comment and body. It becomes `return connectingIp(await headers());`, and the comment says it returns the IP Cloudflare's edge sets, never `x-forwarded-for`, or `unknown` off Cloudflare.
  - Make these the first statements of `login()`, before `const secrets = await getSecrets();`, with a short comment on why. Next forwards a Server Action posted to any other page to `/admin/login` with `x-action-forwarded`, and such a call is never checked or counted, so every checked guess came straight to `/admin/login` with Cloudflare's IP.

  ```ts
  if (isForwardedAction(await headers())) {
    console.warn("login: refused an attempt forwarded from another page");
    return { error: "Log in from the login page." };
  }
  ```

  Leave `login()`'s JSDoc and everything from `const secrets` down unchanged.

- [ ] **Step 2: Add the README paragraph.** Under "### Owner follow-up: rate-limit the login", after the existing paragraph (leave that paragraph as it is), add a paragraph covering these points:
  - The login only checks a password posted straight to `/admin/login`. Next forwards a login posted to any other page (`/ar`, `/admin`, …) to the login page, and the login refuses those forwarded calls without checking or counting them. So a WAF rule on `POST /admin/login` covers every checked guess.
  - Count by IP. The rule may also count Next's forwarded copy, which only blocks the sender.
  - The lockout counts each guess under the IP Cloudflare reports (`cf-connecting-ip`) and never reads `X-Forwarded-For`.

  Keep it to about five lines, in the README's plain voice.

- [ ] **Step 3: Run the project checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all three pass. The new test file passes, and no other tests change.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/login/actions.ts" README.md
git commit -m "fix(auth): the login refuses attempts forwarded from other pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Check the behaviour by hand**

Run:

```bash
pnpm db:migrate:local
pnpm exec next build
ADMIN_PASSWORD=probe-password-123 SESSION_SECRET=0123456789abcdef0123456789abcdef01 pnpm exec next start -p 3123 &
ID=$(node -e 'const m=require("./.next/server/server-reference-manifest.json");for(const [k,v] of Object.entries(m.node)) if(v.exportedName==="login") console.log(k)')
post() { curl -s "http://localhost:3123$1" -H "Next-Action: $ID" -H "Origin: http://localhost:3123" -H "Accept: text/x-component" "${@:2}" -F '0=[{},"$K1"]' -F '1_password=wrong-guess' | grep '^1:'; }
post /admin/login
post /ar
post /admin
post /admin/login -H "x-action-forwarded: 1"
for i in 1 2 3 4 5 6; do post /admin/login -H "x-forwarded-for: 198.51.100.$i"; done
```

Expected:
- The first `/admin/login` answers `1:{"error":"Wrong password."}`.
- `/ar`, `/admin`, and the self-marked `/admin/login` each answer `1:{"error":"Log in from the login page."}`, and the server log shows `login: refused an attempt forwarded from another page` three times.
- In the loop, the varying `x-forwarded-for` values all count under `unknown`. Counting the first direct attempt, at least the 5th and 6th answer `Too many tries. Wait 15 minutes and try again.`

Then stop the server and clear the local count:

```bash
pnpm exec wrangler d1 execute DB --local --command "DELETE FROM login_attempts"
```

If `next start` can't reach local D1 (`no such table`), check that `pnpm db:migrate:local` ran in this worktree.

Logging in with the right password in a browser at `http://localhost:3123/admin/login` reaches `/admin`. Under `next start` the session cookie is `Secure`, so use `pnpm dev` for this part if the browser drops it on http.

- [ ] **Step 6: Check the merge with #17**

Run: `git fetch origin && git merge-tree --write-tree HEAD origin/feat/15-owner-login-lockout-can-be-bypassed-by-r`
Expected: exit 0 and no `CONFLICT` lines. If #17 has already merged into `develop`, run `git merge-tree --write-tree HEAD origin/develop` instead.

If either check shows a conflict, keep this plan's placement rules (Global Constraints) and resolve by keeping #17's lines plus this plan's additions. After the merge, `login()` starts with the forwarded check, and `attemptSteps(await knownDeviceId(secrets), await clientIp())` stays as #17 wrote it. Record the result in the PR body.
