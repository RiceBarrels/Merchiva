import { NextRequest, NextResponse } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";

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

    return NextResponse.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    const message =
      error.message ?? error.rawData?.message ?? "Verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
