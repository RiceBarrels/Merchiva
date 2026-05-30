/**
 * Pure builder for the morning-briefing AI context.
 *
 * Shared by the client (components/morning-briefing-card.tsx, from live
 * subscription rows) and the cron route (app/api/cron/morning-briefing,
 * from a server-side service connection). Both sources expose the same
 * camelCase SpacetimeDB row fields, so the logic lives here once.
 *
 * The shape intentionally mirrors the right-panel Mr. Merchiva `storeContext`
 * (components/merchiva-chat-dashboard.tsx) so the briefing model sees the exact
 * same LIVE STORE DATA the chat assistant does — same store, same signal,
 * including the pre-computed `insights` from lib/merchiva-insights. On top of
 * that it adds briefing-only sections the chat doesn't carry: yesterday's
 * completed-task evidence (with a requires-evidence compliance flag), expiring
 * coupons, and a yesterday-vs-prior-week sales comparison.
 *
 * TIMEZONE: `today` is passed in already localized to the org/user timezone
 * (the cron computes it per-user; the client uses the browser's local date).
 * Date-string columns (shift.date, sales_record.date) are treated as already
 * local. Timestamp columns (payment.createdAt, assignment.completedAt/dueAt) are
 * UTC instants, so we bucket them into the org's timezone (settings.timezone)
 * before comparing — otherwise end-of-day payments / evidence get dropped into
 * the wrong day for non-UTC stores.
 */

import {
  getUpcomingHolidays,
  inferCountryFromLocale,
  parseOpeningHours,
  type HolidayInfo,
  type WeeklyHours,
} from "@/lib/holidays";
import { generateInsights } from "@/lib/merchiva-insights";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Row helpers (work on both client useTable rows and server iter() rows) ──

/** Normalize a SpacetimeDB Identity / uuid / string id to a comparable string. */
function idStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v.toHexString === "function") return v.toHexString();
  if (typeof v.toString === "function") return v.toString();
  return String(v);
}

/** SpacetimeDB timestamp → epoch ms. Handles {microsSinceUnixEpoch}, .toDate(),
 *  raw numbers, and ISO strings. Returns NaN when it can't tell. */
function tsToMs(v: any): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  if (typeof v === "object") {
    if (typeof v.toDate === "function") {
      try { return v.toDate().getTime(); } catch { return NaN; }
    }
    const micros = v.microsSinceUnixEpoch;
    if (typeof micros === "bigint") return Number(micros / 1000n);
    if (typeof micros === "number") return micros / 1000;
  }
  return NaN;
}

