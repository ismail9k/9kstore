// @vitest-environment node
import { describe, expect, test } from "vitest";

import { signingKey, signToken, verifyToken } from "./token";

const SECRET = "0123456789abcdef0123456789abcdef-test-secret";
const NOW = 1_800_000_000_000;
const payload = { iat: NOW, exp: NOW + 30 * 24 * 60 * 60 * 1000, v: 3 };

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
    const token = await signToken({ iat: NOW - 2000, exp: NOW - 1000, v: 1 }, SECRET);
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
    const token = await signToken({ iat: "x", exp: "y", v: 1 }, SECRET);
    expect(await verifyToken(token, SECRET, NOW)).toBeNull();
  });

  test("a token without a finite integer version fails", async () => {
    // Older `{ iat, exp }` tokens, and any version that is not an integer.
    for (const v of [undefined, "1", 1.5, Number.NaN, null]) {
      // @ts-expect-error -- deliberately wrong version
      const token = await signToken({ iat: NOW, exp: payload.exp, v }, SECRET);
      expect(await verifyToken(token, SECRET, NOW)).toBeNull();
    }
  });

  test("a hand-made `{ iat, exp }` token signed with the right key fails", async () => {
    const { createHmac } = await import("node:crypto");
    const body = b64urlJson({ iat: NOW, exp: payload.exp });
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    // Sanity check: the same recipe with `v` verifies.
    const goodBody = b64urlJson(payload);
    const goodSig = createHmac("sha256", SECRET).update(goodBody).digest("base64url");
    expect(await verifyToken(`${goodBody}.${goodSig}`, SECRET, NOW)).toEqual(payload);
    expect(await verifyToken(`${body}.${sig}`, SECRET, NOW)).toBeNull();
  });
});

describe("signingKey", () => {
  const secrets = { sessionSecret: SECRET, adminPassword: "first-long-password" };

  test("depends on both the session secret and the admin password", () => {
    expect(signingKey(secrets)).toBe(signingKey({ ...secrets }));
    expect(signingKey(secrets)).not.toBe(signingKey({ ...secrets, adminPassword: "other-long-password" }));
    expect(signingKey(secrets)).not.toBe(signingKey({ ...secrets, sessionSecret: `${SECRET}x` }));
  });

  test("a token signed under one password fails under another", async () => {
    const token = await signToken(payload, signingKey(secrets));
    expect(await verifyToken(token, signingKey(secrets), NOW)).toEqual(payload);
    const changed = signingKey({ ...secrets, adminPassword: "second-long-password" });
    expect(await verifyToken(token, changed, NOW)).toBeNull();
  });
});
