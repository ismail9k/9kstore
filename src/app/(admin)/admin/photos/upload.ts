/**
 * The admin's side of `POST /admin/photos`: the client-side precheck, one
 * upload, and how many files of a drop fit. Client-safe and React-free.
 */
import type { Photo } from "@/lib/catalog/schema";
import { MESSAGES } from "@/lib/photos/process";
import { ACCEPTED_TYPES, INPUT_MAX_BYTES } from "@/lib/photos/variants";

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
 * Upload one file as the raw body. Resolves to the stored photo; rejects with
 * the server's message, or the network message when the request fails or the
 * answer isn't the route's JSON.
 */
export async function uploadPhoto(file: File, kind: PhotoKind, fetchImpl: typeof fetch = fetch): Promise<Photo> {
  let body: unknown;
  let ok: boolean;
  try {
    const response = await fetchImpl("/admin/photos", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type, "X-Photo-Kind": kind },
    });
    ok = response.ok;
    body = await response.json();
  } catch {
    throw new Error(MESSAGES.network);
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!ok || typeof record.key !== "string") {
    throw new Error(typeof record.error === "string" && record.error ? record.error : MESSAGES.network);
  }
  const photo: Photo = { key: record.key };
  if (isPositiveInt(record.width)) photo.width = record.width;
  if (isPositiveInt(record.height)) photo.height = record.height;
  return photo;
}

/** The first `room` items, and how many didn't fit. */
export function takeUpTo<T>(items: T[], room: number): { taken: T[]; dropped: number } {
  const taken = items.slice(0, Math.max(0, room));
  return { taken, dropped: items.length - taken.length };
}
