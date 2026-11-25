# Owner Login Guess Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Password guesses from devices the store does not know are capped at 20 an hour across every IP address together, while the owner's laptop (a device that has logged in before) keeps its own limit and keeps logging in during an attack.

**Architecture:** The existing attempt transition (`nextAttempt` and its SQL twin) takes a policy argument and a bucket key instead of module constants and an IP. A pure `attemptSteps` decides which buckets an attempt is counted on — a known device's own bucket, or the client's IP (`/64` for IPv6) bucket then a shared `global` bucket — and the login action records them in order, stopping at the first locked one. A signed `9k_device` cookie, set on every successful login, marks a known device.

**Tech Stack:** Next.js 16.4 App Router Server Actions on Cloudflare Workers via `@opennextjs/cloudflare`; Cloudflare D1 (existing `login_attempts` table, no migration); WebCrypto HMAC-SHA256; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-login-guess-limit-design.md`

Intent-Issue: #15 — https://github.com/ismail9k/9kstore/issues/15

## Global Constraints

- Read `AGENTS.md` first. `cookies()` and `headers()` are async; `cacheComponents` stays off.
- Client policy: 5 attempts per 15 minutes, then locked 15 minutes. Shared policy: 20 attempts per 60 minutes, then locked 60 minutes.
- Bucket keys in `login_attempts.ip`: `ip:<IPv4>`, `net:<four hextets>::/64`, `device:<id>`, `global`. No migration.
- A correct password clears only the bucket it was counted on first (device or client key), never `global`.
- Device cookie: name `9k_device`, `HttpOnly`, `SameSite=Lax`, `Secure` when `process.env.NODE_ENV === "production"`, `Path=/admin`, max age 365 days, fresh id on every successful login. Logout does not touch it.
- Device signing key: `"device\n" + signingKey(secrets)`.
- Refusal copy, exact: client/device locked — `Too many tries. Wait 15 minutes and try again.`; shared locked — `Too many login attempts right now. Log in from a device you've used here before, or wait an hour.`
- `clientIp()` in the login action stays as it is (issue #16 owns it). Don't touch Server Action forwarding or the README's WAF paragraph.
- The session token's format, `signToken`/`verifyToken` signatures and `token.test.ts` cases stay unchanged.
- Tests sit next to code as `*.test.ts`, logic only. `noUncheckedIndexedAccess` is on.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run `pnpm deploy` or `pnpm upload`.

## Review Focus

1. A guesser's burst from many addresses must hit the shared bucket only after its client bucket passes, and the action must stop at the first locked step — pinned by the step-order tests in Task 3.
2. A garbage, truncated or old-format `9k_device` cookie must count as an unknown device and never throw or 500 the login — pinned in Task 4.
3. The same `/64` written differently (compressed, expanded, uppercase, leading zeros, zone suffix) must give one key, or a guesser rotates spellings — pinned in Task 2.
4. A session cookie must never pass as a device cookie, nor a device cookie as a session — pinned in Task 4.
5. The owner's correct login on an unknown device must clear her client bucket and leave `global` alone — pinned in Task 3 (first step is never `global`).

---

### Task 1: Attempt policies and keyed storage

**Files:**
- Modify: `src/lib/auth/attempts.ts`
- Modify: `src/lib/auth/attempts.test.ts`
- Modify: `src/lib/auth/store.ts`
- Modify: `src/app/(admin)/admin/login/actions.ts` (only the call sites, to keep the build green)

**Interfaces:**
- Produces:
  - `export type AttemptPolicy = { maxFailures: number; windowMs: number; lockoutMs: number }`
  - `export const CLIENT_POLICY: AttemptPolicy` = `{ maxFailures: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 }`
  - `export const GLOBAL_POLICY: AttemptPolicy` = `{ maxFailures: 20, windowMs: 60 * 60 * 1000, lockoutMs: 60 * 60 * 1000 }`
  - `nextAttempt(record: AttemptRecord | null, now: number, policy: AttemptPolicy): AttemptRecord`
  - `isLocked(record, now)` unchanged; `AttemptRecord` unchanged.
  - `recordLoginAttempt(key: string, now: number, policy: AttemptPolicy): Promise<AttemptRecord>` and `clearLoginAttempts(key: string): Promise<void>` in `store.ts`.
  - `MAX_FAILURES`, `WINDOW_MS`, `LOCKOUT_MS` are removed.

- [ ] **Step 1: Rewrite `attempts.test.ts` against policies**

Keep every existing case, replacing the constants with `CLIENT_POLICY.maxFailures` / `.windowMs` / `.lockoutMs` and passing `CLIENT_POLICY` to `nextAttempt` (the `attempts()` helper takes a policy, default `CLIENT_POLICY`). Replace the policy test and add one:

```ts
test("the client policy is 5 tries per 15 minutes, then 15 minutes locked", () => {
  expect(CLIENT_POLICY).toEqual({ maxFailures: 5, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 });
});

test("the shared policy is 20 tries per hour, then an hour locked", () => {
  expect(GLOBAL_POLICY).toEqual({ maxFailures: 20, windowMs: 60 * 60_000, lockoutMs: 60 * 60_000 });
});

test("a policy locks at its own limit, for its own lockout", () => {
  const twenty = attempts(20, NOW, null, GLOBAL_POLICY);
  expect(isLocked(twenty, NOW)).toBe(false);
  const next = nextAttempt(twenty, NOW + 1, GLOBAL_POLICY);
  expect(next).toEqual({ failures: 21, windowStart: NOW, lockedUntil: NOW + 1 + 60 * 60_000 });
  // The same record under the client policy is already past its limit.
  expect(nextAttempt(attempts(5, NOW), NOW + 1, CLIENT_POLICY).lockedUntil).toBe(NOW + 1 + 15 * 60_000);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test src/lib/auth/attempts.test.ts`
Expected: FAIL — `CLIENT_POLICY` / `GLOBAL_POLICY` are not exported.

- [ ] **Step 3: Implement the policies in `attempts.ts`**

Replace the three constants with `AttemptPolicy`, `CLIENT_POLICY`, `GLOBAL_POLICY`; `nextAttempt` reads its numbers from `policy`. Update the module comment: a record belongs to a bucket key (client, device or shared, see `attemptSteps` in Task 3), not an IP.

- [ ] **Step 4: Key the store by bucket and pass the policy**

In `store.ts`: `recordLoginAttempt(key, now, policy)` binds `key, now, policy.windowMs, policy.maxFailures, policy.lockoutMs` to the unchanged `RECORD_ATTEMPT` SQL; `clearLoginAttempts(key)` deletes by key. Update the comments: the `ip` column holds a bucket key (`ip:…`, `net:…::/64`, `device:…`, `global`); `?1` is the key. In `actions.ts`, change the two calls to `recordLoginAttempt(ip, now, CLIENT_POLICY)` and `clearLoginAttempts(ip)` for now (Task 5 rewires them).

- [ ] **Step 5: Run the checks**

Run: `pnpm test src/lib/auth && pnpm typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/attempts.ts src/lib/auth/attempts.test.ts src/lib/auth/store.ts "src/app/(admin)/admin/login/actions.ts"
git commit -m "refactor(auth): login attempt limits take a policy and a bucket key"
```

### Task 2: Client key from the IP

**Files:**
- Create: `src/lib/auth/client-key.ts`
- Test: `src/lib/auth/client-key.test.ts`

**Interfaces:**
- Produces: `export function clientKey(ip: string): string` — pure, no `server-only`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("clientKey", () => {
  test("IPv4 keeps the whole address", () => {
    expect(clientKey("203.0.113.7")).toBe("ip:203.0.113.7");
  });
  test("IPv6 keeps the /64", () => {
    expect(clientKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("net:2001:db8:1:2::/64");
  });
  test("every address in one /64 gives the same key, however it is written", () => {
    const key = "net:2001:db8:0:2::/64";
    expect(clientKey("2001:db8::2:0:0:0:1")).toBe(key);
    expect(clientKey("2001:0DB8:0000:0002:ffff:0:0:9")).toBe(key);
    expect(clientKey("2001:db8:0:2::1%eth0")).toBe(key);
    expect(clientKey("2001:db8:0:2::")).toBe(key);
  });
  test("different /64s give different keys", () => {
    expect(clientKey("2001:db8:0:2::1")).not.toBe(clientKey("2001:db8:0:3::1"));
  });
  test("leading :: and loopback expand to zeros", () => {
    expect(clientKey("::1")).toBe("net:0:0:0:0::/64");
  });
  test("IPv4-mapped IPv6 counts as the IPv4 address", () => {
    expect(clientKey("::ffff:203.0.113.7")).toBe("ip:203.0.113.7");
    expect(clientKey("::FFFF:203.0.113.7")).toBe("ip:203.0.113.7");
  });
  test("anything else is kept as given", () => {
    expect(clientKey("unknown")).toBe("ip:unknown");
    expect(clientKey("1:2:3")).toBe("ip:1:2:3");
    expect(clientKey("2001:db8::1::2")).toBe("ip:2001:db8::1::2");
    expect(clientKey("")).toBe("ip:");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test src/lib/auth/client-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `clientKey(ip: string): string`**

Order: strip a `%zone` suffix; dotted-quad (`/^\d{1,3}(\.\d{1,3}){3}$/`) → `ip:<as given>`; case-insensitive `::ffff:<dotted-quad>` → `ip:<dotted-quad>`; otherwise parse as IPv6 — at most one `::`, expand it with zero groups to exactly 8, a trailing dotted quad counts as two groups, every group 1–4 hex digits — and return `net:` + the first four groups as `parseInt(g, 16).toString(16)` joined by `:` + `::/64`. Any parse failure → `ip:<original input>`. The module comment says it only normalises; where the IP comes from is the login action's `clientIp()` (issue #16).

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test src/lib/auth/client-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/client-key.ts src/lib/auth/client-key.test.ts
git commit -m "feat(auth): count an IPv6 /64 as one login client"
```

### Task 3: Which buckets an attempt counts on

**Files:**
- Modify: `src/lib/auth/attempts.ts`
- Modify: `src/lib/auth/attempts.test.ts`

**Interfaces:**
- Consumes: `clientKey` (Task 2), `CLIENT_POLICY`, `GLOBAL_POLICY` (Task 1).
- Produces:
  - `export const GLOBAL_KEY = "global"`
  - `export type AttemptStep = { key: string; policy: AttemptPolicy; refusal: "client" | "global" }`
  - `export function attemptSteps(deviceId: string | null, ip: string): AttemptStep[]` — the login action records these in order and stops at the first locked one; a correct password clears `steps[0].key`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("attemptSteps", () => {
  test("an unknown device counts on its client bucket, then the shared one", () => {
    expect(attemptSteps(null, "2001:db8:0:2::1")).toEqual([
      { key: "net:2001:db8:0:2::/64", policy: CLIENT_POLICY, refusal: "client" },
      { key: GLOBAL_KEY, policy: GLOBAL_POLICY, refusal: "global" },
    ]);
  });
  test("a known device counts only on its own bucket, whatever its IP", () => {
    expect(attemptSteps("AAAAAAAAAAAAAAAAAAAAAA", "203.0.113.7")).toEqual([
      { key: "device:AAAAAAAAAAAAAAAAAAAAAA", policy: CLIENT_POLICY, refusal: "client" },
    ]);
  });
  test("the bucket a correct password clears is never the shared one", () => {
    for (const steps of [attemptSteps(null, "203.0.113.7"), attemptSteps("AAAAAAAAAAAAAAAAAAAAAA", "x")]) {
      expect(steps[0]?.key).not.toBe(GLOBAL_KEY);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test src/lib/auth/attempts.test.ts`
Expected: FAIL — `attemptSteps` is not exported.

- [ ] **Step 3: Implement `attemptSteps` and `GLOBAL_KEY` in `attempts.ts`**

Its doc comment states the order and why: the shared bucket is counted only once the client bucket passes, so a locked client cannot use up the shared limit; a known device skips both, so strangers cannot lock the owner's laptop out.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test src/lib/auth/attempts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/attempts.ts src/lib/auth/attempts.test.ts
git commit -m "feat(auth): decide which login buckets an attempt counts on"
```

### Task 4: Device tokens

**Files:**
- Modify: `src/lib/auth/token.ts`
- Create: `src/lib/auth/device-token.test.ts` (`// @vitest-environment node`, like `token.test.ts`)

**Interfaces:**
- Consumes: `signingKey(secrets)`, the private `hmac`/base64url helpers in `token.ts`.
- Produces:
  - `export type DevicePayload = { id: string; iat: number; exp: number }`
  - `export function deviceSigningKey(secrets: Secrets): string` → `"device\n" + signingKey(secrets)`
  - `export function newDeviceId(): string` — 16 bytes from `crypto.getRandomValues`, base64url, 22 characters.
  - `export async function signDeviceToken(payload: DevicePayload, secret: string): Promise<string>`
  - `export async function verifyDeviceToken(token: string | undefined, secret: string, now?: number): Promise<DevicePayload | null>` — never throws; requires a valid signature, `exp > now`, finite `iat`/`exp`, and `id` matching `/^[A-Za-z0-9_-]{22}$/`.

- [ ] **Step 1: Write the failing tests**

```ts
const secrets = { adminPassword: "correct horse battery", sessionSecret: "0123456789abcdef0123456789abcdef-test" };
const NOW = 1_800_000_000_000;
const YEAR = 365 * 24 * 60 * 60 * 1000;
const device = { id: "AAAAAAAAAAAAAAAAAAAAAA", iat: NOW, exp: NOW + YEAR };

test("a new device id is 22 base64url characters and differs each time", () => {
  const a = newDeviceId();
  expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(newDeviceId()).not.toBe(a);
});
test("sign then verify returns the payload", async () => {
  const key = deviceSigningKey(secrets);
  expect(await verifyDeviceToken(await signDeviceToken(device, key), key, NOW)).toEqual(device);
});
test("the device key differs from the session key", () => {
  expect(deviceSigningKey(secrets)).toBe(`device\n${signingKey(secrets)}`);
});
test("tampered, expired and wrong-key tokens fail", async () => { /* flip the last signature char; exp <= NOW; signed with signingKey(secrets) */ });
test("a bad id fails", async () => { /* id "short", id with "/" */ });
test("garbage never throws", async () => {
  for (const t of [undefined, "", "abc", "a.b.c", ".", "%%%.%%%", "eyJ9.x"]) {
    expect(await verifyDeviceToken(t, deviceSigningKey(secrets), NOW)).toBeNull();
  }
});
test("a session token is not a device token, under either key", async () => {
  const session = await signToken({ iat: NOW, exp: NOW + YEAR, v: 1 }, signingKey(secrets));
  expect(await verifyDeviceToken(session, deviceSigningKey(secrets), NOW)).toBeNull();
  expect(await verifyDeviceToken(session, signingKey(secrets), NOW)).toBeNull(); // no id
});
test("a device token is not a session token, under either key", async () => {
  const token = await signDeviceToken(device, deviceSigningKey(secrets));
  expect(await verifyToken(token, signingKey(secrets), NOW)).toBeNull();
  const sameKey = await signDeviceToken(device, signingKey(secrets));
  expect(await verifyToken(sameKey, signingKey(secrets), NOW)).toBeNull(); // no v
});
```

Fill in the two commented cases with concrete assertions that each return `null`.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test src/lib/auth/device-token.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement the device token in `token.ts`**

Share the body/signature encoding between session and device tokens however reads best (the builder's call); `signToken`, `verifyToken` and their output must not change. Serialize device payloads as exactly `{ id, iat, exp }`.

- [ ] **Step 4: Run the auth tests**

Run: `pnpm test src/lib/auth`
Expected: PASS, `token.test.ts` untouched and green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/token.ts src/lib/auth/device-token.test.ts
git commit -m "feat(auth): signed device tokens for known login devices"
```

### Task 5: The device cookie and the login action

**Files:**
- Create: `src/lib/auth/device.ts` (`import "server-only"`)
- Modify: `src/app/(admin)/admin/login/actions.ts`

**Interfaces:**
- Consumes: `attemptSteps`, `isLocked` (Tasks 1, 3); `recordLoginAttempt`, `clearLoginAttempts` (Task 1); `deviceSigningKey`, `newDeviceId`, `signDeviceToken`, `verifyDeviceToken` (Task 4); `Secrets` from `secrets.ts`.
- Produces:
  - `export const DEVICE_COOKIE = "9k_device"`
  - `export const DEVICE_DAYS = 365`
  - `export async function knownDeviceId(secrets: Secrets): Promise<string | null>` — reads `9k_device` from `cookies()`, returns the verified payload's `id` or `null`; never throws.
  - `export async function rememberDevice(secrets: Secrets): Promise<void>` — signs `{ id: newDeviceId(), iat: now, exp: now + DEVICE_DAYS days }` and sets the cookie with the flags in Global Constraints. Call only from a Server Action.

- [ ] **Step 1: Write `device.ts`**

Its doc comment: the cookie grants no access, only a device's own guess budget; logout leaves it; changing `ADMIN_PASSWORD` or `SESSION_SECRET` forgets every device; `Path=/admin` means a login reaching the action through another page counts as an unknown device.

- [ ] **Step 2: Rewire `login` in `actions.ts`**

After `getSecrets()`: `const steps = attemptSteps(await knownDeviceId(secrets), await clientIp());`. For each step in order, inside the existing `try` (any failure → `LOGIN_FAILED`), `recordLoginAttempt(step.key, now, step.policy)`; when `isLocked`, `await wait()` and return the step's refusal message (exact copy in Global Constraints, kept in a `Record<AttemptStep["refusal"], string>`). Password check unchanged. On success, inside the existing `try`: `clearLoginAttempts(steps[0].key)` (guard the `undefined` from `noUncheckedIndexedAccess`), `createSession()`, `rememberDevice(secrets)`, then `redirect("/admin")`. Update the action's doc comment to describe the steps. `clientIp()` is unchanged.

- [ ] **Step 3: Run the checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 4: Check it by hand under `pnpm dev`**

With `.dev.vars` set and `pnpm db:migrate:local` applied, start `pnpm dev`, open `http://localhost:3000/admin/login`:
1. Log in with the right password. Expected: `/admin`, and DevTools shows a `9k_device` cookie with `Path=/admin`, `HttpOnly`, about a year's expiry.
2. Lock the shared bucket: `pnpm exec wrangler d1 execute DB --local --command "INSERT INTO login_attempts (ip, failures, window_start, locked_until) VALUES ('global', 21, strftime('%s','now')*1000, strftime('%s','now')*1000 + 3600000) ON CONFLICT (ip) DO UPDATE SET failures = 21, locked_until = excluded.locked_until"`.
3. Log out and log in again in the same browser. Expected: logs in (known device).
4. In a private window, try any password. Expected: `Too many login attempts right now. Log in from a device you've used here before, or wait an hour.`
5. Clean up: `pnpm exec wrangler d1 execute DB --local --command "DELETE FROM login_attempts"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/device.ts "src/app/(admin)/admin/login/actions.ts"
git commit -m "feat(auth): cap login guesses across addresses, known devices keep their own limit"
```

### Task 6: README and final verification

**Files:**
- Modify: `README.md` (First-time setup step 4; "Owner follow-up: rate-limit the login")

- [ ] **Step 1: Update the README**

- Step 4 of "First-time setup": add that the password should be long and random (a password manager's generated one) because the login limits slow guessing but can't save a weak password.
- "Owner follow-up: rate-limit the login": replace its first sentence and its last sentence (the shared Wi-Fi warning) with: each address gets 5 tries in 15 minutes (an IPv6 `/64` counts as one address); devices that have never logged in share 20 tries an hour between them; a device that has logged in before keeps its own 5-tries limit, so it can still log in while that shared limit holds; someone on the same Wi-Fi can now only lock out a device that has never logged in. Add: after this change ships, log out and back in once on your laptop so it is remembered. Leave the WAF sentence as it is (issue #16 rewrites it).

- [ ] **Step 2: Run every CI check**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm exec opennextjs-cloudflare build`
Expected: all pass, the Worker builds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe the login's shared guess limit and known devices"
```
