import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * The store's D1 database (binding `DB`), read per request. Never cache the
 * result: the binding belongs to the current request's context.
 */
export async function getDb(): Promise<D1Database> {
  return (await getCloudflareContext({ async: true })).env.DB;
}
