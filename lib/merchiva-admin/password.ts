/**
 * Password hashing for /merchivaAdmin platform admins.
 *
 * scrypt(password, salt) where salt = sha256(pepper + username). The pepper is
 * MERCHIVA_ADMIN_SECRET, falling back to SPACETIMEDB_SERVICE_TOKEN so the
 * console works out of the box on any environment that already has the
 * service token. Changing the pepper invalidates every stored hash.
 *
 * Pure Node crypto, no "server-only" import — the seed script runs this under
 * Bun outside Next.js. Never import from client code (it's not secret, but
 * hashing belongs on the server).
 */

import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

function pepper(): string {
  const p = process.env.MERCHIVA_ADMIN_SECRET || process.env.SPACETIMEDB_SERVICE_TOKEN;
  if (!p) {
    throw new Error(
      "MERCHIVA_ADMIN_SECRET (or SPACETIMEDB_SERVICE_TOKEN) must be set to hash platform admin passwords",
    );
  }
  return p;
}

export function normalizeAdminUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateAdminUsername(username: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
    return "Username must be 2-32 chars: lowercase letters, digits, . _ -";
  }
  return null;
}

export function validateAdminPassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 200) return "Password is too long";
  return null;
}

/** Deterministic hex hash for (username, password). */
export function hashAdminPassword(username: string, password: string): string {
  const u = normalizeAdminUsername(username);
  const salt = createHash("sha256").update(`${pepper()}:${u}`).digest();
  return scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS).toString("hex");
}

export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
