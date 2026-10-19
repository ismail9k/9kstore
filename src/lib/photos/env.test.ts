import { expect, test } from "vitest";

import { isDevelopment } from "./env";

test("isDevelopment only for the literal development", () => {
  expect(isDevelopment({ NEXTJS_ENV: "development" })).toBe(true);
  for (const v of [undefined, "", "production", "Development"]) expect(isDevelopment({ NEXTJS_ENV: v })).toBe(false);
});
