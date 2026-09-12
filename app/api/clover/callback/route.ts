import { NextRequest, NextResponse } from "next/server";
import { getCloverOAuthUrl, getCloverEnvironment } from "@/lib/clover";

/**
 * GET /api/clover/callback
 *
 * Handles the OAuth callback from Clover:
 * 1. Verifies the state parameter matches the stored cookie (CSRF protection).
 * 2. Exchanges the authorization code for an access token.
 * 3. Stores the access token + merchant ID in httpOnly cookies.
 * 4. Sets a client-readable cookie so the UI can detect the connection.
 * 5. Redirects to /settings with a success query parameter.
 */
export async function GET(request: NextRequest) {
  const settingsUrl = new URL("/manager/settings", request.url);

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const merchantId = searchParams.get("merchant_id");

    // ─── Validate required params ──────────────────────────────────
    if (!code || !state) {
      settingsUrl.searchParams.set("clover_error", "missing_params");
      return NextResponse.redirect(settingsUrl);
    }

    // ─── CSRF verification ─────────────────────────────────────────
    const storedState = request.cookies.get("clover_oauth_state")?.value;
    if (!storedState || storedState !== state) {
      settingsUrl.searchParams.set("clover_error", "state_mismatch");
      return NextResponse.redirect(settingsUrl);
    }

    // ─── Exchange code for access token ────────────────────────────
    const clientId = process.env.CLOVER_APP_ID;
    const clientSecret = process.env.CLOVER_APP_SECRET;

    if (!clientId || !clientSecret) {
      settingsUrl.searchParams.set("clover_error", "missing_credentials");
      return NextResponse.redirect(settingsUrl);
    }

    const env = getCloverEnvironment();
    const oauthBase = getCloverOAuthUrl(env);
    const tokenUrl = `${oauthBase}/oauth/v2/token`;

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text().catch(() => "");
      console.error("[Clover OAuth] Token exchange failed:", tokenRes.status, errorBody);
      settingsUrl.searchParams.set("clover_error", "token_exchange_failed");
      return NextResponse.redirect(settingsUrl);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string | undefined = tokenData.access_token;

    if (!accessToken) {
      console.error("[Clover OAuth] No access_token in response:", tokenData);
      settingsUrl.searchParams.set("clover_error", "no_access_token");
      return NextResponse.redirect(settingsUrl);
    }

    // ─── Determine merchant ID ─────────────────────────────────────
    // Clover provides merchant_id in the callback URL or in the token response
    const resolvedMerchantId =
      merchantId ?? tokenData.merchant_id ?? null;

    // ─── Store credentials in httpOnly cookies ─────────────────────
    settingsUrl.searchParams.set("clover_connected", "true");
    const response = NextResponse.redirect(settingsUrl);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    };

    response.cookies.set("clover_access_token", accessToken, cookieOptions);

    if (resolvedMerchantId) {
      response.cookies.set("clover_merchant_id", resolvedMerchantId, cookieOptions);
    }

    // Client-readable cookie so the UI can detect the connection
    response.cookies.set("clover_connected", "true", {
      ...cookieOptions,
      httpOnly: false,
    });

    // Clear the CSRF state cookie
    response.cookies.delete({
      name: "clover_oauth_state",
      path: "/api/clover",
    });

    return response;
  } catch (err) {
    console.error("[Clover OAuth] Unexpected error:", err);
    settingsUrl.searchParams.set("clover_error", "unexpected_error");
    return NextResponse.redirect(settingsUrl);
  }
}
