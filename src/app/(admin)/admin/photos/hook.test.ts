import { describe, expect, test } from "vitest";

import { firstOpaqueRow, hookTopOf, measureHookTop } from "./hook";

/** RGBA pixels, fully transparent, with the given (x, y) set to `alpha`. */
function rgba(width: number, height: number, opaque: [number, number, number][] = []): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of opaque) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe("firstOpaqueRow", () => {
  test("is the first row from the top with a pixel above the threshold", () => {
    expect(firstOpaqueRow(rgba(4, 6, [[2, 3, 255], [0, 5, 255]]), 4, 6)).toBe(3);
  });
  test("ignores faint pixels at or below the threshold (default 16)", () => {
    expect(firstOpaqueRow(rgba(4, 6, [[1, 1, 16], [3, 4, 17]]), 4, 6)).toBe(4);
    expect(firstOpaqueRow(rgba(4, 6, [[1, 1, 40]]), 4, 6, 50)).toBeNull();
  });
  test("reads the alpha channel only", () => {
    const data = rgba(2, 2);
    data.fill(255, 0, 3); // an opaque-looking colour with alpha 0
    expect(firstOpaqueRow(data, 2, 2)).toBeNull();
  });
  test("is null for a fully transparent image or no pixels", () => {
    expect(firstOpaqueRow(rgba(3, 3), 3, 3)).toBeNull();
    expect(firstOpaqueRow(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe("hookTopOf", () => {
  test("is the row as a fraction of the height, to 4 decimals", () => {
    expect(hookTopOf(37, 1200)).toBe(0.0308);
    expect(hookTopOf(0, 1200)).toBe(0);
  });
  test("is undefined with no visible pixel or no height", () => {
    expect(hookTopOf(null, 1200)).toBeUndefined();
    expect(hookTopOf(3, 0)).toBeUndefined();
  });
});

describe("measureHookTop", () => {
  test("resolves undefined when the browser cannot decode the file (here: jsdom)", async () => {
    await expect(measureHookTop(new File([new Uint8Array(3)], "a.webp", { type: "image/webp" }))).resolves.toBeUndefined();
  });
});
