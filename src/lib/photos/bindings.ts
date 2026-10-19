import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { isDevelopment } from "./env";
import type { Deps } from "./store";

/**
 * The photo store's bindings for this request: the R2 bucket, the Images
 * binding (absent when `pnpm dev` has no local Images support) and whether
 * degraded paths are allowed.
 */
export async function getPhotoDeps(): Promise<Deps> {
  const { env } = await getCloudflareContext({ async: true });
  // Typed as always present, but `pnpm dev` may run without a local Images binding.
  const images = env.IMAGES as ImagesBinding | undefined;
  return { bucket: env.PHOTOS, images, dev: isDevelopment(env) };
}
