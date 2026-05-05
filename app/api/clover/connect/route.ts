import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getCloverOAuthUrl, getCloverEnvironment } from "@/lib/clover";

/**
 * GET /api/clover/connect
 *
 * Initiates the Clover OAuth flow by redirecting the user to Clover's
 * authorization page. A random state token is stored in an httpOnly cookie
 * for CSRF verification in the callback.
 */
export async function GET() {
  const clientId = process.env.CLOVER_APP_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "CLOVER_APP_ID is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not configured" },
      { status: 500 },
    );
  }

  const redirectUri = `${appUrl}/api/clover/callback`;
  const state = randomBytes(32).toString("hex");
  const env = getCloverEnvironment();
  const oauthBase = getCloverOAuthUrl(env);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  const authorizeUrl = `${oauthBase}/oauth/v2/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authorizeUrl);

  // Store state in an httpOnly cookie for CSRF verification in the callback
  response.cookies.set("clover_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/clover",
    maxAge: 600, // 10 minutes
  });

  return response;
}
