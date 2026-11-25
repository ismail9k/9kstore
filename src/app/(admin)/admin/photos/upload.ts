/**
 * The admin's side of `POST /admin/photos`: the client-side precheck, one
 * upload, how many files of a drop fit, and which finished uploads are
 * ready to add. Client-safe and React-free.
 */
import type { Photo } from "@/lib/catalog/schema";
import { MESSAGES } from "@/lib/photos/process";
import { ACCEPTED_TYPES, INPUT_MAX_BYTES } from "@/lib/photos/variants";

import { measureHookTop } from "./hook";

export type PhotoKind = "color" | "size-chart" | "logo";

/** The accept list for the file picker. */
export const ACCEPT = ACCEPTED_TYPES.join(",");

/** Why a file is refused before any request (wrong type, over 20 MB), or null. */
export function precheckFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return MESSAGES.badType;
  if (file.size > INPUT_MAX_BYTES) return MESSAGES.tooBig;
  return null;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Why an upload failed, and whether trying the same file again could work:
 * a 4xx refusal (too large, wrong type, logged out, refused origin) would
 * fail the same way; a network failure, an answer that isn't the route's
 * JSON, or a 5xx such as 503 might not.
 */
export class UploadError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
  }
}

/**
 * Upload one file as the raw body. Resolves to the stored photo; rejects with
 * an `UploadError` carrying the server's message, or the network message when
 * the request fails or the answer isn't the route's JSON.
 *
 * A color photo (the one that may hang on the rail) is also measured here, in
 * the browser, while it uploads: its `hookTop` is merged into the photo. A
 * failed measurement leaves `hookTop` out and never fails the upload.
 */
export async function uploadPhoto(
  file: File,
  kind: PhotoKind,
  fetchImpl: typeof fetch = fetch,
  measure: (file: Blob) => Promise<number | undefined> = measureHookTop,
): Promise<Photo> {
  const hookTop: Promise<number | undefined> =
    kind === "color" ? measure(file).catch(() => undefined) : Promise.resolve(undefined);
  let body: unknown;
  let status: number;
  try {
    const response = await fetchImpl("/admin/photos", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type, "X-Photo-Kind": kind },
    });
    status = response.status;
    body = await response.json();
  } catch {
    throw new UploadError(MESSAGES.network, true);
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const ok = status >= 200 && status < 300;
  if (!ok || typeof record.key !== "string") {
    const message = typeof record.error === "string" && record.error ? record.error : MESSAGES.network;
    throw new UploadError(message, !(status >= 400 && status < 500));
  }
  const photo: Photo = { key: record.key };
  if (isPositiveInt(record.width)) photo.width = record.width;
  if (isPositiveInt(record.height)) photo.height = record.height;
  const measured = await hookTop;
  if (measured !== undefined) photo.hookTop = measured;
  return photo;
}

/** The first `room` items, and how many didn't fit. */
export function takeUpTo<T>(items: T[], room: number): { taken: T[]; dropped: number } {
  const taken = items.slice(0, Math.max(0, room));
  return { taken, dropped: items.length - taken.length };
}

/**
 * The finished (`done`) uploads that can be added now, in list order, and
 * the rest: every `done` entry before the first `queued` or `uploading` one,
 * so photos land in the order they were picked. `failed` entries don't hold
 * later ones back and stay in `rest`.
 */
export function takeFinished<T extends { status: "queued" | "uploading" | "done" | "failed" }>(
  list: T[],
): { ready: T[]; rest: T[] } {
  const ready: T[] = [];
  for (const item of list) {
    if (item.status === "queued" || item.status === "uploading") break;
    if (item.status === "done") ready.push(item);
  }
  if (ready.length === 0) return { ready, rest: list };
  return { ready, rest: list.filter((item) => !ready.includes(item)) };
}
