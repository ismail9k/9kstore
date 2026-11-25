// TEMPORARY: lets the owner watch an error reach PostHog's error tracking
// from staging. Delete this folder once that is confirmed.
import type { Metadata } from "next";

import { ThrowButton } from "./throw-button";

export const metadata: Metadata = {
  title: "PostHog error test",
  robots: { index: false, follow: false },
};

export default function PostHogErrorTestPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold">PostHog error test</h1>
      <p className="text-muted-foreground">
        The button throws an uncaught error in the browser. It should show up in PostHog under Error tracking.
      </p>
      <ThrowButton />
    </main>
  );
}
