"use server";

import { redirect } from "next/navigation";

import { timingSafeEqual } from "@/lib/auth/password";
import { getSecrets } from "@/lib/auth/secrets";
import { createSession } from "@/lib/auth/session";

export type LoginState = { error?: string };

/** How long a wrong password waits before answering, to slow guessing. */
const WRONG_PASSWORD_DELAY_MS = 1000;

/** Checks the owner's password; on success sets the session and goes to /admin. */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const secrets = await getSecrets();
  if (!secrets) return { error: "Admin is not set up yet." };

  const password = formData.get("password");
  if (typeof password !== "string" || !timingSafeEqual(password, secrets.adminPassword)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return { error: "Wrong password." };
  }

  await createSession();
  redirect("/admin");
}
