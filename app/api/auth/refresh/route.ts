import { NextRequest } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

export const OPTIONS = handleOptions;

export async function POST(req: NextRequest) {
  try {
    const { refreshToken } = await req.json();

    if (!refreshToken) {
      return jsonWithCors(req, { error: "Missing refresh token" }, { status: 400 });
    }

    const result = await workos.userManagement.authenticateWithRefreshToken({
      clientId,
      refreshToken,
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
    const message = error.message ?? "Token refresh failed";
    // Only report 401 when WorkOS definitively rejected the refresh token
    // (invalid/expired/already-used grant). Anything else — WorkOS outage,
    // rate limit, network — is transient: return 502 so the client keeps the
    // session and retries later instead of logging the user out.
    const code = error.error ?? error.code ?? error.rawData?.error;
    const status = typeof error.status === "number" ? error.status : undefined;
    const invalidGrant =
      code === "invalid_grant" ||
      code === "invalid_refresh_token" ||
      status === 400 ||
      status === 401 ||
      status === 403;
    return jsonWithCors(req, { error: message, code }, { status: invalidGrant ? 401 : 502 });
  }
}
