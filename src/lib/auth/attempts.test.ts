import { describe, expect, test } from "vitest";

import {
  LOCKOUT_MS,
  MAX_FAILURES,
  WINDOW_MS,
  isLocked,
  nextAttempt,
  type AttemptRecord,
} from "./attempts";

const NOW = 1_800_000_000_000;

/** Runs `count` attempts at `at` starting from `record`. */
function attempts(count: number, at: number, record: AttemptRecord | null = null): AttemptRecord {
  let current = record;
  for (let i = 0; i < count; i++) current = nextAttempt(current, at);
  if (!current) throw new Error("count must be at least 1");
  return current;
}

describe("login attempt policy", () => {
  test("the policy is 5 tries per 15 minutes, then 15 minutes locked", () => {
    expect(MAX_FAILURES).toBe(5);
    expect(WINDOW_MS).toBe(15 * 60 * 1000);
    expect(LOCKOUT_MS).toBe(15 * 60 * 1000);
  });

  test("the first attempt opens a window with one count and no lock", () => {
    expect(nextAttempt(null, NOW)).toEqual({ failures: 1, windowStart: NOW, lockedUntil: null });
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
    const sixth = nextAttempt(five, at);
    expect(sixth).toEqual({ failures: 6, windowStart: NOW, lockedUntil: at + LOCKOUT_MS });
    expect(isLocked(sixth, at)).toBe(true);
  });

  test("attempts during the lock stay locked and do not extend it", () => {
    const locked = attempts(6, NOW);
    const later = nextAttempt(locked, NOW + 10 * 60_000);
    expect(later.lockedUntil).toBe(NOW + LOCKOUT_MS);
    expect(isLocked(later, NOW + 10 * 60_000)).toBe(true);
    expect(isLocked(later, NOW + LOCKOUT_MS - 1)).toBe(true);
  });

  test("the lock expires at lockedUntil", () => {
    const locked = attempts(6, NOW);
    expect(isLocked(locked, NOW + LOCKOUT_MS)).toBe(false);
    const after = nextAttempt(locked, NOW + LOCKOUT_MS);
    expect(after).toEqual({ failures: 1, windowStart: NOW + LOCKOUT_MS, lockedUntil: null });
    expect(isLocked(after, NOW + LOCKOUT_MS)).toBe(false);
  });

  test("a lock set late in a window holds past the window's end", () => {
    const five = attempts(5, NOW);
    const lateAt = NOW + WINDOW_MS - 1000;
    const locked = nextAttempt(five, lateAt);
    const afterWindow = nextAttempt(locked, NOW + WINDOW_MS + 1000);
    expect(isLocked(afterWindow, NOW + WINDOW_MS + 1000)).toBe(true);
    expect(afterWindow.lockedUntil).toBe(lateAt + LOCKOUT_MS);
  });

  test("a window older than WINDOW_MS resets the count", () => {
    const five = attempts(5, NOW);
    const reset = nextAttempt(five, NOW + WINDOW_MS);
    expect(reset).toEqual({ failures: 1, windowStart: NOW + WINDOW_MS, lockedUntil: null });
  });

  test("an attempt just inside the window still counts", () => {
    const five = attempts(5, NOW);
    expect(isLocked(nextAttempt(five, NOW + WINDOW_MS - 1), NOW + WINDOW_MS - 1)).toBe(true);
  });

  test("a success clears the record, so the next attempt starts fresh", () => {
    // The login action deletes the IP's row on a correct password: the
    // next attempt sees no record.
    attempts(4, NOW);
    expect(nextAttempt(null, NOW + 1)).toEqual({
      failures: 1,
      windowStart: NOW + 1,
      lockedUntil: null,
    });
  });

  test("no record is never locked", () => {
    expect(isLocked(null, NOW)).toBe(false);
  });
});
