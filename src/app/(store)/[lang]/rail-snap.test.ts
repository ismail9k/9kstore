import { describe, expect, test } from "vitest";
import { centeredScroll, middleIndex, snapScroll } from "./rail-snap";

describe("middleIndex", () => {
  test("an odd count opens on the middle tee in both directions", () => {
    expect(middleIndex(3, "ltr")).toBe(1);
    expect(middleIndex(3, "rtl")).toBe(1);
    expect(middleIndex(1, "ltr")).toBe(0);
    expect(middleIndex(1, "rtl")).toBe(0);
  });
  test("an even count opens on the middle tee nearer where the reader starts", () => {
    expect(middleIndex(4, "ltr")).toBe(1);
    expect(middleIndex(4, "rtl")).toBe(2);
    expect(middleIndex(2, "ltr")).toBe(0);
    expect(middleIndex(2, "rtl")).toBe(1);
  });
  test("never negative", () => {
    expect(middleIndex(0, "ltr")).toBe(0);
    expect(middleIndex(0, "rtl")).toBe(0);
  });
});

// A 375px phone with four 172.5px tees overlapping by 15px: the content is
// 600px wide, so the scroller reaches 0–225px.
const CLIENT = 375;
const SCROLL = 600;
const CENTERS = [86.25, 228.75, 371.25, 513.75];

describe("centeredScroll", () => {
  test("puts the tee's center at the scroller's center", () => {
    expect(centeredScroll(228.75, CLIENT, SCROLL)).toBe(41.25);
    expect(centeredScroll(371.25, CLIENT, SCROLL)).toBe(183.75);
  });
  test("clamps to the ends the scroller can reach", () => {
    expect(centeredScroll(86.25, CLIENT, SCROLL)).toBe(0);
    expect(centeredScroll(513.75, CLIENT, SCROLL)).toBe(225);
  });
  test("is 0 when nothing overflows", () => {
    expect(centeredScroll(150, CLIENT, CLIENT)).toBe(0);
    expect(centeredScroll(150, CLIENT, 300)).toBe(0);
  });
});

describe("snapScroll", () => {
  test("settles on the nearest tee's centered position", () => {
    expect(snapScroll(60, CENTERS, CLIENT, SCROLL)).toBe(41.25);
    expect(snapScroll(150, CENTERS, CLIENT, SCROLL)).toBe(183.75);
  });
  test("reaches both ends, so the outer tees can be seen in full", () => {
    expect(snapScroll(15, CENTERS, CLIENT, SCROLL)).toBe(0);
    expect(snapScroll(210, CENTERS, CLIENT, SCROLL)).toBe(225);
  });
  test("with no tees, stays where it is", () => {
    expect(snapScroll(42, [], CLIENT, SCROLL)).toBe(42);
  });
});
