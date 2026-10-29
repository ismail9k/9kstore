"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CLIENT_POLICY, isLocked, type AttemptRecord } from "@/lib/auth/attempts";
import { timingSafeEqual } from "@/lib/auth/password";
import { getSecrets } from "@/lib/auth/secrets";
import { createSession } from "@/lib/auth/session";
import { clearLoginAttempts, recordLoginAttempt } from "@/lib/auth/store";

export type LoginState = { error?: string };

/** Shown when the attempt count or the session cannot be stored (e.g. a missing table). */
const LOGIN_FAILED = "Couldn't log in. Try again.";

/** How long a refused attempt waits before answering, to slow guessing. */
const WRONG_PASSWORD_DELAY_MS = 1000;

const wait = () => new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));

/** The client's IP as Cloudflare reports it, else the first proxy hop. */
async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return list.get("cf-connecting-ip")?.trim() || forwarded || "unknown";
}

/**
 * Checks the owner's password; on success sets the session and goes to
 * /admin. Every attempt is counted before the password is compared, so a
 * burst of parallel requests cannot all slip past the attempt limit. When
 * the count cannot be stored the login is refused, never let through, and
 * no database failure reaches Next's error page.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const secrets = await getSecrets();
  if (!secrets) return { error: "Admin is not set up yet." };

  const ip = await clientIp();
  const now = Date.now();
  let record: AttemptRecord;
  try {
    record = await recordLoginAttempt(ip, now, CLIENT_POLICY);
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
