import "server-only";

import { cookies } from "next/headers";

import type { Secrets } from "./secrets";
import { deviceSigningKey, newDeviceId, signDeviceToken, verifyDeviceToken } from "./token";

export const DEVICE_COOKIE = "9k_device";
export const DEVICE_DAYS = 365;

const DEVICE_SECONDS = DEVICE_DAYS * 24 * 60 * 60;

/**
 * The known-device cookie marks a browser that has logged in before. It
 * grants no access, only that device's own guess budget (see `attemptSteps`).
 * Logout leaves it; changing `ADMIN_PASSWORD` or `SESSION_SECRET` forgets
 * every device. `Path=/admin` means a login reaching the action through
 * another page counts as an unknown device.
 */

/** The verified id of this request's device cookie, else `null`. Never throws. */
export async function knownDeviceId(secrets: Secrets): Promise<string | null> {
  try {
    const token = (await cookies()).get(DEVICE_COOKIE)?.value;
    const payload = await verifyDeviceToken(token, deviceSigningKey(secrets));
    return payload?.id ?? null;
  } catch {
    return null;
  }
}

/** Sets a fresh device cookie. Call only from a Server Action, after a correct password. */
export async function rememberDevice(secrets: Secrets): Promise<void> {
  const iat = Date.now();
  const token = await signDeviceToken(
    { id: newDeviceId(), iat, exp: iat + DEVICE_SECONDS * 1000 },
    deviceSigningKey(secrets),
  );
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    secure: process.env.NODE_ENV === "production",
    maxAge: DEVICE_SECONDS,
  });
}
