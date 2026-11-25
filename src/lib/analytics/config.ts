/**
 * PostHog's settings for the store, browser only. Pure, so it can be tested
 * outside a browser; `src/instrumentation-client.ts` applies it.
 *
 * Everything here runs in the visitor's browser and sends events straight to
 * PostHog's host. The public pages are served from Workers Cache, so the
 * Worker does not run on most visits: no tracking may depend on it, and no
 * PostHog code runs in it. There is no reverse proxy either, so events do not
 * count against the Worker's daily requests.
 */
import type { PostHogConfig } from "posthog-js";

/** Whether PostHog may run on a path: everywhere but the admin. */
export function isTrackedPath(pathname: string): boolean {
  return pathname !== "/admin" && !pathname.startsWith("/admin/");
}

/**
 * The project token and host, inlined by `next build` from
 * `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST`, or null
 * when either is missing (local runs and CI), which leaves PostHog off.
 */
export function posthogTarget(
  token: string | undefined,
  host: string | undefined,
): { token: string; host: string } | null {
  const t = token?.trim();
  const h = host?.trim();
  return t && h ? { token: t, host: h } : null;
}

/**
 * Query parameters PostHog masks in every URL it records, on top of its own
 * list of ad click IDs (`fbclid`, `igshid`, `gclid`…). `igsh` is the share ID
 * Instagram adds to links copied from the app; it can be traced back to the
 * account that shared the link.
 */
export const EXTRA_MASKED_URL_PARAMS = ["igsh"];

export function posthogConfig(host: string, currentPathname: () => string): Partial<PostHogConfig> {
  return {
    api_host: host,
    // The dated defaults pin PostHog's behavior to this snapshot: page views
    // on every history change (client-side navigations included), page
    // leaves, autocapture and session replay with every input masked.
    defaults: "2026-08-30",
    capture_pageview: "history_change",
    capture_exceptions: true,
    disable_session_recording: false,
    // Anonymous visitors only: the store never calls identify(), so no
    // person profiles are made.
    person_profiles: "identified_only",
    mask_personal_data_properties: true,
    custom_personal_data_properties: EXTRA_MASKED_URL_PARAMS,
    // The init already skips the admin, and the admin has its own root
    // layout, so reaching it is a full page load. This is the second line:
    // nothing is sent while the page is under /admin.
    before_send: (event) => (isTrackedPath(currentPathname()) ? event : null),
  };
}
