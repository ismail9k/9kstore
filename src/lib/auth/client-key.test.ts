import { describe, expect, test } from "vitest";

import { clientKey } from "./client-key";

describe("clientKey", () => {
  test("IPv4 keeps the whole address", () => {
    expect(clientKey("203.0.113.7")).toBe("ip:203.0.113.7");
  });
  test("IPv6 keeps the /64", () => {
    expect(clientKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("net:2001:db8:1:2::/64");
  });
  test("every address in one /64 gives the same key, however it is written", () => {
    const key = "net:2001:db8:0:2::/64";
    expect(clientKey("2001:db8::2:0:0:0:1")).toBe(key);
    expect(clientKey("2001:0DB8:0000:0002:ffff:0:0:9")).toBe(key);
    expect(clientKey("2001:db8:0:2::1%eth0")).toBe(key);
    expect(clientKey("2001:db8:0:2::")).toBe(key);
  });
  test("different /64s give different keys", () => {
    expect(clientKey("2001:db8:0:2::1")).not.toBe(clientKey("2001:db8:0:3::1"));
  });
  test("leading :: and loopback expand to zeros", () => {
    expect(clientKey("::1")).toBe("net:0:0:0:0::/64");
  });
  test("IPv4-mapped IPv6 counts as the IPv4 address", () => {
    expect(clientKey("::ffff:203.0.113.7")).toBe("ip:203.0.113.7");
    expect(clientKey("::FFFF:203.0.113.7")).toBe("ip:203.0.113.7");
  });
  test("anything else is kept as given", () => {
    expect(clientKey("unknown")).toBe("ip:unknown");
    expect(clientKey("1:2:3")).toBe("ip:1:2:3");
    expect(clientKey("2001:db8::1::2")).toBe("ip:2001:db8::1::2");
    expect(clientKey("")).toBe("ip:");
  });
});
