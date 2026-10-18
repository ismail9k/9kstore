import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `cacheComponents` (and `partialPrefetching`, which builds on it) is left
  // off: with @opennextjs/cloudflare 1.20 the Worker hangs on every request in
  // workerd. Revisit when OpenNext supports Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
