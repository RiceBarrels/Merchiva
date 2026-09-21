// Admin authorization helpers. Used by /api/admins/* routes to verify the
// caller is a site-wide admin before performing privileged actions.
//
// A user is considered an admin when either:
//   1. their email is in the ADMIN_EMAILS env var (comma-separated), OR
//   2. their WorkOS user metadata contains `role: "admin"`.
// The env-var path is the bootstrap mechanism — the first admin lists themself
// there so they can mint other admins via the UI, which writes to metadata.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { clientId, workos } from "./workos";

export interface AdminCheckResult {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  isAdmin: boolean;
  source: "env" | "metadata" | null;
}

function envAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminFromEnv(email: string): boolean {
  return envAdminEmails().has(email.toLowerCase());
}

/**
 * WorkOS's public signing keys, fetched once and cached by `jose`.
 *
 * Built lazily so a missing WORKOS_CLIENT_ID fails the request rather than the
 * module import.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwks) return jwks;
  if (!clientId) return null;
  try {
    jwks = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(clientId)));
    return jwks;
  } catch (err) {
    console.error("[admin] could not build the WorkOS JWKS:", err);
    return null;
  }
}

/**
 * Verify a Bearer access token with WorkOS and return whether the user is a
 * site admin. Returns `null` if the token is invalid.
 *
 * The signature is checked against WorkOS's JWKS before anything in the token
 * is believed. It previously was not: the payload was base64-decoded and its
 * `sub` trusted directly, so anyone could hand-write
 *
 *     Authorization: Bearer <any header>.<base64 {"sub":"user_01H…"}>.<any sig>
 *
 * with a known admin's WorkOS user id and get everything /api/admins/* can do —
 * arbitrary SQL over the database, promoting themselves in WorkOS metadata,
 * minting coupons. The user-id round-trip below does catch a deleted user, but
 * it cannot tell a real token from a forged one, because it only ever sees the
 * id the caller put in the payload.
 */
export async function verifyAdminFromAuthHeader(
  authHeader: string | null,
): Promise<AdminCheckResult | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const keys = getJwks();
  if (!keys) {
    // No client id configured: fail closed rather than fall back to trusting
    // an unverified payload.
    console.error("[admin] WORKOS_CLIENT_ID is not set — refusing to verify admin tokens");
    return null;
  }

  let userId: string | null = null;
  try {
    const { payload } = await jwtVerify(token, keys);
    userId = typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    // Bad signature, wrong issuer, expired — all the same answer.
    return null;
  }
  if (!userId) return null;

  try {
    const user = await workos.userManagement.getUser(userId);
    const email = (user.email ?? "").toLowerCase();
    if (isAdminFromEnv(email)) {
      return {
        user: {
          id: user.id,
          email: user.email ?? "",
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
        },
        isAdmin: true,
        source: "env",
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (user as any).metadata ?? {};
    const role = typeof meta.role === "string" ? meta.role : null;
    return {
      user: {
        id: user.id,
        email: user.email ?? "",
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
      },
      isAdmin: role === "admin",
      source: role === "admin" ? "metadata" : null,
    };
  } catch (err) {
    console.error("[admin] verifyAdminFromAuthHeader failed:", err);
    return null;
  }
}
