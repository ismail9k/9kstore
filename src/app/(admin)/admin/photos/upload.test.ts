import { describe, expect, test } from "vitest";

import { MESSAGES } from "@/lib/photos/process";
import { INPUT_MAX_BYTES } from "@/lib/photos/variants";

import { precheckFile, takeFinished, takeUpTo, UploadError, uploadPhoto, type PhotoKind } from "./upload";

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

describe("uploadPhoto hook measurement", () => {
  const ok = (async () => Response.json({ key: "k", width: 1200, height: 1200 })) as typeof fetch;
  const file = new File([new Uint8Array(3)], "a.webp", { type: "image/webp" });

  test("adds the measured hookTop to a color photo", async () => {
    const measured: Blob[] = [];
    const measure = async (f: Blob) => (measured.push(f), 0.1234);
    await expect(uploadPhoto(file, "color", ok, measure)).resolves.toEqual({ key: "k", width: 1200, height: 1200, hookTop: 0.1234 });
    expect(measured).toEqual([file]);
  });

  test("leaves hookTop out when it can't be measured, without failing the upload", async () => {
    await expect(uploadPhoto(file, "color", ok, async () => undefined)).resolves.toEqual({ key: "k", width: 1200, height: 1200 });
    const broken = async () => {
      throw new Error("decode failed");
    };
    await expect(uploadPhoto(file, "color", ok, broken)).resolves.toEqual({ key: "k", width: 1200, height: 1200 });
  });

  test("doesn't measure a logo or a size chart, which never hang", async () => {
    let calls = 0;
    const measure = async () => (calls++, 0.5);
    await expect(uploadPhoto(file, "logo", ok, measure)).resolves.toEqual({ key: "k", width: 1200, height: 1200 });
    await uploadPhoto(file, "size-chart", ok, measure);
    expect(calls).toBe(0);
  });
});

describe("uploadPhoto retryable", () => {
  const file = new File([""], "a", { type: "image/jpeg" });
  async function failure(fetchImpl: typeof fetch, kind: PhotoKind = "color"): Promise<UploadError> {
    const error = await uploadPhoto(file, kind, fetchImpl).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UploadError);
    return error as UploadError;
  }
  const answer = (status: number) =>
    (async () => Response.json({ error: `status ${status}` }, { status })) as typeof fetch;

  test("a network failure, a non-JSON body, a malformed answer and a 503 can be retried", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await failure(down)).retryable).toBe(true);
    const html = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;
    expect((await failure(html)).retryable).toBe(true);
    const noKey = (async () => Response.json({ ok: true })) as typeof fetch;
    expect((await failure(noKey)).retryable).toBe(true);
    const unavailable = await failure(answer(503));
    expect(unavailable.retryable).toBe(true);
    expect(unavailable.message).toBe("status 503");
  });

  test("a 4xx refusal would fail the same way again, so it can't be retried", async () => {
    for (const status of [400, 401, 403, 413, 415]) {
      const refusal = await failure(answer(status));
      expect(refusal.retryable).toBe(false);
      expect(refusal.message).toBe(`status ${status}`);
    }
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

describe("takeFinished", () => {
  const u = (id: number, status: "queued" | "uploading" | "done" | "failed") => ({ id, status });
  const ids = (list: { id: number }[]) => list.map((x) => x.id);

  test("takes the done entries before the first queued or uploading one, in list order", () => {
    const { ready, rest } = takeFinished([u(1, "done"), u(2, "done"), u(3, "uploading"), u(4, "done")]);
    expect(ids(ready)).toEqual([1, 2]);
    expect(ids(rest)).toEqual([3, 4]);
  });

  test("a later upload that finishes first waits for the earlier one", () => {
    const { ready, rest } = takeFinished([u(1, "uploading"), u(2, "done")]);
    expect(ready).toEqual([]);
    expect(ids(rest)).toEqual([1, 2]);
    expect(ids(takeFinished([u(1, "queued"), u(2, "done")]).ready)).toEqual([]);
  });

  test("a failed entry ahead doesn't hold later done ones back, and stays", () => {
    const { ready, rest } = takeFinished([
      u(1, "failed"),
      u(2, "done"),
      u(3, "failed"),
      u(4, "done"),
      u(5, "queued"),
    ]);
    expect(ids(ready)).toEqual([2, 4]);
    expect(ids(rest)).toEqual([1, 3, 5]);
  });

  test("nothing ready leaves the list as it is", () => {
    const list = [u(1, "failed"), u(2, "uploading")];
    expect(takeFinished(list)).toEqual({ ready: [], rest: list });
    expect(takeFinished([])).toEqual({ ready: [], rest: [] });
  });
});
