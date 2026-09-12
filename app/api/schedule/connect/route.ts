import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeScheduleProvider } from "@/lib/schedule-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OAuthState = {
  nonce: string;
  provider: "7shifts";
  organizationId: string;
};

export async function GET(req: NextRequest) {
  const provider = normalizeScheduleProvider(req.nextUrl.searchParams.get("provider"));
  const organizationId = req.nextUrl.searchParams.get("orgId")?.trim();
  const settingsUrl = new URL("/manager/settings", req.url);

  if (!organizationId) {
    settingsUrl.searchParams.set("schedule_error", "missing_org");
    return NextResponse.redirect(settingsUrl);
  }

  if (provider !== "7shifts") {
    settingsUrl.searchParams.set("schedule_error", "provider_unavailable");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.SEVENSHIFTS_CLIENT_ID;
  if (!clientId) {
    settingsUrl.searchParams.set("schedule_error", "missing_7shifts_client");
    return NextResponse.redirect(settingsUrl);
  }

  const state: OAuthState = {
    nonce: randomBytes(24).toString("hex"),
    provider,
    organizationId,
  };

  const authorizeUrl = new URL("https://app.7shifts.com/generate_token");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("state", state.nonce);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("schedule_oauth_state", JSON.stringify(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/schedule",
    maxAge: 600,
  });
  return res;
}
