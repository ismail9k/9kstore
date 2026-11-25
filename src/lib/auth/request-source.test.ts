import { describe, expect, test } from "vitest";
import {
  UNKNOWN_CLIENT_IP,
  connectingIp,
  isForwardedAction,
} from "./request-source";

describe("isForwardedAction", () => {
  test("Next's forwarded self-fetch is forwarded", () => {
    expect(isForwardedAction(new Headers({ "x-action-forwarded": "1" }))).toBe(true);
  });
  test("any value, even empty, counts as forwarded", () => {
    expect(isForwardedAction(new Headers({ "x-action-forwarded": "" }))).toBe(true);
    expect(isForwardedAction(new Headers({ "X-Action-Forwarded": "no" }))).toBe(true);
  });
  test("a direct request is not forwarded", () => {
    expect(isForwardedAction(new Headers({ "cf-connecting-ip": "203.0.113.7" }))).toBe(false);
  });
});

describe("connectingIp", () => {
  test("uses cf-connecting-ip, trimmed", () => {
    expect(connectingIp(new Headers({ "cf-connecting-ip": " 203.0.113.7 " }))).toBe("203.0.113.7");
    expect(connectingIp(new Headers({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  test("prefers cf-connecting-ip over x-forwarded-for", () => {
    const h = new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.9" });
    expect(connectingIp(h)).toBe("203.0.113.7");
  });
  test("ignores x-forwarded-for: without cf-connecting-ip every client is unknown", () => {
    expect(connectingIp(new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }))).toBe(UNKNOWN_CLIENT_IP);
    expect(connectingIp(new Headers({ "x-forwarded-for": "198.51.100.10" }))).toBe(UNKNOWN_CLIENT_IP);
    expect(UNKNOWN_CLIENT_IP).toBe("unknown");
  });
  test("blank cf-connecting-ip is unknown", () => {
    expect(connectingIp(new Headers({ "cf-connecting-ip": "   " }))).toBe("unknown");
    expect(connectingIp(new Headers())).toBe("unknown");
  });
});
