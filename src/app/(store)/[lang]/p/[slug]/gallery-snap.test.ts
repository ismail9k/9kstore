import { describe, expect, test } from "vitest";
import { settlePhoto } from "./gallery-snap";

// Three 400px photos: they sit at scrollLeft 0, 400 and 800.
describe("settlePhoto", () => {
  test("a short drag goes back to the photo it started from", () => {
    expect(settlePhoto(1, 400 + 50, 400, 3)).toBe(1);
    expect(settlePhoto(1, 400 - 50, 400, 3)).toBe(1);
  });

  test("a drag past a fifth of a photo moves one photo in its direction", () => {
    expect(settlePhoto(1, 400 + 100, 400, 3)).toBe(2);
    expect(settlePhoto(1, 400 - 100, 400, 3)).toBe(0);
  });

  test("a long drag lands on the nearest photo", () => {
    expect(settlePhoto(0, 750, 400, 3)).toBe(2);
  });

  test("never goes past the first or last photo", () => {
    expect(settlePhoto(0, -100, 400, 3)).toBe(0);
    expect(settlePhoto(2, 900, 400, 3)).toBe(2);
  });

  test("an unlaid-out strip stays on the first photo", () => {
    expect(settlePhoto(0, 0, 0, 3)).toBe(0);
  });
});
