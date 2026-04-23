import { NextRequest } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

export const OPTIONS = handleOptions;

export async function POST(req: NextRequest) {
  try {
    const { code, pendingAuthenticationToken } = await req.json();

    const result =
      await workos.userManagement.authenticateWithEmailVerification({
        clientId,
        code,
        pendingAuthenticationToken,
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
    const message =
      error.message ?? error.rawData?.message ?? "Verification failed";
    return jsonWithCors(req, { error: message }, { status: 400 });
  }
}
