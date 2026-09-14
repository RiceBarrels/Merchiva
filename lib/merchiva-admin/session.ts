/**
 * Signed-cookie sessions for the /merchivaAdmin console (server-only).
 *
 * Token = base64url(username.expiresAtMs) + "." + HMAC-SHA256(secret, payload).
 * The secret is MERCHIVA_ADMIN_SECRET, falling back to SPACETIMEDB_SERVICE_TOKEN.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "merchiva_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminSession {
  username: string;
  expiresAt: number;
}

function secret(): string {
  const s = process.env.MERCHIVA_ADMIN_SECRET || process.env.SPACETIMEDB_SERVICE_TOKEN;
  if (!s) throw new Error("MERCHIVA_ADMIN_SECRET (or SPACETIMEDB_SERVICE_TOKEN) is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(username: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(`${username}.${expiresAt}`).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifySessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const decoded = Buffer.from(payload, "base64url").toString();
  const sep = decoded.lastIndexOf(".");
  if (sep <= 0) return null;
  const username = decoded.slice(0, sep);
  const expiresAt = Number(decoded.slice(sep + 1));
  if (!username || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return { username, expiresAt };
}

/** Current admin session from the request cookies, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const store = await cookies();
    return verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}

export class AdminAuthError extends Error {
  status = 401;
  constructor(message = "Not signed in") {
    super(message);
  }
}

/** For route handlers: returns the session or throws AdminAuthError. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new AdminAuthError();
  return session;
}
