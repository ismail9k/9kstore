import { describe, expect, test } from "vitest";

import { adminGate } from "./gate";

describe("adminGate", () => {
  test("a logged-out page load goes to the login page", () => {
    expect(adminGate("GET", "/admin", false)).toBe("login");
    expect(adminGate("HEAD", "/admin/products/abc", false)).toBe("login");
  });

  test("a logged-out load of the login page stays there", () => {
    expect(adminGate("GET", "/admin/login", false)).toBe("next");
    expect(adminGate("GET", "/admin/login/", false)).toBe("next");
  });

  test("a logged-in load of the login page goes to /admin", () => {
    expect(adminGate("GET", "/admin/login", true)).toBe("admin");
  });

  test("a logged-in page load passes", () => {
    expect(adminGate("GET", "/admin/products/abc", true)).toBe("next");
  });

  test("a logged-out POST (a Server Action) passes so the action answers", () => {
    expect(adminGate("POST", "/admin/products/abc", false)).toBe("next");
    expect(adminGate("POST", "/admin/settings", false)).toBe("next");
    expect(adminGate("POST", "/admin/login", true)).toBe("next");
  });
});
