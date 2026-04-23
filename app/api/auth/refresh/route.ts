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
    return jsonWithCors(req, { error: message }, { status: 401 });
  }
}
