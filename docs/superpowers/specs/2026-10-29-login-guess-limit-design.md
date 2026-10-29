# Owner login guess limit across IP addresses — design

Intent-Issue: #15 — https://github.com/ismail9k/9kstore/issues/15

Status: v1 · 2026-10-29 · planned unattended from the issue, `AGENTS.md`,
the owner-admin spec (`2026-10-19-owner-admin-design.md`, "The owner
login") and the login code as it stands on `develop`. Every choice the
issue left open is recorded under "Calls made while planning", with what it
costs if it turns out wrong.

## Intent

The owner password is the only thing between the internet and every admin
change. Today the login refuses one exact client IP after 5 tries in 15
minutes (`src/lib/auth/attempts.ts`, `src/lib/auth/store.ts`,
`src/app/(admin)/admin/login/actions.ts`). Nothing limits guesses across
addresses, so anyone with an IPv6 `/64` — any cheap server — gives each of
its billions of addresses 5 guesses and never stops. A security audit
guessed 150 times from 30 addresses in one `/64` and was never refused. The
one-second delay does not help against parallel requests, and the code
accepts any password of 12+ characters, weak ones included.

Success: the number of passwords anyone can try stays small and fixed no
matter how many addresses they control, and the owner still logs in
normally from her laptop, even while someone is guessing.

## Goals

1. A hard ceiling on password checks from devices the store does not know,
   counted across every address together.
2. The owner's own laptop (a device that has logged in before) keeps
   logging in while that ceiling is reached.
3. One IPv6 `/64` counts as one client for the per-client limit, so a
   single cheap server cannot use up the shared ceiling on its own.

## Non-goals

- Server Action forwarding through other pages, the WAF rule on
  `POST /admin/login`, and the `x-forwarded-for` fallback when
  `cf-connecting-ip` is missing. These are issue #16, built after this one
  on its own branch. This design leaves `clientIp()` as it is.
- Second factors, passkeys, email codes, CAPTCHAs or Turnstile. The brief
  keeps the admin to one owner and one password.
- Raising the 12-character password minimum (see "Calls").
- Cleaning up old `login_attempts` rows. The table has never been cleaned
  and stays small (see "Storage").

## Anti-goals

- **A design where a stranger can lock the owner out of her own laptop.**
  A plain site-wide lockout would do that, which is why known devices get
  their own limit.
- **A design #16 has to undo.** The new limit must hold even if #16 finds
  the forwarded request carries a spoofable or missing client IP: the
  shared ceiling does not depend on the IP at all.
- **Anything a forged cookie can unlock.** The "known device" mark must be
  signed, so an attacker cannot mint one.

## How it works

### Three kinds of limit, one transition

`attempts.ts` keeps its one transition (`nextAttempt`: count, lock after
the limit, lock does not extend, a fresh window after the lock or the
window ends) and its SQL twin in `store.ts`. What changes is that the
numbers become a **policy** argument instead of module constants, and the
row is identified by a **key** instead of an IP:

| Bucket | Key | Policy | Counts |
|---|---|---|---|
| Per client | `ip:<IPv4>` or `net:<first four IPv6 hextets>::/64` | 5 attempts per 15 min, then locked 15 min (today's numbers) | attempts from a device the store does not know |
| Shared | `global` | 20 attempts per 60 min, then locked 60 min | the same attempts, after they pass their per-client bucket |
| Known device | `device:<device id>` | 5 attempts per 15 min, then locked 15 min | attempts carrying a valid device cookie |

`policy = { maxFailures, windowMs, lockoutMs }`. Export the two policies as
`CLIENT_POLICY` and `GLOBAL_POLICY` (known devices use `CLIENT_POLICY`).
`RECORD_ATTEMPT` already takes the numbers as bind parameters; only its
first parameter's meaning changes from IP to key. The SQL stays one atomic
upsert per bucket.

The keys live in the existing `login_attempts.ip` column. No migration:
the column is a `TEXT PRIMARY KEY`, the prefixes keep the three kinds from
colliding, and renaming the column is not worth a schema change on two
remote databases. The column's comment in `store.ts` and the module
comment in `attempts.ts` say it holds a key now. Rows written before this
ships (bare IPs, no prefix) are simply never read again; any lock in them
would have ended within 15 minutes anyway.

### The order of checks in the login action

Every attempt is still counted before the password is compared.

1. Read the device cookie and verify it (below).
2. **Known device:** record one attempt on `device:<id>`. Locked → refuse
   with the per-client message. The shared bucket is not touched, and the
   IP is not read for counting.
3. **Unknown device:** record one attempt on the client key derived from
   the IP. Locked → refuse with the per-client message, and do **not**
   count it on the shared bucket. Not locked → record one attempt on
   `global`. Locked → refuse with the shared message.
4. Compare the password, as today (constant time, one-second wait when
   wrong).
5. Correct: clear the bucket counted in step 2 or 3 (the device key or the
   client key) — **never** `global` — then create the session and set a
   fresh device cookie.

Any failure recording an attempt still refuses the login with
`LOGIN_FAILED`, never lets it through.

The decision "which buckets, in which order, with which refusal" is a
pure function so it can be tested without D1, for example:

```ts
type AttemptStep = { key: string; policy: AttemptPolicy; refusal: "client" | "global" };
function attemptSteps(deviceId: string | null, ip: string): AttemptStep[];
```

The action runs the steps in order and stops at the first locked one. The
exact signature is the builder's.

Why skipping the shared count for an already-locked client matters: a
locked client hammering the login would otherwise use up the shared
ceiling by itself. With it, one IPv4 address or one `/64` contributes at
most 5 attempts per 15 minutes to the shared bucket.

### What the guesser gets

Without a device cookie, at most 20 password checks per hour across every
address together — about 175,000 a year, whatever the number of addresses.
Concurrent requests cannot slip past, because each bucket is one atomic
upsert counted before the password check. The shared lock lasts an hour
and does not extend while it holds (the transition's existing rule).

### Client key from the IP

A pure function in `attempts.ts` (or a sibling module), e.g.
`clientKey(ip: string): string`:

- IPv4 (`1.2.3.4`) → `ip:1.2.3.4`.
- IPv6 → expand `::`, take the first four hextets, lowercase, no leading
  zeros → `net:2001:db8:1:2::/64`. A zone suffix (`%eth0`) is dropped.
- IPv4-mapped IPv6 (`::ffff:1.2.3.4`) → `ip:1.2.3.4`.
- Anything else (including today's `"unknown"` fallback) → `ip:<the
  string as given>`, so behaviour for odd input matches today's.

The function only normalises. Where the IP comes from (`clientIp()` in the
login action, `cf-connecting-ip` then `x-forwarded-for`) is unchanged and
belongs to #16.

### The device cookie

A device that logs in successfully is remembered as "known".

- Cookie `9k_device`, set on every successful login, replacing any old
  one. `HttpOnly`, `SameSite=Lax`, `Secure` in production (the same rule as
  the session cookie), `Path=/admin`, max age 365 days.
- Value: `base64url(JSON {id, iat, exp}).base64url(HMAC-SHA256)`, the same
  format and helpers as the session token in `token.ts`. `id` is 16 random
  bytes from `crypto.getRandomValues`, base64url. A fresh `id` on each
  login.
- Signing key: `"device\n" + signingKey(secrets)`. The prefix separates it
  from the session key, so a session cookie can never pass as a device
  cookie or the other way round. Because `signingKey` includes the admin
  password and `SESSION_SECRET`, changing either forgets every device.
- Verification: signature, then `exp`, then the payload's shape. Anything
  that fails is treated as no cookie (an unknown device), never as an
  error. Never throws.
- Logout leaves the device cookie alone: it grants no access, only the
  owner's own guess budget. Ending sessions (the session version) does not
  touch devices either.
- `Path=/admin` means a login submitted through another page (the
  forwarding #16 tracks) does not carry the cookie and counts as an
  unknown device. That is the safe direction, and #16 does not need to
  change it.

How `token.ts` grows to sign a second payload shape is the builder's call
(a generic signer both use, or a device-specific pair beside the session
pair), as long as the session token's format and behaviour do not change
and its tests still pass untouched.

### Messages

Owner-facing, English, like the rest of the admin:

- Per client or known device locked: "Too many tries. Wait 15 minutes and
  try again." (today's text).
- Shared bucket locked: "Too many login attempts right now. Log in from a
  device you've used here before, or wait an hour."

Both still wait the one second before answering.

### Storage

The table gains at most one row per client that tries, one `global` row,
and one row per owner login (device ids are fresh per login, and a
successful login deletes its own row). That is the same growth as today.

### README

Update "Owner follow-up: rate-limit the login" so it describes the new
behaviour in plain words: per address (an IPv6 `/64` counts as one), a
shared limit of 20 tries an hour from devices that have never logged in,
and that a device that has logged in before keeps working while that limit
holds. Replace the warning about someone on the same Wi-Fi locking the
owner out: that now only applies to a device that has never logged in.
Keep the WAF paragraph as it is — #16 rewrites it. Tell the owner to log
out and back in once on her laptop after this ships: device cookies are
only set at login, so until then her laptop counts as a device that has
never logged in (call 11). Add one line to the
password step in "First-time setup": use a long random password (a
password manager's generated one); the login limits slow guessing but
cannot save a weak password.

## Testing

Unit tests next to the code, Vitest, logic only (AGENTS.md):

- `attempts.test.ts`: the existing cases, now run with `CLIENT_POLICY`;
  the policy values pinned (5/15/15 and 20/60/60); one case showing a
  different policy locks at its own limit.
- `clientKey`: IPv4, full and `::`-compressed IPv6 in one `/64` giving the
  same key, two different `/64`s giving different keys, upper/lower case,
  IPv4-mapped, zone suffix, `"unknown"`.
- `attemptSteps`: unknown device → client key then `global`; known device →
  only its device key; refusal kinds.
- Device token: sign then verify; tampered, expired, wrong key, and a
  session token presented as a device token all fail; a device token
  presented as a session token fails.
- The SQL upsert, the cookie writes and the action itself are not
  integration-tested, as today. The builder runs the login by hand under
  `pnpm dev`: a known device still logs in after the shared bucket is
  locked (set the `global` row's `locked_until` by hand with
  `wrangler d1 execute --local`), and an unknown device gets the shared
  message.

## Calls made while planning

Each was decided without the owner. What it costs if wrong:

1. **Device cookie over a plain site-wide lockout.** A shared ceiling alone
   lets anyone lock the owner out of the admin for as long as they keep
   guessing. Cost if wrong: one more cookie and a signer; if the owner
   would rather accept that risk, drop the device bucket and the cookie.
2. **Shared policy: 20 tries per hour, then locked an hour.** Bounds a
   guesser to about 175,000 tries a year. Cost if wrong: too loose for a
   weak password, or too tight for the owner on a new laptop during an
   attack (she waits up to an hour). Two constants to change.
3. **During a sustained attack, a device that has never logged in cannot
   log in.** The owner's known laptop keeps working. If she loses that
   cookie (new laptop, cleared cookies) while someone keeps guessing, she
   waits for the attack to stop, or asks for a WAF block (#16). Cost if
   wrong: an escape hatch such as a trusted-IP variable would be a new
   feature.
4. **Correct logins never clear the shared bucket.** Its count is about
   strangers; clearing it would hand a guesser a fresh budget. Cost if
   wrong: after the owner fails a few times on a new device, the shared
   budget is that much smaller until the window ends.
5. **A locked client does not count on the shared bucket.** Keeps one
   address or `/64` from using up the shared ceiling. Cost if wrong: none
   for the ceiling, which still holds.
6. **IPv6 grouped by `/64`.** Matches how providers hand out IPv6. Cost if
   wrong: people behind one `/64` share a 5-try limit — only matters to a
   device that has never logged in.
7. **Logout keeps the device cookie; changing the password or
   `SESSION_SECRET` forgets every device.** The cookie gives no access, so
   keeping it costs nothing on a shared computer beyond a 5-try budget.
8. **No migration; keys go in the `ip` column.** Cost if wrong: a later
   rename migration.
9. **The 12-character minimum stays.** Raising it could mark the deployed
   admin "not set up" if the live password is shorter, and nobody can
   check that from here. The README says to use a long random one.
10. **Open questions from the issue.** Whether the deployed
    `ADMIN_PASSWORD` is long and random cannot be checked from the repo;
    this design does not depend on it. Whether a WAF rule exists, and
    whether `cf-connecting-ip` is always present, are #16's questions; the
    shared ceiling holds either way.
11. **No device cookie for sessions that already exist.** The cookie is
    only set by a successful login, so the owner's laptop is "unknown"
    until she next logs in (a session lasts up to 30 days). The README
    asks her to log out and back in once after the deploy, instead of the
    proxy handing device cookies to every valid session. Cost if wrong: if
    she skips it and an attack starts before her next login, she waits
    out the shared lock once.

## Left to the builder

- Names and file placement of `clientKey`, `attemptSteps`, the policy type
  and the device-token helpers, within `src/lib/auth`.
- How `token.ts` shares code between the two token kinds.
- Whether the device cookie read/write lives in `session.ts` or a new
  server-only module beside it.
