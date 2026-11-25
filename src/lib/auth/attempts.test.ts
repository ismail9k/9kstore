import { describe, expect, test } from "vitest";

import {
  CLIENT_POLICY,
  GLOBAL_KEY,
  GLOBAL_POLICY,
  attemptSteps,
  isLocked,
  nextAttempt,
  type AttemptPolicy,
  type AttemptRecord,
} from "./attempts";

const MAX_FAILURES = CLIENT_POLICY.maxFailures;
const WINDOW_MS = CLIENT_POLICY.windowMs;
const LOCKOUT_MS = CLIENT_POLICY.lockoutMs;

const NOW = 1_800_000_000_000;

/** Runs `count` attempts at `at` starting from `record`. */
function attempts(
  count: number,
  at: number,
  record: AttemptRecord | null = null,
  policy: AttemptPolicy = CLIENT_POLICY,
): AttemptRecord {
  let current = record;
  for (let i = 0; i < count; i++) current = nextAttempt(current, at, policy);
  if (!current) throw new Error("count must be at least 1");
  return current;
}

describe("login attempt policy", () => {
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
    expect(nextAttempt(attempts(5, NOW), NOW + 1, CLIENT_POLICY).lockedUntil).toBe(
      NOW + 1 + 15 * 60_000,
    );
  });

  test("the first attempt opens a window with one count and no lock", () => {
    expect(nextAttempt(null, NOW, CLIENT_POLICY)).toEqual({ failures: 1, windowStart: NOW, lockedUntil: null });
  });

  test("attempts 1 to 5 within the window are not locked", () => {
    for (let n = 1; n <= MAX_FAILURES; n++) {
      const record = attempts(n, NOW + n);
      expect(record.failures).toBe(n);
      expect(isLocked(record, NOW + n)).toBe(false);
    }
  });

  test("the 6th attempt within the window locks for LOCKOUT_MS", () => {
    const five = attempts(5, NOW);
    const at = NOW + 60_000;
    const sixth = nextAttempt(five, at, CLIENT_POLICY);
    expect(sixth).toEqual({ failures: 6, windowStart: NOW, lockedUntil: at + LOCKOUT_MS });
    expect(isLocked(sixth, at)).toBe(true);
  });

  test("attempts during the lock stay locked and do not extend it", () => {
    const locked = attempts(6, NOW);
    const later = nextAttempt(locked, NOW + 10 * 60_000, CLIENT_POLICY);
    expect(later.lockedUntil).toBe(NOW + LOCKOUT_MS);
    expect(isLocked(later, NOW + 10 * 60_000)).toBe(true);
    expect(isLocked(later, NOW + LOCKOUT_MS - 1)).toBe(true);
  });

  test("the lock expires at lockedUntil", () => {
    const locked = attempts(6, NOW);
    expect(isLocked(locked, NOW + LOCKOUT_MS)).toBe(false);
    const after = nextAttempt(locked, NOW + LOCKOUT_MS, CLIENT_POLICY);
    expect(after).toEqual({ failures: 1, windowStart: NOW + LOCKOUT_MS, lockedUntil: null });
    expect(isLocked(after, NOW + LOCKOUT_MS)).toBe(false);
  });

  test("a lock set late in a window holds past the window's end", () => {
    const five = attempts(5, NOW);
    const lateAt = NOW + WINDOW_MS - 1000;
    const locked = nextAttempt(five, lateAt, CLIENT_POLICY);
    const afterWindow = nextAttempt(locked, NOW + WINDOW_MS + 1000, CLIENT_POLICY);
    expect(isLocked(afterWindow, NOW + WINDOW_MS + 1000)).toBe(true);
    expect(afterWindow.lockedUntil).toBe(lateAt + LOCKOUT_MS);
  });

  test("a window older than WINDOW_MS resets the count", () => {
    const five = attempts(5, NOW);
    const reset = nextAttempt(five, NOW + WINDOW_MS, CLIENT_POLICY);
    expect(reset).toEqual({ failures: 1, windowStart: NOW + WINDOW_MS, lockedUntil: null });
  });

  test("an attempt just inside the window still counts", () => {
    const five = attempts(5, NOW);
    expect(isLocked(nextAttempt(five, NOW + WINDOW_MS - 1, CLIENT_POLICY), NOW + WINDOW_MS - 1)).toBe(true);
  });

  test("a success clears the record, so the next attempt starts fresh", () => {
    // The login action deletes the IP's row on a correct password: the
    // next attempt sees no record.
    attempts(4, NOW);
    expect(nextAttempt(null, NOW + 1, CLIENT_POLICY)).toEqual({
      failures: 1,
      windowStart: NOW + 1,
      lockedUntil: null,
    });
  });

  test("no record is never locked", () => {
    expect(isLocked(null, NOW)).toBe(false);
  });
});

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
    for (const steps of [
      attemptSteps(null, "203.0.113.7"),
      attemptSteps("AAAAAAAAAAAAAAAAAAAAAA", "x"),
    ]) {
      expect(steps[0]?.key).not.toBe(GLOBAL_KEY);
    }
  });
});
