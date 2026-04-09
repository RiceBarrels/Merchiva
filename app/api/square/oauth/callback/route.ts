import { NextRequest, NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const settingsUrl = new URL("/settings", request.url);

  // Clear the state cookie regardless of outcome
  const clearCookie = (res: NextResponse) => {
    res.cookies.set("square_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/square/oauth",
      maxAge: 0,
    });
    return res;
  };

  // User denied access on Square
  if (error) {
    settingsUrl.searchParams.set("error", "oauth_denied");
    return clearCookie(NextResponse.redirect(settingsUrl));
  }

  // CSRF validation
  const storedState = request.cookies.get("square_oauth_state")?.value;
  if (!state || !storedState || state !== storedState) {
    settingsUrl.searchParams.set("error", "invalid_state");
    return clearCookie(NextResponse.redirect(settingsUrl));
  }

  if (!code) {
    settingsUrl.searchParams.set("error", "no_code");
    return clearCookie(NextResponse.redirect(settingsUrl));
  }

  // Verify user is authenticated
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return clearCookie(
      NextResponse.redirect(new URL("/login", request.url))
    );
  }

  try {
    // Exchange authorization code for tokens
    const square = new SquareClient({
      environment: SquareEnvironment.Production,
    });

    const tokenResponse = await square.oAuth.obtainToken({
      clientId: process.env.SQUARE_APP_ID!,
      clientSecret: process.env.SQUARE_APP_SECRET!,
      code,
      grantType: "authorization_code",
      redirectUri: process.env.SQUARE_REDIRECT_URI,
    });

    if (!tokenResponse.accessToken) {
      settingsUrl.searchParams.set("error", "token_exchange_failed");
      return clearCookie(NextResponse.redirect(settingsUrl));
    }

    // Fetch locations to auto-select if only one
    const authedSquare = new SquareClient({
      token: tokenResponse.accessToken,
      environment: SquareEnvironment.Production,
    });

    const locationsResponse = await authedSquare.locations.list();
    const locations = (locationsResponse.locations ?? []).filter(
      (l) => l.status === "ACTIVE"
    );

    const singleLocation = locations.length === 1 ? locations[0] : null;

    // Store tokens in settings
    await supabase.from("settings").upsert(
      {
        user_id: user.id,
        square_access_token: tokenResponse.accessToken,
        square_refresh_token: tokenResponse.refreshToken ?? null,
        square_token_expires_at: tokenResponse.expiresAt ?? null,
        square_merchant_id: tokenResponse.merchantId ?? null,
        square_location_id: singleLocation?.id ?? null,
        square_connected: true,
      },
      { onConflict: "user_id" }
    );

    if (singleLocation) {
      settingsUrl.searchParams.set("connected", "true");
    } else if (locations.length > 1) {
      settingsUrl.searchParams.set("pickLocation", "true");
    } else {
      settingsUrl.searchParams.set("connected", "true");
    }

    return clearCookie(NextResponse.redirect(settingsUrl));
  } catch (err) {
    console.error("[square/oauth/callback]", err);
    settingsUrl.searchParams.set("error", "exchange_failed");
    return clearCookie(NextResponse.redirect(settingsUrl));
  }
}
