import { NextRequest, NextResponse } from "next/server";
import {
  getSubscribedServiceConn,
  getEnabledBriefingPrefs,
  getAdminOrgsForUser,
  serviceSaveDailyBriefing,
  serviceCreateNotification,
  serviceAppendAiChatMessage,
} from "@/lib/spacetimedb/service-client";
import { buildBriefingContext, briefingProblemKeys } from "@/lib/insights/build-context";
import { productsFromInventoryRows } from "@/lib/products/from-inventory";
import { buildFallbackBriefing } from "@/lib/insights/fallback-briefing";
import { sendWebPush } from "@/lib/push/send";

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

/** Minutes since local midnight (0–1439) in the given IANA timezone. */
function minutesInTimezone(tz: string, now: Date): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h % 24) * 60 + m;
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

function timeInTimezone(tz: string, now: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
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

const CHAT_COPY: Record<
  string,
  { title: string; body: (total: number, newCount: number, summary: string) => string }
> = {
  en: {
    title: "Hourly patrol",
    body: (total, newCount, summary) =>
      `Hourly patrol found ${total} current ${total === 1 ? "issue" : "issues"}${newCount > 0 ? `, including ${newCount} new since the last check` : ""}.\n\n${summary}`,
  },
  zh: {
    title: "每小时巡查",
    body: (total, newCount, summary) =>
      `每小时巡查发现 ${total} 个当前异常${newCount > 0 ? `，其中 ${newCount} 个是上次检查后新出现的` : ""}。\n\n${summary}`,
  },
  es: {
    title: "Revisión por hora",
    body: (total, newCount, summary) =>
      `La revisión por hora encontró ${total} ${total === 1 ? "problema activo" : "problemas activos"}${newCount > 0 ? `, incluyendo ${newCount} nuevo(s) desde la última revisión` : ""}.\n\n${summary}`,
  },
  fr: {
    title: "Ronde horaire",
    body: (total, newCount, summary) =>
      `La ronde horaire a trouvé ${total} ${total === 1 ? "problème actif" : "problèmes actifs"}${newCount > 0 ? `, dont ${newCount} nouveau(x) depuis la dernière vérification` : ""}.\n\n${summary}`,
  },
  ar: {
    title: "الفحص كل ساعة",
    body: (total, newCount, summary) =>
      `وجد الفحص كل ساعة ${total} مشكلة حالية${newCount > 0 ? `، منها ${newCount} مشكلة جديدة منذ آخر فحص` : ""}.\n\n${summary}`,
  },
  hi: {
    title: "हर घंटे की जाँच",
    body: (total, newCount, summary) =>
      `हर घंटे की जाँच में ${total} मौजूदा समस्याएँ मिलीं${newCount > 0 ? `, जिनमें ${newCount} पिछली जाँच के बाद नई हैं` : ""}।\n\n${summary}`,
  },
};

// Sent to the affected EMPLOYEE (not the admins) when a new forgot-to-clock-out
// incident appears — they're the one who can actually fix it.
const CLOCKOUT_COPY: Record<
  string,
  { title: string; overdue: (end: string, mins: number) => string; stale: (hours: number) => string }
> = {
  en: {
    title: "Forgot to clock out?",
    overdue: (end, mins) => `Your shift ended at ${end} but you're still clocked in (${mins} min over). Please punch out, or ask a manager to correct the record.`,
    stale: (hours) => `You've been clocked in for ${hours} hours with no scheduled shift. If you're done working, please punch out.`,
  },
  zh: {
    title: "忘记打下班卡了吗？",
    overdue: (end, mins) => `你的班次 ${end} 已结束，但你仍处于上班状态（已超出 ${mins} 分钟）。请打下班卡，或请经理修正记录。`,
    stale: (hours) => `你已连续处于上班状态 ${hours} 小时且当天没有排班。如果已经下班，请打下班卡。`,
  },
  es: {
    title: "¿Olvidaste fichar la salida?",
    overdue: (end, mins) => `Tu turno terminó a las ${end} pero sigues fichado (${mins} min de más). Ficha la salida o pide a un gerente que corrija el registro.`,
    stale: (hours) => `Llevas ${hours} horas fichado sin turno programado. Si ya terminaste, ficha la salida.`,
  },
  fr: {
    title: "Oubli de pointage de sortie ?",
    overdue: (end, mins) => `Votre service s'est terminé à ${end} mais vous êtes toujours pointé (${mins} min de plus). Pointez votre sortie ou demandez à un manager de corriger.`,
    stale: (hours) => `Vous êtes pointé depuis ${hours} heures sans service prévu. Si vous avez terminé, pointez votre sortie.`,
  },
  ar: {
    title: "هل نسيت تسجيل الانصراف؟",
    overdue: (end, mins) => `انتهت وردية عملك في ${end} لكنك ما زلت مسجلاً في العمل (${mins} دقيقة إضافية). سجّل الانصراف أو اطلب من المدير تصحيح السجل.`,
    stale: (hours) => `أنت مسجل في العمل منذ ${hours} ساعة دون وردية مجدولة. إذا انتهيت من العمل فسجّل الانصراف.`,
  },
  hi: {
    title: "क्लॉक-आउट करना भूल गए?",
    overdue: (end, mins) => `आपकी शिफ्ट ${end} बजे खत्म हो गई, लेकिन आप अभी भी क्लॉक-इन हैं (${mins} मिनट ऊपर)। कृपया क्लॉक-आउट करें या मैनेजर से रिकॉर्ड ठीक करने को कहें।`,
    stale: (hours) => `आप ${hours} घंटे से क्लॉक-इन हैं और आज कोई शिफ्ट नहीं थी। यदि काम खत्म हो गया है तो कृपया क्लॉक-आउट करें।`,
  },
};

// Sent to each on-shift employee when one of their role tasks' time window
// starts — the "it's time, go do the task" nudge.
const TASK_REMINDER_COPY: Record<
  string,
  { title: string; body: (task: string, time: string) => string }
> = {
  en: {
    title: "Task due on your shift",
    body: (task, time) => `"${task}" (${time}) is due now. Please complete it and upload evidence if required.`,
  },
  zh: {
    title: "值班任务时间到了",
    body: (task, time) => `「${task}」（${time}）现在该做了。请及时完成，需要凭证的话记得上传。`,
  },
  es: {
    title: "Tarea pendiente en tu turno",
    body: (task, time) => `"${task}" (${time}) toca ahora. Complétala y sube evidencia si se requiere.`,
  },
  fr: {
    title: "Tâche à faire pendant votre service",
    body: (task, time) => `« ${task} » (${time}) est à faire maintenant. Merci de la réaliser et d'ajouter une preuve si demandé.`,
  },
  ar: {
    title: "حان وقت مهمة وردتك",
    body: (task, time) => `حان الآن موعد "${task}" (${time}). يرجى إنجازها ورفع إثبات إذا كان مطلوبًا.`,
  },
  hi: {
    title: "आपकी शिफ्ट का टास्क समय",
    body: (task, time) => `"${task}" (${time}) का समय हो गया है। कृपया इसे पूरा करें और आवश्यक हो तो प्रमाण अपलोड करें।`,
  },
};

function normalizedLocale(locale: string): string {
  const key = locale.toLowerCase().split(/[-_]/)[0];
  return key in NOTIF_COPY ? key : "en";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "object" && "microsSinceUnixEpoch" in ts) {
    const micros = (ts as { microsSinceUnixEpoch: bigint | number }).microsSinceUnixEpoch;
    return typeof micros === "bigint" ? Number(micros / 1000n) : Number(micros) / 1000;
  }
  return 0;
}

