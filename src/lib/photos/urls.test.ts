import { expect, test } from "vitest";

import { photoAspect, photoOgSrc, photoSrc, photoSrcSet } from "./urls";

const p = (w?: number, h?: number) => ({ key: "k", ...(w && { width: w }), ...(h && { height: h }) });

test("photoSrc", () => {
  expect(photoSrc(p())).toBe("/photos/k/640.webp");
  expect(photoSrc(p(), 320)).toBe("/photos/k/320.webp");
});

test("photoSrcSet stops at the first width that covers the master", () => {
  expect(photoSrcSet(p(1200, 1200))).toBe(
    "/photos/k/320.webp 320w, /photos/k/640.webp 640w, /photos/k/960.webp 960w, /photos/k/1280.webp 1280w",
  );
  expect(photoSrcSet(p(500, 700))).toBe("/photos/k/320.webp 320w, /photos/k/640.webp 640w");
  expect(photoSrcSet(p(320, 320))).toBe("/photos/k/320.webp 320w");
  expect(photoSrcSet(p())).toContain("1280w");
});

test("photoOgSrc and photoAspect", () => {
  expect(photoOgSrc(p())).toBe("/photos/k/1280.jpg");
  expect(photoAspect(p(1200, 900))).toEqual({ width: 1200, height: 900 });
  expect(photoAspect(p(1200))).toBeNull();
});
