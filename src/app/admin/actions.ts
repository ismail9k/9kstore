"use server";

import { redirect } from "next/navigation";

import { destroySession } from "@/lib/auth/session";

/** Logs the owner out and sends them to the login page. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
