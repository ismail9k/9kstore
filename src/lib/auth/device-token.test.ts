// @vitest-environment node
import { describe, expect, test } from "vitest";

import {
  deviceSigningKey,
  newDeviceId,
  signDeviceToken,
  signingKey,
  signToken,
  verifyDeviceToken,
  verifyToken,
} from "./token";

const secrets = {
  adminPassword: "correct horse battery",
  sessionSecret: "0123456789abcdef0123456789abcdef-test",
};
const NOW = 1_800_000_000_000;
const YEAR = 365 * 24 * 60 * 60 * 1000;
const device = { id: "AAAAAAAAAAAAAAAAAAAAAA", iat: NOW, exp: NOW + YEAR };
const key = deviceSigningKey(secrets);

describe("device tokens", () => {
  test("a new device id is 22 base64url characters and differs each time", () => {
    const a = newDeviceId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newDeviceId()).not.toBe(a);
  });

  test("sign then verify returns the payload", async () => {
    expect(await verifyDeviceToken(await signDeviceToken(device, key), key, NOW)).toEqual(device);
  });

  test("the device key differs from the session key", () => {
    expect(key).toBe(`device\n${signingKey(secrets)}`);
  });

  test("tampered, expired and wrong-key tokens fail", async () => {
    const token = await signDeviceToken(device, key);
    const last = token.slice(-1) === "A" ? "B" : "A";
    expect(await verifyDeviceToken(token.slice(0, -1) + last, key, NOW)).toBeNull();
    expect(await verifyDeviceToken(token, key, device.exp)).toBeNull();
    const wrong = await signDeviceToken(device, signingKey(secrets));
    expect(await verifyDeviceToken(wrong, key, NOW)).toBeNull();
  });

  test("a bad id fails", async () => {
    for (const id of ["short", "AAAAAAAAAAAAAAAAAAAA/A"]) {
      const token = await signDeviceToken({ ...device, id }, key);
      expect(await verifyDeviceToken(token, key, NOW)).toBeNull();
    }
  });

  test("garbage never throws", async () => {
    for (const t of [undefined, "", "abc", "a.b.c", ".", "%%%.%%%", "eyJ9.x"]) {
      expect(await verifyDeviceToken(t, key, NOW)).toBeNull();
    }
  });

  test("a session token is not a device token, under either key", async () => {
    const session = await signToken({ iat: NOW, exp: NOW + YEAR, v: 1 }, signingKey(secrets));
    expect(await verifyDeviceToken(session, key, NOW)).toBeNull();
    expect(await verifyDeviceToken(session, signingKey(secrets), NOW)).toBeNull();
  });

  test("a device token is not a session token, under either key", async () => {
    const token = await signDeviceToken(device, key);
    expect(await verifyToken(token, signingKey(secrets), NOW)).toBeNull();
    const sameKey = await signDeviceToken(device, signingKey(secrets));
    expect(await verifyToken(sameKey, signingKey(secrets), NOW)).toBeNull();
  });
});
