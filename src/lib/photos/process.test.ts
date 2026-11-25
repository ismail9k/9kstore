import { expect, test } from "vitest";

import { checkInput, MESSAGES, needsMaster, variantPlans } from "./process";
import { JPEG_QUALITY, KEEP_MAX_BYTES, OG_BACKGROUND, WEBP_QUALITY } from "./variants";

const jpeg = (w: number, h: number, size = 1_000_000) => ({ format: "image/jpeg", width: w, height: h, fileSize: size });
const webp = (w: number, h: number, size = 1_000_000) => ({ format: "image/webp", width: w, height: h, fileSize: size });

test("checkInput refuses formats other than jpeg/png/webp with the owner message", () => {
  expect(checkInput({ format: "image/gif", width: 10, height: 10, fileSize: 1 })).toEqual({ status: 415, error: MESSAGES.badType });
  expect(checkInput({ format: "image/svg+xml" })).toEqual({ status: 415, error: MESSAGES.badType });
  expect(checkInput(jpeg(12_001, 10))).toEqual({ status: 415, error: MESSAGES.tooLarge });
  expect(checkInput(jpeg(10_001, 10_000))).toEqual({ status: 415, error: MESSAGES.tooLarge }); // > 100 MP
  expect(checkInput(jpeg(6000, 4000))).toBeNull();
});

test("needsMaster: every JPEG; PNG/WebP only when big", () => {
  expect(needsMaster(jpeg(800, 600, 100_000))).toBe(true);
  expect(needsMaster(webp(2560, 2560, KEEP_MAX_BYTES))).toBe(false);
  expect(needsMaster(webp(2561, 100))).toBe(true);
  expect(needsMaster(webp(100, 2561))).toBe(true);
  expect(needsMaster(webp(1200, 1200, KEEP_MAX_BYTES + 1))).toBe(true);
  expect(needsMaster({ ...webp(1200, 1200), format: "image/png" })).toBe(false);
});

test("variantPlans renders the five files from the constants", () => {
  const plans = variantPlans();
  expect(plans.map((p) => p.variant.file)).toEqual(["320.webp", "640.webp", "960.webp", "1280.webp", "1280.jpg"]);
  expect(plans.every((p) => p.transform.fit === "scale-down")).toBe(true);
  expect(plans[4]?.output).toEqual({ format: "image/jpeg", quality: JPEG_QUALITY, background: OG_BACKGROUND });
  expect(plans[0]?.output).toEqual({ format: "image/webp", quality: WEBP_QUALITY });
});
