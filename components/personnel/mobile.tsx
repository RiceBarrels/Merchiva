"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Award, Ban, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardCheck, Clock, FileEdit, HelpCircle, Inbox, Mail, MoreVertical, Pencil, Play, Plus, Search, Shield, Trash2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import { defaultPermissions } from "@/lib/db/team";
import { createShiftTrade, removeMember, updateShift, updateTradeStatus } from "@/lib/spacetimedb/actions";
import type { Permissions } from "@/lib/types";
import {
  InviteMemberDialog,
  EditMemberDialog,
  resendInviteEmail,
  cancelPendingInvite,
  type EditMemberInput,
} from "@/components/personnel/team-dialogs";
import {
  useOrgInvitations,
  useOrgMembers,
  useRoleTasks,
  useShifts,
  useShiftTrades,
  useStaffRoles,
  useTimeOffRequests,
} from "@/lib/spacetimedb/hooks";
import { updateTimeOffStatus } from "@/lib/spacetimedb/actions";
import { Spinner } from "@/components/ui/loaders/geometric";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementFooter,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";

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
  const t = useT();
  const [rawShifts] = useShifts() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [selDate, setSelDate] = useState<string>(() => isoDate(new Date()));
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [poolBusyId, setPoolBusyId] = useState<string | null>(null);
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [changeBusyId, setChangeBusyId] = useState<string | null>(null);
  const { isOwner, role: orgRole, can } = usePermissions();

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

  const selectedShift = selectedShiftId
    ? allShifts.find((s) => s.id === selectedShiftId) ?? null
    : null;
  const selectedDayShifts = selectedShift
    ? allShifts
        .filter((s) => s.date === selectedShift.date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];
  const activeCoverStatuses = ["pending", "accepted"];
  const existingCoverRequest = selectedShift
    ? (rawTrades as any[]).some(
        (tr) =>
          tr.organizationId === orgId &&
          String(tr.shiftId ?? "") === selectedShift.id &&
          String(tr.type ?? "") === "cover" &&
          activeCoverStatuses.includes(String(tr.status ?? "")),
      )
    : false;

  const coverPool = useMemo(
    () =>
      (rawTrades as any[])
        .filter(
          (tr) =>
            tr.organizationId === orgId &&
            String(tr.type ?? "") === "cover" &&
            String(tr.status ?? "") === "pending" &&
            !!tr.broadcastToAll,
        )
        .map((tr) => ({
          id: tr.id?.toString?.() ?? String(tr.id),
          shiftId: String(tr.shiftId ?? ""),
          requesterId: String(tr.requesterId ?? ""),
        }))
        .filter((tr) => allShifts.some((shift) => shift.id === tr.shiftId))
        .sort((a, b) => {
          const sa = allShifts.find((shift) => shift.id === a.shiftId);
          const sb = allShifts.find((shift) => shift.id === b.shiftId);
          return `${sa?.date ?? ""}${sa?.startTime ?? ""}`.localeCompare(`${sb?.date ?? ""}${sb?.startTime ?? ""}`);
        }),
    [rawTrades, orgId, allShifts],
  );

          ["pending", "accepted"].includes(String(tr.status ?? "")),
      )
    : false;

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

  const selectedShiftName = selectedShift
    ? members.find((m) => m.id === selectedShift.memberId)?.displayName ?? selectedShift.staffName ?? "—"
    : "";
  const canFindCover = !!selectedShift && !!myMemberId && selectedShift.memberId === myMemberId;
  const canChangePeople = !!selectedShift && (isOwner || orgRole === "manager" || can("staffing", "edit"));

  async function requestCover() {
    if (!selectedShift || !myMemberId || existingCoverRequest) return;
    setCoverBusy(true);
    try {
      await createShiftTrade({
        organizationId: orgId,
        shiftId: selectedShift.id,
        requesterId: myMemberId,
        broadcastToAll: true,
        targetId: "",
        targetShiftId: null,
        type: "cover",
        comments: "",
      });
      toast.success("Shift added to the cover pool");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request cover");
    } finally {
      setCoverBusy(false);
    }
  }

  async function acceptCoverPoolTrade(tradeId: string) {
    if (!myMemberId) {
      toast.error("No active team member found");
      return;
    }
    setPoolBusyId(tradeId);
    try {
      await updateTradeStatus(tradeId, "accepted");
      toast.success("Cover request accepted — waiting for manager approval");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept cover request");
    } finally {
      setPoolBusyId(null);
    }
  }

  async function changeShiftPerson(member: MemberRow) {
    if (!selectedShift) return;
    setChangeBusyId(member.id);
    try {
      await updateShift(selectedShift.id, {
        memberId: member.id,
        staffName: member.displayName,
      });
      toast.success("Shift person updated");
      setShowPeoplePicker(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update shift person");
    } finally {
      setChangeBusyId(null);
    }
  }

  return (
    <div>
      {/* KPI row */}
      <div className="grid grid-cols-3 border-b border-border bg-background">
        <Kpi label={t("personnel.m.onShift")} value={onShiftNow.length} suffix={`/ ${members.length}`} />
        <Kpi label={t("personnel.m.todayHours")} value={dayHours.toFixed(1)} suffix="h" mono border />
        <Kpi
          label={t("personnel.m.pending")}
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
            {t("personnel.m.thisWeek")} · {weekLabel}
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
            <span className="font-mono tabular-nums">{dayShifts.length}</span>{" "}
            {t("personnel.m.shifts").replace("{n} ", "").replace("{n}", "")}
            {" · "}
            <span className="font-mono tabular-nums">{dayHours.toFixed(1)}h</span>
          </div>
        </div>
        <span
          className="h-7 px-2.5 rounded-[0.3rem] border border-dashed border-border text-[11.5px] text-muted-foreground italic inline-flex items-center gap-1 shrink-0"
          title={t("personnel.m.addHint")}
        >
          <Plus className="h-3 w-3" strokeWidth={1.75} /> {t("personnel.m.add")}
        </span>
      </div>

      {/* Day shift list */}
      {dayShifts.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground text-[12.5px]">
          {t("personnel.m.noShifts")}
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
            <button
              key={s.id}
              type="button"
              onClick={() => { setSelectedShiftId(s.id); setShowPeoplePicker(false); }}
              onClick={() => setSelectedShiftId(s.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-3 bg-background text-left active:bg-muted/60",
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
                      ● {t("personnel.m.onShift")}
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
            </button>
          );
        })
      )}
      <Section title="Cover pool" count={coverPool.length} kicker="Open cover requests that anyone on the team can accept. Manager approval is still required after acceptance.">
        {coverPool.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            No open cover requests.
          </div>
        ) : (
          coverPool.map((request) => {
            const shift = allShifts.find((s) => s.id === request.shiftId);
            if (!shift) return null;
            const requester = members.find((m) => m.id === request.requesterId);
            const assigned = members.find((m) => m.id === shift.memberId);
            const isOwnRequest = request.requesterId === myMemberId;
            return (
              <Card key={request.id} size="sm" className="mx-3.5 mb-2 rounded-[0.3rem] py-0 shadow-none">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Avatar name={assigned?.displayName ?? shift.staffName} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">
                      {assigned?.displayName ?? shift.staffName}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-muted-foreground">
                      {shortDate(shift.date)} · {formatTimeShort(shift.startTime)}–{formatTimeShort(shift.endTime)}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground truncate">
                      Requested by {requester?.displayName ?? "team member"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isOwnRequest ? "outline" : "default"}
                    disabled={isOwnRequest || poolBusyId === request.id}
                    onClick={() => acceptCoverPoolTrade(request.id)}
                    className="h-8 rounded-[0.3rem] px-2.5 text-[12px]"
                  >
                    {poolBusyId === request.id ? <Spinner size={12} /> : isOwnRequest ? "Mine" : "Accept"}
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </Section>
      <div className="h-4" />

      <DynamicUIElement open={!!selectedShift} onOpenChange={(open) => { if (!open) { setSelectedShiftId(null); setShowPeoplePicker(false); } }}>
        <DynamicUIElementContent className="sm:max-w-md" noPadding>
          {selectedShift && (
            <>
              <DynamicUIElementHeader className="px-4 pt-4 pb-3 border-b border-border">
                <DynamicUIElementTitle mobileTitle="Shift details">
                  {selectedShiftName}
                </DynamicUIElementTitle>
                <DynamicUIElementDescription>
                  {shortDate(selectedShift.date)} · {formatTimeLong(selectedShift.startTime)}–{formatTimeLong(selectedShift.endTime)}
                </DynamicUIElementDescription>
              </DynamicUIElementHeader>

              <div className="px-4 py-4 space-y-4">
                <div className="rounded-[0.3rem] border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={selectedShiftName} size={36} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">{selectedShiftName}</div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {selectedShift.staffRoles.length > 0 ? selectedShift.staffRoles.join(" · ") : selectedShift.shiftType}
                        </div>
                      </div>
                    </div>
                    <Badge mono>{shiftHours(selectedShift).toFixed(1)}h</Badge>
                  </div>
                </div>

                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Everyone working that day
                  </div>
                  <div className="relative pl-4 space-y-0">
                    <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                    {selectedDayShifts.map((shift) => {
                      const member = members.find((m) => m.id === shift.memberId);
                      const name = member?.displayName ?? shift.staffName ?? "—";
                      const active = shift.id === selectedShift.id;
                      return (
                        <div key={shift.id} className="relative pb-3 last:pb-0">
                          <span
                            className={cn(
                              "absolute -left-[14px] top-1.5 h-3 w-3 rounded-full border-2 border-background",
                              active ? "bg-foreground" : "bg-muted-foreground",
                            )}
                          />
                          <div className={cn("rounded-[0.3rem] border p-2.5", active ? "border-foreground bg-muted/40" : "border-border bg-background")}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar name={name} size={26} />
                                <span className="text-[13px] font-medium truncate">{name}</span>
                              </div>
                              <span className="font-mono tabular-nums text-[11.5px] text-muted-foreground shrink-0">
                                {formatTimeShort(shift.startTime)}–{formatTimeShort(shift.endTime)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {canChangePeople && (
                <div className="px-4 pb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPeoplePicker((v) => !v)}
                    className="w-full h-9 rounded-[0.3rem] text-[12.5px]"
                  >
                    Change people
                  </Button>
                  {showPeoplePicker && (
                    <div className="mt-2 rounded-[0.3rem] border border-border overflow-hidden">
                      {members.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          disabled={changeBusyId === member.id || selectedShift.memberId === member.id}
                          onClick={() => changeShiftPerson(member)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-background text-left border-t border-border first:border-t-0 disabled:opacity-50"
                        >
                          <Avatar name={member.displayName} size={26} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-medium truncate">{member.displayName}</div>
                            <div className="text-[10.5px] text-muted-foreground truncate">{member.role}</div>
                          </div>
                          {changeBusyId === member.id ? (
                            <Spinner size={12} />
                          ) : selectedShift.memberId === member.id ? (
                            <Badge tone="ok">Current</Badge>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {canFindCover && (
                <DynamicUIElementFooter className="px-4 py-3 border-t border-border">
                  <button
                    type="button"
                    disabled={coverBusy || existingCoverRequest}
                    onClick={requestCover}
                    className="w-full h-10 rounded-[0.3rem] bg-foreground text-background inline-flex items-center justify-center gap-2 text-[13px] font-semibold disabled:opacity-50"
                  >
                    {coverBusy ? <Spinner size={16} /> : <Clock className="h-4 w-4" strokeWidth={1.75} />}
                    {existingCoverRequest ? "Already in cover pool" : "Find cover"}
                  </button>
                </DynamicUIElementFooter>
              )}
            </>
          )}
        </DynamicUIElementContent>
      </DynamicUIElement>
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
  const t = useT();
  const { currentOrg, can } = usePermissions();
  const { user } = useAuth();
  const orgName = currentOrg?.name ?? null;
  const inviterEmail = user?.email ?? null;
  const canEditTeam = can("team", "edit");
  const canInviteTeam = can("team", "invite");

  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawInvitations] = useOrgInvitations() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "invited">("all");

  // Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<EditMemberInput | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openEdit(rowId: string) {
    const raw = (rawMembers as Array<{ id: { toString(): string }; role: string; permissions: unknown; displayName: string; email: string }>)
      .find((x) => (x.id?.toString?.() ?? String(x.id)) === rowId);
    if (!raw) return;
    let parsed: Permissions = defaultPermissions();
    const rawPerms = raw.permissions;
    if (typeof rawPerms === "string") {
      try { parsed = { ...parsed, ...(JSON.parse(rawPerms) as Partial<Permissions>) }; } catch {}
    } else if (rawPerms && typeof rawPerms === "object") {
      parsed = { ...parsed, ...(rawPerms as Partial<Permissions>) };
    }
    const role = String(raw.role ?? "").toLowerCase();
    if (role === "owner") return;
    setEditingMember({
      id: rowId,
      displayName: String(raw.displayName ?? "—"),
      email: String(raw.email ?? ""),
      role: role === "manager" ? "manager" : "staff",
      perms: parsed,
    });
    setActionsFor(null);
  }

  async function doRemove(id: string, name: string) {
    if (!confirm(t("personnel.team.confirmRemove").replace("{name}", name))) return;
    setBusyId(id);
    try {
      await removeMember(id);
      toast.success(t("personnel.toast.memberRemoved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personnel.toast.memberRemoveFailed"));
    } finally {
      setBusyId(null);
      setActionsFor(null);
    }
  }

  async function doResend(invId: string) {
    const inv = (rawInvitations as Array<{ id: { toString(): string }; email: string; token: string; role: string }>)
      .find((x) => x.id?.toString?.() === invId);
    if (!inv) return;
    setBusyId(invId);
    const ok = await resendInviteEmail({
      email: inv.email, token: inv.token, role: inv.role, orgName, inviterEmail,
    });
    if (ok) toast.success(t("personnel.toast.resendSent"));
    else toast.error(t("personnel.toast.resendFailed"));
    setBusyId(null);
    setActionsFor(null);
  }

  async function doCancel(invId: string, email: string) {
    if (!confirm(t("personnel.team.confirmCancelInvite").replace("{email}", email))) return;
    setBusyId(invId);
    const ok = await cancelPendingInvite(invId);
    if (ok) toast.success(t("personnel.toast.inviteCancelled"));
    setBusyId(null);
    setActionsFor(null);
  }

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
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("personnel.m.search")}
            className="h-9 rounded-[0.3rem] bg-muted/50 pl-8 text-[12.5px]"
          />
        </div>
        {canInviteTeam && (
          <Button
            type="button"
            size="sm"
            onClick={() => setInviteOpen(true)}
            className="h-9 rounded-[0.3rem] px-3 text-[12px]"
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={1.75} /> {t("personnel.m.invite")}
          </Button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 px-3.5 py-2.5 border-b border-border bg-background overflow-x-auto no-scrollbar">
        {(
          [
            { id: "all", label: t("personnel.m.filterAll").replace("{n}", String(counts.all)) },
            { id: "active", label: t("personnel.m.filterActive").replace("{n}", String(counts.active)) },
            { id: "invited", label: t("personnel.m.filterInvited").replace("{n}", String(counts.invited)) },
          ] as const
        ).map((f) => {
          const active = f.id === filter;
          return (
            <Button
              key={f.id}
              type="button"
              size="xs"
              variant={active ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
              className="h-7 rounded-[0.3rem] px-2.5 text-[11.5px] shrink-0 whitespace-nowrap"
            >
              {f.label}
            </Button>
          );
        })}
      </div>

      {/* Member list */}
      {list.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground text-[12.5px]">
          {t("personnel.m.noMatches")}
        </div>
      ) : (
        list.map((m) => {
          const role = roles.find((r) =>
            m.role.toLowerCase().includes(r.name.toLowerCase()),
          );
          const isInvite = m.status === "invited";
          const invId = isInvite ? m.id.replace(/^inv-/, "") : null;
          const isOwner = m.role.toLowerCase() === "owner";
          // Rows are tap-to-action; for active members the action sheet
          // surfaces edit/remove, for pending invites it surfaces resend/cancel.
          const canAction = canEditTeam && !isOwner;
          return (
            <Card key={m.id} size="sm" className="mx-3.5 mt-2 rounded-[0.3rem] py-0 shadow-none">
              <button
                type="button"
                disabled={!canAction}
                onClick={() => {
                  if (!canAction) return;
                  if (isInvite) setActionsFor(actionsFor === m.id ? null : m.id);
                  else openEdit(m.id);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 bg-card text-left rounded-[0.3rem]",
                  canAction ? "active:bg-muted/60" : "cursor-default",
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
                  {isInvite && <Badge tone="warn">{t("personnel.m.invitedBadge")}</Badge>}
                  {canAction && (
                    isInvite
                      ? <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                      : <Pencil className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
                  )}
                </div>
              </button>

              {/* Pending-invite action sheet (inline expander) */}
              {isInvite && actionsFor === m.id && invId && (
                <CardContent className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 p-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === invId}
                    onClick={() => doResend(invId)}
                    className="h-8 rounded-[0.3rem] text-[12px]"
                  >
                    {busyId === invId ? <Spinner size={12} /> : <Mail className="h-3 w-3" strokeWidth={1.75} />}
                    {t("personnel.m.resend")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyId === invId}
                    onClick={() => doCancel(invId, m.email)}
                    className="h-8 rounded-[0.3rem] text-[12px]"
                  >
                    {busyId === invId ? <Spinner size={12} /> : <Trash2 className="h-3 w-3" strokeWidth={1.75} />}
                    {t("personnel.m.cancel")}
                  </Button>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
      <div className="h-4" />
      {/* Unused imports kept for prettier diff with the design */}
      <span className="hidden">
        <UserPlus />
        <ChevronRight />
      </span>

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} orgId={orgId} />
      <EditMemberDialog member={editingMember} onClose={() => setEditingMember(null)} />
    </div>
  );
}

// ─── Mobile Roles (list → drill into detail) ────────────────────────────────

export function MobileRoles({ orgId }: { orgId: string }) {
  const tt = useT();
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

  const selectedRole = selectedId ? roles.find((r) => r.id === selectedId) ?? null : null;
  const selectedTasks = selectedRole ? tasksByRole.get(selectedRole.id) ?? [] : [];
  const selectedMembers = selectedRole
    ? activeMembers.filter((m) =>
        m.role.toLowerCase().includes(selectedRole.name.toLowerCase()),
      )
    : [];

  return (
    <div>
      <Section
        title={tt("personnel.m.rolesTitle").replace("{n}", String(roles.length))}
        kicker={tt("personnel.m.rolesKicker")}
      >
        {roles.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            {tt("personnel.m.noRoles")}
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
                    {tt("personnel.m.membersTasks")
                      .replace("{m}", String(members.length))
                      .replace("{t}", String(tasks))}
                  </div>
                </div>
                <ChevronRight className="h-[14px] w-[14px] text-muted-foreground" strokeWidth={1.75} />
              </button>
            );
          })
        )}
      </Section>
      <div className="h-4" />

      <DynamicUIElement
        open={!!selectedRole}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DynamicUIElementContent className="sm:max-w-md" noPadding>
          {selectedRole && (
            <>
              <DynamicUIElementHeader className="px-4 pt-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-[0.3rem] inline-flex items-center justify-center text-background shrink-0"
                    style={{ background: selectedRole.color }}
                  >
                    <Shield className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <DynamicUIElementTitle mobileTitle={selectedRole.name}>
                      {selectedRole.name}
                    </DynamicUIElementTitle>
                    <DynamicUIElementDescription>
                      {tt("personnel.m.membersTasks")
                        .replace("{m}", String(selectedMembers.length))
                        .replace("{t}", String(selectedTasks.length))}
                    </DynamicUIElementDescription>
                  </div>
                </div>
              </DynamicUIElementHeader>

              <div className="px-4 py-4 space-y-4">
                {selectedRole.description && (
                  <div className="rounded-[0.3rem] border border-border bg-muted/20 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {selectedRole.description}
                  </div>
                )}

                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {tt("personnel.m.members").replace("{n}", String(selectedMembers.length))}
                  </div>
                  {selectedMembers.length === 0 ? (
                    <div className="text-[12px] text-muted-foreground py-1">{tt("personnel.m.noMembers")}</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMembers.map((m) => (
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

                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {tt("personnel.m.taskList").replace("{n}", String(selectedTasks.length))}
                  </div>
                  {selectedTasks.length === 0 ? (
                    <div className="rounded-[0.3rem] border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                      {tt("personnel.m.noTasks")}
                    </div>
                  ) : (
                    <div className="rounded-[0.3rem] border border-border overflow-hidden">
                      {selectedTasks.map((task, i) => (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 bg-background",
                            i > 0 && "border-t border-border",
                          )}
                        >
                          <span className="w-[18px] h-[18px] rounded-sm border-[1.5px] border-border bg-background shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13.5px] font-medium tracking-[-0.01em] text-foreground truncate">
                              {task.title}
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-muted-foreground shrink-0">
                            {task.startTime && task.endTime
                              ? `${task.startTime.slice(0, 5)}–${task.endTime.slice(0, 5)}`
                              : tt("personnel.m.anytime")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DynamicUIElementContent>
      </DynamicUIElement>
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
  const tt = useT();
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
      await updateTradeStatus(id, "accepted");
    } catch (err) {
      console.error("[Personnel mobile] approve trade failed", err);
    } finally {
      setBusyFor(id, false);
    }
  };
  const denyTD = async (id: string) => {
    setBusyFor(id, true);
    try {
      await updateTradeStatus(id, "denied");
    } catch (err) {
      console.error("[Personnel mobile] deny trade failed", err);
    } finally {
      setBusyFor(id, false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      direction="bottom"
    >
      <DrawerContent className="md:hidden bg-background">
        <DrawerDescription className="sr-only">
          {tt("personnel.m.requestsTitle")}
        </DrawerDescription>
        <div className="px-4 py-3 flex items-center border-b border-border gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <DrawerTitle className="text-[16px] font-semibold tracking-[-0.015em]">
            {tt("personnel.m.requestsTitle")}
          </DrawerTitle>
          <span className="ml-auto font-mono tabular-nums text-[11px] text-muted-foreground">
            {tt("personnel.m.pendingCount").replace("{n}", String(total))}
          </span>
          <DrawerClose asChild>
            <button
              type="button"
              className="ml-2 h-7 w-7 rounded-[0.3rem] inline-flex items-center justify-center hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </DrawerClose>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {total === 0 && (
            <div className="px-4 py-14 text-center text-[12.5px] text-muted-foreground">
              {tt("personnel.m.allHandled")}
            </div>
          )}

          {pendingTO.length > 0 && (
            <Section title={tt("personnel.m.timeOff")}>
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
                        {tt("personnel.m.approve")}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => denyTO(r.id)}
                        className="flex-1 h-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center gap-1 text-[12px] font-medium text-rose-700 disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" strokeWidth={1.75} />
                        {tt("personnel.m.reject")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {pendingTD.length > 0 && (
            <Section title={tt("personnel.m.tradeOrCover")}>
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
                        {t.type === "trade" ? tt("personnel.m.trade") : tt("personnel.m.cover")}
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
                          {tt("personnel.m.anyAvailable")}
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
                        {tt("personnel.m.accept")}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => denyTD(t.id)}
                        className="flex-1 h-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center gap-1 text-[12px] font-medium text-rose-700 disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" strokeWidth={1.75} />
                        {tt("personnel.m.reject")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      </DrawerContent>
    </Drawer>
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
