import { NextRequest, NextResponse } from "next/server";
import {
  getServiceConn,
  subscribeAndWait,
  getEnabledBriefingPrefs,
  getAdminOrgsForUser,
  serviceSaveDailyBriefing,
  serviceCreateNotification,
} from "@/lib/spacetimedb/service-client";
import { buildBriefingContext, briefingProblemKeys } from "@/lib/insights/build-context";

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
// Fired only when a NEW problem appears since the previous hourly run.

const NOTIF_COPY: Record<string, { title: string; body: (n: number) => string }> = {
  en: { title: "New issue needs your attention", body: (n) => `Mr. Merchiva spotted ${n} new ${n === 1 ? "issue" : "issues"} since the last check.` },
  zh: { title: "有新问题需要处理", body: (n) => `Mr. Merchiva 自上次检查以来发现了 ${n} 个新问题。` },
  es: { title: "Un nuevo problema requiere tu atención", body: (n) => `Mr. Merchiva detectó ${n} ${n === 1 ? "problema nuevo" : "problemas nuevos"} desde la última revisión.` },
  fr: { title: "Un nouveau problème requiert votre attention", body: (n) => `Mr. Merchiva a repéré ${n} ${n === 1 ? "nouveau problème" : "nouveaux problèmes"} depuis la dernière vérification.` },
  ar: { title: "مشكلة جديدة تتطلب انتباهك", body: (n) => `رصد Mr. Merchiva ${n} مشكلة جديدة منذ آخر فحص.` },
  hi: { title: "नई समस्या पर ध्यान दें", body: (n) => `Mr. Merchiva ने पिछली जाँच के बाद से ${n} नई समस्याएँ देखीं।` },
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
      "SELECT * FROM organization",
      "SELECT * FROM org_member",
      "SELECT * FROM daily_briefing",
      "SELECT * FROM staff_member",
      "SELECT * FROM inventory_item",
      "SELECT * FROM shift",
      "SELECT * FROM time_off_request",
      "SELECT * FROM shift_trade",
      // Richer context so the scheduled briefing surfaces the same signals the
      // right-panel Mr. Merchiva sees, plus yesterday's task evidence.
      "SELECT * FROM sales_record",
      "SELECT * FROM payment",
      "SELECT * FROM product",
      "SELECT * FROM staff_role",
      "SELECT * FROM role_task",
      "SELECT * FROM role_task_assignment",
      "SELECT * FROM notification",
      "SELECT * FROM shift_preset",
      "SELECT * FROM staff_availability",
      "SELECT * FROM coupon",
      "SELECT * FROM settings",
      "SELECT * FROM punch_event",
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/morning-briefing] subscription failed:", msg);
    return NextResponse.json({ error: `subscription: ${msg}` }, { status: 500 });
  }

  // Briefings are generated for EVERY active-admin org on EVERY hourly run —
  // independent of whether anyone is on the dashboard or of any per-user
  // "briefing hours". The enabled prefs below only decide who gets *notified*
  // when a new problem appears, so we never spam users who didn't opt in.
  const enabledPrefs = await getEnabledBriefingPrefs(conn);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (table: string): any[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (conn.db as any)[table];
    return t && typeof t.iter === "function" ? [...t.iter()] : [];
  };
  const users = allRows("user");
  const organizations = allRows("organization");
  const orgMembers = allRows("orgMember");
  const staffMembers = allRows("staffMember");
  const inventoryItems = allRows("inventoryItem");
  const shifts = allRows("shift");
  const timeOff = allRows("timeOffRequest");
  const shiftTrades = allRows("shiftTrade");
  const salesRecords = allRows("salesRecord");
  const payments = allRows("payment");
  const products = allRows("product");
  const staffRoles = allRows("staffRole");
  const roleTasks = allRows("roleTask");
  const roleTaskAssignments = allRows("roleTaskAssignment");
  const notifications = allRows("notification");
  const shiftPresets = allRows("shiftPreset");
  const staffAvailability = allRows("staffAvailability");
  const coupons = allRows("coupon");
  const settings = allRows("settings");
  const punchEvents = allRows("punchEvent");
  const briefings = allRows("dailyBriefing");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localeOf = (id: any): string => {
    const hex = id?.toHexString?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = users.find((x: any) => x.identity?.toHexString?.() === hex);
    return (u?.locale as string | undefined) ?? "en";
  };

  // Every org that has at least one ACTIVE owner/manager gets scanned this run.
  // (Derived from membership, not from prefs — the dashboard card shows for all
  //  admins, so every managed store should have a fresh hourly snapshot.)
  const orgLocale = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of orgMembers as any[]) {
    if (m.status !== "active") continue;
    if (m.role !== "owner" && m.role !== "manager") continue;
    const orgId = m.organizationId as string;
    if (!orgLocale.has(orgId)) orgLocale.set(orgId, localeOf(m.userId));
  }

  // Enabled admins per org — these (and only these) get a push notification when
  // a new problem appears, so disabling briefings still silences the alerts.
  const notifyByOrg = new Map<string, { pref: (typeof enabledPrefs)[number]; locale: string }[]>();
  for (const pref of enabledPrefs) {
    const locale = localeOf(pref.userId);
    for (const orgId of getAdminOrgsForUser(conn, pref.userId)) {
      const arr = notifyByOrg.get(orgId) ?? [];
      arr.push({ pref, locale });
      notifyByOrg.set(orgId, arr);
    }
  }

  // Org-local date/hour from the store's own timezone (settings), fallback UTC,
  // so each snapshot's `hour` is the store's local hour no matter who runs it.
  const tzForOrg = (orgId: string): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (settings as any[]).find((x) => x.organizationId === orgId);
    return (s?.timezone as string | undefined) || "UTC";
  };

  let generated = 0;
  let notified = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [orgId, locale] of orgLocale) {
    const tz = tzForOrg(orgId);
    const date = dateInTimezone(tz, now);
    const curHour = hourInTimezone(tz, now) ?? 0;
    try {
      // Problem keys from the most recent snapshot strictly BEFORE this hour
      // slot (this org). New keys vs that = problems that just appeared.
      const curRank = `${date}:${String(curHour).padStart(2, "0")}`;
      let prevKeys: string[] = [];
      let prevRank = "";
      for (const b of briefings) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = b as any;
        if (row.organizationId !== orgId) continue;
        const h = row.hour == null ? 0 : Number(row.hour);
        const rank = `${row.date}:${String(h).padStart(2, "0")}`;
        if (rank >= curRank || rank <= prevRank) continue;
        prevRank = rank;
        try {
          const a = JSON.parse(row.problemKeys ?? "[]");
          prevKeys = Array.isArray(a) ? a.map(String) : [];
        } catch {
          prevKeys = [];
        }
      }

      const context = buildBriefingContext(
        {
          organizations,
          orgMembers,
          staffMembers,
          inventoryItems,
          shifts,
          timeOff,
          shiftTrades,
          salesRecords,
          payments,
          products,
          staffRoles,
          roleTasks,
          roleTaskAssignments,
          notifications,
          shiftPresets,
          staffAvailability,
          coupons,
          settings,
          punchEvents,
        },
        orgId,
        date,
        locale,
      );
      const currentKeys = briefingProblemKeys(context);

      const res = await fetch(`${origin}/api/insights/morning-briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, lang: locale, dateStr: date, organizationId: orgId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        errors.push(`gen ${orgId}@${curHour}: ${e.error ?? res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        summary: string;
        content: string;
        date: string;
        generatedBy: string;
        actions?: unknown[];
      };
      await serviceSaveDailyBriefing(conn, {
        organizationId: orgId,
        date: data.date,
        content: data.content,
        summary: data.summary,
        generatedBy: data.generatedBy,
        actions: data.actions && data.actions.length ? JSON.stringify(data.actions) : undefined,
        problemKeys: JSON.stringify(currentKeys),
        hour: curHour,
      });
      generated++;

      // Notify enabled admins only when a NEW problem appeared this hour.
      const prevSet = new Set(prevKeys);
      const newCount = currentKeys.filter((k) => !prevSet.has(k)).length;
      if (newCount > 0) {
        for (const admin of notifyByOrg.get(orgId) ?? []) {
          const copy = NOTIF_COPY[admin.locale] ?? NOTIF_COPY.en;
          await serviceCreateNotification(conn, {
            organizationId: orgId,
            targetIdentity: admin.pref.userId,
            type: "briefing",
            title: copy.title,
            body: copy.body(newCount),
            link: "/~/dashboard",
          });
          notified++;
        }
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push(`${orgId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[cron/morning-briefing] orgs=${orgLocale.size} generated=${generated} notified=${notified} skipped=${skipped} errors=${errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    triggeredAt: now.toISOString(),
    orgs: orgLocale.size,
    generated,
    notified,
    skipped,
    errors,
  });
}

// Vercel cron probes use GET to confirm registration; just echo metadata.
export async function GET() {
  return NextResponse.json({
    name: "Merchiva Briefing Cron",
    schedule: "Hourly — scans every active-admin org each hour, regardless of who is online",
    triggers: "Service-side briefing refresh; notifies enabled managers only when a NEW problem appears",
  });
}
