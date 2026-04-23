import { NextRequest, NextResponse } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const result = await workos.userManagement.authenticateWithPassword({
      clientId,
      email,
      password,
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

    if (error.code === "email_verification_required") {
      return NextResponse.json(
        {
          emailVerificationRequired: true,
          pendingAuthenticationToken: error.pendingAuthenticationToken,
        },
        { status: 403 },
      );
    }

    if (error.code === "mfa_challenge") {
      return NextResponse.json(
        {
          mfaRequired: true,
          pendingAuthenticationToken: error.pendingAuthenticationToken,
          authenticationFactors: error.authenticationFactors,
        },
        { status: 403 },
      );
    }

    const message =
      error.message ?? error.rawData?.message ?? "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
