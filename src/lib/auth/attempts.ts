/**
 * The login attempt limit, per bucket, as pure functions.
 *
 * A record belongs to a bucket key (a client, a known device, or the shared
 * `global` bucket; see `attemptSteps`), not just an IP. Every login attempt
 * is counted before the password is checked (see the login action), so the
 * count is "attempts", and a correct password deletes the first bucket's
 * record. Within one window the first `maxFailures` attempts are checked;
 * the next one locks the bucket for `lockoutMs`, and every attempt is
 * refused until the lock ends. A window older than `windowMs`, or a lock
 * that has ended, starts a fresh window.
 *
 * `recordLoginAttempt` in `store.ts` runs the same transition as one SQL
 * upsert so parallel requests cannot race past it; its three CASE
 * expressions follow the three branches of `nextAttempt` in order. Change
 * both together.
 */

import { clientKey } from "./client-key";

/** How many attempts a bucket allows per window, and how long it then locks. */
export type AttemptPolicy = { maxFailures: number; windowMs: number; lockoutMs: number };

/** One client or known device: 5 tries per 15 minutes, then locked 15 minutes. */
export const CLIENT_POLICY: AttemptPolicy = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
};

/** All unknown devices together: 20 tries per hour, then locked an hour. */
export const GLOBAL_POLICY: AttemptPolicy = {
  maxFailures: 20,
  windowMs: 60 * 60 * 1000,
  lockoutMs: 60 * 60 * 1000,
};

/** One bucket's attempts. Times are milliseconds since the epoch. */
export type AttemptRecord = {
  failures: number;
  windowStart: number;
  lockedUntil: number | null;
};

/** Whether `record` refuses attempts at `now`. */
export function isLocked(record: AttemptRecord | null, now: number): boolean {
  return record !== null && record.lockedUntil !== null && record.lockedUntil > now;
}

/** The record after one more attempt at `now` (`null`: the bucket has no record). */
export function nextAttempt(
  record: AttemptRecord | null,
  now: number,
  policy: AttemptPolicy,
): AttemptRecord {
  // 1. Still locked: count it, keep the lock as it is (no extension).
  if (record && isLocked(record, now)) {
    return { ...record, failures: record.failures + 1 };
  }
  // 2. No record, an ended lock, or an expired window: start a fresh window.
  if (!record || record.lockedUntil !== null || now - record.windowStart >= policy.windowMs) {
    return { failures: 1, windowStart: now, lockedUntil: null };
  }
  // 3. Same window: count it, and lock once the count passes `policy.maxFailures`.
  const failures = record.failures + 1;
  return {
    failures,
    windowStart: record.windowStart,
    lockedUntil: failures > policy.maxFailures ? now + policy.lockoutMs : null,
  };
}

/** The bucket every unknown device shares. */
export const GLOBAL_KEY = "global";

/** One bucket an attempt is counted on, and which refusal it gives when locked. */
export type AttemptStep = { key: string; policy: AttemptPolicy; refusal: "client" | "global" };

/**
 * The buckets a login attempt counts on, in order. The login action records
 * them one by one and stops at the first locked one; a correct password
 * clears `steps[0].key`. The shared bucket is counted only once the client
 * bucket passes, so a locked client cannot use up the shared limit; a known
 * device skips both, so strangers cannot lock the owner's laptop out.
 */
export function attemptSteps(deviceId: string | null, ip: string): AttemptStep[] {
  if (deviceId !== null) {
    return [{ key: `device:${deviceId}`, policy: CLIENT_POLICY, refusal: "client" }];
  }
  return [
    { key: clientKey(ip), policy: CLIENT_POLICY, refusal: "client" },
    { key: GLOBAL_KEY, policy: GLOBAL_POLICY, refusal: "global" },
  ];
}
