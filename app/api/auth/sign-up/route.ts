import { NextRequest } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";
import { normalizeWorkOSError } from "@/lib/auth/workos-errors";

export const OPTIONS = handleOptions;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-up flow:
 *   1. createUser(email, password)
 *      - email already taken → try to sign in with the supplied password. This
 *        rescues the common "my first attempt errored after the user was
 *        created" case: a correct password either signs them in or drops them
 *        back into email verification. A wrong password → 409 email_exists.
 *   2. authenticateWithPassword
 *      - email_verification_required → return pending token (normal path)
 *      - any other failure → delete the user we just created so the next
 *        attempt doesn't hit "email not available", then surface the error.
 */
export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return jsonWithCors(req, { error: "Invalid request body", code: "invalid_email" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return jsonWithCors(
      req,
      { error: "Please enter a valid email address.", code: "invalid_email" },
      { status: 400 },
    );
  }
  if (!password) {
    return jsonWithCors(
      req,
      { error: "Password is required.", code: "weak_password" },
      { status: 400 },
    );
  }

  const authenticate = () =>
    workos.userManagement.authenticateWithPassword({
      clientId,
      email,
      password,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

  // ── 1. Create the user ──────────────────────────────────────────
  let userId: string | null = null;
  try {
    const user = await workos.userManagement.createUser({
      email,
      password,
      emailVerified: false,
    });
    userId = user.id;
  } catch (err: unknown) {
    const norm = normalizeWorkOSError(err, "Registration failed");

    if (norm.code === "email_exists") {
      // Existing account — see if the supplied password is theirs.
      try {
        const result = await authenticate();
        return jsonWithCors(req, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        });
      } catch (authErr: unknown) {
        const authNorm = normalizeWorkOSError(authErr);
        if (authNorm.code === "email_verification_required") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = authErr as any;
          return jsonWithCors(req, {
            pendingVerification: true,
            pendingAuthenticationToken: e.pendingAuthenticationToken ?? e.rawData?.pending_authentication_token,
            userId: e.rawData?.user?.id ?? null,
            email,
          });
        }
        if (authNorm.code === "sso_required") {
          return jsonWithCors(req, { error: authNorm.message, code: authNorm.code }, { status: 400 });
        }
        // Wrong password (or anything else): tell them the account exists.
        return jsonWithCors(req, { error: norm.message, code: "email_exists" }, { status: 409 });
      }
    }

    console.error("[sign-up] createUser failed", { email, code: norm.raw, message: norm.message });
    return jsonWithCors(req, { error: norm.message, code: norm.code }, { status: norm.status });
  }

  // ── 2. Authenticate (normally yields email_verification_required) ──
  try {
    const result = await authenticate();
    return jsonWithCors(req, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (authErr: unknown) {
    const norm = normalizeWorkOSError(authErr, "Registration failed");

    if (norm.code === "email_verification_required") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = authErr as any;
      return jsonWithCors(req, {
        pendingVerification: true,
        pendingAuthenticationToken: e.pendingAuthenticationToken ?? e.rawData?.pending_authentication_token,
        userId,
        email,
      });
    }

    // Anything else means the account is unusable as created. Roll it back so
    // a retry doesn't fail with "email not available".
    try {
      await workos.userManagement.deleteUser(userId);
    } catch (delErr) {
      console.error("[sign-up] rollback deleteUser failed", { userId, delErr });
    }
    console.error("[sign-up] authenticate failed after create", { email, code: norm.raw, message: norm.message });
    return jsonWithCors(req, { error: norm.message, code: norm.code }, { status: norm.status });
  }
}
