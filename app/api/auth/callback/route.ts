import { NextRequest, NextResponse } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  let redirectTo = "/dashboard";
  if (state) {
    try {
      const parsed = JSON.parse(
        Buffer.from(state, "base64url").toString("utf-8"),
      );
      if (parsed.redirectTo) redirectTo = parsed.redirectTo;
    } catch {}
  }

  try {
    const result = await workos.userManagement.authenticateWithCode({
      clientId,
      code,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    const params = new URLSearchParams({
      access_token: result.accessToken!,
      refresh_token: result.refreshToken!,
      user: JSON.stringify({
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      }),
      redirect_to: redirectTo,
    });

    return NextResponse.redirect(
      new URL(`/auth-callback?${params.toString()}`, req.url),
    );
  } catch (err: unknown) {
    console.error("[auth/callback] OAuth error:", err);
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", req.url),
    );
  }
}
