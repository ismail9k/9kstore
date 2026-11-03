/**
 * The Worker entry (`main` in wrangler.jsonc): OpenNext's worker, with the
 * catalog and product pages made shareable by Workers Cache on the way out.
 * Next renders every dynamic page as `private, no-store`, and a page cannot
 * set its own headers, so the decision is made here, where the status is
 * known. The rules live in `src/lib/cache/pages.ts`; every other request
 * passes through untouched.
 * https://opennext.js.org/cloudflare/howtos/custom-worker
 */
// `.open-next/worker.js` exists only after `opennextjs-cloudflare build`, so
// `@ts-expect-error` would fail the other way round once it does.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import openNext from "./.open-next/worker.js";

import { sharedPageTags, sharePage, withoutForwardedHeaders } from "@/lib/cache/pages";

const next = openNext as Required<Pick<ExportedHandler<CloudflareEnv>, "fetch">>;

export default {
  async fetch(request, env, ctx) {
    const tags = sharedPageTags(request.method, new URL(request.url));
    if (!tags) return next.fetch(request, env, ctx);
    return sharePage(await next.fetch(withoutForwardedHeaders(request), env, ctx), tags);
  },
} satisfies ExportedHandler<CloudflareEnv>;
