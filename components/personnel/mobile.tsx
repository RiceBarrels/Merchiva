"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  Ban,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileEdit,
  HelpCircle,
  Inbox,
  Mail,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Shield,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOrgInvitations,
  useOrgMembers,
  useRoleTasks,
  useShifts,
  useShiftTrades,
  useStaffRoles,
  useTimeOffRequests,
} from "@/lib/spacetimedb/hooks";
import {
  managerApproveShiftTrade,
  updateTimeOffStatus,
} from "@/lib/spacetimedb/actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Shared types ───────────────────────────────────────────────────────────

interface ShiftRow {
  id: string;
  memberId: string | null;
  staffName: string;
  staffRoles: string[];
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
}

interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  description: string;
}

interface RoleTaskRow {
  id: string;
  roleId: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimeShort(t: string): string {
  const [hStr, mStr] = (t || "00:00").split(":");
  const h = Number(hStr);
  const m = mStr ?? "00";
  return m === "00" ? `${h}${h < 12 ? "a" : "p"}` : `${h}:${m}${h < 12 ? "a" : "p"}`;
}

function formatTimeLong(t: string): string {
  const [hStr, mStr] = (t || "00:00").split(":");
  const h = Number(hStr);
  const m = mStr ?? "00";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

function shiftHours(s: { startTime: string; endTime: string }): number {
  const [h1, m1] = s.startTime.split(":").map(Number);
  const [h2, m2] = s.endTime.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return 0;
  return Math.max(0, h2 + m2 / 60 - (h1 + m1 / 60));
}

// ─── Avatar / pill primitives ───────────────────────────────────────────────

function avatarBg(name: string): string {
  const palette = [
    "bg-cyan-100 text-cyan-800",
    "bg-violet-100 text-violet-800",
    "bg-rose-100 text-rose-800",
    "bg-amber-100 text-amber-800",
    "bg-emerald-100 text-emerald-800",
    "bg-sky-100 text-sky-800",
    "bg-fuchsia-100 text-fuchsia-800",
    "bg-lime-100 text-lime-800",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className={cn(
        "rounded-full inline-flex items-center justify-center font-semibold shrink-0",
        avatarBg(name),
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}

function Badge({
  tone = "default",
  mono,
  children,
  className,
}: {
  tone?: "default" | "warn" | "ok" | "danger";
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground border-border",
    warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
    danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[0.3rem] border text-[10px] font-medium",
        mono && "font-mono tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  count,
  action,
  kicker,
  children,
}: {
  title: string;
  count?: number;
  action?: { label: string; icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>; onClick?: () => void };
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {typeof count === "number" && count > 0 && (
            <span className="font-mono tabular-nums text-[10.5px] text-muted-foreground px-1.5 h-4 inline-flex items-center justify-center border border-border rounded-[0.3rem]">
              {count}
            </span>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-[11.5px] font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1 hover:text-foreground"
          >
            {action.label}
            {action.icon ? (
              <action.icon className="h-3 w-3" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
      {kicker && (
        <div className="px-4 pb-2 text-[12px] text-muted-foreground leading-relaxed">
          {kicker}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Mobile Schedule ────────────────────────────────────────────────────────

const SHIFT_COLORS: Record<string, string> = {
  morning: "#0891b2",
  afternoon: "#d97706",
  evening: "#7c3aed",
  closing: "#1c1917",
};

export function MobileSchedule({
  orgId,
  myMemberId,
  onOpenRequests,
}: {
  orgId: string;
  myMemberId: string | null;
  onOpenRequests: () => void;
}) {
  const [rawShifts] = useShifts() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [selDate, setSelDate] = useState<string>(() => isoDate(new Date()));
  void myMemberId;

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const members = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter((m) => m.organizationId === orgId && m.status === "active")
        .map((m) => ({
          id: m.id?.toString?.() ?? String(m.id),
          displayName: String(m.displayName ?? "—"),
          email: String(m.email ?? ""),
          role: String(m.role ?? "staff"),
          status: "active",
        })),
    [rawMembers, orgId],
  );

  const roleMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const r of rawRoles as any[]) {
      if (r.organizationId !== orgId) continue;
      map.set(String(r.name ?? "").toLowerCase(), String(r.color ?? "#a8a29e"));
    }
    return map;
  }, [rawRoles, orgId]);

  const allShifts = useMemo<ShiftRow[]>(
    () =>
      (rawShifts as any[])
        .filter((s) => s.organizationId === orgId)
        .map((s) => {
          let staffRoles: string[] = [];
          try {
            const parsed = typeof s.staffRoles === "string" ? JSON.parse(s.staffRoles) : s.staffRoles;
            if (Array.isArray(parsed)) staffRoles = parsed.filter((x) => typeof x === "string");
          } catch {}
          return {
            id: s.id?.toString?.() ?? String(s.id),
            memberId: s.memberId ? String(s.memberId) : null,
            staffName: String(s.staffName ?? ""),
            staffRoles,
            date: String(s.date ?? ""),
            shiftType: String(s.shiftType ?? "morning"),
            startTime: String(s.startTime ?? ""),
            endTime: String(s.endTime ?? ""),
          };
        }),
    [rawShifts, orgId],
  );

  const dayShifts = useMemo(
    () =>
      allShifts
        .filter((s) => s.date === selDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [allShifts, selDate],
  );

  const dayHours = dayShifts.reduce((acc, s) => acc + shiftHours(s), 0);

  // "On now" — based on actual current clock time.
  const nowMin = useMemo(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }, []);
  const todayIso = isoDate(new Date());
  const isToday = selDate === todayIso;
  const onShiftNow = isToday
    ? dayShifts.filter((s) => {
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
      })
    : [];

  const pending = useMemo(() => {
    const to = (rawTimeOff as any[]).filter(
      (r) => r.organizationId === orgId && r.status === "pending",
    ).length;
    const tr = (rawTrades as any[]).filter(
      (r) => r.organizationId === orgId && r.status === "pending",
    ).length;
    return to + tr;
  }, [rawTimeOff, rawTrades, orgId]);

  const navigateWeek = (delta: number) => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      return next;
    });
  };

  const selDay = new Date(selDate + "T00:00:00");
  const weekLabel = `${week[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${week[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div>
      {/* KPI row */}
      <div className="grid grid-cols-3 border-b border-border bg-background">
        <Kpi label="在岗" value={onShiftNow.length} suffix={`/ ${members.length}`} />
        <Kpi label="今日时长" value={dayHours.toFixed(1)} suffix="h" mono border />
        <Kpi
          label="待处理"
          value={pending}
          tone={pending > 0 ? "warn" : "default"}
          border
          onClick={onOpenRequests}
        />
      </div>

      {/* Week strip */}
      <div className="border-b border-border bg-muted/30">
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            本周 · {weekLabel}
          </span>
          <div className="flex items-center gap-1">
            <IconBtn icon={ChevronLeft} onClick={() => navigateWeek(-1)} />
            <IconBtn icon={ChevronRight} onClick={() => navigateWeek(1)} />
          </div>
        </div>
        <div className="grid grid-cols-7 px-2.5 pb-3 gap-0.5">
          {week.map((d, i) => {
            const iso = isoDate(d);
            const active = iso === selDate;
            const dayIsToday = iso === todayIso;
            const count = allShifts.filter((s) => s.date === iso).length;
            const dayAbbr = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i];
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelDate(iso)}
                className={cn(
                  "py-2 px-0 rounded-[0.3rem] flex flex-col items-center gap-0.5 relative transition-colors",
                  active
                    ? "bg-foreground text-background border border-foreground"
                    : "bg-transparent border border-transparent",
                  !active && dayIsToday && "text-foreground",
                  !active && !dayIsToday && "text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "text-[9.5px] font-semibold uppercase tracking-wider",
                    active ? "opacity-75" : "opacity-60",
                  )}
                >
                  {dayAbbr}
                </div>
                <div className="font-mono tabular-nums text-[16px] font-semibold leading-none">
                  {d.getDate()}
                </div>
                <div
                  className={cn(
                    "mt-0.5 font-mono tabular-nums text-[9px] font-semibold",
                    active ? "opacity-85" : "text-muted-foreground",
                  )}
                >
                  {count}
                </div>
                {dayIsToday && !active && (
                  <span className="absolute bottom-1 w-[3px] h-[3px] rounded-full bg-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day header */}
      <div className="px-4 py-3 border-b border-border bg-background flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold tracking-[-0.01em] truncate">
            {selDay.toLocaleDateString("zh-CN", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            <span className="font-mono tabular-nums">{dayShifts.length}</span> 班次
            {" · "}
            <span className="font-mono tabular-nums">{dayHours.toFixed(1)}h</span>
          </div>
        </div>
        <span
          className="h-7 px-2.5 rounded-[0.3rem] border border-dashed border-border text-[11.5px] text-muted-foreground italic inline-flex items-center gap-1 shrink-0"
          title="使用桌面端或问 Merchiva 添加班次"
        >
          <Plus className="h-3 w-3" strokeWidth={1.75} /> 添加
        </span>
      </div>

      {/* Day shift list */}
      {dayShifts.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground text-[12.5px]">
          当日无排班
        </div>
      ) : (
        dayShifts.map((s, i) => {
          const member = members.find((m) => m.id === s.memberId);
          const name = member?.displayName ?? s.staffName ?? "—";
          const isOnNow =
            isToday &&
            (() => {
              const [sh, sm] = s.startTime.split(":").map(Number);
              const [eh, em] = s.endTime.split(":").map(Number);
              return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
            })();
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-2.5 px-4 py-3 bg-background",
                i < dayShifts.length - 1 && "border-b border-border",
              )}
            >
              <div
                className="w-[3px] self-stretch rounded-[1.5px]"
                style={{ background: SHIFT_COLORS[s.shiftType] ?? "#78716c" }}
              />
              <Avatar name={name} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em] truncate">
                  {name}
                  {isOnNow && (
                    <span className="ml-1.5 text-[9.5px] font-bold tracking-wider text-emerald-600">
                      ● 在岗
                    </span>
                  )}
                </div>
                {s.staffRoles.length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-1.5 flex-wrap">
                    {s.staffRoles.slice(0, 3).map((rn, j) => (
                      <span key={j} className="inline-flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: roleMap.get(rn.toLowerCase()) ?? "#a8a29e" }}
                        />
                        {rn}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono tabular-nums text-[12.5px] font-semibold text-foreground">
                  {formatTimeShort(s.startTime)}
                </div>
                <div className="font-mono tabular-nums text-[10.5px] text-muted-foreground">
                  –{formatTimeShort(s.endTime)}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div className="h-4" />
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  tone,
  mono,
  border,
  onClick,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  tone?: "default" | "warn";
  mono?: boolean;
  border?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "px-3.5 py-3 text-left disabled:cursor-default",
        border && "border-l border-border",
        onClick && "hover:bg-muted/40",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-1.5">
        <span
          className={cn(
            "text-[22px] font-semibold leading-none tracking-[-0.02em]",
            mono && "font-mono tabular-nums",
            tone === "warn" ? "text-amber-600" : "text-foreground",
          )}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </button>
  );
}

function IconBtn({
  icon: IconComp,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 w-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center text-muted-foreground hover:bg-muted"
    >
      <IconComp className="h-[14px] w-[14px]" strokeWidth={1.75} />
    </button>
  );
}

// ─── Mobile Team ────────────────────────────────────────────────────────────

export function MobileTeam({ orgId }: { orgId: string }) {
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawInvitations] = useOrgInvitations() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "invited">("all");

  const roles = useMemo<RoleRow[]>(
    () =>
      (rawRoles as any[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id?.toString?.() ?? String(r.id),
          name: String(r.name ?? ""),
          color: String(r.color ?? "#44403c"),
          description: String(r.description ?? ""),
        })),
    [rawRoles, orgId],
  );

  const members = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter((m) => m.organizationId === orgId)
        .map((m) => ({
          id: m.id?.toString?.() ?? String(m.id),
          displayName: String(m.displayName ?? "—"),
          email: String(m.email ?? ""),
          role: String(m.role ?? "staff"),
          status: String(m.status ?? "active"),
        })),
    [rawMembers, orgId],
  );

  const invitations = useMemo(
    () =>
      (rawInvitations as any[]).filter(
        (i) => i.organizationId === orgId && !i.acceptedAt,
      ),
    [rawInvitations, orgId],
  );

  const counts = {
    all: members.length,
    active: members.filter((m) => m.status === "active").length,
    invited: invitations.length,
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (filter === "invited") {
      return invitations
        .filter((i: any) =>
          !needle ||
          String(i.email ?? "").toLowerCase().includes(needle) ||
          String(i.role ?? "").toLowerCase().includes(needle),
        )
        .map((i: any) => ({
          id: `inv-${i.id?.toString?.() ?? i.id}`,
          displayName: String(i.email ?? "—").split("@")[0],
          email: String(i.email ?? ""),
          role: String(i.role ?? "staff"),
          status: "invited",
        }));
    }
    return members.filter((m) => {
      if (filter === "active" && m.status !== "active") return false;
      if (!needle) return true;
      return (
        m.displayName.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.role.toLowerCase().includes(needle)
      );
    });
  }, [q, filter, members, invitations]);

  return (
    <div>
      {/* Search + invite */}
      <div className="px-3.5 py-2.5 flex gap-2 bg-background border-b border-border">
        <div className="flex-1 flex items-center gap-1.5 h-8 px-2.5 bg-muted/60 border border-border rounded-[0.3rem]">
          <Search className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索成员"
            className="flex-1 bg-transparent border-0 outline-none text-[12.5px] text-foreground"
          />
        </div>
        <a
          href="/~/settings"
          className="h-8 px-3 rounded-[0.3rem] bg-foreground text-background text-[12px] font-medium inline-flex items-center gap-1"
        >
          <Plus className="h-[13px] w-[13px]" strokeWidth={1.75} /> 邀请
        </a>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 px-3.5 py-2.5 border-b border-border bg-background overflow-x-auto no-scrollbar">
        {(
          [
            { id: "all", label: `全部 ${counts.all}` },
            { id: "active", label: `在职 ${counts.active}` },
            { id: "invited", label: `待入职 ${counts.invited}` },
          ] as const
        ).map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-6 px-2.5 rounded-full border text-[11.5px] shrink-0 whitespace-nowrap",
                active
                  ? "bg-foreground text-background border-foreground font-semibold"
                  : "bg-background text-stone-700 dark:text-stone-200 border-border font-medium",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Member list */}
      {list.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground text-[12.5px]">
          没有符合条件的成员
        </div>
      ) : (
        list.map((m, i) => {
          const role = roles.find((r) =>
            m.role.toLowerCase().includes(r.name.toLowerCase()),
          );
          return (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 bg-background",
                i < list.length - 1 && "border-b border-border",
              )}
            >
              <Avatar name={m.displayName} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium tracking-[-0.015em] truncate">
                  {m.displayName}
                </div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate inline-flex items-center gap-1">
                  {role && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: role.color }}
                    />
                  )}
                  {m.role}
                </div>
                {m.email && (
                  <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate font-mono">
                    {m.email}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.status === "invited" && <Badge tone="warn">待入职</Badge>}
                <ChevronRight className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
              </div>
            </div>
          );
        })
      )}
      <div className="h-4" />
      {/* Unused imports kept for prettier diff with the design */}
      <span className="hidden">
        <Mail />
        <UserPlus />
      </span>
    </div>
  );
}

// ─── Mobile Roles (list → drill into detail) ────────────────────────────────

export function MobileRoles({ orgId }: { orgId: string }) {
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];
  const [rawTasks] = useRoleTasks() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];

  const roles = useMemo<RoleRow[]>(
    () =>
      (rawRoles as any[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id?.toString?.() ?? String(r.id),
          name: String(r.name ?? ""),
          color: String(r.color ?? "#44403c"),
          description: String(r.description ?? ""),
        })),
    [rawRoles, orgId],
  );

  const tasksByRole = useMemo<Map<string, RoleTaskRow[]>>(() => {
    const map = new Map<string, RoleTaskRow[]>();
    for (const r of rawTasks as any[]) {
      if (r.organizationId && r.organizationId !== orgId) continue;
      const t: RoleTaskRow = {
        id: r.id?.toString?.() ?? String(r.id),
        roleId: String(r.roleId ?? ""),
        title: String(r.title ?? ""),
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
      };
      const list = map.get(t.roleId) ?? [];
      list.push(t);
      map.set(t.roleId, list);
    }
    return map;
  }, [rawTasks, orgId]);

  const activeMembers = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter((m) => m.organizationId === orgId && m.status === "active")
        .map((m) => ({
          id: m.id?.toString?.() ?? String(m.id),
          displayName: String(m.displayName ?? "—"),
          email: String(m.email ?? ""),
          role: String(m.role ?? "staff"),
          status: "active",
        })),
    [rawMembers, orgId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    const role = roles.find((r) => r.id === selectedId);
    if (!role) {
      setSelectedId(null);
      return null;
    }
    const tasks = tasksByRole.get(role.id) ?? [];
    const members = activeMembers.filter((m) =>
      m.role.toLowerCase().includes(role.name.toLowerCase()),
    );

    return (
      <div>
        {/* Detail header */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border bg-background">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="w-8 h-8 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center"
          >
            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={1.75} />
          </button>
          <span
            className="w-8 h-8 rounded-[0.3rem] inline-flex items-center justify-center text-background"
            style={{ background: role.color }}
          >
            <Shield className="h-[15px] w-[15px]" strokeWidth={1.75} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.01em] truncate">
              {role.name}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              <span className="font-mono tabular-nums">{members.length}</span> 名成员 ·{" "}
              <span className="font-mono tabular-nums">{tasks.length}</span> 项任务
            </div>
          </div>
          <Pencil className="h-[14px] w-[14px] text-muted-foreground" strokeWidth={1.75} />
        </div>

        {/* Members */}
        <div className="px-3.5 pt-3 pb-3 bg-background border-b border-border">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            成员 · {members.length}
          </div>
          {members.length === 0 ? (
            <div className="text-[12px] text-muted-foreground py-1">暂无成员</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="inline-flex items-center gap-1.5 pr-2.5 pl-1 py-1 rounded-full border border-border bg-background"
                >
                  <Avatar name={m.displayName} size={20} />
                  <span className="text-[12px] font-medium">
                    {m.displayName.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tasks */}
        <Section title={`任务清单 · ${tasks.length}`}>
          {tasks.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
              该岗位暂无任务
            </div>
          ) : (
            tasks.map((t, i) => (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 bg-background",
                  i < tasks.length - 1 ? "border-t border-border" : "border-t border-border",
                )}
              >
                <span className="w-[18px] h-[18px] rounded-sm border-[1.5px] border-border bg-background shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium tracking-[-0.01em] text-foreground">
                    {t.title}
                  </div>
                </div>
                <span className="font-mono tabular-nums text-[11px] text-muted-foreground shrink-0">
                  {t.startTime && t.endTime
                    ? `${t.startTime.slice(0, 5)}–${t.endTime.slice(0, 5)}`
                    : "随时"}
                </span>
                <MoreVertical
                  className="h-3 w-3 text-muted-foreground shrink-0"
                  strokeWidth={1.75}
                />
              </div>
            ))
          )}
        </Section>
        <div className="h-4" />
      </div>
    );
  }

  return (
    <div>
      <Section
        title={`角色 · ${roles.length}`}
        kicker="点击角色查看其任务清单与成员分配"
      >
        {roles.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            暂无岗位
          </div>
        ) : (
          roles.map((r, i) => {
            const members = activeMembers.filter((m) =>
              m.role.toLowerCase().includes(r.name.toLowerCase()),
            );
            const tasks = (tasksByRole.get(r.id) ?? []).length;
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "w-full text-left flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/30",
                  i < roles.length - 1 ? "border-t border-border" : "border-t border-border",
                )}
              >
                <span
                  className="w-9 h-9 rounded-[0.3rem] inline-flex items-center justify-center text-background"
                  style={{ background: r.color }}
                >
                  <Shield className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium tracking-[-0.01em] truncate">
                    {r.name}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">
                    <span className="font-mono tabular-nums">{members.length}</span> 名成员 ·{" "}
                    <span className="font-mono tabular-nums">{tasks}</span> 项任务
                  </div>
                </div>
                <ChevronRight className="h-[14px] w-[14px] text-muted-foreground" strokeWidth={1.75} />
              </button>
            );
          })
        )}
      </Section>
      <div className="h-4" />
    </div>
  );
}

// ─── Mobile Training (delegated to existing TrainingPanel — already responsive) ─

// Re-exporting nothing; consumers use the existing TrainingPanel directly.
// Kept here as a placeholder if we later need a fully different mobile layout.

// ─── Mobile Requests bottom sheet ───────────────────────────────────────────

export function MobileRequestsSheet({
  open,
  onClose,
  orgId,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
}) {
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];
  const [rawShifts] = useShifts() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const setBusyFor = (id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const members = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const m of rawMembers as any[]) {
      if (m.organizationId !== orgId) continue;
      const id = m.id?.toString?.() ?? String(m.id);
      const uid = m.userId?.toString?.() ?? String(m.userId ?? "");
      map.set(id, String(m.displayName ?? "—"));
      if (uid) map.set(uid, String(m.displayName ?? "—"));
    }
    return map;
  }, [rawMembers, orgId]);

  const shifts = useMemo<Map<string, ShiftRow>>(() => {
    const map = new Map<string, ShiftRow>();
    for (const s of rawShifts as any[]) {
      if (s.organizationId !== orgId) continue;
      const id = s.id?.toString?.() ?? String(s.id);
      map.set(id, {
        id,
        memberId: s.memberId ? String(s.memberId) : null,
        staffName: String(s.staffName ?? ""),
        staffRoles: [],
        date: String(s.date ?? ""),
        shiftType: String(s.shiftType ?? "morning"),
        startTime: String(s.startTime ?? ""),
        endTime: String(s.endTime ?? ""),
      });
    }
    return map;
  }, [rawShifts, orgId]);

  const pendingTO = useMemo(
    () =>
      (rawTimeOff as any[])
        .filter((r) => r.organizationId === orgId && r.status === "pending")
        .map((r) => ({
          id: r.id?.toString?.() ?? String(r.id),
          userId: r.userId?.toString?.() ?? "",
          staffName:
            members.get(r.userId?.toString?.() ?? "") ??
            String(r.staffName ?? ""),
          startDate: String(r.startDate ?? ""),
          endDate: String(r.endDate ?? r.startDate ?? ""),
          fullDays: !!r.fullDays,
          startTime: r.startTime ?? null,
          endTime: r.endTime ?? null,
          comments: r.comments ?? null,
        })),
    [rawTimeOff, orgId, members],
  );

  const pendingTD = useMemo(
    () =>
      (rawTrades as any[])
        .filter((t) => t.organizationId === orgId && t.status === "pending")
        .map((t) => ({
          id: t.id?.toString?.() ?? String(t.id),
          shiftId: String(t.shiftId ?? ""),
          requesterId: String(t.requesterId ?? ""),
          targetId: t.targetId ? String(t.targetId) : null,
          type: String(t.type ?? "trade"),
        })),
    [rawTrades, orgId],
  );

  const total = pendingTO.length + pendingTD.length;

  const approveTO = async (id: string) => {
    setBusyFor(id, true);
    try {
      await updateTimeOffStatus(id, "approved");
    } catch (err) {
      console.error("[Personnel mobile] approve TO failed", err);
    } finally {
      setBusyFor(id, false);
    }
  };
  const denyTO = async (id: string) => {
    setBusyFor(id, true);
    try {
      await updateTimeOffStatus(id, "denied");
    } catch (err) {
      console.error("[Personnel mobile] deny TO failed", err);
    } finally {
      setBusyFor(id, false);
    }
  };
  const approveTD = async (id: string) => {
    setBusyFor(id, true);
    try {
      await managerApproveShiftTrade(id, "", true);
    } catch (err) {
      console.error("[Personnel mobile] approve trade failed", err);
    } finally {
      setBusyFor(id, false);
    }
  };
  const denyTD = async (id: string) => {
    setBusyFor(id, true);
    try {
      await managerApproveShiftTrade(id, "", false);
    } catch (err) {
      console.error("[Personnel mobile] deny trade failed", err);
    } finally {
      setBusyFor(id, false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="md:hidden fixed inset-0 z-50 bg-black/40 flex items-end"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[80%] bg-background rounded-t-[1rem] overflow-hidden flex flex-col animate-[mobile-sheet-up_220ms_ease-out]"
      >
        <div className="pt-2 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="px-4 py-3 flex items-center border-b border-border gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <div className="text-[16px] font-semibold tracking-[-0.015em]">请求</div>
          <span className="ml-auto font-mono tabular-nums text-[11px] text-muted-foreground">
            待处理 · {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 h-7 w-7 rounded-[0.3rem] inline-flex items-center justify-center hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {total === 0 && (
            <div className="px-4 py-14 text-center text-[12.5px] text-muted-foreground">
              全部处理完毕 · 暂无待办
            </div>
          )}

          {pendingTO.length > 0 && (
            <Section title="请假">
              {pendingTO.map((r) => {
                const isBusy = busy.has(r.id);
                return (
                  <div
                    key={r.id}
                    className="px-4 py-3 bg-background border-t border-border"
                  >
                    <div className="flex gap-2.5">
                      <Avatar name={r.staffName} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold tracking-[-0.01em] truncate">
                          {r.staffName}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {shortDate(r.startDate)}
                          {r.endDate !== r.startDate && ` – ${shortDate(r.endDate)}`}
                          {!r.fullDays && r.startTime && r.endTime && (
                            <>
                              {" · "}
                              {formatTimeLong(r.startTime)}–{formatTimeLong(r.endTime)}
                            </>
                          )}
                        </div>
                        {r.comments && (
                          <div className="text-[11.5px] text-stone-700 dark:text-stone-300 mt-1 italic line-clamp-2">
                            “{r.comments}”
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => approveTO(r.id)}
                        className="flex-1 h-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center gap-1 text-[12px] font-medium text-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" strokeWidth={1.75} />
                        批准
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => denyTO(r.id)}
                        className="flex-1 h-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center gap-1 text-[12px] font-medium text-rose-700 disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" strokeWidth={1.75} />
                        拒绝
                      </button>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {pendingTD.length > 0 && (
            <Section title="换班 / 代班">
              {pendingTD.map((t) => {
                const shift = shifts.get(t.shiftId);
                const reqName = members.get(t.requesterId);
                const tgtName = t.targetId ? members.get(t.targetId) : null;
                const isBusy = busy.has(t.id);
                return (
                  <div
                    key={t.id}
                    className="px-4 py-3 bg-background border-t border-border"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <Badge tone={t.type === "trade" ? "default" : "warn"}>
                        {t.type === "trade" ? "换班" : "代班"}
                      </Badge>
                      {shift && (
                        <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                          {shortDate(shift.date)} · {formatTimeShort(shift.startTime)}–
                          {formatTimeShort(shift.endTime)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px]">
                      {reqName && (
                        <>
                          <Avatar name={reqName} size={22} />
                          <span className="font-medium">{reqName.split(" ")[0]}</span>
                        </>
                      )}
                      <ArrowRight
                        className="h-[11px] w-[11px] text-muted-foreground"
                        strokeWidth={1.75}
                      />
                      {tgtName ? (
                        <>
                          <Avatar name={tgtName} size={22} />
                          <span className="font-medium">{tgtName.split(" ")[0]}</span>
                        </>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground italic">
                          任意可用人员
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => approveTD(t.id)}
                        className="flex-1 h-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center gap-1 text-[12px] font-medium text-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" strokeWidth={1.75} />
                        接受
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => denyTD(t.id)}
                        className="flex-1 h-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center gap-1 text-[12px] font-medium text-rose-700 disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" strokeWidth={1.75} />
                        拒绝
                      </button>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// Decorative icons kept import-warm — exported helper-bag for follow-up Training mobile work.
export const __unused = {
  Award,
  BookOpen,
  ClipboardCheck,
  FileEdit,
  HelpCircle,
  Play,
};
