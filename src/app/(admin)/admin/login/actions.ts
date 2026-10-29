"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { attemptSteps, isLocked, type AttemptStep } from "@/lib/auth/attempts";
import { knownDeviceId, rememberDevice } from "@/lib/auth/device";
import { timingSafeEqual } from "@/lib/auth/password";
import { getSecrets } from "@/lib/auth/secrets";
import { createSession } from "@/lib/auth/session";
import { clearLoginAttempts, recordLoginAttempt } from "@/lib/auth/store";

export type LoginState = { error?: string };

/** Shown when the attempt count or the session cannot be stored (e.g. a missing table). */
const LOGIN_FAILED = "Couldn't log in. Try again.";

/** How long a refused attempt waits before answering, to slow guessing. */
const WRONG_PASSWORD_DELAY_MS = 1000;

/** What a refused attempt is told, by the bucket that refused it. */
const REFUSALS: Record<AttemptStep["refusal"], string> = {
  client: "Too many tries. Wait 15 minutes and try again.",
  global:
    "Too many login attempts right now. Log in from a device you've used here before, or wait an hour.",
};

const wait = () => new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));

/** The client's IP as Cloudflare reports it, else the first proxy hop. */
async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return list.get("cf-connecting-ip")?.trim() || forwarded || "unknown";
}

/**
 * Checks the owner's password; on success sets the session, remembers the
 * device and goes to /admin. Every attempt is counted before the password is
 * compared, so a burst of parallel requests cannot all slip past the limit.
 * The buckets (see `attemptSteps`) are counted in order and the first locked
 * one refuses: a known device only has its own; an unknown one counts on its
 * client bucket, then the shared one. When a count cannot be stored the
 * login is refused, never let through, and no database failure reaches
 * Next's error page.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const secrets = await getSecrets();
  if (!secrets) return { error: "Admin is not set up yet." };

  const steps = attemptSteps(await knownDeviceId(secrets), await clientIp());
  const now = Date.now();
  for (const step of steps) {
    let locked: boolean;
    try {
      locked = isLocked(await recordLoginAttempt(step.key, now, step.policy), now);
    } catch (err) {
      console.error("login: recording the attempt failed", err);
      return { error: LOGIN_FAILED };
    }
    if (locked) {
      await wait();
      return { error: REFUSALS[step.refusal] };
    }
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !timingSafeEqual(password, secrets.adminPassword)) {
    await wait();
    return { error: "Wrong password." };
  }

  try {
    const first = steps[0];
    if (first) await clearLoginAttempts(first.key);
    await createSession();
    await rememberDevice(secrets);
  } catch (err) {
    console.error("login: starting the session failed", err);
    return { error: LOGIN_FAILED };
  }
  redirect("/admin");
}
