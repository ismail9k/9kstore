import { describe, expect, test } from "vitest";

import { MESSAGES } from "@/lib/photos/process";
import { INPUT_MAX_BYTES } from "@/lib/photos/variants";

import { precheckFile, takeUpTo, uploadPhoto } from "./upload";

describe("precheckFile", () => {
  test("accepts JPEG, PNG and WebP up to the input limit", () => {
    expect(precheckFile({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(precheckFile({ type: "image/png", size: INPUT_MAX_BYTES })).toBeNull();
    expect(precheckFile({ type: "image/webp", size: 1 })).toBeNull();
  });

  test("refuses other types and files over the limit", () => {
    expect(precheckFile({ type: "application/pdf", size: 1 })).toBe(MESSAGES.badType);
    expect(precheckFile({ type: "image/heic", size: 1 })).toBe(MESSAGES.badType);
    expect(precheckFile({ type: "", size: 1 })).toBe(MESSAGES.badType);
    expect(precheckFile({ type: "image/png", size: INPUT_MAX_BYTES + 1 })).toBe(MESSAGES.tooBig);
  });
});

describe("uploadPhoto", () => {
  test("posts the raw file with its type and kind, returns the photo", async () => {
    const calls: { url: unknown; init: RequestInit }[] = [];
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url, init: init! });
      return Response.json({ key: "k", width: 1, height: 2 });
    }) as typeof fetch;
    const file = new File([new Uint8Array(3)], "a.jpg", { type: "image/jpeg" });
    await expect(uploadPhoto(file, "color", fetchImpl)).resolves.toEqual({ key: "k", width: 1, height: 2 });
    expect(calls[0]?.url).toBe("/admin/photos");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe(file);
    expect(new Headers(calls[0]?.init.headers).get("x-photo-kind")).toBe("color");
    expect(new Headers(calls[0]?.init.headers).get("content-type")).toBe("image/jpeg");
  });

  test("returns a photo without dimensions as just its key", async () => {
    const fetchImpl = (async () => Response.json({ key: "k" })) as typeof fetch;
    await expect(uploadPhoto(new File([""], "a", { type: "image/png" }), "logo", fetchImpl)).resolves.toEqual({
      key: "k",
    });
  });

  test("surfaces the server message", async () => {
    const bad = (async () => Response.json({ error: "Nope" }, { status: 415 })) as typeof fetch;
    await expect(uploadPhoto(new File([""], "a", { type: "image/jpeg" }), "logo", bad)).rejects.toThrow("Nope");
  });

  test("uses the network message for a thrown fetch, a non-JSON body or a malformed answer", async () => {
    const file = new File([""], "a", { type: "image/jpeg" });
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(uploadPhoto(file, "logo", down)).rejects.toThrow(MESSAGES.network);
    const html = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;
    await expect(uploadPhoto(file, "logo", html)).rejects.toThrow(MESSAGES.network);
    const noKey = (async () => Response.json({ ok: true })) as typeof fetch;
    await expect(uploadPhoto(file, "logo", noKey)).rejects.toThrow(MESSAGES.network);
  });
});

describe("takeUpTo", () => {
  test("takes the first items that fit and counts the rest", () => {
    expect(takeUpTo([1, 2, 3], 2)).toEqual({ taken: [1, 2], dropped: 1 });
    expect(takeUpTo([1, 2], 5)).toEqual({ taken: [1, 2], dropped: 0 });
    expect(takeUpTo([1, 2], 0)).toEqual({ taken: [], dropped: 2 });
    expect(takeUpTo([1, 2], -1)).toEqual({ taken: [], dropped: 2 });
  });
});
