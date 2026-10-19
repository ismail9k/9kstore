import { timingSafeEqual } from "./password";
import type { Secrets } from "./secrets";

/**
 * Session payload. `iat` and `exp` are milliseconds since the epoch; `v` is
 * the session version at login (see `auth_state` in migrations/0002_auth.sql).
 */
export type TokenPayload = { iat: number; exp: number; v: number };

/**
 * The HMAC key for session tokens. It includes the admin password, so
 * changing `ADMIN_PASSWORD` (or `SESSION_SECRET`) invalidates every session.
 */
export function signingKey(secrets: Secrets): string {
  return `${secrets.sessionSecret}\n${secrets.adminPassword}`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not base64url");
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64url(new Uint8Array(signature));
}

function isPayload(value: unknown): value is TokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const { iat, exp, v } = value as Record<string, unknown>;
  return Number.isFinite(iat) && Number.isFinite(exp) && Number.isInteger(v);
}

/** `base64url(JSON payload).base64url(HMAC-SHA256 of the first segment)`. */
export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const body = toBase64url(encoder.encode(JSON.stringify({ iat: payload.iat, exp: payload.exp, v: payload.v })));
  return `${body}.${await hmac(body, secret)}`;
}

/**
 * Returns the payload of a token signed with `secret` that has not expired at
 * `now`, or `null` for anything else. Never throws.
 */
export async function verifyToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<TokenPayload | null> {
  try {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts as [string, string];
    // Compare the encoded signatures: base64url's trailing bits make several
    // strings decode to the same bytes, and only the canonical one is valid.
    if (!timingSafeEqual(await hmac(body, secret), signature)) return null;
    const payload: unknown = JSON.parse(decoder.decode(fromBase64url(body)));
    if (!isPayload(payload)) return null;
    if (payload.exp <= now) return null;
    return { iat: payload.iat, exp: payload.exp, v: payload.v };
  } catch {
    return null;
  }
}
