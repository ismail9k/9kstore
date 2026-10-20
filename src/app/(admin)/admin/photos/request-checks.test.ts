import { expect, test } from "vitest";

import { MESSAGES } from "@/lib/photos/process";
import { INPUT_MAX_BYTES } from "@/lib/photos/variants";

import { checkUploadHeaders, sameOrigin } from "./request-checks";

const h = (o: Record<string, string>) => new Headers(o);

test("sameOrigin by Sec-Fetch-Site, else by Origin", () => {
  expect(sameOrigin(h({ "sec-fetch-site": "same-origin" }), "https://x.test/admin/photos")).toBe(true);
  expect(sameOrigin(h({ "sec-fetch-site": "cross-site", origin: "https://x.test" }), "https://x.test/admin/photos")).toBe(false);
  expect(sameOrigin(h({ origin: "https://x.test" }), "https://x.test/admin/photos")).toBe(true);
  expect(sameOrigin(h({ origin: "https://evil.test" }), "https://x.test/admin/photos")).toBe(false);
  expect(sameOrigin(h({}), "https://x.test/admin/photos")).toBe(false);
});

test("checkUploadHeaders", () => {
  expect(checkUploadHeaders(h({ "content-type": "image/jpeg", "content-length": "1000" }))).toBeNull();
  expect(checkUploadHeaders(h({ "content-type": "image/webp; charset=x", "content-length": "1000" }))).toBeNull();
  expect(checkUploadHeaders(h({ "content-type": "image/jpeg", "content-length": String(INPUT_MAX_BYTES + 1) }))).toEqual({ status: 413, error: MESSAGES.tooBig });
  expect(checkUploadHeaders(h({ "content-type": "image/jpeg" }))?.status).toBe(400);
  expect(checkUploadHeaders(h({ "content-type": "application/pdf", "content-length": "10" }))).toEqual({ status: 415, error: MESSAGES.badType });
});
