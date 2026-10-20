import { expect, test } from "vitest";
import { ar } from "./messages/ar";
import { en } from "./messages/en";

function leaves(obj: unknown, prefix = ""): [string, unknown][] {
  if (typeof obj !== "object" || obj === null) return [[prefix, obj]];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

test("Arabic and English have the same keys", () => {
  expect(leaves(ar).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
});

test("every message is a non-empty string", () => {
  for (const [key, value] of [...leaves(ar), ...leaves(en)]) {
    expect(typeof value, key).toBe("string");
    expect((value as string).trim().length, key).toBeGreaterThan(0);
  }
});
