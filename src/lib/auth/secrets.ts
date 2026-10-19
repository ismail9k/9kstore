import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type Secrets = { adminPassword: string; sessionSecret: string };

/** Shortest `SESSION_SECRET` accepted; anything shorter counts as not set. */
const MIN_SECRET_LENGTH = 32;

/**
 * The owner's password and the cookie-signing secret, read per request from
 * the Worker's environment (falling back to `process.env`). `null` when
 * either is missing or the secret is too short: the admin is "not set up",
 * and every request is treated as logged out.
 */
export async function getSecrets(): Promise<Secrets | null> {
  let env: Partial<CloudflareEnv> = {};
  try {
    env = (await getCloudflareContext({ async: true })).env;
  } catch {
    // No Cloudflare context (e.g. a plain Node process): use process.env.
  }
  const adminPassword = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const sessionSecret = env.SESSION_SECRET || process.env.SESSION_SECRET;
  if (!adminPassword || !sessionSecret || sessionSecret.length < MIN_SECRET_LENGTH) {
    return null;
  }
  return { adminPassword, sessionSecret };
}
