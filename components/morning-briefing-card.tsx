"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  Package,
  Calendar,
  CalendarPlus,
  ArrowRightLeft,
  AlertTriangle,
  Bell,
  Camera,
  CheckCheck,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight,
  History,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusBadge, STATUS_TONE_DOT, STATUS_TONE_TEXT, type StatusTone } from "@/components/ui/status-badge";
import { MerchivaLogo } from "@/components/logo";
import { usePermissions } from "@/lib/context/permissions";
import {
  useDailyBriefings,
  useShifts,
  useStaffMembers,
  useOrgMembers,
  useInventoryItems,
  useTimeOffRequests,
  useShiftTrades,
  useSalesRecords,
  usePayments,
  useProducts,
  useStaffRoles,
  useRoleTasks,
  useRoleTaskAssignments,
  useNotifications,
  useShiftPresets,
  useStaffAvailability,
  useCoupons,
  useSettingsRows,
  useOrganizations,
  usePunchEvents,
} from "@/lib/spacetimedb/hooks";
import {
  saveDailyBriefing,
  updateTimeOffStatus,
  managerApproveShiftTrade,
  addInventoryTransaction,
  addShift,
  createNotification,
} from "@/lib/spacetimedb/actions";
import { buildBriefingContext as buildBriefingContextShared, briefingProblemKeys } from "@/lib/insights/build-context";
import { buildFallbackBriefing } from "@/lib/insights/fallback-briefing";
import { parseOpeningHours, dayKeyForDate } from "@/lib/holidays";
import { executeAction } from "@/lib/merchiva/skills/registry";
import { useI18n, useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function sanitizeBriefingHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");
}

interface BriefingRow {
  id: { toString(): string };
  organizationId: string;
  date: string;
  content: string;
  summary?: string | null;
  generatedBy: string;
  actions?: string | null;     // JSON: [{ label, action, paramsJson }]
  hour?: number | null;        // org-local hour (0-23) this snapshot was generated for
  problemKeys?: string | null; // JSON array of problem signatures (for the "new problem" dot)
}

// One AI-proposed one-click action persisted with the briefing.
interface AiAction {
  label: string;
  action: string;
  params: Record<string, unknown>;
}

function parseBriefingKeys(s?: string | null): string[] {
  if (!s) return [];
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

function monthDay(date: string): string {
  const p = date.split("-");
  return p.length === 3 ? `${Number(p[1])}/${Number(p[2])}` : date;
}
function slotTitle(date: string, hour: number | null | undefined): string {
  return hour == null ? date : `${date} ${String(hour).padStart(2, "0")}:00`;
}

type AgentState = "working" | "done" | "idle" | "attention";
type BriefingCardTone = "critical" | "warning" | "info" | "success" | "neutral";

interface BriefingCardItem {
  id: string;
  title: string;
  detail?: string;
  section?: string;
  icon: LucideIcon;
  tone: BriefingCardTone;
}

const BRIEFING_ICON_MAP: Record<string, LucideIcon> = {
  alerttriangle: AlertTriangle,
  warning: AlertTriangle,
  package: Package,
  box: Package,
  inventory: Package,
  users: Users,
  user: Users,
  staffing: Users,
  bell: Bell,
  notification: Bell,
  calendar: Calendar,
  holiday: Calendar,
  calendarplus: CalendarPlus,
  schedule: CalendarPlus,
  arrowrightleft: ArrowRightLeft,
  trade: ArrowRightLeft,
  camera: Camera,
  evidence: Camera,
  checkcheck: CheckCheck,
  check: Check,
  clock: Clock,
};

const BRIEFING_STATUS_TONE: Record<BriefingCardTone, StatusTone> = {
  critical: "danger",
  warning: "warning",
  info: "info",
  success: "success",
  neutral: "neutral",
};

/** Soft-fill card surface (border + bg only; text inherits) per status tone. */
const TONE_CARD: Record<StatusTone, string> = {
  danger: "border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/30",
  warning: "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20",
  info: "border-sky-200 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20",
  success: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20",
  neutral: "border-border bg-muted/40",
};

function briefingToneStyles(tone: BriefingCardTone) {
  const status = BRIEFING_STATUS_TONE[tone];
  return { card: TONE_CARD[status], pip: STATUS_TONE_DOT[status], icon: STATUS_TONE_TEXT[status], status };
}

function normalizeMetaKey(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCardText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveBriefingIcon(text: string, requestedIcon?: string | null): LucideIcon {
  const requested = BRIEFING_ICON_MAP[normalizeMetaKey(requestedIcon)];
  if (requested) return requested;

  const n = text.toLowerCase();
  if (/stock|inventory|sku|reorder|restock|cream|milk|\bunits?\b|\bmin\s*\d|\bminimum\b/.test(n)) return Package;
  if (/holiday|juneteenth|calendar|date/.test(n)) return Calendar;
  if (/notif|notification|unread|pending item|提醒|通知/.test(n)) return Bell;
  if (/overdue|past due|due time|timed task|task overdue|过时|逾期|今日任务|任务/.test(n)) return Clock;
  if (/evidence|photo|camera|proof|task evidence/.test(n)) return Camera;
  if (/trade|swap/.test(n)) return ArrowRightLeft;
  if (/staff|shift|clock|punch|attendance|late|absent|coverage|排班|打卡/.test(n)) return Users;
  if (/insight|severity|urgent|critical|alert|attention|高危|紧急/.test(n)) return AlertTriangle;
  if (/done|clear|normal|ok/.test(n)) return CheckCheck;
  return AlertTriangle;
}

function resolveBriefingTone(text: string, requestedTone?: string | null): BriefingCardTone {
  const requested = normalizeMetaKey(requestedTone);
  if (["critical", "danger", "rose", "red", "high", "urgent"].includes(requested)) return "critical";
  if (["warning", "warn", "amber", "yellow", "medium"].includes(requested)) return "warning";
  if (["info", "blue", "sky"].includes(requested)) return "info";
  if (["success", "green", "emerald", "ok", "clear"].includes(requested)) return "success";
  if (["neutral", "muted", "gray", "grey", "low"].includes(requested)) return "neutral";

  const n = text.toLowerCase();
  if (/urgent|critical|high-severity|high severity|out of stock|no one clocked|absent|overdue|past due|过时|逾期|0\s*\/|高危|紧急/.test(n)) {
    return "critical";
  }
  if (/minimum|below|late|attention|pending|unread|holiday|overtime|warning|needs? review/.test(n)) {
    return "warning";
  }
  if (/clear|normal|completed|done|ok/.test(n)) return "success";
  if (/insight|forecast|sales|holiday|notification/.test(n)) return "info";
  return "neutral";
}

function splitBriefingText(li: Element): { title: string; detail?: string } {
  const full = normalizeCardText(li.textContent);
  const strong = normalizeCardText(li.querySelector("strong")?.textContent);
  if (strong) {
    const title = strong.replace(/[:：\-–—]\s*$/, "");
    const detail = normalizeCardText(full.replace(strong, "").replace(/^[:：\-–—]\s*/, ""));
    return { title: title || full, detail: detail || undefined };
  }

  const separator = full.match(/^(.{6,72}?)([:：]| – | — | - )\s+(.+)$/);
  if (separator) {
    return {
      title: normalizeCardText(separator[1]).replace(/[:：\-–—]\s*$/, ""),
      detail: normalizeCardText(separator[3]),
    };
  }

  return { title: full };
}

function parseBriefingCards(html: string): BriefingCardItem[] {
  if (typeof window === "undefined" || !html.trim()) return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const cards: BriefingCardItem[] = [];
  let section = "";
  let index = 0;

  const addListItem = (li: Element, currentSection: string) => {
    const text = normalizeCardText(li.textContent);
    if (!text) return;
    const { title, detail } = splitBriefingText(li);
    const icon = resolveBriefingIcon(
      text,
      li.getAttribute("data-icon") ||
        li.getAttribute("data-lucide-icon") ||
        li.getAttribute("data-lucide"),
    );
    const tone = resolveBriefingTone(
      text,
      li.getAttribute("data-tone") ||
        li.getAttribute("data-color") ||
        li.getAttribute("data-severity"),
    );
    cards.push({
      id: `briefing-${index++}`,
      title,
      detail,
      section: currentSection || undefined,
      icon,
      tone,
    });
  };

  for (const child of Array.from(doc.body.children)) {
    if (/^h[1-6]$/i.test(child.tagName)) {
      section = normalizeCardText(child.textContent);
      continue;
    }
    if (child.tagName.toLowerCase() === "ul" || child.tagName.toLowerCase() === "ol") {
      for (const li of Array.from(child.children).filter((el) => el.tagName.toLowerCase() === "li")) {
        addListItem(li, section);
      }
    }
  }

  if (cards.length === 0) {
    for (const li of Array.from(doc.body.querySelectorAll("li"))) addListItem(li, "");
  }

  return cards;
}

function AiBriefingCards({ html }: { html: string }) {
  const safeHtml = useMemo(() => sanitizeBriefingHtml(html), [html]);
  const [cards, setCards] = useState<BriefingCardItem[]>([]);

  useEffect(() => {
    setCards(parseBriefingCards(safeHtml));
  }, [safeHtml]);

  if (cards.length === 0) {
    return (
      <div
        className="merchiva-rich-text text-[13px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <MerchivaLogo size={11} />
        <Eyebrow as="span" size="xs">
          AI briefing
        </Eyebrow>
        <span className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9.5px] tabular-nums text-background">
          {cards.length}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <ul className="space-y-1.5">
        {cards.map((item) => (
          <AiBriefingCardRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

function AiBriefingCardRow({ item }: { item: BriefingCardItem }) {
  const Icon = item.icon;
  const tone = briefingToneStyles(item.tone);

  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[12px]",
        tone.card,
      )}
    >
      <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone.pip)} />
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone.icon)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium leading-snug">{item.title}</span>
          {item.section && (
            <StatusBadge size="xs" tone={tone.status} className="font-mono">
              {item.section}
            </StatusBadge>
          )}
        </div>
        {item.detail && (
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {item.detail}
          </div>
        )}
      </div>
    </li>
  );
}

function MerchivaMark({ state }: { state: AgentState }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-foreground">
        <MerchivaLogo size={16} fg="var(--background)" />
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
          state === "working" && "bg-amber-500 animate-pulse",
          state === "attention" && "bg-destructive",
          state === "done" && "bg-emerald-500",
          state === "idle" && "bg-muted-foreground",
        )}
      />
    </span>
  );
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysLocal(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// SpacetimeDB timestamp → "YYYY-MM-DD" in the given IANA timezone. Mirrors the
// bucketing in lib/insights/build-context so issue detection lines up with the
// AI briefing (end-of-day timestamps land on the right local day).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsToMs(v: any): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function localDateOf(v: any, tz: string): string | null {
  const ms = tsToMs(v);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
// UTC instant (or ms number) → "HH:MM" (24h) in the given timezone.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function localTimeOf(v: any, tz: string): string | null {
  const ms = tsToMs(v);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
}

