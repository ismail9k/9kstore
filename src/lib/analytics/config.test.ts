import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { isTrackedPath, posthogConfig, posthogTarget } from "./config";

describe("isTrackedPath", () => {
  it("tracks the store", () => {
    expect(isTrackedPath("/")).toBe(true);
    expect(isTrackedPath("/ar")).toBe(true);
    expect(isTrackedPath("/en/p/black-tee")).toBe(true);
    expect(isTrackedPath("/ar/p/admin")).toBe(true);
  });

  it("never tracks the admin", () => {
    expect(isTrackedPath("/admin")).toBe(false);
    expect(isTrackedPath("/admin/")).toBe(false);
    expect(isTrackedPath("/admin/login")).toBe(false);
    expect(isTrackedPath("/admin/products/12")).toBe(false);
  });

  it("does not mistake a path that only starts with the word", () => {
    expect(isTrackedPath("/administrator")).toBe(true);
  });
});

describe("posthogTarget", () => {
  it("needs both the token and the host", () => {
    expect(posthogTarget("phc_x", "https://eu.i.posthog.com")).toEqual({
      token: "phc_x",
      host: "https://eu.i.posthog.com",
    });
    expect(posthogTarget(undefined, "https://eu.i.posthog.com")).toBeNull();
    expect(posthogTarget("phc_x", undefined)).toBeNull();
    expect(posthogTarget(" ", "https://eu.i.posthog.com")).toBeNull();
  });
});

describe("posthogConfig before_send", () => {
  const event = { event: "$pageview", properties: {} } as unknown as CaptureResult;

  function beforeSend(pathname: string) {
    const fn = posthogConfig("https://eu.i.posthog.com", () => pathname).before_send;
    if (typeof fn !== "function") throw new Error("before_send is not a function");
    return fn(event);
  }

  it("lets store events through", () => {
    expect(beforeSend("/en/p/black-tee")).toBe(event);
  });

  it("drops anything sent from the admin", () => {
    expect(beforeSend("/admin/products/12")).toBeNull();
  });
});