/** "HH:MM" → minutes since midnight, or null when unparseable. */
function hhmmToMin(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

// ─── Route ──────────────────────────────────────────────────────────────────────

async function runHourlyPatrol(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const origin = req.nextUrl.origin;

  // Snapshot every table the context builder + idempotency checks read.
  // getSubscribedServiceConn retries once on a fresh connection, so a stale
  // warm socket doesn't kill the hour's patrol.
  let conn;
  try {
    conn = await getSubscribedServiceConn([
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
      "SELECT * FROM staff_role",
      "SELECT * FROM role_task",
      "SELECT * FROM role_task_assignment",
      "SELECT * FROM notification",
      "SELECT * FROM shift_preset",
      "SELECT * FROM staff_availability",
      "SELECT * FROM coupon",
      "SELECT * FROM settings",
      "SELECT * FROM punch_event",
      // Web-push fan-out for on-shift task reminders.
      "SELECT * FROM push_subscription",
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
  // The product table no longer exists — retail-enabled inventory rows ARE the products.
  const products = productsFromInventoryRows(inventoryItems);
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
  const pushSubscriptions = allRows("pushSubscription");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localeOf = (id: any): string => {
    const hex = id?.toHexString?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = users.find((x: any) => x.identity?.toHexString?.() === hex);
    return (u?.locale as string | undefined) ?? "en";
  };

  // Every org that has at least one ACTIVE owner/manager gets scanned this run.
  // UI messages go to active owner/managers; push notifications are still gated
  // by briefing prefs below.
  const orgLocale = new Map<string, string>();
  const messageByOrg = new Map<
    string,
    { userId: (typeof enabledPrefs)[number]["userId"]; locale: string }[]
  >();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of orgMembers as any[]) {
    if (m.status !== "active") continue;
    if (m.role !== "owner" && m.role !== "manager") continue;
    const orgId = m.organizationId as string;
    const locale = localeOf(m.userId);
    if (!orgLocale.has(orgId)) orgLocale.set(orgId, locale);
    const arr = messageByOrg.get(orgId) ?? [];
    const userHex = m.userId?.toHexString?.() ?? String(m.userId);
    if (!arr.some((recipient) => recipient.userId.toHexString() === userHex)) {
      arr.push({ userId: m.userId, locale });
      messageByOrg.set(orgId, arr);
    }
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
  let fallbacks = 0;
  let notified = 0;
  let chatMessages = 0;
  let clockOutReminders = 0;
  let taskReminders = 0;
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
        now.getTime(),
      );
      const currentKeys = briefingProblemKeys(context);

      // LLM generation — the snapshot must exist for EVERY hour no matter
      // what, so any failure here degrades to the deterministic fallback
      // instead of skipping the hour.
      interface GenResult {
        summary: string;
        content: string;
        date: string;
        generatedBy: string;
        actions?: unknown[];
      }
      let data: GenResult | null = null;
      try {
        const res = await fetch(`${origin}/api/insights/morning-briefing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, lang: locale, dateStr: date, organizationId: orgId }),
        });
        if (res.ok) {
          data = (await res.json()) as GenResult;
        } else {
          const e = await res.json().catch(() => ({}));
          errors.push(`gen ${orgId}@${curHour}: ${e.error ?? res.status} (fallback used)`);
        }
      } catch (err) {
        errors.push(
          `gen ${orgId}@${curHour}: ${err instanceof Error ? err.message : String(err)} (fallback used)`,
        );
      }
      let shouldSave = true;
      if (!data) {
        // A downgraded fallback must never clobber a snapshot that already
        // exists for this hour (e.g. one the dashboard client generated).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = (briefings as any[]).some(
          (b) =>
            b.organizationId === orgId &&
            b.date === date &&
            (b.hour == null ? -1 : Number(b.hour)) === curHour,
        );
        const fb = buildFallbackBriefing(currentKeys, locale, {
          done: context.todayTasks.completed,
          total: context.todayTasks.total,
        });
        data = { summary: fb.summary, content: fb.content, date, generatedBy: "auto-fallback", actions: [] };
        if (existing) shouldSave = false;
        else fallbacks++;
      }
      if (shouldSave) {
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
      }

      // Notify enabled admins only when a NEW problem appeared this hour.
      const prevSet = new Set(prevKeys);
      const newKeys = currentKeys.filter((k) => !prevSet.has(k));
      const newCount = newKeys.length;
      const messageAdmins = messageByOrg.get(orgId) ?? [];
      if (currentKeys.length > 0 && messageAdmins.length > 0) {
        for (const admin of messageAdmins) {
          const localeKey = normalizedLocale(admin.locale);
          const copy = CHAT_COPY[localeKey] ?? CHAT_COPY.en;
          const summary = (data.summary || "").trim() || copy.title;
          const targetHex = admin.userId.toHexString?.() ?? String(admin.userId);
          try {
            await serviceAppendAiChatMessage(conn, {
              organizationId: orgId,
              targetIdentity: admin.userId,
              title: copy.title,
              message: copy.body(currentKeys.length, newCount, summary),
              time: timeInTimezone(tz, now, admin.locale),
              messageId: `hourly-patrol:${orgId}:${date}:${curHour}:${targetHex}`,
            });
            chatMessages++;
          } catch (err) {
            errors.push(
              `chat ${orgId}@${curHour}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
      if (newCount > 0) {
        const admins = notifyByOrg.get(orgId) ?? [];
        for (const admin of admins) {
          const copy = NOTIF_COPY[normalizedLocale(admin.locale)] ?? NOTIF_COPY.en;
          await serviceCreateNotification(conn, {
            organizationId: orgId,
            targetIdentity: admin.pref.userId,
            type: "briefing",
            title: copy.title,
            body: copy.body(newCount),
            link: "/manager/",
          });
          notified++;
        }
      } else {
        skipped++;
      }

      // Remind the affected employee directly on a NEW forgot-to-clock-out
      // incident (keys are person+day scoped, so this fires once per incident).
      const newKeySet = new Set(newKeys);
      for (const o of context.attendance.overdueClockOuts ?? []) {
        const key = `${o.kind === "stale" ? "stale-punch" : "overdue-out"}:${o.name}:${o.punchDate}`;
        if (!newKeySet.has(key)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const member = (orgMembers as any[]).find(
          (m) =>
            m.organizationId === orgId &&
            m.status === "active" &&
            String(m.displayName ?? "").trim() === o.name.trim(),
        );
        if (!member?.userId) continue;
        const copy =
          CLOCKOUT_COPY[normalizedLocale(localeOf(member.userId))] ?? CLOCKOUT_COPY.en;
        try {
          await serviceCreateNotification(conn, {
            organizationId: orgId,
            targetIdentity: member.userId,
            type: "punch",
            title: copy.title,
            body:
              o.kind === "overdue"
                ? copy.overdue(o.scheduledEnd ?? "?", o.minutesOver ?? 0)
                : copy.stale(Math.max(1, Math.round(o.openForMinutes / 60))),
            link: "/store",
          });
          clockOutReminders++;
        } catch (err) {
          errors.push(
            `clockout ${orgId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // ─── Task-time reminders ─────────────────────────────────────────────
      // Everyone on shift TODAY whose shift roles include a task whose start
      // time falls in the past hour gets a nudge (in-app + web push). The
      // [start, start+60) window means exactly one hourly run fires per task;
      // completed tasks and already-sent notifications are skipped.
      try {
        const nowMin = minutesInTimezone(tz, now);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgShifts = (shifts as any[]).filter(
          (s) => s.organizationId === orgId && s.date === date,
        );
        if (nowMin != null && orgShifts.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const orgRoles = (staffRoles as any[]).filter((r) => r.organizationId === orgId);
          const roleIdByName = new Map<string, string>();
          for (const r of orgRoles) roleIdByName.set(String(r.name).toLowerCase(), r.id.toString());
          const orgRoleIds = new Set(orgRoles.map((r) => r.id.toString()));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tasksByRole = new Map<string, any[]>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const tk of roleTasks as any[]) {
            const rid = String(tk.roleId ?? "");
            if (!orgRoleIds.has(rid)) continue;
            const arr = tasksByRole.get(rid) ?? [];
            arr.push(tk);
            tasksByRole.set(rid, arr);
          }

          // Task ids already completed today (org-local date).
          const completedToday = new Set<string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const a of roleTaskAssignments as any[]) {
            if (a.organizationId !== orgId || a.status !== "completed") continue;
            const ms = tsMs(a.completedAt);
            if (!ms || dateInTimezone(tz, new Date(ms)) !== date) continue;
            completedToday.add(String(a.taskId));
          }

          // Dedupe against reminders already inserted (e.g. an earlier run in
          // the same hour, or a retried request).
          const alreadyReminded = new Set<string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const n of notifications as any[]) {
            if (n.organizationId !== orgId || n.type !== "task-reminder") continue;
            const hex = n.targetId?.toHexString?.() ?? String(n.targetId);
            alreadyReminded.add(`${hex}|${n.link ?? ""}`);
          }

          for (const s of orgShifts) {
            if (!s.memberId) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const member = (orgMembers as any[]).find(
              (m) =>
                m.organizationId === orgId &&
                m.status === "active" &&
                m.id?.toString?.() === String(s.memberId),
            );
            if (!member?.userId) continue;
            const targetHex = member.userId?.toHexString?.() ?? String(member.userId);
            const copy =
              TASK_REMINDER_COPY[normalizedLocale(localeOf(member.userId))] ??
              TASK_REMINDER_COPY.en;

            let roleNames: string[] = [];
            try {
              const parsed = JSON.parse(s.staffRoles ?? "[]");
              if (Array.isArray(parsed)) roleNames = parsed.map(String);
            } catch { /* legacy rows */ }
            if (s.staffRole) roleNames.push(String(s.staffRole));

            for (const rn of new Set(roleNames.map((x) => x.toLowerCase()))) {
              const rid = roleIdByName.get(rn);
              if (!rid) continue;
              for (const tk of tasksByRole.get(rid) ?? []) {
                const start = hhmmToMin(tk.startTime);
                if (start == null) continue; // untimed tasks: nothing to remind at
                if (nowMin < start || nowMin >= start + 60) continue;
                const taskId = tk.id?.toString?.() ?? String(tk.id);
                if (completedToday.has(taskId)) continue;
                const link = `/manager/personnel?task=${taskId}&d=${date}`;
                if (alreadyReminded.has(`${targetHex}|${link}`)) continue;
                alreadyReminded.add(`${targetHex}|${link}`);
                const timeLabel = `${String(tk.startTime).slice(0, 5)}${
                  tk.endTime ? `–${String(tk.endTime).slice(0, 5)}` : ""
                }`;
                const title = copy.title;
                const body = copy.body(String(tk.title ?? ""), timeLabel);
                try {
                  await serviceCreateNotification(conn, {
                    organizationId: orgId,
                    targetIdentity: member.userId,
                    type: "task-reminder",
                    title,
                    body,
                    link,
                  });
                  // Best-effort web push so staff off the app still see it.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const subs = (pushSubscriptions as any[])
                    .filter(
                      (p) =>
                        p.organizationId === orgId &&
                        (p.targetId?.toHexString?.() ?? String(p.targetId)) === targetHex,
                    )
                    .map((p) => ({
                      endpoint: p.endpoint as string,
                      p256dh: p.p256Dh as string,
                      auth: p.auth as string,
                    }));
                  if (subs.length > 0) {
                    await sendWebPush(subs, { title, body, link, type: "task-reminder" });
                  }
                  taskReminders++;
                } catch (err) {
                  errors.push(
                    `task-reminder ${orgId}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }
            }
          }
        }
      } catch (err) {
        errors.push(
          `task-reminders ${orgId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } catch (err) {
      errors.push(`${orgId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[cron/morning-briefing] orgs=${orgLocale.size} generated=${generated} fallbacks=${fallbacks} notified=${notified} chatMessages=${chatMessages} clockOutReminders=${clockOutReminders} taskReminders=${taskReminders} skipped=${skipped} errors=${errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    triggeredAt: now.toISOString(),
    orgs: orgLocale.size,
    generated,
    fallbacks,
    notified,
    chatMessages,
    clockOutReminders,
    taskReminders,
    skipped,
    errors,
  });
}

export async function GET(req: NextRequest) {
  return runHourlyPatrol(req);
}

export async function POST(req: NextRequest) {
  return runHourlyPatrol(req);
}
