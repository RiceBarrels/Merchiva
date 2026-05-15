import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily cron entry point for morning briefings.
 *
 * STATUS: stub. The briefing itself is generated client-side (see
 * components/morning-briefing-card.tsx) the first time the owner opens the
 * dashboard each day, so the briefing data path works without server-side
 * SpacetimeDB.
 *
 * What this route needs to do once we have a service identity for SpacetimeDB:
 *   1. Iterate active organizations
 *   2. For each org, build a server-side store context
 *   3. POST that to /api/insights/morning-briefing
 *   4. Save the result through a service-authed saveDailyBriefing
 *   5. Send the owner an email via sendMorningReminderEmail (lib/email/resend.ts)
 *
 * For now we just authenticate the cron call (so the endpoint isn't exposed
 * publicly) and return success.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: server-side org iteration + email reminder.
  console.log("[cron/morning-briefing] tick — server-side iteration not yet wired");

  return NextResponse.json({
    ok: true,
    note: "Briefings are generated client-side on dashboard mount. Server-side iteration pending a SpacetimeDB service identity.",
    triggeredAt: new Date().toISOString(),
  });
}

// Vercel cron probes use GET to confirm registration; just echo metadata.
export async function GET() {
  return NextResponse.json({
    name: "Morning Briefing Cron",
    schedule: "Daily at 06:00 UTC",
    triggers: "Client-side briefing + (TODO) email reminder via Resend",
  });
}
