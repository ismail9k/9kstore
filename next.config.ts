import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `cacheComponents` (and `partialPrefetching`, which builds on it) is left
  // off: with @opennextjs/cloudflare 1.20 the Worker hangs on every request in
  // workerd. Revisit when OpenNext supports Cache Components.

  // Streaming metadata is off for every user agent. Streaming would put
  // `generateMetadata`'s tags in the `<body>` for user agents off Next's bot
  // list (Telegram, iMessage…), and a tag outside `<head>` is a missing link
  // preview. Every customer page already blocks on D1 before its first byte,
  // so this costs no TTFB.
  htmlLimitedBots: /.*/,
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
