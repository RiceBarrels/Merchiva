import { NextRequest, NextResponse } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const user = await workos.userManagement.createUser({
      email,
      password,
      emailVerified: false,
    });

    // Attempt to authenticate — WorkOS will send a verification email
    // and return a pending token if email is unverified.
    try {
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
    } catch (authErr: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authError = authErr as any;
      if (authError.code === "email_verification_required") {
        return NextResponse.json({
          pendingVerification: true,
          pendingAuthenticationToken: authError.pendingAuthenticationToken,
          userId: user.id,
          email: user.email,
        });
      }
      throw authErr;
    }
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    const message =
      error.message ?? error.rawData?.message ?? "Registration failed";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
