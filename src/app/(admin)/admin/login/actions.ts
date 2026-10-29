"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isLocked, type AttemptRecord } from "@/lib/auth/attempts";
import { timingSafeEqual } from "@/lib/auth/password";
import { connectingIp, isForwardedAction } from "@/lib/auth/request-source";
import { getSecrets } from "@/lib/auth/secrets";
import { createSession } from "@/lib/auth/session";
import { clearLoginAttempts, recordLoginAttempt } from "@/lib/auth/store";

export type LoginState = { error?: string };

/** Shown when the attempt count or the session cannot be stored (e.g. a missing table). */
const LOGIN_FAILED = "Couldn't log in. Try again.";

/** How long a refused attempt waits before answering, to slow guessing. */
const WRONG_PASSWORD_DELAY_MS = 1000;

const wait = () => new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));

/**
 * The client's IP as Cloudflare's edge reports it (`cf-connecting-ip`), never
 * `x-forwarded-for`, or `unknown` off Cloudflare.
 */
async function clientIp(): Promise<string> {
  return connectingIp(await headers());
}

/**
 * Checks the owner's password; on success sets the session and goes to
 * /admin. Every attempt is counted before the password is compared, so a
 * burst of parallel requests cannot all slip past the attempt limit. When
 * the count cannot be stored the login is refused, never let through, and
 * no database failure reaches Next's error page.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Next forwards a Server Action posted to any other page to /admin/login
  // with x-action-forwarded. Such a call is never checked or counted, so every
  // checked guess came straight to /admin/login with Cloudflare's IP.
  if (isForwardedAction(await headers())) {
    console.warn("login: refused an attempt forwarded from another page");
    return { error: "Log in from the login page." };
  }

  const secrets = await getSecrets();
  if (!secrets) return { error: "Admin is not set up yet." };

  const ip = await clientIp();
  const now = Date.now();
  let record: AttemptRecord;
  try {
    record = await recordLoginAttempt(ip, now);
  } catch (err) {
    console.error("login: recording the attempt failed", err);
    return { error: LOGIN_FAILED };
  }
  if (isLocked(record, now)) {
    await wait();
    return { error: "Too many tries. Wait 15 minutes and try again." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !timingSafeEqual(password, secrets.adminPassword)) {
    await wait();
    return { error: "Wrong password." };
  }

  try {
    await clearLoginAttempts(ip);
    await createSession();
  } catch (err) {
    console.error("login: starting the session failed", err);
    return { error: LOGIN_FAILED };
  }
  redirect("/admin");
}
