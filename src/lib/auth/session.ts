import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSecrets } from "./secrets";
import { signToken, verifyToken } from "./token";

export const COOKIE_NAME = "9k_admin";
export const SESSION_DAYS = 30;

const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const COOKIE_PATH = "/admin";

/**
 * Logs the owner in by setting a signed cookie valid for `SESSION_DAYS`.
 * Call only from a Server Action after the password has been checked.
 * Throws when the secrets are not set (the login action checks first).
 */
export async function createSession(): Promise<void> {
  const secrets = await getSecrets();
  if (!secrets) throw new Error("Admin secrets are not set");
  const iat = Date.now();
  const token = await signToken({ iat, exp: iat + SESSION_SECONDS * 1000 }, secrets.sessionSecret);
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
  });
}

/** Logs the owner out. Call only from a Server Action. */
export async function destroySession(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_NAME, path: COOKIE_PATH });
}

/** Whether this request carries a valid owner cookie. False when secrets are missing. */
export async function getSession(): Promise<boolean> {
  const secrets = await getSecrets();
  if (!secrets) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return (await verifyToken(token, secrets.sessionSecret)) !== null;
}

/** Every admin page and Server Action calls this first. */
export async function requireOwner(): Promise<void> {
  if (!(await getSession())) redirect("/admin/login");
}
