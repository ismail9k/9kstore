import { expect, test } from "vitest";

import { immutableHeaders, isNotModified, noStore } from "./http";

test("immutableHeaders", () => {
  expect(new Headers(immutableHeaders("image/webp", '"abc"')).get("cache-control")).toBe("public, max-age=31536000, immutable");
  const h = new Headers(immutableHeaders("image/webp", '"abc"'));
  expect(h.get("etag")).toBe('"abc"');
  expect(h.get("x-content-type-options")).toBe("nosniff");
  expect(h.get("content-disposition")).toBe("inline");
  expect(h.get("content-type")).toBe("image/webp");
});

test("noStore", () => expect(new Headers(noStore()).get("cache-control")).toBe("no-store"));

test("isNotModified: exact, weak, list, star", () => {
  expect(isNotModified('"abc"', '"abc"')).toBe(true);
  expect(isNotModified('W/"abc"', '"abc"')).toBe(true);
  expect(isNotModified('"x", "abc"', '"abc"')).toBe(true);
  expect(isNotModified("*", '"abc"')).toBe(true);
  expect(isNotModified(null, '"abc"')).toBe(false);
  expect(isNotModified('"abd"', '"abc"')).toBe(false);
});
