import { NextRequest, NextResponse } from "next/server";
import {
  getServiceConn,
  serviceSetScheduleIntegration,
} from "@/lib/spacetimedb/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OAuthState = {
  nonce: string;
  provider: "7shifts";
  organizationId: string;
};

function parseState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthState>;
    if (
      parsed.provider === "7shifts" &&
      typeof parsed.organizationId === "string" &&
      typeof parsed.nonce === "string"
    ) {
      return parsed as OAuthState;
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/~/settings", req.url);
  const state = parseState(req.cookies.get("schedule_oauth_state")?.value);
  const returnedState = req.nextUrl.searchParams.get("state");
  const guid = req.nextUrl.searchParams.get("guid");
  const companyId = req.nextUrl.searchParams.get("company_id");

  const redirect = (code: string) => {
    settingsUrl.searchParams.set("schedule_error", code);
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete({ name: "schedule_oauth_state", path: "/api/schedule" });
    return res;
  };

  if (!state || state.nonce !== returnedState) {
    return redirect("state_mismatch");
  }
  if (!guid || !companyId) {
    return redirect("missing_7shifts_grant");
  }

  try {
    const conn = await getServiceConn();
    await serviceSetScheduleIntegration(conn, {
      organizationId: state.organizationId,
      provider: "7shifts",
      companyGuid: guid,
      companyId,
      status: "connected",
      summary: "7shifts connected",
    });
  } catch (err) {
    console.error("[schedule/callback] failed:", err);
    return redirect("save_failed");
  }

  settingsUrl.searchParams.set("schedule_connected", "7shifts");
  const res = NextResponse.redirect(settingsUrl);
  res.cookies.delete({ name: "schedule_oauth_state", path: "/api/schedule" });
  return res;
}