/** UTC instant → "YYYY-MM-DD" in the given IANA timezone (falls back to UTC). */
function localDateOf(v: any, tz: string): string | null {
  const ms = tsToMs(v);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Shift a "YYYY-MM-DD" string by `delta` days (UTC arithmetic on the date). */
function addDaysIso(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Parse a JSON-encoded array column safely. */
function parseJsonArray(s: any): any[] {
  if (Array.isArray(s)) return s;
  if (typeof s !== "string") return [];
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BriefingRows {
  organizations?: any[];
  orgMembers?: any[];
  staffMembers?: any[];
  inventoryItems?: any[];
  shifts?: any[];
  timeOff?: any[];
  shiftTrades?: any[];
  salesRecords?: any[];
  payments?: any[];
  products?: any[];
  staffRoles?: any[];
  roleTasks?: any[];
  roleTaskAssignments?: any[];
  notifications?: any[];
  shiftPresets?: any[];
  staffAvailability?: any[];
  coupons?: any[];
  settings?: any[];
}

export type EvidenceStatus = "complete" | "missing_required" | "not_required";

export interface TaskEvidenceItem {
  task: string;
  staff: string;
  status: string;
  evidenceStatus: EvidenceStatus;
  note: string | null;
  evidence: { url: string; type: string }[];
  completedAt: string | null;
}

export interface BriefingInsight {
  type: string;
  title: string;
  severity: "high" | "medium" | "low";
}

export interface BriefingContext {
  date: string;
  yesterday: string;
  timezone: string;
  storeName: string;
  openingHours: WeeklyHours | null;
  hoursStatus: "set" | "unset";
  countryCode: string;
  upcomingHolidays: HolidayInfo[];

  team: { name: string; role: string; hasPunchInCode: boolean }[];

  inventory: {
    name: string; category: string; stock: number;
    min: number; max: number; unit: string; supplier: string;
    status: "ok" | "low" | "out";
  }[];
  lowStock: { name: string; stock: number; min: number; unit: string; outOfStock: boolean }[];

  todayShifts: { name: string; role: string; start: string; end: string; type: string }[];
  upcomingShifts: { name: string; date: string; start: string; end: string; type: string }[];
  unassignedTodayShifts: number;
  shiftPresets: { name: string; startTime: string; endTime: string }[];

  pendingTimeOffCount: number;
  timeOffRequests: { staffName: string; startDate: string; endDate: string; fullDays: boolean }[];
  pendingShiftTradesCount: number;
  shiftTrades: { type: string; requester: string; target: string; managerApproved: boolean }[];

  sales: {
    recentDaily: { date: string; revenue: number }[];
    todayHourly: { hour: number; revenue: number }[];
    yesterdayRevenue: number;
    priorWeekSameDayRevenue: number;
    todayRevenueSoFar: number;
  };

  insights: BriefingInsight[];

  products: { name: string; price: number; category: string; alert?: string }[];

  coupons: { code: string; discount: string; validUntil: string; usesLeft: number | null }[];
  expiringCoupons: { code: string; discount: string; validUntil: string; usesLeft: number | null }[];

  roles: {
    name: string;
    tasks: { title: string; startTime: string | null; endTime: string | null; requiresEvidence: boolean }[];
  }[];

  yesterdayTaskEvidence: TaskEvidenceItem[];
  taskCompliance: {
    completedYesterday: number;
    skippedYesterday: number;
    overduePending: number;
    missingRequiredEvidence: number;
    overdueExamples: { task: string; staff: string; dueDate: string | null }[];
  };

  availability: { staffName: string; type: string; availableDays: string[] }[];
  unreadNotifications: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Caps to keep the JSON context from blowing the model's window on large orgs.
const INVENTORY_CAP = 50;
const PRODUCTS_CAP = 30;
const UPCOMING_SHIFTS_CAP = 40;
const EVIDENCE_CAP = 25;
const AVAILABILITY_CAP = 20;

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildBriefingContext(
  rows: BriefingRows,
  organizationId: string,
  today: string,
  locale = "en",
): BriefingContext {
  const orgId = organizationId;
  const yesterday = addDaysIso(today, -1);

  // Store identity + timezone first — timestamp bucketing depends on the tz.
  const setting = (rows.settings ?? []).find((s: any) => s.organizationId === orgId);
  const tz = (setting?.timezone as string | undefined) || "UTC";
  const openingHours = parseOpeningHours(setting?.openingHours ?? null);
  const hoursStatus: "set" | "unset" = openingHours ? "set" : "unset";
  const countryCode = (setting?.countryCode as string | undefined) || inferCountryFromLocale(locale);
  const upcomingHolidays = getUpcomingHolidays(countryCode, 14);
  const org = (rows.organizations ?? []).find((o: any) => idStr(o.id) === orgId);
  const storeName = org?.name || setting?.businessName || "your store";

  const orgMembers = (rows.orgMembers ?? []).filter(
    (m: any) => m.organizationId === orgId && (m.status == null || m.status === "active"),
  );
  const staffMembers = (rows.staffMembers ?? []).filter(
    (m: any) => m.organizationId === orgId,
  );

  // Name resolvers. Time-off keys by orgMember.userId (Identity); shift trades
  // and task assignments key by staff_member.id (or org_member.id). Resolve from
  // whichever table has the id so names render regardless of source.
  const nameByUserHex = new Map<string, string>();
  const nameByMemberId = new Map<string, string>();
  for (const m of orgMembers) {
    const display = m.displayName || m.email || "Staff";
    nameByUserHex.set(idStr(m.userId), display);
    nameByMemberId.set(idStr(m.id), display);
  }
  for (const s of staffMembers) {
    nameByMemberId.set(idStr(s.id), s.name);
  }
  const resolveMemberName = (id: any): string =>
    nameByMemberId.get(idStr(id)) || "Staff";
  const resolveUserName = (uid: any): string =>
    nameByUserHex.get(idStr(uid)) || "Staff";

  // ── Team (org members + any staff-only placeholders, deduped by name) ──
  const team: BriefingContext["team"] = orgMembers.map((m: any) => ({
    name: m.displayName || m.email || "Staff",
    role: m.role,
    hasPunchInCode: !!m.punchInCode,
  }));
  const teamNames = new Set(team.map((m) => m.name));
  for (const s of staffMembers) {
    if (!teamNames.has(s.name)) {
      team.push({ name: s.name, role: s.role, hasPunchInCode: false });
      teamNames.add(s.name);
    }
  }

  // ── Inventory (status derived: out / low / ok) ──
  const inventory = (rows.inventoryItems ?? [])
    .filter((i: any) => i.organizationId === orgId)
    .slice(0, INVENTORY_CAP)
    .map((i: any) => {
      const stock = num(i.currentStock);
      const min = num(i.minStock);
      const status: "ok" | "low" | "out" =
        stock <= 0 ? "out" : min > 0 && stock <= min ? "low" : "ok";
      return {
        name: i.name,
        category: i.category,
        stock,
        min,
        max: num(i.maxStock),
        unit: i.unit,
        supplier: i.supplier,
        status,
      };
    });
  const lowStock = inventory
    .filter((i) => i.status !== "ok")
    .map((i) => ({
      name: i.name,
      stock: i.stock,
      min: i.min,
      unit: i.unit,
      outOfStock: i.status === "out",
    }));

  // ── Shifts ──
  const orgShifts = (rows.shifts ?? []).filter((s: any) => s.organizationId === orgId);
  const shiftRole = (s: any): string => {
    const arr = parseJsonArray(s.staffRoles);
    if (arr.length) return arr.join(", ");
    return s.staffRole || "";
  };
  const todayShiftRows = orgShifts.filter((s: any) => s.date === today);
  const todayShifts = todayShiftRows.map((s: any) => ({
    name: s.staffName,
    role: shiftRole(s),
    start: s.startTime,
    end: s.endTime,
    type: s.shiftType,
  }));
  const unassignedTodayShifts = todayShiftRows.filter(
    (s: any) => !s.memberId && !s.staffName,
  ).length;
  const upcomingShifts = orgShifts
    .filter((s: any) => s.date > today)
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
    .slice(0, UPCOMING_SHIFTS_CAP)
    .map((s: any) => ({
      name: s.staffName,
      date: s.date,
      start: s.startTime,
      end: s.endTime,
      type: s.shiftType,
    }));
  const shiftPresets = (rows.shiftPresets ?? [])
    .filter((p: any) => p.organizationId === orgId)
    .map((p: any) => ({ name: p.name, startTime: p.startTime, endTime: p.endTime }));

  // ── Pending time-off + shift trades (detailed, not just counts) ──
  const pendingTimeOffRows = (rows.timeOff ?? []).filter(
    (r: any) => r.organizationId === orgId && r.status === "pending",
  );
  const timeOffRequests = pendingTimeOffRows.map((r: any) => ({
    staffName: resolveUserName(r.userId),
    startDate: r.startDate,
    endDate: r.endDate,
    fullDays: !!r.fullDays,
  }));
  const pendingTradeRows = (rows.shiftTrades ?? []).filter(
    (r: any) => r.organizationId === orgId && r.status === "pending",
  );
  const shiftTrades = pendingTradeRows.map((r: any) => ({
    type: r.type,
    requester: resolveMemberName(r.requesterId),
    target: r.broadcastToAll ? "anyone" : resolveMemberName(r.targetId),
    managerApproved: !!r.managerApproved,
  }));

  // ── Sales — replicate useSales daily aggregation (sales_record + POS payments) ──
  // sales_record.date is already a local date string; payments are UTC instants
  // bucketed into the org timezone so end-of-day sales land on the right day.
  const orgSalesRecords = (rows.salesRecords ?? []).filter((r: any) => r.organizationId === orgId);
  const dailyMap = new Map<string, number>();
  for (const r of orgSalesRecords) {
    if (r.hour != null) continue; // hourly rows aren't daily totals
    dailyMap.set(r.date, num(r.actual));
  }
  for (const p of (rows.payments ?? [])) {
    if (p.organizationId !== orgId) continue;
    if (p.status === "refunded") continue;
    const d = localDateOf(p.createdAt, tz);
    if (!d) continue;
    const net = num(p.amount) - num(p.refundAmount);
    if (net <= 0) continue;
    dailyMap.set(d, (dailyMap.get(d) ?? 0) + net);
  }
  const dailySorted = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const todayHourlyMap = new Map<number, number>();
  for (const r of orgSalesRecords) {
    if (r.hour == null || r.date !== today) continue;
    todayHourlyMap.set(num(r.hour), (todayHourlyMap.get(num(r.hour)) ?? 0) + num(r.actual));
  }
  const todayHourly = [...todayHourlyMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, revenue]) => ({ hour, revenue: round2(revenue) }));
  const sales = {
    recentDaily: dailySorted.slice(-14).map(([date, revenue]) => ({ date, revenue: round2(revenue) })),
    todayHourly,
    yesterdayRevenue: round2(dailyMap.get(yesterday) ?? 0),
    priorWeekSameDayRevenue: round2(dailyMap.get(addDaysIso(yesterday, -7)) ?? 0),
    todayRevenueSoFar: round2(dailyMap.get(today) ?? 0),
  };

  // ── Pre-computed insights (same engine the right-panel uses) ──
  let insights: BriefingInsight[] = [];
  try {
    const invForInsights = inventory.map((i) => ({
      id: i.name, name: i.name, category: i.category, currentStock: i.stock,
      minStock: i.min, maxStock: i.max, unit: i.unit, costPerUnit: 0, supplier: i.supplier,
    })) as any;
    const shiftsForInsights = orgShifts.map((s: any) => ({ date: s.date })) as any;
    const salesHistForInsights = dailySorted.map(([date, actual]) => ({ date, actual, hour: undefined })) as any;
    const salesHourlyForInsights = todayHourly.map((h) => ({ date: today, hour: h.hour, actual: h.revenue })) as any;
    insights = generateInsights(invForInsights, shiftsForInsights, salesHistForInsights, salesHourlyForInsights)
      .map((i) => ({ type: i.type, title: i.title, severity: i.severity }));
  } catch {
    insights = [];
  }

  // ── Products ──
  const products = (rows.products ?? [])
    .filter((p: any) => p.organizationId === orgId)
    .slice(0, PRODUCTS_CAP)
    .map((p: any) => {
      const alert = p.alert && p.alert !== "none" ? p.alert : undefined;
      return { name: p.name, price: num(p.price), category: p.category, ...(alert ? { alert } : {}) };
    });

  // ── Coupons (active) + expiring within 7 days ──
  const couponOut = (c: any) => ({
    code: c.code,
    discount: c.discountType === "percent" ? `${num(c.discountValue)}%` : `$${num(c.discountValue)}`,
    validUntil: c.validUntil,
    usesLeft: num(c.maxUses) > 0 ? Math.max(0, num(c.maxUses) - num(c.usedCount)) : null,
  });
  const coupons = (rows.coupons ?? [])
    .filter((c: any) => c.organizationId === orgId && c.active)
    .map(couponOut);
  const couponHorizon = addDaysIso(today, 7);
  const expiringCoupons = coupons.filter(
    (c) => c.validUntil && c.validUntil >= today && c.validUntil <= couponHorizon,
  );

  // ── Roles + their tasks ──
  const allRoleTasks = (rows.roleTasks ?? []).filter(
    (tk: any) => tk.organizationId == null || tk.organizationId === orgId,
  );
  const taskTitleById = new Map<string, string>();
  const taskRequiresEvidenceById = new Map<string, boolean>();
  for (const tk of allRoleTasks) {
    taskTitleById.set(idStr(tk.id), tk.title);
    taskRequiresEvidenceById.set(idStr(tk.id), !!tk.requiresEvidence);
  }
  const roles = (rows.staffRoles ?? [])
    .filter((r: any) => r.organizationId === orgId)
    .map((r: any) => {
      const rid = idStr(r.id);
      return {
        name: r.name,
        tasks: allRoleTasks
          .filter((tk: any) => idStr(tk.roleId) === rid)
          .map((tk: any) => ({
            title: tk.title,
            startTime: tk.startTime ?? null,
            endTime: tk.endTime ?? null,
            requiresEvidence: !!tk.requiresEvidence,
          })),
      };
    });

  // ── Task assignments — yesterday's evidence + completion compliance ──
  const assigns = (rows.roleTaskAssignments ?? []).filter(
    (a: any) => a.organizationId === orgId,
  );
  const yesterdayTaskEvidence: TaskEvidenceItem[] = [];
  const overdueExamples: { task: string; staff: string; dueDate: string | null }[] = [];
  let completedYesterday = 0;
  let skippedYesterday = 0;
  let overduePending = 0;
  let missingRequiredEvidence = 0;
  for (const a of assigns) {
    const status = a.status;
    const completedDate = localDateOf(a.completedAt, tz);
    const dueDate = localDateOf(a.dueAt, tz);
    const requiresEvidence = taskRequiresEvidenceById.get(idStr(a.taskId)) ?? false;

    if (status === "completed" && completedDate === yesterday) {
      completedYesterday++;
      const evidence = parseJsonArray(a.evidenceUrls)
        .map((e: any) =>
          typeof e === "string"
            ? { url: e, type: "image" }
            : { url: e?.url, type: e?.type || "image" },
        )
        .filter((e: any) => !!e.url);
      if (evidence.length === 0 && a.evidenceUrl) {
        evidence.push({ url: a.evidenceUrl, type: "image" });
      }
      const evidenceStatus: EvidenceStatus = !requiresEvidence
        ? "not_required"
        : evidence.length > 0
        ? "complete"
        : "missing_required";
      if (evidenceStatus === "missing_required") missingRequiredEvidence++;
      if (yesterdayTaskEvidence.length < EVIDENCE_CAP) {
        yesterdayTaskEvidence.push({
          task: taskTitleById.get(idStr(a.taskId)) || "Task",
          staff: resolveMemberName(a.memberId),
          status,
          evidenceStatus,
          note: a.note ?? null,
          evidence,
          completedAt: completedDate,
        });
      }
    } else if (status === "skipped" && (completedDate === yesterday || dueDate === yesterday)) {
      skippedYesterday++;
    }

    // Required-evidence task that was due yesterday but never completed.
    if (status !== "completed" && dueDate === yesterday && requiresEvidence) {
      missingRequiredEvidence++;
    }

    if (status === "pending" && dueDate && dueDate <= today) {
      overduePending++;
      if (overdueExamples.length < 10) {
        overdueExamples.push({
          task: taskTitleById.get(idStr(a.taskId)) || "Task",
          staff: resolveMemberName(a.memberId),
          dueDate,
        });
      }
    }
  }

  // ── Availability ──
  const availability = (rows.staffAvailability ?? [])
    .filter((a: any) => a.organizationId === orgId)
    .slice(0, AVAILABILITY_CAP)
    .map((a: any) => {
      const days = parseJsonArray(a.days);
      const availableDays = days
        .map((on: boolean, i: number) => (on ? DAY_NAMES[i] : null))
        .filter(Boolean) as string[];
      return { staffName: resolveUserName(a.userId), type: a.type, availableDays };
    });

  // ── Notifications ──
  const unreadNotifications = (rows.notifications ?? []).filter(
    (n: any) => n.organizationId === orgId && !n.read,
  ).length;

  return {
    date: today,
    yesterday,
    timezone: tz,
    storeName,
    openingHours,
    hoursStatus,
    countryCode,
    upcomingHolidays,
    team,
    inventory,
    lowStock,
    todayShifts,
    upcomingShifts,
    unassignedTodayShifts,
    shiftPresets,
    pendingTimeOffCount: timeOffRequests.length,
    timeOffRequests,
    pendingShiftTradesCount: shiftTrades.length,
    shiftTrades,
    sales,
    insights,
    products,
    coupons,
    expiringCoupons,
    roles,
    yesterdayTaskEvidence,
    taskCompliance: {
      completedYesterday,
      skippedYesterday,
      overduePending,
      missingRequiredEvidence,
      overdueExamples,
    },
    availability,
    unreadNotifications,
  };
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Stable, order-independent set of "problem" signatures present in a briefing.
 * The hourly cron diffs this run's keys against the previous run's stored keys
 * to decide whether a NEW problem appeared (→ notify the manager). Keys must be
 * deterministic for the same underlying problem so an ongoing issue doesn't
 * re-notify every hour.
 */
export function briefingProblemKeys(ctx: BriefingContext): string[] {
  const keys: string[] = [];

  for (const i of ctx.lowStock) keys.push(`${i.outOfStock ? "out" : "low"}:${i.name}`);

  // No coverage today — only flag when the store is actually open today.
  let openToday = true;
  if (ctx.openingHours) {
    const d = new Date(`${ctx.date}T00:00:00Z`);
    const dayKey = WEEKDAY_KEYS[Number.isNaN(d.getTime()) ? 0 : d.getUTCDay()];
    const th = (ctx.openingHours as Record<string, { closed?: boolean } | undefined>)[dayKey];
    openToday = !(th?.closed === true);
  }
  if (openToday && ctx.todayShifts.length === 0 && ctx.team.length > 0) keys.push("coverage:none");

  for (const o of ctx.taskCompliance.overdueExamples) keys.push(`overdue:${o.task}:${o.staff}`);
  for (const e of ctx.yesterdayTaskEvidence) {
    if (e.evidenceStatus === "missing_required") keys.push(`evidence:${e.task}:${e.staff}`);
  }
  for (const r of ctx.timeOffRequests) keys.push(`timeoff:${r.staffName}:${r.startDate}`);
  for (const s of ctx.shiftTrades) keys.push(`trade:${s.requester}:${s.type}`);
  for (const c of ctx.expiringCoupons) keys.push(`coupon:${c.code}`);
  for (const ins of ctx.insights) if (ins.severity === "high") keys.push(`insight:${ins.title}`);

  return Array.from(new Set(keys));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
