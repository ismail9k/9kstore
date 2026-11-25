import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The incremental cache is not configured: nothing is statically generated.
// The `PHOTOS` R2 bucket holds product photos and is not the OpenNext cache
// bucket. See https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
