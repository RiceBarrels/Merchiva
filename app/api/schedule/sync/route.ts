import { NextRequest, NextResponse } from "next/server";
import {
  getServiceConn,
  serviceRecordScheduleSync,
  subscribeAndWait,
} from "@/lib/spacetimedb/service-client";
import { scheduleProviderLabel } from "@/lib/schedule-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SyncBody = {
  organizationId?: string;
};

type SettingsRow = {
  organizationId: string;
  scheduleProvider?: string | null;
  scheduleConnected?: boolean | null;
  scheduleCompanyGuid?: string | null;
  scheduleCompanyId?: string | null;
  scheduleLocationId?: string | null;
};

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function countRows(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "shifts", "results"]) {
      if (Array.isArray(obj[key])) return obj[key].length;
    }
  }
  return 0;
}

async function issue7shiftsToken(): Promise<string> {
  const clientId = process.env.SEVENSHIFTS_CLIENT_ID;
  const clientSecret = process.env.SEVENSHIFTS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("7shifts credentials are not configured");
  }

  const tokenRes = await fetch("https://app.7shifts.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: process.env.SEVENSHIFTS_SCOPES || "v1_access shifts:read users:read roles:read locations:read",
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    throw new Error(`7shifts token failed: ${tokenRes.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const tokenData = await tokenRes.json();
  if (typeof tokenData.access_token !== "string" || !tokenData.access_token) {
    throw new Error("7shifts token response did not include access_token");
  }
  return tokenData.access_token;
}

async function sync7shifts(settings: SettingsRow): Promise<string> {
  if (!settings.scheduleCompanyGuid || !settings.scheduleCompanyId) {
    throw new Error("7shifts company grant is missing");
  }

  const token = await issue7shiftsToken();
  const apiVersion = process.env.SEVENSHIFTS_API_VERSION || "2025-03-01";
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "x-company-guid": settings.scheduleCompanyGuid,
    "x-api-version": apiVersion,
  };

  const whoami = await fetch("https://api.7shifts.com/v2/whoami", { headers });
  if (!whoami.ok) {
    const detail = await whoami.text().catch(() => "");
    throw new Error(`7shifts whoami failed: ${whoami.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const url = new URL(`https://api.7shifts.com/v2/company/${encodeURIComponent(settings.scheduleCompanyId)}/shifts`);
  url.searchParams.set("start[gte]", isoDaysFromNow(-1));
  url.searchParams.set("start[lte]", isoDaysFromNow(14));
  url.searchParams.set("include_draft", "true");
  url.searchParams.set("limit", "200");
  if (settings.scheduleLocationId) {
    url.searchParams.set("location_id", settings.scheduleLocationId);
  }

  const shiftsRes = await fetch(url, { headers });
  if (!shiftsRes.ok) {
    const detail = await shiftsRes.text().catch(() => "");
    throw new Error(`7shifts shifts failed: ${shiftsRes.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }

  const shiftsPayload = await shiftsRes.json();
  const count = countRows(shiftsPayload);
  return `Pulled ${count} shifts from 7shifts for the next 14 days. Mapping to Merchiva shifts is pending staff/location matching.`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as SyncBody;
  const organizationId = body.organizationId?.trim();
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  let conn;
  try {
    conn = await getServiceConn();
    await subscribeAndWait(conn, ["SELECT * FROM settings"]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `service connection: ${msg}` }, { status: 500 });
  }

  const settings = ([...conn.db.settings.iter()] as SettingsRow[])
    .find((row) => row.organizationId === organizationId);
  if (!settings) {
    return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  }
  const provider = settings.scheduleProvider || "built_in";
  try {
    let summary: string;
    if (provider === "built_in") {
      summary = "Using Merchiva built-in schedule. No external schedule sync is needed.";
    } else if (!settings.scheduleConnected) {
      throw new Error("No external schedule software connected");
    } else if (provider === "7shifts") {
      summary = await sync7shifts(settings);
    } else {
      throw new Error(`${scheduleProviderLabel(provider)} sync is not available yet`);
    }

    await serviceRecordScheduleSync(conn, {
      organizationId,
      provider,
      status: "success",
      summary,
    });

    return NextResponse.json({ success: true, provider, message: summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[schedule/sync] failed:", msg);
    await serviceRecordScheduleSync(conn, {
      organizationId,
      provider,
      status: "failed",
      summary: msg,
    }).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
