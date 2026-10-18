import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache yet; add the R2 cache once the bucket exists.
// See https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
