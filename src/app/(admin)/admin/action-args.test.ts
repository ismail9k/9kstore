import { describe, expect, it } from "vitest";

import { checkOrderIds, checkToggleArgs } from "./action-args";

describe("checkToggleArgs", () => {
  it("accepts a non-empty id and a boolean", () => {
    expect(checkToggleArgs("p1", false)).toEqual({ id: "p1", published: false });
  });

  it.each([
    ["", true],
    [42, true],
    [null, true],
    ["p1", "true"],
    ["p1", 1],
    ["p1", undefined],
  ])("rejects id %j with published %j", (id, published) => {
    expect(() => checkToggleArgs(id, published)).toThrow();
  });
});

describe("checkOrderIds", () => {
  it("accepts unique non-empty strings, and an empty list", () => {
    expect(checkOrderIds(["b", "a"])).toEqual(["b", "a"]);
    expect(checkOrderIds([])).toEqual([]);
  });

  it.each([[["a", "a"]], [["a", ""]], [["a", 1]], ["a,b"], [null], [{ 0: "a", length: 1 }]])(
    "rejects %j",
    (ids) => {
      expect(() => checkOrderIds(ids)).toThrow();
    },
  );
});
