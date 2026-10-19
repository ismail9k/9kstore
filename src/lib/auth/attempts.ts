/**
 * The login attempt limit, per client IP, as pure functions.
 *
 * Every login attempt is counted before the password is checked (see the
 * login action), so the count is "attempts", and a correct password deletes
 * the IP's record. Within one window the first `MAX_FAILURES` attempts are
 * checked; the next one locks the IP for `LOCKOUT_MS`, and every attempt is
 * refused until the lock ends. A window older than `WINDOW_MS`, or a lock
 * that has ended, starts a fresh window.
 *
 * `recordLoginAttempt` in `store.ts` runs the same transition as one SQL
 * upsert so parallel requests cannot race past it; its three CASE
 * expressions follow the three branches of `nextAttempt` in order. Change
 * both together.
 */

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** One IP's attempts. Times are milliseconds since the epoch. */
export type AttemptRecord = {
  failures: number;
  windowStart: number;
  lockedUntil: number | null;
};

/** Whether `record` refuses attempts at `now`. */
export function isLocked(record: AttemptRecord | null, now: number): boolean {
  return record !== null && record.lockedUntil !== null && record.lockedUntil > now;
}

/** The record after one more attempt at `now` (`null`: the IP has no record). */
export function nextAttempt(record: AttemptRecord | null, now: number): AttemptRecord {
  // 1. Still locked: count it, keep the lock as it is (no extension).
  if (record && isLocked(record, now)) {
    return { ...record, failures: record.failures + 1 };
  }
  // 2. No record, an ended lock, or an expired window: start a fresh window.
  if (!record || record.lockedUntil !== null || now - record.windowStart >= WINDOW_MS) {
    return { failures: 1, windowStart: now, lockedUntil: null };
  }
  // 3. Same window: count it, and lock once the count passes MAX_FAILURES.
  const failures = record.failures + 1;
  return {
    failures,
    windowStart: record.windowStart,
    lockedUntil: failures > MAX_FAILURES ? now + LOCKOUT_MS : null,
  };
}
