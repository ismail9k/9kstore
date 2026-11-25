import { expect, test } from "vitest";

import { isPhotoId, masterKey, OG_VARIANT, parseVariant, variantKey } from "./variants";

test("parseVariant accepts exactly the five files", () => {
  expect(parseVariant("640.webp")).toMatchObject({ width: 640, format: "webp", contentType: "image/webp" });
  expect(parseVariant("1280.jpg")).toMatchObject({ width: 1280, format: "jpeg", contentType: "image/jpeg" });
  for (const bad of ["1281.webp", "640.png", "640.WEBP", "../master", "master", "", "640.webp/"]) {
    expect(parseVariant(bad)).toBeNull();
  }
});

test("isPhotoId", () => {
  expect(isPhotoId("a".repeat(32))).toBe(true);
  expect(isPhotoId("seed-tee-black-flat")).toBe(true);
  for (const bad of ["", "A1", "a/b", "a".repeat(65), "x y"]) expect(isPhotoId(bad)).toBe(false);
});

test("keys", () => {
  expect(masterKey("abc")).toBe("photos/abc/master");
  expect(variantKey("abc", OG_VARIANT)).toBe("photos/abc/1280.jpg");
});
