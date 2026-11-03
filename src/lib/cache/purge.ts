import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { CATALOG_TAG, productTag, STORE_TAG } from "./pages";

/**
 * Drops the cached copies of every shared page carrying one of `tags`, in
 * both languages. Called by the admin after a save, so the change is live on
 * the next visit. Never throws: the save already happened, and a failed purge
 * only leaves pages stale until their edge TTL (an hour) runs out, so it is
 * logged instead. A no-op under `pnpm dev`, which has no Workers Cache.
 * https://developers.cloudflare.com/workers/cache/purge/
 */
async function purge(tags: string[]): Promise<void> {
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    if (!ctx.cache) return;
    const result = await ctx.cache.purge({ tags });
    if (!result.success) console.error(`cache: purging ${tags.join(",")} failed`, result.errors);
  } catch (err) {
    console.error(`cache: purging ${tags.join(",")} failed`, err);
  }
}

/**
 * After a product is saved, published or hidden: its page (under its current
 * slug and, when the save renamed it, the old one) and the catalog.
 */
export function purgeProduct(...slugs: string[]): Promise<void> {
  return purge([CATALOG_TAG, ...[...new Set(slugs)].map(productTag)]);
}

/** After the catalog order changes. */
export function purgeCatalog(): Promise<void> {
  return purge([CATALOG_TAG]);
}

/** After the settings change: they show on every shared page. */
export function purgeStore(): Promise<void> {
  return purge([STORE_TAG]);
}
