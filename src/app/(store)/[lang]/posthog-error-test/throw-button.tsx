"use client";

// TEMPORARY: see page.tsx.
import { Button } from "@/components/ui/button";

export function ThrowButton() {
  return (
    <Button
      onClick={() => {
        // Thrown from an event handler, so it is uncaught and reaches PostHog's
        // exception autocapture through `window.onerror`.
        throw new Error("PostHog test error from /posthog-error-test");
      }}
    >
      Throw a test error
    </Button>
  );
}
