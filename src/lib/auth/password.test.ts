import { describe, expect, test } from "vitest";

import { timingSafeEqual } from "./password";

describe("timingSafeEqual", () => {
  test("equal strings are equal", () => {
    expect(timingSafeEqual("correct horse", "correct horse")).toBe(true);
  });

  test("same length, different content is not equal", () => {
    expect(timingSafeEqual("abcdef", "abcdeg")).toBe(false);
  });

  test("different length is not equal", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });

  test("empty vs empty is equal", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  test("compares UTF-8 bytes, not UTF-16 units", () => {
    expect(timingSafeEqual("كلمة", "كلمة")).toBe(true);
    expect(timingSafeEqual("كلمة", "كلمه")).toBe(false);
  });
});
