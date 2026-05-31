import { NextRequest } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

export const OPTIONS = handleOptions;

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return jsonWithCors(
        req,
        { error: "Email and code are required" },
        { status: 400 },
      );
    }

    const result = await workos.userManagement.authenticateWithMagicAuth({
      clientId,
      email,
      code,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return jsonWithCors(req, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;

    if (error.code === "mfa_challenge") {
      return jsonWithCors(
        req,
        {
          mfaRequired: true,
          pendingAuthenticationToken: error.pendingAuthenticationToken,
          authenticationFactors: error.authenticationFactors,
        },
        { status: 403 },
      );
    }

    const message =
      error.message ?? error.rawData?.message ?? "Invalid magic code";
    return jsonWithCors(req, { error: message }, { status: 401 });
  }
}
