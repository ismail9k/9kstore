import { expect, test } from "vitest";

import { ogImageSize, photoAspect, photoOgSrc, photoSrc, photoSrcSet } from "./urls";

const p = (w?: number, h?: number) => ({ key: "k", ...(w && { width: w }), ...(h && { height: h }) });

test("photoSrc", () => {
  expect(photoSrc(p())).toBe("/photos/k/640.webp");
  expect(photoSrc(p(), 320)).toBe("/photos/k/320.webp");
});

test("photoSrcSet stops at the first width that covers the master, advertised at the master's width", () => {
  expect(photoSrcSet(p(1200, 1200))).toBe(
    "/photos/k/320.webp 320w, /photos/k/640.webp 640w, /photos/k/960.webp 960w, /photos/k/1280.webp 1200w",
  );
  expect(photoSrcSet(p(500, 700))).toBe("/photos/k/320.webp 320w, /photos/k/640.webp 500w");
  expect(photoSrcSet(p(1280, 1280))).toContain("/photos/k/1280.webp 1280w");
  expect(photoSrcSet(p(4000, 3000))).toBe(
    "/photos/k/320.webp 320w, /photos/k/640.webp 640w, /photos/k/960.webp 960w, /photos/k/1280.webp 1280w",
  );
  expect(photoSrcSet(p(320, 320))).toBe("/photos/k/320.webp 320w");
  expect(photoSrcSet(p(100, 100))).toBe("/photos/k/320.webp 100w");
  expect(photoSrcSet(p())).toBe(
    "/photos/k/320.webp 320w, /photos/k/640.webp 640w, /photos/k/960.webp 960w, /photos/k/1280.webp 1280w",
  );
});

test("photoOgSrc and photoAspect", () => {
  expect(photoOgSrc(p())).toBe("/photos/k/1280.jpg");
  expect(photoAspect(p(1200, 900))).toEqual({ width: 1200, height: 900 });
  expect(photoAspect(p(1200))).toBeNull();
});

test("ogImageSize scales the master down to 1280 wide, never up, null when unknown", () => {
  expect(ogImageSize(p(2000, 3000))).toEqual({ width: 1280, height: 1920 });
  expect(ogImageSize(p(1000, 1000))).toEqual({ width: 1000, height: 1000 });
  expect(ogImageSize(p(1500, 1000))).toEqual({ width: 1280, height: 853 });
  expect(ogImageSize(p(1000))).toBeNull();
  expect(ogImageSize(p())).toBeNull();
});
