import { NextRequest, NextResponse } from "next/server";
import {
  getServiceConn,
  subscribeAndWait,
  getEnabledBriefingPrefs,
  getAdminOrgsForUser,
  serviceSaveDailyBriefing,
  serviceCreateNotification,
} from "@/lib/spacetimedb/service-client";
import { buildBriefingContext } from "@/lib/insights/build-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Briefing generation calls the LLM per org — give it room.
export const maxDuration = 300;

// ─── Timezone helpers ──────────────────────────────────────────────────────────

/** Current hour (0–23) in the given IANA timezone, or null if tz is invalid. */
function hourInTimezone(tz: string, now: Date): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    });
    const h = fmt.formatToParts(now).find((p) => p.type === "hour")?.value;
    if (h == null) return null;
    const n = parseInt(h, 10);
    // Intl can emit "24" for midnight in some environments — normalize.
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

/** YYYY-MM-DD for the given timezone (en-CA formats as ISO date). */
function dateInTimezone(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// ─── Localized notification copy ────────────────────────────────────────────────

const NOTIF_COPY: Record<string, { title: string; body: string }> = {
  en: { title: "Your morning briefing is ready", body: "Tap to see today's highlights." },
  zh: { title: "今日晨间简报已就绪", body: "点击查看今天的重点。" },
  es: { title: "Tu informe matutino está listo", body: "Toca para ver lo más importante de hoy." },
  fr: { title: "Votre briefing du matin est prêt", body: "Touchez pour voir les points clés du jour." },
  ar: { title: "ملخصك الصباحي جاهز", body: "اضغط لرؤية أبرز أحداث اليوم." },
  hi: { title: "आपकी सुबह की ब्रीफिंग तैयार है", body: "आज की मुख्य बातें देखने के लिए टैप करें।" },
};

// ─── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const origin = req.nextUrl.origin;

  let conn;
  try {
    conn = await getServiceConn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/morning-briefing] service connection failed:", msg);
    return NextResponse.json({ error: `service connection: ${msg}` }, { status: 500 });
  }

  // Snapshot every table the context builder + idempotency checks read.
  try {
    await subscribeAndWait(conn, [
      "SELECT * FROM user",
      "SELECT * FROM user_briefing_pref",
      "SELECT * FROM org_member",
      "SELECT * FROM daily_briefing",
      "SELECT * FROM staff_member",
      "SELECT * FROM inventory_item",
      "SELECT * FROM shift",
      "SELECT * FROM time_off_request",
      "SELECT * FROM shift_trade",
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/morning-briefing] subscription failed:", msg);
    return NextResponse.json({ error: `subscription: ${msg}` }, { status: 500 });
  }

  const prefs = await getEnabledBriefingPrefs(conn);

  // Only users whose configured hour matches the current hour in their tz.
  const due = prefs.filter((p) => {
    const targetHour = parseInt((p.briefingTime ?? "").slice(0, 2), 10);
    if (!Number.isFinite(targetHour)) return false;
    return hourInTimezone(p.timezone, now) === targetHour;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (table: string): any[] => [...(conn.db as any)[table].iter()];
  const users = allRows("user");
  const staffMembers = allRows("staffMember");
  const inventoryItems = allRows("inventoryItem");
  const shifts = allRows("shift");
  const timeOff = allRows("timeOffRequest");
  const shiftTrades = allRows("shiftTrade");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const briefings = allRows("dailyBriefing");

  let generated = 0;
  let notified = 0;
  let skipped = 0;
  const errors: string[] = [];
  // Dedup briefing generation across multiple admins of the same org in one run.
  const generatedThisRun = new Set<string>();

  for (const pref of due) {
    const userHex = pref.userId.toHexString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = users.find((u: any) => u.identity?.toHexString?.() === userHex);
    const locale = (user?.locale as string | undefined) ?? "en";
    const date = dateInTimezone(pref.timezone, now);
    const orgs = getAdminOrgsForUser(conn, pref.userId);

    for (const orgId of orgs) {
      const briefingKey = `${orgId}:${date}`;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exists = briefings.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (b: any) => b.organizationId === orgId && b.date === date,
        );

        if (!exists && !generatedThisRun.has(briefingKey)) {
          const context = buildBriefingContext(
            { staffMembers, inventoryItems, shifts, timeOff, shiftTrades },
            orgId,
            date,
          );
          const res = await fetch(`${origin}/api/insights/morning-briefing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context, lang: locale, dateStr: date }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            errors.push(`gen ${briefingKey}: ${e.error ?? res.status}`);
            continue;
          }
          const data = (await res.json()) as {
            summary: string;
            content: string;
            date: string;
            generatedBy: string;
          };
          await serviceSaveDailyBriefing(conn, {
            organizationId: orgId,
            date: data.date,
            content: data.content,
            summary: data.summary,
            generatedBy: data.generatedBy,
          });
          generatedThisRun.add(briefingKey);
          generated++;
        } else {
          skipped++;
        }

        // Notify the user that the briefing is ready (once — the hour match
        // only fires one cron run per day per user).
        const copy = NOTIF_COPY[locale] ?? NOTIF_COPY.en;
        await serviceCreateNotification(conn, {
          organizationId: orgId,
          targetIdentity: pref.userId,
          type: "briefing",
          title: copy.title,
          body: copy.body,
          link: "/~/dashboard",
        });
        notified++;
      } catch (err) {
        errors.push(`${briefingKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(
    `[cron/morning-briefing] due=${due.length} generated=${generated} notified=${notified} skipped=${skipped} errors=${errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    triggeredAt: now.toISOString(),
    due: due.length,
    generated,
    notified,
    skipped,
    errors,
  });
}

// Vercel cron probes use GET to confirm registration; just echo metadata.
export async function GET() {
  return NextResponse.json({
    name: "Morning Briefing Cron",
    schedule: "Hourly — fires per-user at their configured local time",
    triggers: "Service-side briefing generation + in-app notification",
  });
}
