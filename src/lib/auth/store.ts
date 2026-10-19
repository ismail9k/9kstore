/**
 * The owner login's state in D1 (migrations/0002_auth.sql): the failed-attempt
 * record per client IP and the session version. Server-only; never cached.
 */
import "server-only";

import { getDb } from "@/lib/db";

import { LOCKOUT_MS, MAX_FAILURES, WINDOW_MS, type AttemptRecord } from "./attempts";

type AttemptRow = { failures: number; window_start: number; locked_until: number | null };

// `nextAttempt` (attempts.ts) as one atomic upsert. SQLite evaluates every SET
// expression against the row as it was before the update, so the three CASE
// expressions see the same old values. Their branches, in order, are
// `nextAttempt`'s: 1. still locked → count, keep window and lock;
// 2. ended lock or expired window → fresh window of one;
// 3. same window → count, lock once the count passes MAX_FAILURES.
// ?1 ip, ?2 now, ?3 WINDOW_MS, ?4 MAX_FAILURES, ?5 LOCKOUT_MS.
const RECORD_ATTEMPT = `
INSERT INTO login_attempts (ip, failures, window_start, locked_until)
VALUES (?1, 1, ?2, NULL)
ON CONFLICT (ip) DO UPDATE SET
  failures = CASE
    WHEN locked_until IS NOT NULL AND locked_until > ?2 THEN failures + 1
    WHEN locked_until IS NOT NULL OR ?2 - window_start >= ?3 THEN 1
    ELSE failures + 1
  END,
  window_start = CASE
    WHEN locked_until IS NOT NULL AND locked_until > ?2 THEN window_start
    WHEN locked_until IS NOT NULL OR ?2 - window_start >= ?3 THEN ?2
    ELSE window_start
  END,
  locked_until = CASE
    WHEN locked_until IS NOT NULL AND locked_until > ?2 THEN locked_until
    WHEN locked_until IS NOT NULL OR ?2 - window_start >= ?3 THEN NULL
    WHEN failures + 1 > ?4 THEN ?2 + ?5
    ELSE NULL
  END
RETURNING failures, window_start, locked_until`;

/**
 * Counts one login attempt from `ip` at `now` and returns the IP's record
 * after it. Call before checking the password.
 */
export async function recordLoginAttempt(ip: string, now: number): Promise<AttemptRecord> {
  const row = await (await getDb())
    .prepare(RECORD_ATTEMPT)
    .bind(ip, now, WINDOW_MS, MAX_FAILURES, LOCKOUT_MS)
    .first<AttemptRow>();
  if (!row) throw new Error("Recording the login attempt returned no row");
  return { failures: row.failures, windowStart: row.window_start, lockedUntil: row.locked_until };
}

/** Forgets `ip`'s attempts. Call after a correct password. */
export async function clearLoginAttempts(ip: string): Promise<void> {
  await (await getDb()).prepare("DELETE FROM login_attempts WHERE ip = ?1").bind(ip).run();
}

/** The current session version. Throws when it cannot be read. */
export async function getSessionVersion(): Promise<number> {
  const row = await (await getDb())
    .prepare("SELECT session_version FROM auth_state WHERE id = 1")
    .first<{ session_version: number }>();
  if (!row) throw new Error("auth_state has no row");
  return row.session_version;
}

/** Ends every session signed with the current version. */
export async function bumpSessionVersion(): Promise<void> {
  await (await getDb())
    .prepare("UPDATE auth_state SET session_version = session_version + 1 WHERE id = 1")
    .run();
}
