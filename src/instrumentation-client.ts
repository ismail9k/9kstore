/**
 * Runs in the browser before hydration, on every page of both root layouts.
 * Starts PostHog on the store only; the admin is never tracked or recorded.
 * The settings and the reasons for them are in `src/lib/analytics/config.ts`.
 *
 * This is the only file that imports posthog-js. It never reaches the server
 * bundle, and components use the instance through `@/lib/analytics/instance`.
 */
import posthog from "posthog-js";

import { isTrackedPath, posthogConfig, posthogTarget } from "@/lib/analytics/config";
import { setPosthog } from "@/lib/analytics/instance";

const target = posthogTarget(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, process.env.NEXT_PUBLIC_POSTHOG_HOST);

if (target && isTrackedPath(window.location.pathname)) {
  try {
    posthog.init(
      target.token,
      posthogConfig(target.host, () => window.location.pathname),
    );
    setPosthog(posthog);
  } catch (error) {
    // Analytics must never break the store.
    console.error("posthog: init failed", error);
  }
}
