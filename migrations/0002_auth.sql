-- Owner login hardening (issue #2): a failed-attempt limit per client IP and
-- a session version that logout and password changes use to end sessions.

-- One row per client IP that has tried to log in. Times are milliseconds
-- since the epoch. A correct password deletes the IP's row.
CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
);

-- A single row. Session tokens carry the version current at login; logout
-- bumps it, which ends every outstanding session at once.
CREATE TABLE auth_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  session_version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO auth_state (id) VALUES (1);
