import { expect, test } from "vitest";
import { formatPrice, isolateLtr } from "./format";

test("formatPrice uses Western digits, comma grouping and the locale's unit", () => {
  expect(formatPrice(850, "en")).toBe("850 EGP");
  expect(formatPrice(850, "ar")).toBe("850 جنيه");
  expect(formatPrice(1250, "en")).toBe("1,250 EGP");
  expect(formatPrice(1250, "ar")).toBe("1,250 جنيه");
  expect(formatPrice(0, "en")).toBe("0 EGP");
  expect(formatPrice(1250, "ar")).not.toMatch(/[٠-٩]/);
});

test("isolateLtr wraps text in LRI…PDI", () => {
  expect(isolateLtr("TEE-01")).toBe("\u2066TEE-01\u2069");
});
