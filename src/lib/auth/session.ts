import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSecrets, type Secrets } from "./secrets";
import { bumpSessionVersion, getSessionVersion } from "./store";
import { signingKey, signToken, verifyToken } from "./token";

export const COOKIE_NAME = "9k_admin";
export const SESSION_DAYS = 30;

const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const COOKIE_PATH = "/admin";

/**
 * Whether `token` is a live owner session: signed with the current secrets,
 * not expired, and carrying the current session version. The one check
 * behind both `getSession()` and the proxy, so they always agree. False
 * (never throws) when secrets are missing or the version cannot be read.
 */
export async function isValidSessionToken(
  token: string | undefined,
  secrets: Secrets | null,
): Promise<boolean> {
  if (!secrets) return false;
  const payload = await verifyToken(token, signingKey(secrets));
  if (!payload) return false;
  try {
    return payload.v === (await getSessionVersion());
  } catch {
    return false;
  }
}

/**
 * Logs the owner in by setting a signed cookie valid for `SESSION_DAYS`.
 * Call only from a Server Action after the password has been checked.
 * Throws when the secrets are not set (the login action checks first).
 */
export async function createSession(): Promise<void> {
  const secrets = await getSecrets();
  if (!secrets) throw new Error("Admin secrets are not set");
  const iat = Date.now();
  const token = await signToken(
    { iat, exp: iat + SESSION_SECONDS * 1000, v: await getSessionVersion() },
    signingKey(secrets),
  );
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
  });
}

/**
 * Logs the owner out and, when this request is logged in, ends every other
 * session too (a stolen copy of the cookie included) by bumping the session
 * version. An anonymous request only clears its own cookie, so it cannot log
 * the owner out elsewhere. Call only from a Server Action.
 */
export async function destroySession(): Promise<void> {
  if (await getSession()) await bumpSessionVersion();
  (await cookies()).delete({ name: COOKIE_NAME, path: COOKIE_PATH });
}

/** Whether this request carries a valid owner cookie. False when secrets are missing. */
export async function getSession(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return isValidSessionToken(token, await getSecrets());
}

/** Every admin page and Server Action calls this first. */
export async function requireOwner(): Promise<void> {
  if (!(await getSession())) redirect("/admin/login");
}
