// Admin authorization helpers. Used by /api/admins/* routes to verify the
// caller is a site-wide admin before performing privileged actions.
//
// A user is considered an admin when either:
//   1. their email is in the ADMIN_EMAILS env var (comma-separated), OR
//   2. their WorkOS user metadata contains `role: "admin"`.
// The env-var path is the bootstrap mechanism — the first admin lists themself
// there so they can mint other admins via the UI, which writes to metadata.

import { workos } from "./workos";
import { verifiedUserId } from "./verify-token";

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
  const userId = await verifiedUserId(authHeader);
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
