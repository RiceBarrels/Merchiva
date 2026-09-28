"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Award, Ban, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardCheck, Clock, FileEdit, HelpCircle, Inbox, Pencil, Play, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/context/permissions";
import { addShift, createShiftTrade, updateShift, updateTradeStatus } from "@/lib/spacetimedb/actions";
import type { RoleTask, StaffRole, StaffRolePermissions } from "@/lib/types";
import {
  RoleFormDialog,
  RoleIconComp,
  RoleTaskFormDialog,
  taskCompletionsForDate,
} from "@/components/personnel/role-dialogs";
import { RoleTasksOverview } from "@/components/personnel/tasks-overview";
import { TaskRow } from "@/components/personnel/task-row";
import { AttendanceWeek } from "@/components/personnel/attendance";
import { useMobileRolesPageContext, useMobileSchedulePageContext } from "@/components/personnel/use-page-context";
import { TaskCompleteDialog } from "@/components/task-complete-dialog";
import {
  useChatConversations,
  useOrgMembers,
  useRoleTasks,
  useRoleTaskAssignments,
  useShifts,
  useShiftTrades,
  useShiftPresets,
  useStaffRoles,
  useTimeOffRequests,
  useUsers,
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
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { isOnShiftAt } from "@/lib/shift-time";
import { useNow } from "@/lib/use-now";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusBadge, STATUS_TONE_TEXT, type StatusTone } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mondayOf } from "@/lib/date-key";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  userId?: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
  status: string;
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  description: string;
}

