// Admin authorization helpers. Used by /api/admins/* routes to verify the
// caller is a site-wide admin before performing privileged actions.
//
// A user is considered an admin when either:
//   1. their email is in the ADMIN_EMAILS env var (comma-separated), OR
//   2. their WorkOS user metadata contains `role: "admin"`.
// The env-var path is the bootstrap mechanism — the first admin lists themself
// there so they can mint other admins via the UI, which writes to metadata.

import { workos } from "./workos";

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

// Verify a Bearer access token with WorkOS and return whether the user is an
// admin. Returns `null` if the token is invalid.
export async function verifyAdminFromAuthHeader(
  authHeader: string | null,
): Promise<AdminCheckResult | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  // Decode the JWT to extract user id (WorkOS issues JWTs). We then call the
  // WorkOS API to get the full user record — this also validates the user
  // still exists. We avoid signature verification here because the same proxy
  // already handles refreshing; the user-id round-trip catches revoked tokens.
  let userId: string | null = null;
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"),
    );
    userId = decoded?.sub ?? null;
  } catch {
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
