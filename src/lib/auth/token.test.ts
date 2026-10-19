// @vitest-environment node
import { describe, expect, test } from "vitest";

import { signToken, verifyToken } from "./token";

const SECRET = "0123456789abcdef0123456789abcdef-test-secret";
const NOW = 1_800_000_000_000;
const payload = { iat: NOW, exp: NOW + 30 * 24 * 60 * 60 * 1000 };

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("signToken / verifyToken", () => {
  test("sign then verify returns the payload", async () => {
    const token = await signToken(payload, SECRET);
    expect(token.split(".")).toHaveLength(2);
    expect(await verifyToken(token, SECRET, NOW)).toEqual(payload);
  });

  test("a tampered signature fails", async () => {
    const token = await signToken(payload, SECRET);
    const last = token.at(-1);
    const flipped = token.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(await verifyToken(flipped, SECRET, NOW)).toBeNull();
  });

  test("a tampered payload fails", async () => {
    const token = await signToken(payload, SECRET);
    const [, sig] = token.split(".");
    const forged = `${b64urlJson({ ...payload, exp: payload.exp + 1000 })}.${sig}`;
    expect(await verifyToken(forged, SECRET, NOW)).toBeNull();
  });

  test("an expired token fails", async () => {
    const token = await signToken({ iat: NOW - 2000, exp: NOW - 1000 }, SECRET);
    expect(await verifyToken(token, SECRET, NOW)).toBeNull();
  });

  test("a different secret fails", async () => {
    const token = await signToken(payload, SECRET);
    expect(
      await verifyToken(token, "another-secret-another-secret-xx", NOW),
    ).toBeNull();
  });

  test("undefined and garbage tokens return null without throwing", async () => {
    const garbage = [
      undefined,
      "",
      ".",
      "abc",
      "a.b.c",
      "!!!.???",
      `${b64urlJson("not an object")}.x`,
      `${Buffer.from("{not json").toString("base64url")}.x`,
    ];
    for (const token of garbage) {
      await expect(verifyToken(token, SECRET, NOW)).resolves.toBeNull();
    }
  });

  test("a correctly signed payload of the wrong shape fails", async () => {
    // @ts-expect-error -- deliberately wrong shape
    const token = await signToken({ iat: "x", exp: "y" }, SECRET);
    expect(await verifyToken(token, SECRET, NOW)).toBeNull();
  });
});