interface ShiftPresetRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function shortDate(iso: string, formatDate: (d: Date | number | string, o: Intl.DateTimeFormatOptions) => string): string {
  if (!iso) return "";
  return formatDate(iso + "T00:00:00", { month: "short", day: "numeric" });
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

function rowIdentityKey(value: unknown): string {
  if (value && typeof (value as { toHexString?: () => string }).toHexString === "function") {
    return (value as { toHexString: () => string }).toHexString();
  }
  if (value && typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return String(value ?? "");
}

function avatarMapFromUsers(rawUsers: unknown[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const user of rawUsers as Array<{ identity?: unknown; avatarUrl?: string | null }>) {
    if (!user.identity) continue;
    const avatarUrl = user.avatarUrl ?? null;
    const key = rowIdentityKey(user.identity);
    if (key) map.set(key, avatarUrl);
    const textKey = user.identity.toString();
    if (textKey) map.set(textKey, avatarUrl);
  }
  return map;
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
  const tones: Record<string, StatusTone> = { default: "neutral", warn: "warning", ok: "success", danger: "danger" };
  return (
    <StatusBadge
      tone={tones[tone]}
      size="xs"
      className={cn("h-auto gap-1 px-1.5 py-0.5 normal-case tracking-normal", mono && "font-mono tabular-nums", className)}
    >
      {children}
    </StatusBadge>
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
          <Eyebrow as="span">{title}</Eyebrow>
          {typeof count === "number" && count > 0 && (
            <span className="font-mono tabular-nums text-[10.5px] text-muted-foreground px-1.5 h-4 inline-flex items-center justify-center border border-border rounded">
              {count}
            </span>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-[11.5px] font-medium text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
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
  const formatDate = useDateFormat();
  const nowClock = useNow(60_000);
  const [rawShifts] = useShifts() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawUsers] = useUsers() as [unknown[], boolean];
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];
  const [rawPresets] = useShiftPresets() as [unknown[], boolean];

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [selDate, setSelDate] = useState<string>(() => isoDate(new Date()));
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [poolBusyId, setPoolBusyId] = useState<string | null>(null);
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [changeBusyId, setChangeBusyId] = useState<string | null>(null);
  const { isOwner, role: orgRole, can } = usePermissions();
  const canEditSchedule = isOwner || orgRole === "manager" || can("staffing", "edit");
  const canManageAttendance = isOwner || orgRole === "manager";
  const [mobileView, setMobileView] = useState<"shifts" | "attendance">("shifts");
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [addShiftBusy, setAddShiftBusy] = useState(false);
  const [addShiftForm, setAddShiftForm] = useState({
    memberId: "",
    date: isoDate(new Date()),
    shiftType: "morning",
    startTime: "09:00",
    endTime: "17:00",
    roleNames: [] as string[],
  });

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const avatarByUserId = useMemo(() => avatarMapFromUsers(rawUsers), [rawUsers]);

  const members = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter((m) => m.organizationId === orgId && m.status === "active")
        .map((m) => {
          const userId = rowIdentityKey(m.userId);
          return {
            id: m.id?.toString?.() ?? String(m.id),
            userId,
            displayName: String(m.displayName ?? "—"),
            email: String(m.email ?? ""),
            avatarUrl: avatarByUserId.get(userId) ?? null,
            role: String(m.role ?? "staff"),
            status: "active",
          };
        }),
    [rawMembers, orgId, avatarByUserId],
  );

  const roles = useMemo<RoleRow[]>(
    () =>
      (rawRoles as any[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id?.toString?.() ?? String(r.id),
          name: String(r.name ?? ""),
          color: String(r.color ?? "#a8a29e"),
          description: String(r.description ?? ""),
        }))
        .filter((r) => r.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rawRoles, orgId],
  );

  const roleMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const r of roles) map.set(r.name.toLowerCase(), r.color);
    return map;
  }, [roles]);

  const shiftPresets = useMemo<ShiftPresetRow[]>(
    () =>
      (rawPresets as any[])
        .filter((preset) => preset.organizationId === orgId)
        .map((preset) => ({
          id: preset.id?.toString?.() ?? String(preset.id),
          name: String(preset.name ?? ""),
          startTime: String(preset.startTime ?? "09:00"),
          endTime: String(preset.endTime ?? "17:00"),
          color: String(preset.color ?? "#44403c"),
        }))
        .filter((preset) => preset.name.trim())
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name)),
    [rawPresets, orgId],
  );

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


  // "On now" — based on actual current clock time.
  // A useMemo with an empty dependency array froze this at mount, so a tablet
  // left open all day still showed the morning crew as "on now" at 15:00.
  const nowMin = nowClock.getHours() * 60 + nowClock.getMinutes();
  const todayIso = isoDate(new Date());
  const isToday = selDate === todayIso;
  const onShiftNow = isToday
    ? dayShifts.filter((s) => isOnShiftAt(s.startTime, s.endTime, nowMin))
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
  const weekLabel = `${formatDate(week[0], { month: "short", day: "numeric" })} – ${formatDate(week[6], { month: "short", day: "numeric" })}`;

  const selectedShiftName = selectedShift
    ? members.find((m) => m.id === selectedShift.memberId)?.displayName ?? selectedShift.staffName ?? "—"
    : "";
  const selectedShiftMember = selectedShift
    ? members.find((m) => m.id === selectedShift.memberId) ?? null
    : null;
  const canFindCover = !!selectedShift && !!myMemberId && selectedShift.memberId === myMemberId;
  const canChangePeople = !!selectedShift && (isOwner || orgRole === "manager" || can("staffing", "edit"));
  useMobileSchedulePageContext({
    view: mobileView, canManageAttendance, week, day: selDate, members, shifts: allShifts,
    selectedShift, addShift: addShiftOpen ? addShiftForm : null,
  });

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
      toast.success(t("staffing.toasts.shiftAddedToCoverPool"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request cover");
    } finally {
      setCoverBusy(false);
    }
  }

  async function acceptCoverPoolTrade(tradeId: string) {
    if (!myMemberId) {
      toast.error(t("staffing.toasts.noActiveMember"));
      return;
    }
    setPoolBusyId(tradeId);
    try {
      await updateTradeStatus(tradeId, "accepted");
      toast.success(t("staffing.toasts.coverAcceptedPending"));
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
      // Spread the row first: updateShift replaces every column, so a patch
      // with only these two fields blanks date, shiftType, startTime, endTime
      // and staffRoles.
      await updateShift(selectedShift.id, {
        ...selectedShift,
        memberId: member.id,
        staffName: member.displayName,
      });
      toast.success(t("staffing.toasts.shiftPersonUpdated"));
      setShowPeoplePicker(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update shift person");
    } finally {
      setChangeBusyId(null);
    }
  }

  async function saveMobileShift() {
    const member = members.find((m) => m.id === addShiftForm.memberId);
    if (!member) {
      toast.error(t("staffing.shiftDialog.assignEmployee"));
      return;
    }
    if (addShiftForm.roleNames.length === 0) {
      toast.error(t("staffing.shiftDialog.rolesLabel"));
      return;
    }
    if (addShiftForm.endTime <= addShiftForm.startTime) {
      toast.error(t("staffing.attendance.invalidWindow"));
      return;
    }

    setAddShiftBusy(true);
    try {
      await addShift({
        memberId: member.id,
        staffName: member.displayName,
        staffRole: addShiftForm.roleNames[0] ?? null,
        staffRoles: JSON.stringify(addShiftForm.roleNames),
        date: addShiftForm.date,
        shiftType: addShiftForm.shiftType,
        startTime: addShiftForm.startTime,
        endTime: addShiftForm.endTime,
        predictedDemand: "medium",
      });
      toast.success(t("staffing.toasts.shiftAdded"));
      setSelDate(addShiftForm.date);
      setAddShiftOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedSaveShift"));
    } finally {
      setAddShiftBusy(false);
    }
  }

  // Managers see a Schedule | Attendance switch; staff just get the schedule.
  const viewTabs = canManageAttendance ? (
    <div className="flex border-b border-border bg-background">
      {(["shifts", "attendance"] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => setMobileView(view)}
          className={cn(
            "flex-1 py-2.5 text-[13px] text-center transition-colors",
            mobileView === view
              ? "font-semibold text-foreground border-b-2 border-foreground"
              : "font-medium text-muted-foreground",
          )}
        >
          {view === "shifts" ? t("staffing.tabs.schedule") : t("staffing.tabs.attendance")}
        </button>
      ))}
    </div>
  ) : null;

  if (mobileView === "attendance" && canManageAttendance) {
    return (
      <div>
        {viewTabs}
        <AttendanceWeek orgId={orgId} shownOn="mobile" />
        <div className="h-4" />
      </div>
    );
  }

  return (
    <div>
      {viewTabs}
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
          <Eyebrow as="span">
            {t("personnel.m.thisWeek")} · {weekLabel}
          </Eyebrow>
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
                  "py-2 px-0 rounded-lg flex flex-col items-center gap-0.5 relative transition-colors",
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
        {canEditSchedule && (
          <Button
            type="button"
            onClick={() => {
              setAddShiftForm({
                memberId: members[0]?.id ?? "",
                date: selDate,
                shiftType: "morning",
                startTime: "09:00",
                endTime: "17:00",
                roleNames: roles[0]?.name ? [roles[0].name] : [],
              });
              setAddShiftOpen(true);
            }}
            className="px-3 text-[12px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> {t("staffing.header.addShiftShort")}
          </Button>
        )}
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
              return isOnShiftAt(s.startTime, s.endTime, nowMin);
            })();
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelectedShiftId(s.id);
                setShowPeoplePicker(false);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-3 bg-background text-left active:bg-muted/60",
                i < dayShifts.length - 1 && "border-b border-border",
              )}
            >
              <div
                className="w-[3px] self-stretch rounded-[1.5px]"
                style={{ background: SHIFT_COLORS[s.shiftType] ?? "#78716c" }}
              />
              <Avatar name={name} src={member?.avatarUrl} size="md" />
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
      <Section title={t("staffing.coverPool.title")} count={coverPool.length} kicker={t("staffing.coverPool.kicker")}>
        {coverPool.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            {t("staffing.coverPool.empty")}
          </div>
        ) : (
          coverPool.map((request) => {
            const shift = allShifts.find((s) => s.id === request.shiftId);
            if (!shift) return null;
            const requester = members.find((m) => m.id === request.requesterId);
            const assigned = members.find((m) => m.id === shift.memberId);
            const isOwnRequest = request.requesterId === myMemberId;
            return (
              <Card key={request.id} size="sm" className="mx-3.5 mb-2 py-0 shadow-none">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Avatar name={assigned?.displayName ?? shift.staffName} src={assigned?.avatarUrl} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">
                      {assigned?.displayName ?? shift.staffName}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-muted-foreground">
                      {shortDate(shift.date, formatDate)} · {formatTimeShort(shift.startTime)}–{formatTimeShort(shift.endTime)}
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
                    className="h-8 px-2.5 text-[12px]"
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

      <DynamicUIElement open={addShiftOpen} onOpenChange={setAddShiftOpen}>
        <DynamicUIElementContent className="max-w-md" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("staffing.shiftDialog.createTitle")}>
              {t("staffing.shiftDialog.createTitle")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">
              {t("staffing.shiftDialog.createDescription")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>

          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pt-2 pb-4 space-y-4">
                <div className="flex items-center gap-3 py-2 border-b border-border">
                  <Input
                    type="date"
                    value={addShiftForm.date}
                    onChange={(event) => setAddShiftForm((form) => ({ ...form, date: event.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="flex items-center gap-2 py-2 border-b border-border">
                  <Input
                    type="time"
                    value={addShiftForm.startTime}
                    onChange={(event) => setAddShiftForm((form) => ({ ...form, startTime: event.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    value={addShiftForm.endTime}
                    onChange={(event) => setAddShiftForm((form) => ({ ...form, endTime: event.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({shiftHours({ startTime: addShiftForm.startTime, endTime: addShiftForm.endTime }).toFixed(1)}{t("staffing.shiftDialog.hourSuffix")})
                  </span>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Eyebrow as="span">
                      {t("staffing.shiftDialog.timeTemplate")}
                    </Eyebrow>
                  </div>
                  {shiftPresets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("staffing.shiftDialog.noTemplatesYet")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {shiftPresets.map((preset) => {
                        const active = addShiftForm.startTime === preset.startTime && addShiftForm.endTime === preset.endTime;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setAddShiftForm((form) => ({
                              ...form,
                              startTime: preset.startTime,
                              endTime: preset.endTime,
                            }))}
                            className={cn(
                              "rounded px-2.5 py-1.5 text-center text-[11px] font-semibold transition-colors",
                              active ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/80",
                            )}
                            style={active ? { backgroundColor: preset.color } : undefined}
                          >
                            <span className="block">{preset.name}</span>
                            <span className={cn("block font-normal", active ? "text-white/70" : "text-muted-foreground/60")}>
                              {formatTimeShort(preset.startTime)}-{formatTimeShort(preset.endTime)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-2 bg-muted/50" />

              <div className="px-4 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.assignEmployee")}</Label>
                    <Select
                      value={addShiftForm.memberId}
                      onValueChange={(value) => setAddShiftForm((form) => ({ ...form, memberId: value ?? "" }))}
                    >
                      <SelectTrigger className="mt-1 w-full border-0 border-b border-border rounded-none px-0 shadow-none focus:ring-0">
                        <SelectValue placeholder={t("staffing.shiftDialog.selectPlaceholder")}>
                          {members.find((member) => member.id === addShiftForm.memberId)?.displayName ?? t("staffing.shiftDialog.selectPlaceholder")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>{member.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("storeAi.fields.shiftType")}</Label>
                    <Select
                      value={addShiftForm.shiftType}
                      onValueChange={(value) => setAddShiftForm((form) => ({ ...form, shiftType: value ?? "morning" }))}
                    >
                      <SelectTrigger className="mt-1 w-full border-0 border-b border-border rounded-none px-0 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["morning", "afternoon", "evening", "closing"] as const).map((type) => (
                          <SelectItem key={type} value={type}>{t(`staffing.shiftTypes.${type}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.rolesLabel")}</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {roles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("staffing.roles.noRolesYet")}</p>
                    ) : (
                      roles.map((role) => {
                        const selected = addShiftForm.roleNames.includes(role.name);
                        return (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => setAddShiftForm((form) => ({
                              ...form,
                              roleNames: selected
                                ? form.roleNames.filter((name) => name !== role.name)
                                : [...form.roleNames, role.name],
                            }))}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors",
                              selected
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selected ? "white" : role.color }} />
                            {role.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.shiftNotes")}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("staffing.shiftDialog.shiftNotesHint")}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 py-4 border-t border-border mt-auto">
              <Button
                onClick={saveMobileShift}
                disabled={addShiftBusy || !addShiftForm.memberId || addShiftForm.roleNames.length === 0}
                className="w-full h-12 text-sm font-semibold"
              >
                {addShiftBusy ? <Spinner size={16} /> : t("staffing.shiftDialog.createCta")}
              </Button>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      <DynamicUIElement open={!!selectedShift} onOpenChange={(open) => { if (!open) { setSelectedShiftId(null); setShowPeoplePicker(false); } }}>
        <DynamicUIElementContent className="sm:max-w-md" noPadding>
          {selectedShift && (
            <>
              <DynamicUIElementHeader className="px-4 pt-4 pb-3 border-b border-border">
                <DynamicUIElementTitle mobileTitle="Shift details">
                  {selectedShiftName}
                </DynamicUIElementTitle>
                <DynamicUIElementDescription>
                  {shortDate(selectedShift.date, formatDate)} · {formatTimeLong(selectedShift.startTime)}–{formatTimeLong(selectedShift.endTime)}
                </DynamicUIElementDescription>
              </DynamicUIElementHeader>

              <div className="px-4 py-4 space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={selectedShiftName} src={selectedShiftMember?.avatarUrl} size="lg" />
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
                  <Eyebrow as="div" className="mb-3">
                    {t("staffing.everyoneWorkingThatDay")}
                  </Eyebrow>
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
                          <div className={cn("rounded-lg border p-2.5", active ? "border-foreground bg-muted/40" : "border-border bg-background")}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar name={name} src={member?.avatarUrl} size="sm" />
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
                    className="w-full h-9 text-[12.5px]"
                  >
                    {t("staffing.changePeople")}
                  </Button>
                  {showPeoplePicker && (
                    <div className="mt-2 rounded-lg border border-border overflow-hidden">
                      {members.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          disabled={changeBusyId === member.id || selectedShift.memberId === member.id}
                          onClick={() => changeShiftPerson(member)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-background text-left border-t border-border first:border-t-0 disabled:opacity-50"
                        >
                          <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
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
                  <Button
                    type="button"
                    disabled={coverBusy || existingCoverRequest}
                    onClick={requestCover}
                    className="w-full h-10 gap-2 text-[13px] font-semibold"
                  >
                    {coverBusy ? <Spinner size={16} /> : <Clock className="h-4 w-4" strokeWidth={1.75} />}
                    {existingCoverRequest ? "Already in cover pool" : "Find cover"}
                  </Button>
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
      <Eyebrow as="div" size="xs">
        {label}
      </Eyebrow>
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
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={onClick}
      className="text-muted-foreground"
    >
      <IconComp className="h-[14px] w-[14px]" strokeWidth={1.75} />
    </Button>
  );
}

// ─── Mobile Roles (list → drill into detail) ────────────────────────────────

export function MobileRoles({ orgId }: { orgId: string }) {
  const tt = useT();
  const { isOwner, can } = usePermissions();
  // Same gate as the desktop roles editor in staffing-full.tsx.
  const canEdit = isOwner || can("staffing", "edit");
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];
  const [rawTasks] = useRoleTasks() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawUsers] = useUsers() as [unknown[], boolean];
  const [rawConvos] = useChatConversations() as [unknown[], boolean];
  const [rawAssignments] = useRoleTaskAssignments() as [unknown[], boolean];

  const roles = useMemo<StaffRole[]>(
    () =>
      (rawRoles as any[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id?.toString?.() ?? String(r.id),
          name: String(r.name ?? ""),
          color: String(r.color ?? "#44403c"),
          icon: String(r.icon ?? "user"),
          description: String(r.description ?? ""),
          permissions: ((): StaffRolePermissions => {
            const p = r.permissions;
            if (p && typeof p === "object") return p as StaffRolePermissions;
            if (typeof p === "string") {
              try { return JSON.parse(p) as StaffRolePermissions; } catch {}
            }
            return {};
          })(),
        })),
    [rawRoles, orgId],
  );

  const tasksByRole = useMemo<Map<string, RoleTask[]>>(() => {
    const map = new Map<string, RoleTask[]>();
    for (const r of rawTasks as any[]) {
      if (r.organizationId && r.organizationId !== orgId) continue;
      const t: RoleTask = {
        id: r.id?.toString?.() ?? String(r.id),
        roleId: String(r.roleId ?? ""),
        organizationId: r.organizationId ?? null,
        title: String(r.title ?? ""),
        description: String(r.description ?? ""),
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        sortOrder: Number(r.sortOrder ?? 0),
        requiresEvidence: !!r.requiresEvidence,
        notifyChats: (() => {
          if (Array.isArray(r.notifyChats)) return r.notifyChats as string[];
          if (typeof r.notifyChats === "string" && r.notifyChats.length > 0) {
            try {
              const parsed = JSON.parse(r.notifyChats);
              if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
            } catch {}
          }
          return [];
        })(),
      };
      const list = map.get(t.roleId) ?? [];
      list.push(t);
      map.set(t.roleId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
    }
    return map;
  }, [rawTasks, orgId]);

  const groupChats = useMemo(
    () =>
      (rawConvos as any[])
        .filter((c) => c.organizationId === orgId && c.type === "group")
        .map((c) => ({
          id: c.id?.toString?.() ?? String(c.id),
          name: (c.name ?? null) as string | null,
          type: "group",
        })),
    [rawConvos, orgId],
  );

  // ─── Editor state (shared role/task form dialogs) ───
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<StaffRole | null>(null);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: RoleTask | null }>({ open: false, task: null });
  // Tap a task row to complete it — same evidence-upload flow as the dashboard.
  const [completeFor, setCompleteFor] = useState<RoleTask | null>(null);

  const avatarByUserId = useMemo(() => avatarMapFromUsers(rawUsers), [rawUsers]);

  const activeMembers = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter((m) => m.organizationId === orgId && m.status === "active")
        .map((m) => {
          const userId = rowIdentityKey(m.userId);
          return {
            id: m.id?.toString?.() ?? String(m.id),
            userId,
            displayName: String(m.displayName ?? "—"),
            email: String(m.email ?? ""),
            avatarUrl: avatarByUserId.get(userId) ?? null,
            role: String(m.role ?? "staff"),
            status: "active",
          };
        }),
    [rawMembers, orgId, avatarByUserId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ─── Per-day completion status (anyone submits; permitted users can browse
  //     any day's completion state; everyone else sees today's) ───
  const todayStr = isoDate(new Date());
  const [statusDate, setStatusDate] = useState(todayStr);
  const dayCompletions = useMemo(
    () => taskCompletionsForDate(rawAssignments, orgId, statusDate),
    [rawAssignments, orgId, statusDate],
  );
  const nameByIdentity = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of rawMembers as any[]) {
      if (m.organizationId !== orgId) continue;
      map.set(rowIdentityKey(m.userId), String(m.displayName ?? "—"));
    }
    return map;
  }, [rawMembers, orgId]);
  const shiftStatusDate = (delta: number) => {
    setStatusDate((prev) => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + delta);
      const next = isoDate(d);
      return next > todayStr ? prev : next;
    });
  };

  const selectedRole = selectedId ? roles.find((r) => r.id === selectedId) ?? null : null;
  const selectedTasks = selectedRole ? tasksByRole.get(selectedRole.id) ?? [] : [];
  useMobileRolesPageContext({
    roleCount: roles.length, selectedRole, selectedTaskCount: selectedTasks.length, statusDate, todayStr,
  });
  const selectedMembers = selectedRole
    ? activeMembers.filter((m) =>
        m.role.toLowerCase().includes(selectedRole.name.toLowerCase()),
      )
    : [];

  return (
    <div>
      <RoleTasksOverview orgId={orgId} roles={roles} className="border-b border-border" />
      <Section
        title={tt("personnel.m.rolesTitle").replace("{n}", String(roles.length))}
        kicker={tt("personnel.m.rolesKicker")}
        action={canEdit ? {
          label: tt("staffing.roles.addRole"),
          icon: Plus,
          onClick: () => { setEditingRole(null); setRoleDialogOpen(true); },
        } : undefined}
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
                  className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-background"
                  style={{ background: r.color }}
                >
                  <RoleIconComp name={r.icon} className="h-4 w-4" />
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
                    className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-background shrink-0"
                    style={{ background: selectedRole.color }}
                  >
                    <RoleIconComp name={selectedRole.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DynamicUIElementTitle mobileTitle={selectedRole.name}>
                      {selectedRole.name}
                    </DynamicUIElementTitle>
                    <DynamicUIElementDescription>
                      {tt("personnel.m.membersTasks")
                        .replace("{m}", String(selectedMembers.length))
                        .replace("{t}", String(selectedTasks.length))}
                    </DynamicUIElementDescription>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={tt("common.edit")}
                      onClick={() => { setEditingRole(selectedRole); setRoleDialogOpen(true); }}
                      className="text-muted-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </Button>
                  )}
                </div>
              </DynamicUIElementHeader>

              {/* DynamicUIElementHeader is CSS-hidden under 640px, which also
                  hides the edit button — mirror the header here for phones. */}
              <div className="sm:hidden flex items-center gap-2.5 px-4 pt-1 pb-3 border-b border-border">
                <span
                  className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-background shrink-0"
                  style={{ background: selectedRole.color }}
                >
                  <RoleIconComp name={selectedRole.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium tracking-[-0.01em] truncate">{selectedRole.name}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">
                    {tt("personnel.m.membersTasks")
                      .replace("{m}", String(selectedMembers.length))
                      .replace("{t}", String(selectedTasks.length))}
                  </div>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={tt("common.edit")}
                    onClick={() => { setEditingRole(selectedRole); setRoleDialogOpen(true); }}
                    className="text-muted-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </Button>
                )}
              </div>

              <div className="px-4 py-4 space-y-4">
                {selectedRole.description && (
                  <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {selectedRole.description}
                  </div>
                )}

                <div>
                  <Eyebrow as="div" className="mb-2">
                    {tt("personnel.m.members").replace("{n}", String(selectedMembers.length))}
                  </Eyebrow>
                  {selectedMembers.length === 0 ? (
                    <div className="text-[12px] text-muted-foreground py-1">{tt("personnel.m.noMembers")}</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMembers.map((m) => (
                        <div
                          key={m.id}
                          className="inline-flex items-center gap-1.5 pr-2.5 pl-1 py-1 rounded-full border border-border bg-background"
                        >
                          <Avatar name={m.displayName} src={m.avatarUrl} size="xs" />
                          <span className="text-[12px] font-medium">
                            {m.displayName.split(" ")[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Eyebrow as="div">
                      {tt("personnel.m.taskList").replace("{n}", String(selectedTasks.length))}
                    </Eyebrow>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setTaskDialog({ open: true, task: null })}
                        className="text-[11px] text-muted-foreground"
                      >
                        <Plus className="h-3 w-3" strokeWidth={1.75} /> {tt("staffing.roles.addTask")}
                      </Button>
                    )}
                  </div>
                  {/* Permitted users can browse completion status for any day */}
                  {canEdit && (
                    <div className="flex items-center justify-between rounded-lg border border-border px-1.5 py-1 mb-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tt("staffing.roles.prevDay")}
                        onClick={() => shiftStatusDate(-1)}
                        className="text-muted-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                      <span className="text-[12px] font-medium tabular-nums">
                        {statusDate === todayStr
                          ? tt("staffing.roles.today")
                          : new Date(statusDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" })}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tt("staffing.roles.nextDay")}
                        onClick={() => shiftStatusDate(1)}
                        disabled={statusDate >= todayStr}
                        className="text-muted-foreground"
                      >
                        <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </div>
                  )}
                  {selectedTasks.length === 0 ? (
                    <EmptyState compact description={tt("personnel.m.noTasks")} />
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      {selectedTasks.map((task, i) => {
                        const comp = dayCompletions.get(task.id);
                        return (
                          <TaskRow
                            key={task.id}
                            task={task}
                            completion={comp ? {
                              completedAtMs: comp.completedAtMs,
                              completedByName: comp.completedBy ? nameByIdentity.get(comp.completedBy) ?? null : null,
                              evidence: comp.evidence,
                              note: comp.note,
                            } : null}
                            onComplete={statusDate === todayStr ? () => setCompleteFor(task) : undefined}
                            onEdit={canEdit ? () => setTaskDialog({ open: true, task }) : undefined}
                            className={i > 0 ? "border-t border-border" : undefined}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* Shared add/edit dialogs — same forms + actions as the desktop editor. */}
      <RoleFormDialog
        open={roleDialogOpen}
        onOpenChange={(open) => { setRoleDialogOpen(open); if (!open) setEditingRole(null); }}
        role={editingRole}
        organizationId={orgId}
      />
      {selectedRole && (
        <RoleTaskFormDialog
          open={taskDialog.open}
          onOpenChange={(open) => { if (!open) setTaskDialog({ open: false, task: null }); }}
          task={taskDialog.task}
          roleId={selectedRole.id}
          organizationId={orgId}
          sortOrder={selectedTasks.length}
          chatOptions={groupChats}
        />
      )}
      {completeFor && (
        <TaskCompleteDialog
          task={completeFor}
          organizationId={orgId}
          onClose={() => setCompleteFor(null)}
        />
      )}
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
  const formatDate = useDateFormat();
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];
  const [rawShifts] = useShifts() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawUsers] = useUsers() as [unknown[], boolean];
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const setBusyFor = (id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const avatarByUserId = useMemo(() => avatarMapFromUsers(rawUsers), [rawUsers]);

  const members = useMemo<Map<string, { name: string; avatarUrl: string | null }>>(() => {
    const map = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const m of rawMembers as any[]) {
      if (m.organizationId !== orgId) continue;
      const id = m.id?.toString?.() ?? String(m.id);
      const uid = rowIdentityKey(m.userId);
      const member = {
        name: String(m.displayName ?? "—"),
        avatarUrl: avatarByUserId.get(uid) ?? null,
      };
      map.set(id, member);
      if (uid) map.set(uid, member);
    }
    return map;
  }, [rawMembers, orgId, avatarByUserId]);

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
        .map((r) => {
          const userId = rowIdentityKey(r.userId);
          const member = members.get(userId);
          return {
            id: r.id?.toString?.() ?? String(r.id),
            userId,
            staffName: member?.name ?? String(r.staffName ?? ""),
            avatarUrl: member?.avatarUrl ?? null,
            startDate: String(r.startDate ?? ""),
            endDate: String(r.endDate ?? r.startDate ?? ""),
            fullDays: !!r.fullDays,
            startTime: r.startTime ?? null,
            endTime: r.endTime ?? null,
            comments: r.comments ?? null,
          };
        }),
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-2"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>
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
                      <Avatar name={r.staffName} src={r.avatarUrl} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold tracking-[-0.01em] truncate">
                          {r.staffName}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {shortDate(r.startDate, formatDate)}
                          {r.endDate !== r.startDate && ` – ${shortDate(r.endDate, formatDate)}`}
                          {!r.fullDays && r.startTime && r.endTime && (
                            <>
                              {" · "}
                              {formatTimeLong(r.startTime)}–{formatTimeLong(r.endTime)}
                            </>
                          )}
                        </div>
                        {r.comments && (
                          <div className="text-[11.5px] text-muted-foreground mt-1 italic line-clamp-2">
                            “{r.comments}”
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => approveTO(r.id)}
                        className={cn("flex-1 text-[12px]", STATUS_TONE_TEXT.success)}
                      >
                        <Check className="h-3 w-3" strokeWidth={1.75} />
                        {tt("personnel.m.approve")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => denyTO(r.id)}
                        className="flex-1 text-[12px]"
                      >
                        <Ban className="h-3 w-3" strokeWidth={1.75} />
                        {tt("personnel.m.reject")}
                      </Button>
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
                const reqMember = members.get(t.requesterId);
                const tgtMember = t.targetId ? members.get(t.targetId) : null;
                const reqName = reqMember?.name;
                const tgtName = tgtMember?.name;
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
                          {shortDate(shift.date, formatDate)} · {formatTimeShort(shift.startTime)}–
                          {formatTimeShort(shift.endTime)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px]">
                      {reqName && (
                        <>
                          <Avatar name={reqName} src={reqMember?.avatarUrl} size="sm" />
                          <span className="font-medium">{reqName.split(" ")[0]}</span>
                        </>
                      )}
                      <ArrowRight
                        className="h-[11px] w-[11px] text-muted-foreground"
                        strokeWidth={1.75}
                      />
                      {tgtName ? (
                        <>
                          <Avatar name={tgtName} src={tgtMember?.avatarUrl} size="sm" />
                          <span className="font-medium">{tgtName.split(" ")[0]}</span>
                        </>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground italic">
                          {tt("personnel.m.anyAvailable")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => approveTD(t.id)}
                        className={cn("flex-1 text-[12px]", STATUS_TONE_TEXT.success)}
                      >
                        <Check className="h-3 w-3" strokeWidth={1.75} />
                        {tt("personnel.m.accept")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => denyTD(t.id)}
                        className="flex-1 text-[12px]"
                      >
                        <Ban className="h-3 w-3" strokeWidth={1.75} />
                        {tt("personnel.m.reject")}
                      </Button>
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
