import { NextRequest } from "next/server";
import { workos } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";
import { normalizeWorkOSError } from "@/lib/auth/workos-errors";

export const OPTIONS = handleOptions;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Re-send the 6-digit email verification code. Accepts either the WorkOS
 * userId returned by /api/auth/sign-up or the email address (looked up
 * server-side). Always responds 200 for unknown emails so this can't be used
 * to probe which addresses are registered.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let userId: string | null = typeof body?.userId === "string" ? body.userId : null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!userId) {
      if (!EMAIL_RE.test(email)) {
        return jsonWithCors(req, { error: "Email is required.", code: "invalid_email" }, { status: 400 });
      }
      const users = await workos.userManagement.listUsers({ email, limit: 1 });
      userId = users.data[0]?.id ?? null;
      if (!userId) return jsonWithCors(req, { ok: true });
    }

    await workos.userManagement.sendVerificationEmail({ userId });
    return jsonWithCors(req, { ok: true });
  } catch (err: unknown) {
    const norm = normalizeWorkOSError(err, "Could not resend the code");
    console.error("[resend-verification] failed", { code: norm.raw, message: norm.message });
    return jsonWithCors(req, { error: norm.message, code: norm.code }, { status: norm.status });
  }
}
