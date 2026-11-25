/**
 * The store's custom PostHog events. Browser only. Each is a no-op when
 * PostHog was not started (no token, or an admin page), and none carries
 * anything about the customer.
 */
import type { Locale } from "@/lib/i18n/locales";

import { getPosthog } from "./instance";

/**
 * The customer tapped "Order on WhatsApp". The tap follows a plain link to
 * the order route, which redirects to WhatsApp at once, so the page may be
 * gone before PostHog's next batch: the event skips the queue and goes out as
 * a beacon, which the browser delivers after the page unloads.
 */
export function captureOrderTapped(order: { slug: string; size: string; priceEgp: number; locale: Locale }): void {
  const posthog = getPosthog();
  if (!posthog) return;
  posthog.capture(
    "order_tapped",
    {
      product_slug: order.slug,
      size: order.size,
      price: order.priceEgp,
      currency: "EGP",
      language: order.locale,
    },
    { send_instantly: true, transport: "sendBeacon" },
  );
}
