/**
 * The running PostHog instance, handed over by `src/instrumentation-client.ts`
 * once it has started PostHog. Components reach PostHog only through here,
 * with a type-only import, so posthog-js stays out of the server bundle: the
 * Worker renders client components too, and no PostHog code may run in it.
 */
import type { PostHog } from "posthog-js";

let instance: PostHog | null = null;

export function setPosthog(posthog: PostHog): void {
  instance = posthog;
}

/** Null until PostHog has started, and always on the server and the admin. */
export function getPosthog(): PostHog | null {
  return instance;
}
