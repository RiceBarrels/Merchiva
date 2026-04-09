import { NextRequest, NextResponse } from "next/server";
import { getCloverBaseUrl } from "@/lib/clover/api";

interface CloverTokenResponse {
  access_token?: string;
  merchant_id?: string;
  token_type?: string;
  expires_in?: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  // Clover passes merchant_id as a query param alongside the code
  const merchantIdFromQuery = searchParams.get("merchant_id");

  const settingsUrl = new URL("/settings", request.url);

  if (!code) {
    settingsUrl.searchParams.set("clover_error", "no_code");
    return NextResponse.redirect(settingsUrl);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const redirectUri =
      process.env.CLOVER_REDIRECT_URI ??
      "https://project-management-phi-red.vercel.app/api/clover/callback";

    const tokenRes = await fetch(`${getCloverBaseUrl()}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.CLOVER_APP_ID!,
        client_secret: process.env.CLOVER_APP_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[clover/callback] token exchange failed:", tokenRes.status, await tokenRes.text());
      settingsUrl.searchParams.set("clover_error", "token_exchange_failed");
      return NextResponse.redirect(settingsUrl);
    }

    const tokenData = (await tokenRes.json()) as CloverTokenResponse;
    const accessToken = tokenData.access_token;
    const merchantId = tokenData.merchant_id ?? merchantIdFromQuery;

    if (!accessToken || !merchantId) {
      settingsUrl.searchParams.set("clover_error", "missing_token");
      return NextResponse.redirect(settingsUrl);
    }

    await supabase.from("settings").upsert(
      {
        user_id: user.id,
        clover_connected: true,
        clover_access_token: accessToken,
        clover_merchant_id: merchantId,
        clover_last_synced_at: null,
      },
      { onConflict: "user_id" }
    );

    settingsUrl.searchParams.set("clover_connected", "true");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[clover/callback]", err);
    settingsUrl.searchParams.set("clover_error", "exchange_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
