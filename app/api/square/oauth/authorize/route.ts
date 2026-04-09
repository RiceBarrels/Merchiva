import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const SCOPES = "ITEMS_READ INVENTORY_READ ORDERS_READ MERCHANT_PROFILE_READ";

export async function GET() {
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    client_id: process.env.SQUARE_APP_ID!,
    scope: SCOPES,
    session: "false",
    state,
  });

  if (process.env.SQUARE_REDIRECT_URI) {
    params.set("redirect_uri", process.env.SQUARE_REDIRECT_URI);
  }

  const authorizeUrl = `https://connect.squareup.com/oauth2/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set("square_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/square/oauth",
    maxAge: 600, // 10 minutes
  });

  return response;
}