// ── Issue model ──────────────────────────────────────────────────────────
type Severity = "high" | "medium" | "low";

type IssueAction =
  | { kind: "approveTimeOff"; requestId: string }
  | { kind: "rejectTimeOff"; requestId: string }
  | { kind: "approveTrade"; tradeId: string }
  | { kind: "rejectTrade"; tradeId: string }
  | { kind: "restock"; itemName: string; delta: number }
  | { kind: "autoScheduleToday"; shifts: { memberId: string; staffName: string; role: string; start: string; end: string }[] }
  | { kind: "remindEvidence"; tasks: string[] }
  | { kind: "navigate"; href: string };

interface IssueActionButton {
  label: string;
  primary?: boolean;
  action: IssueAction;
}

interface Issue {
  id: string;
  severity: Severity;
  icon: LucideIcon;
  label: string;
  sub?: string;
  actions: IssueActionButton[];
}

export function MorningBriefingCard() {
  const t = useT();
  const router = useRouter();
  const { locale } = useI18n();
  const { organizationId, isOwner, role: orgRole } = usePermissions();
  const isAdmin = isOwner || orgRole === "manager";

  // Second element is the SDK's `subscribeApplied` flag — true once the
  // daily_briefing subscription has delivered its snapshot (NOT a "loading"
  // spinner flag). The auto-gen safety net must wait for it, or a fresh page
  // load sees an empty table and wrongly regenerates every time.
  const [rawBriefings, briefingsReady] = useDailyBriefings() as [unknown[], boolean];
  const [shifts] = useShifts() as [unknown[], boolean];
  const [staffMembers] = useStaffMembers() as [unknown[], boolean];
  const [orgMembers] = useOrgMembers() as [unknown[], boolean];
  const [inventoryItems] = useInventoryItems() as [unknown[], boolean];
  const [timeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [shiftTrades] = useShiftTrades() as [unknown[], boolean];
  // Extra tables so the briefing sees the same LIVE STORE DATA the right-panel
  // Mr. Merchiva does (sales, products, roles + tasks, coupons, etc.) plus
  // yesterday's task evidence. All fed to the shared buildBriefingContext.
  const [salesRecords] = useSalesRecords() as [unknown[], boolean];
  const [payments] = usePayments() as [unknown[], boolean];
  const [products] = useProducts() as [unknown[], boolean];
  const [staffRoles] = useStaffRoles() as [unknown[], boolean];
  const [roleTasks] = useRoleTasks() as [unknown[], boolean];
  const [roleTaskAssignments] = useRoleTaskAssignments() as [unknown[], boolean];
  const [notifications] = useNotifications() as [unknown[], boolean];
  const [shiftPresets] = useShiftPresets() as [unknown[], boolean];
  const [staffAvailability] = useStaffAvailability() as [unknown[], boolean];
  const [coupons] = useCoupons() as [unknown[], boolean];
  const [settingsRows] = useSettingsRows() as [unknown[], boolean];
  const [organizations] = useOrganizations() as [unknown[], boolean];
  const [punchEvents] = usePunchEvents() as [unknown[], boolean];

  const today = todayLocal();

  // Today's CURRENT briefing = the latest-hour snapshot for today.
  const todaysBriefing = useMemo<BriefingRow | null>(() => {
    if (!organizationId) return null;
    let best: BriefingRow | null = null;
    for (const r of rawBriefings as BriefingRow[]) {
      if (r.organizationId !== organizationId || r.date !== today) continue;
      if (!best || (r.hour ?? -1) > (best.hour ?? -1)) best = r;
    }
    return best;
  }, [rawBriefings, organizationId, today]);

  // Past briefings — one row per past day (the latest-hour snapshot of that day).
  const briefingHistory = useMemo<BriefingRow[]>(() => {
    if (!organizationId) return [];
    const latestPerDay = new Map<string, BriefingRow>();
    for (const r of rawBriefings as BriefingRow[]) {
      if (r.organizationId !== organizationId || r.date === today) continue;
      const cur = latestPerDay.get(r.date);
      if (!cur || (r.hour ?? -1) > (cur.hour ?? -1)) latestPerDay.set(r.date, r);
    }
    return Array.from(latestPerDay.values())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 14);
  }, [rawBriefings, organizationId, today]);

  // ── 24-hour briefing timeline (the on-card "graph") ─────────────────────
  // Left rail shows ALL 24 hours of the viewed day. An hour only lights up and
  // becomes clickable when its snapshot detected a problem. ◀ ▶ switch days.
  const [viewDate, setViewDate] = useState<string>(today);
  const [viewHour, setViewHour] = useState<number | null>(null);

  // All briefings for this org, grouped by date and sorted by hour.
  const byDate = useMemo(() => {
    const m = new Map<string, BriefingRow[]>();
    if (!organizationId) return m;
    for (const r of rawBriefings as BriefingRow[]) {
      if (r.organizationId !== organizationId) continue;
      const arr = m.get(r.date) ?? [];
      arr.push(r);
      m.set(r.date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.hour ?? -1) - (b.hour ?? -1));
    return m;
  }, [rawBriefings, organizationId]);

  // Days we can page through with ◀ ▶ — every day that has a briefing, plus today.
  const navDates = useMemo(() => {
    const set = new Set<string>(byDate.keys());
    set.add(today);
    return Array.from(set).sort();
  }, [byDate, today]);

  // Snapshot for each hour of the viewed day (null-hour legacy rows excluded).
  const hourMap = useMemo(() => {
    const m = new Map<number, BriefingRow>();
    for (const r of byDate.get(viewDate) ?? []) {
      if (r.hour != null) m.set(r.hour, r);
    }
    return m;
  }, [byDate, viewDate]);

  const dayLatest = useMemo<BriefingRow | null>(() => {
    const arr = byDate.get(viewDate) ?? [];
    return arr.length ? arr[arr.length - 1] : null;
  }, [byDate, viewDate]);

  // The briefing currently shown — a picked hour, else the day's latest.
  const displayedBriefing = useMemo<BriefingRow | null>(() => {
    if (viewHour != null) {
      const s = hourMap.get(viewHour);
      if (s) return s;
    }
    if (viewDate === today) return todaysBriefing ?? dayLatest;
    return dayLatest;
  }, [viewHour, hourMap, viewDate, today, todaysBriefing, dayLatest]);

  // Live actions + issues only when showing today's current (latest) briefing.
  const viewingLatest = viewDate === today && viewHour == null;

  const viewIdx = navDates.indexOf(viewDate);
  const goPrevDay = useCallback(() => {
    const i = navDates.indexOf(viewDate);
    if (i > 0) { setViewDate(navDates[i - 1]); setViewHour(null); }
  }, [navDates, viewDate]);
  const goNextDay = useCallback(() => {
    const i = navDates.indexOf(viewDate);
    if (i >= 0 && i < navDates.length - 1) { setViewDate(navDates[i + 1]); setViewHour(null); }
  }, [navDates, viewDate]);

  // AI-proposed one-click actions persisted with today's briefing. Stored as a
  // JSON array of { label, action, paramsJson }; we parse paramsJson into a
  // params object here and drop anything malformed or outside the allowlist.
  const AI_ACTION_ALLOWLIST = useMemo(
    () => new Set(["addShift", "updateInventory", "createNotification"]),
    [],
  );
  const aiActions = useMemo<AiAction[]>(() => {
    if (!todaysBriefing?.actions) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(todaysBriefing.actions);
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    // The AI sometimes hallucinates an addShift whose staffName is actually a
    // role ("Evening Cashier") or whose staffRoles use the permission level
    // ("manager") instead of a real job role. Either one makes the addShift
    // reducer throw — which surfaces to the user as an opaque "fatal error". So
    // validate against the live roster + roles here and drop anything that can't
    // run, rather than rendering a button that's guaranteed to fail.
    const activeMemberNames = new Set(
      (orgMembers as any[])
        .filter((m) => m.organizationId === organizationId && m.status === "active")
        .map((m) => String(m.displayName || m.email || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const validRoleNames = new Set(
      (staffRoles as any[])
        .filter((r) => r.organizationId === organizationId)
        .map((r) => String(r.name ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const out: AiAction[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const action = String(rec.action ?? "");
      if (!AI_ACTION_ALLOWLIST.has(action)) continue;
      let params: Record<string, unknown> = {};
      const pj = rec.paramsJson;
      if (typeof pj === "string") {
        try {
          const parsed = JSON.parse(pj);
          if (parsed && typeof parsed === "object") params = parsed as Record<string, unknown>;
        } catch {
          continue; // unparseable params → skip rather than run a half-formed action
        }
      } else if (rec.params && typeof rec.params === "object") {
        params = rec.params as Record<string, unknown>;
      }

      // Validate addShift against the real roster + job roles so a bad proposal
      // can never reach the reducer (where it throws an opaque fatal error).
      if (action === "addShift") {
        const staffName = String(params.staffName ?? "").trim().toLowerCase();
        if (!staffName || !activeMemberNames.has(staffName)) {
          console.warn(`[briefing] dropping addShift: "${params.staffName}" is not an active team member`);
          continue;
        }
        const rolesRaw = Array.isArray(params.staffRoles)
          ? (params.staffRoles as unknown[])
          : typeof params.staffRoles === "string"
            ? [params.staffRoles]
            : [];
        const roleNames = rolesRaw.map((r) => String(r ?? "").trim()).filter(Boolean);
        const validRoles = roleNames.filter((r) => validRoleNames.has(r.toLowerCase()));
        if (validRoles.length === 0) {
          console.warn(`[briefing] dropping addShift for "${params.staffName}": no valid job role in ${JSON.stringify(roleNames)} (valid: ${[...validRoleNames].join(", ") || "none"})`);
          continue;
        }
        // Keep only the roles that actually exist, in their proposed order.
        params = { ...params, staffRoles: validRoles };
      }

      out.push({ label: String(rec.label ?? action), action, params });
    }
    return out;
  }, [todaysBriefing, AI_ACTION_ALLOWLIST, orgMembers, staffRoles, organizationId]);

  // ── Live issue detection from current DB state ─────────────────────────
  const issues = useMemo<Issue[]>(() => {
    if (!organizationId) return [];
    const out: Issue[] = [];

    /* eslint-disable @typescript-eslint/no-explicit-any */

    // Pending time-off requests
    for (const r of timeOff as any[]) {
      if (r.organizationId !== organizationId || r.status !== "pending") continue;
      const member = (orgMembers as any[]).find(
        (m) => m.userId?.toString?.() === r.userId?.toString?.(),
      );
      const name = member?.displayName || "Staff member";
      const range = r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`;
      const rid = r.id.toString();
      out.push({
        id: `to-${rid}`,
        severity: "medium",
        icon: Calendar,
        label: `${name} requested time off`,
        sub: range,
        actions: [
          { label: "Reject", action: { kind: "rejectTimeOff", requestId: rid } },
          { label: "Approve", primary: true, action: { kind: "approveTimeOff", requestId: rid } },
        ],
      });
    }

    // Pending shift trades
    for (const r of shiftTrades as any[]) {
      if (r.organizationId !== organizationId || r.status !== "pending") continue;
      const requester = (staffMembers as any[]).find(
        (m) => m.id?.toString?.() === r.requesterId?.toString?.(),
      );
      const target = (staffMembers as any[]).find(
        (m) => m.id?.toString?.() === r.targetId?.toString?.(),
      );
      const reqName = requester?.name || "Staff";
      const tgtName = target?.name || (r.broadcastToAll ? "anyone" : "Staff");
      const tid = r.id.toString();
      out.push({
        id: `st-${tid}`,
        severity: "medium",
        icon: ArrowRightLeft,
        label: `Shift trade · ${reqName} → ${tgtName}`,
        sub: r.comments || r.type,
        actions: [
          { label: "Reject", action: { kind: "rejectTrade", tradeId: tid } },
          { label: "Approve", primary: true, action: { kind: "approveTrade", tradeId: tid } },
        ],
      });
    }

    // Inventory at or below minimum
    for (const i of inventoryItems as any[]) {
      if (i.organizationId !== organizationId) continue;
      const cur = Number(i.currentStock ?? 0);
      const min = Number(i.minStock ?? 0);
      if (min <= 0 || cur > min) continue;
      const isOut = cur <= 0;
      const target = Math.max(min * 2, min + 1);
      const delta = Math.max(1, Math.ceil(target - cur));
      out.push({
        id: `inv-${i.id.toString()}`,
        severity: isOut ? "high" : "medium",
        icon: Package,
        label: `${i.name} ${isOut ? "out of stock" : "below minimum"}`,
        sub: `${cur} / ${min} ${i.unit || ""}`.trim(),
        actions: [
          {
            label: `Restock +${delta}`,
            primary: true,
            action: { kind: "restock", itemName: i.name, delta },
          },
        ],
      });
    }

    // Today's shifts without an assigned org member
    for (const s of shifts as any[]) {
      if (s.organizationId !== organizationId) continue;
      if (s.date !== today) continue;
      if (s.memberId) continue;
      out.push({
        id: `shift-${s.id.toString()}`,
        severity: "high",
        icon: AlertTriangle,
        label: "Unassigned shift today",
        sub: `${s.startTime}–${s.endTime} · ${s.staffName || s.staffRole || "no one"}`,
        actions: [],
      });
    }

    // No coverage today — store is (or may be) open but nobody is scheduled.
    // Offer a one-click auto-schedule for every active team member.
    const setting = (settingsRows as any[]).find((s) => s.organizationId === organizationId);
    const tz = (setting?.timezone as string | undefined) || "UTC";
    const hours = parseOpeningHours(setting?.openingHours ?? null);
    const todayKey = dayKeyForDate(new Date(`${today}T00:00:00`));
    const todayHours = hours?.[todayKey];
    const closedToday = todayHours?.closed === true;
    const todayShiftCount = (shifts as any[]).filter(
      (s) => s.organizationId === organizationId && s.date === today,
    ).length;
    const activeMembers = (orgMembers as any[]).filter(
      (m) => m.organizationId === organizationId && (m.status == null || m.status === "active"),
    );
    // A shift must carry a real JOB role (a staff_role like "Morning Cashier"),
    // never the member's permission role (owner/manager/staff) — addShift
    // rejects unknown roles, which surfaces to the user as "Action failed". So
    // resolve a valid job role per member, and only offer auto-schedule when the
    // store actually has job roles defined.
    const orgJobRoles = (staffRoles as any[])
      .filter((r) => r.organizationId === organizationId)
      .map((r) => String(r.name ?? "").trim())
      .filter(Boolean);
    const jobRoleByLower = new Map(orgJobRoles.map((n) => [n.toLowerCase(), n]));
    if (todayShiftCount === 0 && activeMembers.length > 0 && !closedToday && orgJobRoles.length > 0) {
      const start = todayHours?.open || "09:00";
      const end = todayHours?.close || "17:00";
      const proposed = activeMembers.map((m) => ({
        memberId: m.id.toString(),
        staffName: m.displayName || m.email || "Staff",
        // Use the member's own role only if it's a real job role; otherwise
        // fall back to the store's first defined job role.
        role: jobRoleByLower.get(String(m.role ?? "").trim().toLowerCase()) || orgJobRoles[0],
        start,
        end,
      }));
      out.push({
        id: "coverage-today",
        severity: "high",
        icon: CalendarPlus,
        label: "No one scheduled today",
        sub: `${start}–${end} · auto-schedule ${proposed.length} member${proposed.length > 1 ? "s" : ""}`,
        actions: [
          { label: "Manual", action: { kind: "navigate", href: "/manager/staffing" } },
          { label: "Auto-schedule", primary: true, action: { kind: "autoScheduleToday", shifts: proposed } },
        ],
      });
    }

    // Required-evidence tasks that were due yesterday but never got evidence.
    const yesterday = addDaysLocal(today, -1);
    const requiresEvidenceById = new Map<string, boolean>();
    for (const tk of roleTasks as any[]) {
      if (tk.organizationId != null && tk.organizationId !== organizationId) continue;
      requiresEvidenceById.set(tk.id.toString(), !!tk.requiresEvidence);
    }
    const taskTitleById = new Map<string, string>();
    for (const tk of roleTasks as any[]) taskTitleById.set(tk.id.toString(), tk.title);
    const memberNameById = new Map<string, string>();
    for (const m of orgMembers as any[]) {
      if (m.organizationId !== organizationId) continue;
      memberNameById.set(String(m.id), m.displayName || m.email || "Staff");
    }
    for (const m of staffMembers as any[]) {
      if (m.organizationId !== organizationId) continue;
      memberNameById.set(String(m.id), m.name || "Staff");
    }
    const resolveMemberName = (id: unknown) => memberNameById.get(String(id)) || "Staff";

    const overdueTodayTasks: { title: string; staff: string; dueTime: string | null; requiresEvidence: boolean }[] = [];
    const missingEvidence: string[] = [];
    for (const a of roleTaskAssignments as any[]) {
      if (a.organizationId !== organizationId) continue;
      const taskId = String(a.taskId ?? "");
      if (a.status === "pending" && localDateOf(a.dueAt, tz) === today) {
        const dueMs = tsToMs(a.dueAt);
        if (Number.isFinite(dueMs) && dueMs <= Date.now()) {
          overdueTodayTasks.push({
            title: taskTitleById.get(taskId) || "Task",
            staff: resolveMemberName(a.memberId),
            dueTime: localTimeOf(a.dueAt, tz),
            requiresEvidence: !!requiresEvidenceById.get(taskId),
          });
        }
      }
      if (!requiresEvidenceById.get(taskId)) continue;
      if (localDateOf(a.dueAt, tz) !== yesterday) continue;
      const evid = (() => {
        try { return JSON.parse(a.evidenceUrls ?? "[]"); } catch { return []; }
      })();
      const hasEvidence = (Array.isArray(evid) && evid.length > 0) || !!a.evidenceUrl;
      if (a.status === "completed" && hasEvidence) continue;
      missingEvidence.push(taskTitleById.get(taskId) || "Task");
    }
    if (missingEvidence.length > 0) {
      const uniq = Array.from(new Set(missingEvidence));
      out.push({
        id: "evidence-missing",
        severity: "medium",
        icon: Camera,
        label: `${uniq.length} task${uniq.length > 1 ? "s" : ""} missing evidence`,
        sub: uniq.slice(0, 3).join(", ") + (uniq.length > 3 ? ` +${uniq.length - 3}` : ""),
        actions: [
          { label: "Remind staff", primary: true, action: { kind: "remindEvidence", tasks: uniq } },
        ],
      });
    }
    if (overdueTodayTasks.length > 0) {
      const sample = overdueTodayTasks
        .slice(0, 3)
        .map((task) =>
          `${task.dueTime ?? "due"} ${task.title}${task.requiresEvidence ? " · evidence" : ""}`,
        )
        .join(", ");
      out.push({
        id: "today-tasks-overdue",
        severity: "high",
        icon: Clock,
        label: `${overdueTodayTasks.length} overdue task${overdueTodayTasks.length > 1 ? "s" : ""} today`,
        sub: `${sample}${overdueTodayTasks.length > 3 ? ` +${overdueTodayTasks.length - 3}` : ""}`,
        actions: [],
      });
    }

    /* eslint-enable @typescript-eslint/no-explicit-any */

    const weight = (x: Severity) => (x === "high" ? 0 : x === "medium" ? 1 : 2);
    return out.sort((a, b) => weight(a.severity) - weight(b.severity));
  }, [organizationId, today, timeOff, shiftTrades, inventoryItems, shifts, orgMembers, staffMembers, staffRoles, roleTasks, roleTaskAssignments, settingsRows]);

  // Current local hour — drives the live pulse, "next scan" time, and which
  // timeline hours read as "not scanned yet" vs "scanned & clear".
  const nowHour = new Date().getHours();

  const orgSetting = useMemo(
    () =>
      (settingsRows as Array<Record<string, unknown>>).find(
        (s) => s.organizationId === organizationId,
      ),
    [settingsRows, organizationId],
  );
  const tz = (orgSetting?.timezone as string | undefined) || "UTC";

  // ── Today's attendance + yesterday's task completion ───────────────────
  // Deterministic, computed straight from live punch_event + role-task rows so
  // these always reflect reality (not the AI's write-up). "On shift" mirrors the
  // punch-in terminal (open "in", on break if an open "break-start" exists).
  const todayStatus = useMemo(() => {
    if (!organizationId) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const yesterday = addDaysLocal(today, -1);

    // Attendance from punch_event.
    const evts = (punchEvents as any[]).filter((e) => e.organizationId === organizationId);
    const nameByMemberId = new Map<string, string>();
    for (const m of orgMembers as any[]) {
      if (m.organizationId !== organizationId) continue;
      nameByMemberId.set(m.id?.toString?.() ?? String(m.id), m.displayName || m.email || "Staff");
    }
    const resolveName = (id: any) => nameByMemberId.get(String(id)) || "Staff";
    const onShift = evts
      .filter((e) => e.action === "in" && !e.closed)
      .map((e) => ({
        name: resolveName(e.memberId),
        since: localTimeOf(e.at, tz),
        onBreak: evts.some(
          (b) => String(b.memberId) === String(e.memberId) && b.action === "break-start" && !b.closed,
        ),
      }));
    const firstIn = new Map<string, number>();
    for (const e of evts) {
      if (e.action !== "in") continue;
      if (localDateOf(e.at, tz) !== today) continue;
      const mid = String(e.memberId);
      const ms = tsToMs(e.at);
      if (!Number.isFinite(ms)) continue;
      if (!firstIn.has(mid) || ms < (firstIn.get(mid) as number)) firstIn.set(mid, ms);
    }
    const punchedInToday = [...firstIn.entries()].map(([mid, ms]) => ({
      name: resolveName(mid),
      firstIn: localTimeOf(ms, tz),
    }));

    // Role-task completion — today's progress and yesterday's outcome.
    let dueY = 0;
    let doneY = 0;
    let skippedY = 0;
    let dueT = 0;
    let doneT = 0;
    let skippedT = 0;
    for (const a of roleTaskAssignments as any[]) {
      if (a.organizationId !== organizationId) continue;
      const dueDate = localDateOf(a.dueAt, tz);
      if (dueDate === yesterday) {
        dueY++;
        if (a.status === "completed") doneY++;
        else if (a.status === "skipped") skippedY++;
      } else if (dueDate === today) {
        dueT++;
        if (a.status === "completed") doneT++;
        else if (a.status === "skipped") skippedT++;
      }
    }
    const notDoneY = Math.max(0, dueY - doneY - skippedY);
    const pendingT = Math.max(0, dueT - doneT - skippedT);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { onShift, punchedInToday, dueY, doneY, skippedY, notDoneY, dueT, doneT, skippedT, pendingT };
  }, [organizationId, today, tz, punchEvents, orgMembers, roleTaskAssignments]);

  // ── Horizontal hourly-scan timeline ("the pulse") ──────────────────────
  // Mr. Merchiva scans the store every hour; each scan that ran becomes a dot
  // on a single horizontal track for the viewed day. Hours where it flagged a
  // problem light up rose (and stay clickable to read that snapshot); quiet
  // hours are small grey dots; hours still ahead of "now" are hollow. This
  // replaces the old 64px greyed-out vertical 24-hour rail.
  type ScanState = "issue" | "clear" | "pending" | "skip";
  const scanTimeline = useMemo(() => {
    // Business window from the store's opening hours, widened so it always
    // covers every hour that actually has a scan (and "now" on today).
    let openH = 6;
    let closeH = 22;
    const oh = parseOpeningHours((orgSetting?.openingHours as string) ?? null);
    const dh = oh?.[dayKeyForDate(new Date(`${viewDate}T00:00:00`))];
    if (dh && !dh.closed) {
      const o = Number.parseInt(String(dh.open ?? "").slice(0, 2), 10);
      const c = Number.parseInt(String(dh.close ?? "").slice(0, 2), 10);
      if (Number.isFinite(o)) openH = o;
      if (Number.isFinite(c)) closeH = c;
    }
    for (const h of hourMap.keys()) {
      openH = Math.min(openH, h);
      closeH = Math.max(closeH, h);
    }
    if (viewDate === today) closeH = Math.max(closeH, nowHour);
    openH = Math.max(0, Math.min(openH, 23));
    closeH = Math.min(23, Math.max(closeH, openH + 1));

    // One row per hour. The view lays these out as equal flex columns, so we
    // don't compute pixel positions here — only state + which labels to show.
    let issueCount = 0;
    const hh = (h: number) => String(h).padStart(2, "0");
    const rows: {
      h: number;
      state: ScanState;
      snap: BriefingRow | null;
      clickable: boolean;
      flag: boolean;
      tickLabel: string | null;
    }[] = [];
    for (let h = openH; h <= closeH; h++) {
      const snap = hourMap.get(h) ?? null;
      const problem = snap ? parseBriefingKeys(snap.problemKeys).length > 0 : false;
      if (problem) issueCount++;
      const future = viewDate === today && h > nowHour;
      const state: ScanState = problem ? "issue" : snap ? "clear" : future ? "pending" : "skip";
      rows.push({ h, state, snap, clickable: !!snap, flag: problem, tickLabel: null });
    }

    // Sparse context ticks (open · mid · close), but never on — or right next
    // to — an hour that already shows its own rose HH:00 label, so they can't
    // collide. Each tick lives in its own column, centred under its hour.
    const span = Math.max(1, closeH - openH);
    const issueHours = rows.filter((r) => r.state === "issue").map((r) => r.h);
    const gap = Math.max(1, Math.round(span * 0.12));
    const near = (h: number) => issueHours.some((ih) => Math.abs(ih - h) <= gap);
    const mid = Math.round((openH + closeH) / 2);
    for (const h of new Set([openH, mid, closeH])) {
      if (near(h)) continue;
      const r = rows.find((x) => x.h === h);
      if (r && r.state !== "issue") r.tickLabel = hh(h);
    }

    return {
      rows,
      openH,
      closeH,
      scanCount: hourMap.size,
      issueCount,
      isToday: viewDate === today,
    };
  }, [orgSetting, viewDate, today, nowHour, hourMap]);

  const [busyBriefing, setBusyBriefing] = useState(false);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // ── Build briefing context for the AI ──────────────────────────────────
  // Shared with the server-side cron via lib/insights/build-context.ts.
  const buildBriefingContext = useCallback(() => {
    return buildBriefingContextShared(
      {
        organizations: organizations as unknown[],
        orgMembers: orgMembers as unknown[],
        staffMembers: staffMembers as unknown[],
        inventoryItems: inventoryItems as unknown[],
        shifts: shifts as unknown[],
        timeOff: timeOff as unknown[],
        shiftTrades: shiftTrades as unknown[],
        salesRecords: salesRecords as unknown[],
        payments: payments as unknown[],
        products: products as unknown[],
        staffRoles: staffRoles as unknown[],
        roleTasks: roleTasks as unknown[],
        roleTaskAssignments: roleTaskAssignments as unknown[],
        notifications: notifications as unknown[],
        shiftPresets: shiftPresets as unknown[],
        staffAvailability: staffAvailability as unknown[],
        coupons: coupons as unknown[],
        settings: settingsRows as unknown[],
        punchEvents: punchEvents as unknown[],
      },
      organizationId ?? "",
      today,
      locale,
      Date.now(),
    );
  }, [
    organizations, orgMembers, staffMembers, inventoryItems, shifts, timeOff,
    shiftTrades, salesRecords, payments, products, staffRoles, roleTasks,
    roleTaskAssignments, notifications, shiftPresets, staffAvailability, coupons,
    settingsRows, punchEvents, organizationId, today, locale,
  ]);

  // Hours of today that already have a snapshot — kept in a ref so the
  // fallback path below can consult a fresh value without re-creating the
  // generate callback on every briefing update.
  const todayHoursRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    todayHoursRef.current = new Set(
      (byDate.get(todayLocal()) ?? [])
        .map((r) => r.hour)
        .filter((h): h is number => h != null),
    );
  }, [byDate]);

  // ── Generate briefing ──────────────────────────────────────────────────
  // fallbackOnError (auto path): when the LLM route fails, still persist a
  // deterministic no-AI snapshot so the hour is never left empty — but only
  // if the hour has no snapshot yet, so a good one is never downgraded.
  const generateBriefing = useCallback(async (opts?: { fallbackOnError?: boolean }) => {
    if (!organizationId || busyBriefing) return;
    setBusyBriefing(true);
    try {
      const context = buildBriefingContext();
      const problemKeys = briefingProblemKeys(context);
      const saveFallback = async () => {
        const hour = new Date().getHours();
        if (todayHoursRef.current.has(hour)) return;
        const fb = buildFallbackBriefing(problemKeys, locale, {
          done: context.todayTasks.completed,
          total: context.todayTasks.total,
        });
        await saveDailyBriefing({
          date: today,
          content: fb.content,
          summary: fb.summary,
          generatedBy: "auto-fallback",
          problemKeys: JSON.stringify(problemKeys),
          hour,
        });
      };
      let res: Response;
      try {
        res = await fetch("/api/insights/morning-briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, lang: locale, dateStr: today, organizationId }),
        });
      } catch (e) {
        if (opts?.fallbackOnError) await saveFallback();
        throw e;
      }
      if (!res.ok) {
        if (opts?.fallbackOnError) {
          await saveFallback();
          return;
        }
        const err = await res.json().catch(() => ({}));
        toast.error("Briefing failed", { description: err.error });
        return;
      }
      const data = (await res.json()) as {
        summary: string;
        content: string;
        date: string;
        generatedBy: string;
        actions?: unknown[];
      };
      await saveDailyBriefing({
        date: data.date,
        content: data.content,
        summary: data.summary,
        generatedBy: data.generatedBy,
        actions: data.actions && data.actions.length ? JSON.stringify(data.actions) : undefined,
        // Keep problemKeys fresh so the hourly cron's new-problem diff is accurate.
        problemKeys: JSON.stringify(problemKeys),
        // Snapshot this hour so the chat's time-rail can browse the day's runs.
        hour: new Date().getHours(),
      });
    } catch (e) {
      console.error("[briefing] error:", e);
    } finally {
      setBusyBriefing(false);
    }
  }, [organizationId, busyBriefing, buildBriefingContext, locale, today]);

  // The hourly cron (/api/cron/morning-briefing) is the PRIMARY generator — it
  // scans every active-admin org each hour whether or not anyone is on the
  // dashboard. But every hour MUST get a snapshot, so this is the client-side
  // safety net: if the dashboard is open and the current hour still has no
  // snapshot a few minutes past the top of the hour (cron missed/failed, local
  // dev without a cron runner, org created mid-hour), generate one from here.
  // The reducer upserts on (org, date, hour), so overlapping with the cron is
  // harmless. Capped at 2 attempts per hour so a failing API isn't hammered.
  const autoGenAttempts = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    // Staff can't save briefings (reducer requires manager/owner) — admins only.
    // Waiting for `briefingsReady` means an empty byDate really is "no snapshot
    // for this hour yet", never "subscription still loading" — entering or
    // refreshing the page must NOT re-generate when the hour already ran.
    if (!organizationId || !briefingsReady || !isAdmin) return;
    // Attempts are persisted per (org, date, hour) so page refreshes don't
    // reset the budget; in-memory map is the private-mode fallback.
    const readAttempts = (key: string): number => {
      try {
        const v = window.localStorage.getItem(`mbAutoGen:${key}`);
        if (v != null) return Number(v) || 0;
      } catch { /* storage unavailable */ }
      return autoGenAttempts.current.get(key) ?? 0;
    };
    const writeAttempts = (key: string, n: number) => {
      autoGenAttempts.current.set(key, n);
      try { window.localStorage.setItem(`mbAutoGen:${key}`, String(n)); } catch { /* ignore */ }
    };
    // Prune markers from previous days so the store doesn't accumulate.
    try {
      const dateStr = todayLocal();
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("mbAutoGen:") && !k.includes(`:${dateStr}:`)) {
          window.localStorage.removeItem(k);
        }
      }
    } catch { /* ignore */ }
    const check = () => {
      const now = new Date();
      if (now.getMinutes() < 3) return; // give the server cron a head start
      const dateStr = todayLocal();
      const hour = now.getHours();
      if (busyBriefing) return;
      // Snapshot already exists for this hour (cron, another tab, earlier
      // visit) — nothing to do. This is the normal path on page entry.
      const hasSnapshot = (byDate.get(dateStr) ?? []).some((r) => r.hour === hour);
      if (hasSnapshot) return;
      const key = `${organizationId}:${dateStr}:${hour}`;
      const attempts = readAttempts(key);
      if (attempts >= 2) return; // don't hammer a failing API — next hour retries
      writeAttempts(key, attempts + 1);
      void generateBriefing({ fallbackOnError: true });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [organizationId, briefingsReady, isAdmin, byDate, busyBriefing, generateBriefing]);

  // ── Quick-action dispatcher (re-uses Mr. Merchiva's reducer wrappers) ─
  const runAction = useCallback(
    async (issueId: string, action: IssueAction) => {
      // Navigation is instant — never flips the row into a busy/spinner state.
      if (action.kind === "navigate") {
        router.push(action.href);
        return;
      }
      if (busyActions.has(issueId)) return;
      setBusyActions((prev) => new Set(prev).add(issueId));
      try {
        switch (action.kind) {
          case "approveTimeOff":
            await updateTimeOffStatus(action.requestId, "approved");
            toast.success("Time-off approved");
            break;
          case "rejectTimeOff":
            await updateTimeOffStatus(action.requestId, "rejected");
            toast.info("Time-off rejected");
            break;
          case "approveTrade":
            await managerApproveShiftTrade(action.tradeId, "", true);
            toast.success("Shift trade approved");
            break;
          case "rejectTrade":
            await managerApproveShiftTrade(action.tradeId, "", false);
            toast.info("Shift trade rejected");
            break;
          case "restock":
            await addInventoryTransaction({
              itemName: action.itemName,
              type: "in",
              quantity: action.delta,
              date: today,
              notes: "Restocked via Mr. Merchiva",
            });
            toast.success(`Restocked ${action.itemName} +${action.delta}`);
            break;
          case "autoScheduleToday": {
            let n = 0;
            for (const sh of action.shifts) {
              await addShift({
                memberId: sh.memberId,
                staffName: sh.staffName,
                staffRole: sh.role,
                staffRoles: JSON.stringify([sh.role]),
                date: today,
                shiftType: "morning",
                startTime: sh.start,
                endTime: sh.end,
                predictedDemand: "medium",
              });
              n++;
            }
            toast.success(`Scheduled ${n} shift${n > 1 ? "s" : ""} for today`);
            break;
          }
          case "remindEvidence":
            await createNotification({
              type: "urgent",
              title: "Submit task evidence",
              body:
                `Please submit the required photo/note for: ` +
                `${action.tasks.slice(0, 5).join(", ")}${action.tasks.length > 5 ? "…" : ""}`,
              link: "/store",
            });
            toast.success("Reminder sent to staff");
            break;
        }
      } catch (e) {
        console.error("[merchiva] action failed:", e);
        toast.error("Action failed");
      } finally {
        setBusyActions((prev) => {
          const next = new Set(prev);
          next.delete(issueId);
          return next;
        });
      }
    },
    [busyActions, today, router],
  );

  // ── AI-proposed action execution (reuses Mr. Merchiva's executeAction) ──
  const [busyAi, setBusyAi] = useState<Set<number>>(new Set());
  const [dismissedAi, setDismissedAi] = useState<Set<number>>(new Set());
  const runAiAction = useCallback(
    async (idx: number, act: AiAction) => {
      if (busyAi.has(idx)) return;
      setBusyAi((prev) => new Set(prev).add(idx));
      try {
        // Build the flat {action, ...params} object executeAction expects.
        const payload: Record<string, unknown> = { action: act.action, ...act.params };
        // addShift needs a memberId resolved from the team by staffName —
        // mirror the chat's handleApprove so a bad name can't slip through.
        if (act.action === "addShift") {
          const name = String(act.params.staffName ?? "");
          const member = (orgMembers as Array<Record<string, unknown>>).find(
            (m) => (m.displayName || m.email) === name,
          );
          if (!member) {
            toast.error(`"${name}" is not a team member`);
            return;
          }
          payload.memberId = (member.id as { toString(): string }).toString();
        }
        await executeAction(payload);
        setDismissedAi((prev) => new Set(prev).add(idx));
      } catch (e) {
        console.error("[merchiva] AI action failed:", e);
        // executeAction surfaces its own toast on failure.
      } finally {
        setBusyAi((prev) => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
      }
    },
    [busyAi, orgMembers],
  );

  // ── Approve-all (一键批准全部) — runs each issue's primary action, then any
  //    still-pending AI-proposed actions, in turn. ──
  const [busyAll, setBusyAll] = useState(false);
  const primaryOf = useCallback((iss: Issue): IssueAction | null => {
    const p = iss.actions.find((a) => a.primary);
    if (p) return p.action;
    return iss.actions.length === 1 ? iss.actions[0].action : null;
  }, []);
  const approveAll = useCallback(async () => {
    if (busyAll) return;
    setBusyAll(true);
    try {
      for (const iss of issues) {
        const primary = primaryOf(iss);
        if (!primary) continue;
        await runAction(iss.id, primary);
      }
      for (let i = 0; i < aiActions.length; i++) {
        if (dismissedAi.has(i)) continue;
        await runAiAction(i, aiActions[i]);
      }
    } finally {
      setBusyAll(false);
    }
  }, [busyAll, issues, primaryOf, runAction, aiActions, dismissedAi, runAiAction]);

  if (!isAdmin) return null;

  const pendingAiActions = aiActions.filter((_, i) => !dismissedAi.has(i));
  const issueCount = issues.length;
  const approvableCount =
    issues.filter((i) => primaryOf(i) !== null).length + pendingAiActions.length;
  const hasHigh = issues.some((i) => i.severity === "high");
  const agentState: AgentState = busyBriefing
    ? "working"
    : hasHigh
    ? "attention"
    : issueCount > 0
    ? "idle"
    : todaysBriefing
    ? "done"
    : "idle";

  // Header / footer display helpers.
  const onToday = viewDate === today;
  const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;
  // Latest scan time for the viewed day (drives the header "· latest HH:00").
  const latestHour = displayedBriefing?.hour ?? dayLatest?.hour ?? null;
  // Next hourly scan (today only) — the cron runs on the hour.
  const nextScanHour = (nowHour + 1) % 24;
  const weekdayLabel = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
        new Date(`${viewDate}T00:00:00`),
      );
    } catch {
      return "";
    }
  })();
  // All-clear when nothing is queued for the manager on the live view.
  const allClear =
    viewingLatest && issueCount === 0 && pendingAiActions.length === 0 && !!displayedBriefing;
  const hasFooter = briefingHistory.length > 0 || onToday;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          {/* Header — identity + a live "Hourly scan · latest HH:00" status.
              The day pager and regenerate move to the right where they belong;
              only the identity block toggles collapse. */}
          <div className="flex w-full items-center gap-2.5">
            <div
              role="button"
              tabIndex={0}
              className="flex flex-1 min-w-0 items-center gap-2.5 text-left cursor-pointer"
              onClick={() => setBriefingExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setBriefingExpanded((v) => !v);
                }
              }}
            >
              <MerchivaMark state={agentState} />
              <div className="flex flex-1 min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm tracking-tight">Mr. Merchiva</CardTitle>
                  {/* When collapsed, the body's count is hidden — surface it here. */}
                  {!briefingExpanded && issueCount > 0 && (
                    <span
                      className={cn(
                        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] tabular-nums text-white",
                        hasHigh ? "bg-destructive" : "bg-amber-500",
                      )}
                    >
                      {issueCount}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full bg-destructive",
                      onToday && !busyBriefing && "animate-pulse",
                    )}
                  />
                  <Eyebrow as="span" size="xs">
                    {busyBriefing
                      ? t("dashboard.scanning") || "scanning…"
                      : t("dashboard.hourlyScan") || "Hourly scan"}
                  </Eyebrow>
                  {latestHour != null && (
                    <>
                      <span className="text-border">·</span>
                      <span className="font-mono text-[10px] tabular-nums">
                        {t("dashboard.latest") || "latest"} {fmtHour(latestHour)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* day pager */}
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={goPrevDay}
                  disabled={viewIdx <= 0}
                  className="text-muted-foreground"
                  title={t("common.previous") || "Previous day"}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-[58px] text-center font-mono text-[10.5px] font-medium tabular-nums text-foreground">
                  {weekdayLabel ? `${weekdayLabel} · ` : ""}
                  {monthDay(viewDate)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={goNextDay}
                  disabled={viewIdx < 0 || viewIdx >= navDates.length - 1}
                  className="text-muted-foreground"
                  title={t("common.next") || "Next day"}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => void generateBriefing()}
                disabled={busyBriefing}
                className="text-muted-foreground"
                title={t("dashboard.regenerate") || "Regenerate"}
              >
                {busyBriefing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setBriefingExpanded((v) => !v)}
                className="text-muted-foreground"
                title={
                  briefingExpanded
                    ? t("common.collapse") || "Collapse"
                    : t("common.expand") || "Expand"
                }
              >
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", briefingExpanded && "rotate-180")}
                />
              </Button>
            </div>
          </div>
        </CardHeader>

        {briefingExpanded && (
          <CardContent className="space-y-4 pt-0">
            {/* ── Hourly-scan pulse ───────────────────────────────────────────
                Mr. Merchiva scans the store every hour; each scan that ran is a
                dot on one horizontal track. Quiet hours are small grey dots, the
                hour it flagged a problem lights up rose (and stays clickable to
                read that snapshot), hours still ahead of "now" are hollow. This
                replaces the greyed-out 64px vertical 24-hour rail. */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <Eyebrow as="span" size="xs">
                  {scanTimeline.isToday
                    ? t("dashboard.todayScan") || "Today's scan"
                    : t("dashboard.hourlyScan") || "Hourly scan"}
                  <span className="text-muted-foreground/60">
                    {" · "}
                    {t("dashboard.perHour") || "hourly"}
                  </span>
                </Eyebrow>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {scanTimeline.scanCount === 0 ? (
                    t("dashboard.awaitingScan") || "Awaiting first scan"
                  ) : (
                    <>
                      {scanTimeline.scanCount} {t("dashboard.scans") || "scans"}
                      {scanTimeline.issueCount > 0 && (
                        <span className="text-destructive">
                          {" · "}
                          {scanTimeline.issueCount} {t("dashboard.flagged") || "flagged"}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>

              {/* Equal flex columns — one per hour. Flex centring keeps every
                  dot exactly on the track, and each label is bounded to its own
                  column so flags/hour-labels/ticks can never overlap. Each hour
                  is a full-height click column (a comfortable tap target). */}
              <div className="relative mx-1.5 flex items-stretch">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-[19px] h-[3px] -translate-y-1/2 rounded-full bg-border"
                />
                {scanTimeline.rows.map((r) => {
                  const active =
                    !!r.snap && displayedBriefing?.id.toString() === r.snap.id.toString();
                  const dot =
                    r.state === "issue"
                      ? cn(
                          "rounded-full bg-destructive ring-4 ring-destructive/15",
                          active ? "h-3 w-3 ring-destructive/30" : "h-2.5 w-2.5",
                        )
                      : r.state === "clear"
                      ? cn(
                          "rounded-full bg-muted-foreground/80",
                          active ? "h-2.5 w-2.5 bg-muted-foreground ring-2 ring-muted-foreground/30" : "h-1.5 w-1.5",
                        )
                      : r.state === "pending"
                      ? "h-1.5 w-1.5 rounded-full border border-border bg-card"
                      : "h-1 w-1 rounded-full bg-border";
                  const hourLabel = `${String(r.h).padStart(2, "0")}:00`;
                  const inner = (
                    <>
                      {/* flag row (fixed height so every dot lines up) */}
                      <span className="flex h-[11px] items-end leading-none">
                        {r.flag && (
                          <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-destructive">
                            {t("dashboard.issueFlag") || "issue"}
                          </span>
                        )}
                      </span>
                      {/* dot row — fixed height centres each dot on the track */}
                      <span className="relative z-10 flex h-4 items-center">
                        <span className={cn("block transition-all", dot)} />
                      </span>
                      {/* label row (issue HH:00, else a sparse context tick) */}
                      <span className="flex h-[12px] items-start leading-none">
                        {r.state === "issue" ? (
                          <span className="font-mono text-[9px] font-semibold tabular-nums text-destructive">
                            {hourLabel}
                          </span>
                        ) : r.tickLabel ? (
                          <span className="font-mono text-[8.5px] tabular-nums text-muted-foreground/70">
                            {r.tickLabel}
                          </span>
                        ) : null}
                      </span>
                    </>
                  );
                  return r.clickable ? (
                    <button
                      key={r.h}
                      type="button"
                      onClick={() => setViewHour(r.h)}
                      title={`${viewDate} ${hourLabel}`}
                      aria-label={
                        r.state === "issue"
                          ? `${hourLabel} — ${t("dashboard.issueFlag") || "issue"}`
                          : hourLabel
                      }
                      className="flex min-w-0 flex-1 flex-col items-center rounded hover:bg-muted/50"
                    >
                      {inner}
                    </button>
                  ) : (
                    <span
                      key={r.h}
                      aria-hidden
                      className="flex min-w-0 flex-1 flex-col items-center"
                    >
                      {inner}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* ── Today's attendance + yesterday's tasks (deterministic) ──
                Answers "who's clocked in today" and "did yesterday's tasks get
                done" straight from live punch + role-task rows, independent of
                the AI write-up. Only on the live (today) view. */}
            {viewingLatest && todayStatus && (
              <div className="space-y-2.5">
                {/* Today's attendance */}
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Eyebrow as="span" size="xs">
                      {t("dashboard.attendance.title") || "Today's attendance"}
                    </Eyebrow>
                    <span className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-muted px-1 font-mono text-[9.5px] tabular-nums">
                      {todayStatus.onShift.length}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    {todayStatus.punchedInToday.length > 0 && (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {todayStatus.punchedInToday.length} {t("dashboard.attendance.punchedIn") || "punched in"}
                      </span>
                    )}
                  </div>
                  {todayStatus.onShift.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      {todayStatus.punchedInToday.length > 0
                        ? t("dashboard.attendance.allOut") || "Everyone has clocked out."
                        : t("dashboard.attendance.nobody") || "No one has punched in yet."}
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {todayStatus.onShift.map((s, i) => (
                        <li
                          key={`${s.name}-${i}`}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px]",
                            s.onBreak
                              ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20"
                              : "border-border bg-muted/40",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              s.onBreak ? "bg-amber-500" : "bg-emerald-500",
                            )}
                          />
                          <span className="font-medium">{s.name}</span>
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                            {s.onBreak
                              ? t("dashboard.attendance.onBreak") || "on break"
                              : s.since ?? ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Today's tasks — live completion progress, always shown */}
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Eyebrow as="span" size="xs">
                      {t("dashboard.todayTasks.title") || "Today's tasks"}
                    </Eyebrow>
                    <div className="h-px flex-1 bg-border" />
                    {todayStatus.dueT > 0 && (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {todayStatus.doneT}/{todayStatus.dueT} {t("dashboard.todayTasks.done") || "completed"}
                      </span>
                    )}
                  </div>
                  {todayStatus.dueT === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      {t("dashboard.todayTasks.none") || "No tasks due today."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2 py-1",
                          todayStatus.doneT >= todayStatus.dueT
                            ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                            : "border-border bg-muted/40",
                        )}
                      >
                        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-mono tabular-nums">
                          {todayStatus.doneT}/{todayStatus.dueT}
                        </span>
                        <span className="text-muted-foreground">
                          {t("dashboard.todayTasks.done") || "completed"}
                        </span>
                      </span>
                      {todayStatus.pendingT > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1 dark:border-amber-900/50 dark:bg-amber-950/20">
                          <span className="font-mono tabular-nums">{todayStatus.pendingT}</span>
                          <span className="text-amber-700 dark:text-amber-400">
                            {t("dashboard.todayTasks.pending") || "pending"}
                          </span>
                        </span>
                      )}
                      {todayStatus.skippedT > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-muted-foreground">
                          <span className="font-mono tabular-nums">{todayStatus.skippedT}</span>
                          <span>{t("dashboard.todayTasks.skipped") || "skipped"}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Yesterday's tasks */}
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Eyebrow as="span" size="xs">
                      {t("dashboard.yesterdayTasks.title") || "Yesterday's tasks"}
                    </Eyebrow>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {todayStatus.dueY === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      {t("dashboard.yesterdayTasks.none") || "No tasks were due yesterday."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1">
                        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-mono tabular-nums">
                          {todayStatus.doneY}/{todayStatus.dueY}
                        </span>
                        <span className="text-muted-foreground">
                          {t("dashboard.yesterdayTasks.done") || "done"}
                        </span>
                      </span>
                      {todayStatus.notDoneY > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1 dark:border-amber-900/50 dark:bg-amber-950/20">
                          <span className="font-mono tabular-nums">{todayStatus.notDoneY}</span>
                          <span className="text-amber-700 dark:text-amber-400">
                            {t("dashboard.yesterdayTasks.notDone") || "not done"}
                          </span>
                        </span>
                      )}
                      {todayStatus.skippedY > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-muted-foreground">
                          <span className="font-mono tabular-nums">{todayStatus.skippedY}</span>
                          <span>{t("dashboard.yesterdayTasks.skipped") || "skipped"}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Viewing a past snapshot — jump back to the live view. */}
            {!viewingLatest && displayedBriefing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewDate(today);
                  setViewHour(null);
                }}
                className="w-full justify-start gap-1.5 px-2 text-[11px] text-muted-foreground"
              >
                <History className="h-3 w-3" />
                {slotTitle(displayedBriefing.date, displayedBriefing.hour)}
                <Eyebrow as="span" size="xs" className="ml-auto text-current">
                  {t("dashboard.backToNow") || "Back to now"}
                </Eyebrow>
              </Button>
            )}

            {/* ── Needs attention — the live issues, lifted to be the main event ── */}
            {viewingLatest && issueCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Eyebrow as="span" size="xs">
                    {t("dashboard.needsAttention") || "Needs attention"}
                  </Eyebrow>
                  <span className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-destructive px-1 font-mono text-[9.5px] tabular-nums text-white">
                    {issueCount}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                  {approvableCount > 1 && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-6 gap-1 px-2 text-[10px]"
                      disabled={busyAll || busyActions.size > 0}
                      onClick={approveAll}
                      title={t("dashboard.approveAll") || "Approve all"}
                    >
                      {busyAll ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3 w-3" />
                      )}
                      {t("dashboard.approveAll") || "Approve all"} · {approvableCount}
                    </Button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {issues.map((iss) => (
                    <IssueRow
                      key={iss.id}
                      issue={iss}
                      busy={busyActions.has(iss.id)}
                      onAction={(a) => runAction(iss.id, a)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* ── All-clear reassurance — replaces the old garbled "⚠️ 高危" line ── */}
            {allClear && (
              <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                </span>
                {t("dashboard.allClear") ||
                  "This scan came back clean — nothing needs your attention right now."}
              </div>
            )}

            {/* ── AI-proposed one-click actions (Mr. Merchiva suggestions) ── */}
            {viewingLatest && pendingAiActions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <MerchivaLogo size={11} />
                  <Eyebrow as="span" size="xs">
                    {t("dashboard.suggestedActions") || "Suggested actions"} · {pendingAiActions.length}
                  </Eyebrow>
                  <div className="h-px flex-1 bg-border" />
                  {issueCount === 0 && approvableCount > 1 && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-6 gap-1 px-2 text-[10px]"
                      disabled={busyAll || busyAi.size > 0}
                      onClick={approveAll}
                      title={t("dashboard.approveAll") || "Approve all"}
                    >
                      {busyAll ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3 w-3" />
                      )}
                      {t("dashboard.approveAll") || "Approve all"} · {approvableCount}
                    </Button>
                  )}
                </div>
                <ul className="space-y-1">
                  {aiActions.map((act, i) =>
                    dismissedAi.has(i) ? null : (
                      <li
                        key={`ai-${i}`}
                        className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-[12px]"
                      >
                        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{act.label}</div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {act.action}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={busyAi.has(i) || busyAll}
                            onClick={() => setDismissedAi((prev) => new Set(prev).add(i))}
                          >
                            {t("dashboard.dismiss") || "Dismiss"}
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-2 text-[11px]"
                            disabled={busyAi.has(i) || busyAll}
                            onClick={() => runAiAction(i, act)}
                          >
                            {busyAi.has(i) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              t("dashboard.approve") || "Approve"
                            )}
                          </Button>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            {/* ── The generated briefing write-up ── */}
            {displayedBriefing ? (
              <AiBriefingCards html={displayedBriefing.content} />
            ) : busyBriefing ? (
              <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("dashboard.generating") || "Generating today’s briefing…"}
              </div>
            ) : (
              <p className="py-1 text-[12px] text-muted-foreground">
                {t("dashboard.noBriefing") || "No briefing yet. Tap refresh to generate one."}
              </p>
            )}

            {/* ── Footer — past-briefings access + next-scan time ── */}
            {hasFooter && (
              <div className="flex items-center gap-2 border-t border-border pt-2.5">
                {briefingHistory.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setHistoryExpanded((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <History className="h-3 w-3" />
                    <Eyebrow as="span" size="xs" className="text-current">
                      {t("dashboard.pastBriefings") || "Past briefings"} · {briefingHistory.length}
                    </Eyebrow>
                    <ChevronDown
                      className={cn("h-3 w-3 transition-transform", historyExpanded && "rotate-180")}
                    />
                  </button>
                ) : (
                  <span />
                )}
                <span className="flex-1" />
                {onToday && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {t("dashboard.nextScan") || "Next scan"} {fmtHour(nextScanHour)}
                  </span>
                )}
              </div>
            )}

            {/* Past briefings list (expanded from the footer toggle) */}
            {briefingHistory.length > 0 && historyExpanded && (
              <ul className="max-h-56 space-y-1 overflow-auto">
                {briefingHistory.map((b) => (
                  <li
                    key={b.id.toString()}
                    className="grid grid-cols-[88px_1fr] items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-[12px]"
                  >
                    <span className="font-mono tabular-nums text-muted-foreground">{b.date}</span>
                    <span className="truncate">{b.summary || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function IssueRow({
  issue,
  busy,
  onAction,
}: {
  issue: Issue;
  busy: boolean;
  onAction: (a: IssueAction) => void;
}) {
  const Icon = issue.icon;
  // Severity sets the card's emphasis: high-severity issues are lifted onto a
  // danger-tinted card (the design's "main event becomes the protagonist"),
  // lower ones stay quiet so the urgent thing reads first.
  const tone =
    issue.severity === "high"
      ? {
          card: TONE_CARD.danger,
          pip: cn(STATUS_TONE_DOT.danger, "ring-2 ring-destructive/20"),
          icon: STATUS_TONE_TEXT.danger,
        }
      : issue.severity === "medium"
      ? { card: TONE_CARD.neutral, pip: STATUS_TONE_DOT.warning, icon: STATUS_TONE_TEXT.neutral }
      : { card: "border-border", pip: STATUS_TONE_DOT.neutral, icon: STATUS_TONE_TEXT.neutral };
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border px-2.5 py-2 text-[12px]",
        tone.card,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.pip)} />
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone.icon)} />
      <div className="min-w-[120px] flex-1">
        <div className="truncate font-medium">{issue.label}</div>
        {issue.sub && (
          <div className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
            {issue.sub}
          </div>
        )}
      </div>
      {issue.actions.length > 0 && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {issue.actions.map((act) => (
            <Button
              key={act.label}
              size="sm"
              variant={act.primary ? "default" : "ghost"}
              className="h-7 px-2.5 text-[11px]"
              disabled={busy}
              onClick={() => onAction(act.action)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : act.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
