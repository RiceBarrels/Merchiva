"use client";

import { cn, uuid } from "@/lib/utils";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Plus, ChevronLeft, ChevronRight, X, Shield, Trash2, ArrowLeftRight, UserPlus, Users, CalendarX, Search, Check, Ban, ChevronDown, ChevronUp, User, Camera, Clock, ClipboardList, Pencil, Download, RefreshCw, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, type AvatarProps } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DialogActions } from "@/components/ui/dialog-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementDescription, DynamicUIElementHeader, DynamicUIElementTitle, useDynamicUIElementUrl,
} from "@/components/ui/dynamic-ui-element";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/lib/context/permissions";
import {
  addShift, updateShift, deleteShift,
  addStaffRole, updateStaffRole, deleteStaffRole,
  getRoleTasks, addRoleTask, updateRoleTask, deleteRoleTask,
  addShiftPreset, updateShiftPreset, deleteShiftPreset,
  managerRecordPunch,
  managerSetPunchWindow,
} from "@/lib/spacetimedb/actions";
import type { ShiftPreset } from "@/lib/types";
import {
  upsertAvailability,
  createTimeOffRequest, updateTimeOffStatus,
  createShiftTrade, updateTradeStatus,
} from "@/lib/spacetimedb/actions";
import { getCoworkersWithShifts } from "@/lib/db/availability";
import type {
  OrgMember, Shift, ShiftType, StaffRole, StaffRolePermissions,
  StaffAvailability, TimeOffRequest, ShiftTrade, RoleTask,
} from "@/lib/types";
import { NotificationPanel } from "@/components/notification-panel";
import { PageHeader } from "@/components/page-header";
import { hapticLight, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { getCached, setCache } from "@/lib/cache";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";
import { useIsMobile } from "@/lib/use-is-mobile";
import { tables } from "@/lib/spacetimedb/generated";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { type DateFormatter } from "@/lib/i18n/dates";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { isOnShiftAt, shiftDurationHours } from "@/lib/shift-time";
import { useNow } from "@/lib/use-now";

// Role constants + icon helper now live in the shared role-dialogs module so
// the mobile personnel pages can reuse them.
import {
  ROLE_ICON_LIST, ROLE_ICON_MAP, ROLE_PERMISSION_KEYS, RoleColorPicker, RoleIconComp,
  taskCompletionsForDate,
} from "@/components/personnel/role-dialogs";
import { RoleTasksOverview } from "@/components/personnel/tasks-overview";
import { TaskRow } from "@/components/personnel/task-row";
import { TaskCompleteDialog } from "@/components/task-complete-dialog";
import { useRoleTaskAssignments } from "@/lib/spacetimedb/hooks";
import { AttendanceWeek } from "@/components/personnel/attendance";
import { useStaffingDesktopPageContext, type ShiftDialogState } from "@/components/personnel/use-page-context";

const SHIFT_COLORS: Record<ShiftType, string> = {
  morning:   "#44403c",
  afternoon: "#0891b2",
  evening:   "#7c3aed",
  closing:   "#dc2626",
};

const SHIFT_LABEL_KEYS: Record<ShiftType, string> = {
  morning:   "staffing.shiftTypes.morning",
  afternoon: "staffing.shiftTypes.afternoon",
  evening:   "staffing.shiftTypes.evening",
  closing:   "staffing.shiftTypes.closing",
};

const DAY_NAME_KEYS = ["staffing.days.sun", "staffing.days.mon", "staffing.days.tue", "staffing.days.wed", "staffing.days.thu", "staffing.days.fri", "staffing.days.sat"];

function avatarSize(px: number): NonNullable<AvatarProps["size"]> {
  if (px <= 22) return "xs";
  if (px <= 27) return "sm";
  if (px <= 33) return "md";
  if (px <= 40) return "lg";
  return "xl";
}

function StaffAvatar({
  name,
  avatarUrl,
  size = 28,
  shape,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  shape?: AvatarProps["shape"];
  className?: string;
}) {
  return <Avatar name={name} src={avatarUrl} size={avatarSize(size)} shape={shape} className={className} />;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

// Shifts are stored as the store's own calendar day, so this must be local.
function isoDate(d: Date): string {
  return dateKey(d);
}

function getWeekDates(base: Date): Date[] {
  const d = new Date(base);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(mon);
    date.setDate(mon.getDate() + i);
    return date;
  });
}

function formatDateShort(iso: string, formatDate: DateFormatter): string {
  return formatDate(iso + "T00:00:00", { month: "short", day: "numeric" });
}


const DEFAULT_DAY_TIMES = [false, true, true, true, true, true, false].map((on) => ({
  enabled: on, fullDay: true, startTime: "09:00", endTime: "17:00",
}));

const DEFAULT_AVAIL_FORM = {
  type: "permanent" as "permanent" | "temporary",
  startDate: "",
  endDate: "",
  dayTimes: DEFAULT_DAY_TIMES,
  status: "available",
  comments: "",
};

// Pad a possibly-short dayTimes array to 7 entries so UI indexing is always safe.
function normalizeDayTimes(dt: unknown): typeof DEFAULT_DAY_TIMES {
  const base = DEFAULT_DAY_TIMES.map((d) => ({ ...d }));
  if (!Array.isArray(dt)) return base;
  for (let i = 0; i < 7; i++) {
    const src = dt[i];
    if (src && typeof src === "object") {
      base[i] = { ...base[i], ...(src as Partial<typeof base[number]>) };
    }
  }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop Layout
// ─────────────────────────────────────────────────────────────────────────────

type DesktopTab = "schedule" | "attendance" | "roles";

interface PunchEventRow {
  id: { toString(): string };
  organizationId: string;
  memberId: string;
  action: string;
  at: { toDate?: () => Date; microsSinceUnixEpoch?: bigint };
  closed: boolean;
  pairEventId?: string | null;
}

interface AttendanceRow {
  member: OrgMember;
  inEvent: PunchEventRow | null;
  outEvent: PunchEventRow | null;
  openIn: PunchEventRow | null;
  openBreak: PunchEventRow | null;
  state: "off" | "on" | "break" | "complete";
  startTime: string;
  endTime: string;
}

function punchEventTime(e: PunchEventRow): Date {
  if (e.at && typeof e.at.toDate === "function") return e.at.toDate();
  if (typeof e.at?.microsSinceUnixEpoch === "bigint") {
    return new Date(Number(e.at.microsSinceUnixEpoch / BigInt(1000)));
  }
  return new Date();
}

function formatClockDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateTimeFromInput(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function dayStartFromInput(date: string): Date {
  return dateTimeFromInput(date, "00:00");
}

function nextDayStartFromInput(date: string): Date {
  const d = dayStartFromInput(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function AttendanceManagerPanel({
  rows,
  canManage,
  date,
  onDateChange,
  busyMemberId,
  savingMemberId,
  onPunch,
  onSaveWindow,
  compact = false,
  full = false,
  showHeader = true,
}: {
  rows: AttendanceRow[];
  canManage: boolean;
  date: string;
  onDateChange: (date: string) => void;
  busyMemberId: string | null;
  savingMemberId: string | null;
  onPunch: (memberId: string, action: "in" | "out") => void;
  onSaveWindow: (memberId: string, startTime: string, endTime: string) => void;
  compact?: boolean;
  full?: boolean;
  showHeader?: boolean;
}) {
  const t = useT();
  const [drafts, setDrafts] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const rowSyncKey = rows.map((row) => `${row.member.id}:${row.startTime}:${row.endTime}`).join("|");

  // `rowSyncKey` exists so the drafts re-seed only when the punch TIMES change.
  // Listing `rows` as well defeated it: `rows` is a useMemo over the whole
  // punch-event stream, so any colleague tapping "break start" on the shared
  // tablet gave it a new identity and this effect overwrote the manager's
  // half-typed correction with the server values. The sibling editor in
  // components/personnel/attendance.tsx already keys on the derived value only.
  useEffect(() => {
    const next: Record<string, { startTime: string; endTime: string }> = {};
    rows.forEach((row) => {
      next[row.member.id] = { startTime: row.startTime, endTime: row.endTime };
    });
    setDrafts(next);
    // `rows` is deliberately NOT a dependency. The render that produces a new
    // rowSyncKey produces the matching `rows`, so the closure is current —
    // whereas listing `rows` re-runs on every unrelated punch event too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSyncKey]);

  if (!canManage) return null;

  const recordedCount = rows.filter((row) => row.inEvent).length;
  const canQuickPunch = date === dateKey(new Date());
  const setDraft = (memberId: string, field: "startTime" | "endTime", value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [memberId]: {
        startTime: prev[memberId]?.startTime ?? "",
        endTime: prev[memberId]?.endTime ?? "",
        [field]: value,
      },
    }));
  };

  return (
    <section className={cn("border-b border-border bg-background", compact ? "" : "border-t", full && "flex-1 min-h-0 flex flex-col")}>
      {showHeader && (
        <div className={cn("flex items-center justify-between gap-3", compact ? "px-4 py-2.5" : "px-6 py-3")}>
          <div className="min-w-0">
            <Eyebrow>{t("staffing.attendance.title")}</Eyebrow>
            <p className="text-[12px] text-muted-foreground">
              {t("staffing.attendance.subtitle").replace("{active}", String(recordedCount)).replace("{total}", String(rows.length))}
            </p>
          </div>
          <Input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-8 w-[136px] shrink-0 px-2 text-[12px]"
            aria-label={t("staffing.attendance.date")}
          />
        </div>
      )}
      {rows.length === 0 ? (
        <p className={cn("text-[12px] text-muted-foreground", compact ? "px-4 pb-3" : "px-6 pb-3")}>{t("staffing.attendance.empty")}</p>
      ) : (
        <div className={cn("divide-y divide-border", compact ? "" : full ? "flex-1 overflow-y-auto" : "max-h-56 overflow-y-auto")}>
          {rows.map((row) => {
            const { member, openIn, openBreak, state } = row;
            const memberId = member.id;
            const action: "in" | "out" = openIn ? "out" : "in";
            const busy = busyMemberId === memberId;
            const saving = savingMemberId === memberId;
            const since = openBreak ?? openIn;
            const draft = drafts[memberId] ?? { startTime: "", endTime: "" };
            const dirty = draft.startTime !== row.startTime || draft.endTime !== row.endTime;
            return (
              <div key={memberId} className={cn("flex items-center gap-2.5", compact ? "px-4 py-2.5 flex-wrap" : "px-6 py-2.5")}>
                <StaffAvatar name={member.displayName} avatarUrl={member.avatarUrl} size={compact ? 28 : 30} />
                <div className={cn("min-w-0 flex-1", compact ? "basis-[calc(100%-40px)]" : "")}>
                  <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{member.displayName}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {state === "complete" ? t("staffing.attendance.complete") : state === "break" ? t("staffing.attendance.break") : state === "on" ? t("staffing.attendance.on") : t("staffing.attendance.off")}
                    {since ? ` · ${t("staffing.attendance.since")} ${formatClockDate(punchEventTime(since))}` : ""}
                  </p>
                </div>
                <div className={cn("flex items-center gap-1.5", compact ? "ml-[38px]" : "")}>
                  <Input
                    type="time"
                    value={draft.startTime}
                    onChange={(event) => setDraft(memberId, "startTime", event.target.value)}
                    className="h-8 w-[82px] px-1.5 text-[12px] font-mono tabular-nums"
                    aria-label={t("staffing.attendance.start")}
                  />
                  <span className="text-[11px] text-muted-foreground">-</span>
                  <Input
                    type="time"
                    value={draft.endTime}
                    onChange={(event) => setDraft(memberId, "endTime", event.target.value)}
                    className="h-8 w-[82px] px-1.5 text-[12px] font-mono tabular-nums"
                    aria-label={t("staffing.attendance.end")}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-[68px] px-2.5 text-[12px]"
                  disabled={!dirty || !draft.startTime || !!savingMemberId || !!busyMemberId}
                  onClick={() => onSaveWindow(memberId, draft.startTime, draft.endTime)}
                >
                  {saving ? <Spinner size={14} /> : <><Check className="h-3.5 w-3.5" /> {t("staffing.attendance.save")}</>}
                </Button>
                {canQuickPunch && (
                  <Button
                    size="sm"
                    variant={action === "out" ? "outline" : "default"}
                    className="h-8 min-w-[78px] px-2.5 text-[12px]"
                    disabled={!!busyMemberId || !!savingMemberId}
                    onClick={() => onPunch(memberId, action)}
                  >
                    {busy ? <Spinner size={14} /> : action === "in" ? t("staffing.attendance.clockIn") : t("staffing.attendance.clockOut")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface StaffingDesktopProps {
  organizationId: string | null;
  isOwner: boolean;
  canEdit: boolean;
  isStaff: boolean;
  currentOrg: { name: string } | null;
  role: string | null;
  userId: string | null;
  myMemberId: string | null;
  canManageAttendance: boolean;
  team: OrgMember[];
  shifts: Shift[];
  setShifts: React.Dispatch<React.SetStateAction<Shift[]>>;
  roles: StaffRole[];
  weekStart: Date;
  setWeekStart: React.Dispatch<React.SetStateAction<Date>>;
  weekDates: Date[];
  weekShifts: Shift[];
  todayStr: string;
  selectedDay: string;
  setSelectedDay: (d: string) => void;
  orgTimeOffRequests: TimeOffRequest[];
  orgShiftTrades: ShiftTrade[];
  pendingCount: number;
  getMemberName: (id: string) => string;
  handleTimeOffStatusUpdate: (id: string, status: "approved" | "denied") => Promise<void>;
  handleTradeStatusUpdate: (id: string, status: "accepted" | "denied") => Promise<void>;
  handleDeleteShift: (id: string) => Promise<void>;
  setEditingShift: (s: Shift | null) => void;
  setShiftForm: React.Dispatch<React.SetStateAction<{
    memberId: string;
    date: string;
    shiftType: ShiftType;
    startTime: string;
    endTime: string;
    roleNames: string[];
  }>>;
  setAddDialog: (b: boolean) => void;
  roleTasksCache: Record<string, RoleTask[]>;
  roleTaskCounts: Record<string, number>;
  loadRoleTasksFor: (roleId: string) => Promise<void>;
  loadingTasks: boolean;
  selectedRole: StaffRole | null;
  setSelectedRole: (r: StaffRole | null) => void;
  handleSelectRole: (r: StaffRole) => void;
  handleDeleteRole: (id: string) => Promise<void>;
  setEditingRole: (r: StaffRole | null) => void;
  setRoleForm: React.Dispatch<React.SetStateAction<{
    name: string;
    color: string;
    icon: string;
    description: string;
    permissions: StaffRolePermissions;
  }>>;
  setRoleDialog: (b: boolean) => void;
  setTaskDialog: React.Dispatch<React.SetStateAction<{ open: boolean; task: RoleTask | null }>>;
  setTaskForm: React.Dispatch<React.SetStateAction<{
    title: string;
    description: string;
    hasTime: boolean;
    startTime: string;
    endTime: string;
    requiresEvidence: boolean;
    notifyChats: string[];
  }>>;
  refreshing: boolean;
  /** The add / edit shift dialog while it is open, for Mr. Merchiva's page context. */
  shiftDialog: ShiftDialogState | null;
  /** Restrict which inner subtabs are shown. When set, the tab bar is hidden
   *  if only one entry remains. Used by the Personnel hub to split this page
   *  across its own top tabs (Schedule shows schedule; Roles shows
   *  just the roles tab). */
  subtabs?: DesktopTab[];
}

function StaffingDesktop(props: StaffingDesktopProps) {
  const t = useT();
  const formatDate = useDateFormat();
  // "On now" has to keep up on a tablet left open all day.
  const nowClock = useNow(60_000);
  const {
    canEdit, isStaff, currentOrg, team, shifts, roles,
    weekStart, setWeekStart, weekDates, weekShifts,
    todayStr,
    orgTimeOffRequests, orgShiftTrades, pendingCount,
    getMemberName, handleTimeOffStatusUpdate, handleTradeStatusUpdate,
    handleDeleteShift, setEditingShift, setShiftForm, setAddDialog,
    roleTasksCache, roleTaskCounts, loadRoleTasksFor, loadingTasks,
    selectedRole, setSelectedRole, handleSelectRole, handleDeleteRole,
    setEditingRole, setRoleForm, setRoleDialog,
    setTaskDialog, setTaskForm, refreshing, myMemberId, selectedDay, setSelectedDay,
    canManageAttendance, organizationId, shiftDialog,
    subtabs: subtabsFilter,
  } = props;

  const [dTab, setDTab] = useState<DesktopTab>(() => subtabsFilter?.[0] ?? "schedule");
  const [railOpen, setRailOpen] = useState(true);

  // ─── Roles tab: per-day completion status. Anyone can submit completions;
  //     users with staffing-edit permission can browse any day's status. ───
  const [rawTaskAssignments] = useRoleTaskAssignments() as [unknown[], boolean];
  const [statusDate, setStatusDate] = useState(todayStr);
  // Tap a task row to complete it — same evidence-upload flow as the dashboard.
  const [completeTaskFor, setCompleteTaskFor] = useState<RoleTask | null>(null);
  const dayCompletions = useMemo(
    () => taskCompletionsForDate(rawTaskAssignments, organizationId ?? "", statusDate),
    [rawTaskAssignments, organizationId, statusDate],
  );
  const nameByIdentity = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of team) {
      if (m.userId) map.set(m.userId, m.displayName);
    }
    return map;
  }, [team]);
  const shiftStatusDate = (delta: number) => {
    setStatusDate((prev) => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + delta);
      const next = isoDate(d);
      return next > todayStr ? prev : next;
    });
  };

  const prevWeekD = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeekD = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const monthYearD = formatDate(weekDates[0], { month: "long", year: "numeric" });
  const isTodayD = (d: Date) => isoDate(d) === todayStr;
  const allMembers = team.filter((m) => m.status === "active");
  useStaffingDesktopPageContext({
    tab: dTab, weekDates, weekShifts, members: allMembers, roles, selectedRole,
    roleTaskCounts, statusDate, todayStr, shiftDialog,
  });

  // Compute shift hours helper. Wraps past midnight — see lib/shift-time.ts.
  const shiftHours = (s: Shift) => shiftDurationHours(s.startTime, s.endTime);

  // ─── Schedule Tab (staff x week grid) ─────────────────────
  function ScheduleGrid() {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Week nav */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={prevWeekD}>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Button>
          <span className="text-[13px] font-semibold text-foreground min-w-[140px] text-center">{monthYearD}</span>
          <Button variant="ghost" size="icon-sm" onClick={nextWeekD}>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
          <div className="flex-1" />
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingShift(null);
                setShiftForm({
                  memberId: team[0]?.id ?? "",
                  date: todayStr,
                  shiftType: "morning",
                  startTime: "07:00",
                  endTime: "14:00",
                  roleNames: [],
                });
                setAddDialog(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> {t("staffing.header.addShift")}
            </Button>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-full grid grid-cols-[180px_repeat(7,minmax(0,1fr))_68px]">
            {/* Header row */}
            <div className="sticky top-0 z-10 bg-muted border-b border-r border-border px-3 py-2.5 flex items-center">
              <Eyebrow as="span">{t("staffing.header.staff")}</Eyebrow>
            </div>
            {weekDates.map((d) => {
              const ds = isoDate(d);
              const today = isTodayD(d);
              return (
                <div
                  key={ds}
                  className={`sticky top-0 z-10 border-b border-r border-border px-2 py-2.5 text-center ${
                    today ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide">
                    {formatDate(d, { weekday: "short" })}
                  </div>
                  <div className={`text-[15px] font-bold ${today ? "text-background" : "text-foreground"}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
            <div className="sticky top-0 z-10 bg-muted border-b border-border px-2 py-2.5 text-center">
              <Eyebrow as="span">{t("staffing.header.total")}</Eyebrow>
            </div>

            {/* Staff rows */}
            {allMembers.map((member) => {
              const memberWeekShifts = weekShifts.filter((s) => s.memberId === member.id);
              const totalHrs = memberWeekShifts.reduce((acc, s) => acc + shiftHours(s), 0);
              return (
                <React.Fragment key={member.id}>
                  {/* Name cell */}
                  <div className="border-b border-r border-border px-3 py-2.5 flex items-center gap-2.5 bg-background">
                    <StaffAvatar name={member.displayName} avatarUrl={member.avatarUrl} size={28} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground truncate leading-tight">{member.displayName}</div>
                      <div className="text-[11px] text-muted-foreground truncate leading-tight">{member.role ?? t("staffing.staff").toLowerCase()}</div>
                    </div>
                  </div>

                  {/* Day cells */}
                  {weekDates.map((d) => {
                    const ds = isoDate(d);
                    const dayShifts = memberWeekShifts.filter((s) => s.date === ds);
                    const today = isTodayD(d);
                    return (
                      <div
                        key={ds}
                        className={`border-b border-r border-border px-1.5 py-1.5 group/cell relative min-h-[60px] ${
                          today ? "bg-muted/50" : "bg-background"
                        }`}
                      >
                        {dayShifts.length > 0 ? (
                          <div className="space-y-1">
                            {dayShifts.map((shift) => {
                              const matchedRoles = (shift.staffRoles ?? [])
                                .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                                .filter(Boolean) as StaffRole[];
                              return (
                                <div
                                  key={shift.id}
                                  className="flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-muted cursor-pointer transition-colors group/chip"
                                  onClick={() => {
                                    if (canEdit) {
                                      setEditingShift(shift);
                                      setShiftForm({
                                        memberId: shift.memberId ?? member.id,
                                        date: shift.date,
                                        shiftType: shift.shiftType,
                                        startTime: shift.startTime,
                                        endTime: shift.endTime,
                                        roleNames: shift.staffRoles ?? [],
                                      });
                                      setAddDialog(true);
                                    }
                                  }}
                                >
                                  <div
                                    className="w-[3px] rounded-full shrink-0 self-stretch mt-0.5 mb-0.5"
                                    style={{ backgroundColor: SHIFT_COLORS[shift.shiftType] }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-medium text-foreground font-mono tabular-nums leading-tight">
                                      {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                                    </div>
                                    {matchedRoles.length > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        {matchedRoles.map((r) => (
                                          <span
                                            key={r.id}
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: r.color }}
                                            title={r.name}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {canEdit && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteShift(shift.id); }}
                                      className="p-0.5 rounded opacity-0 group-hover/chip:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : canEdit ? (
                          <button
                            onClick={() => {
                              setEditingShift(null);
                              setShiftForm({
                                memberId: member.id,
                                date: ds,
                                shiftType: "morning",
                                startTime: "07:00",
                                endTime: "14:00",
                                roleNames: [],
                              });
                              setAddDialog(true);
                            }}
                            className="absolute inset-1 border border-dashed border-transparent group-hover/cell:border-border rounded-lg flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-all"
                          >
                            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}

                  {/* Total cell */}
                  <div className="border-b border-border px-2 py-2.5 text-center bg-background">
                    <span className="text-[13px] font-semibold text-foreground font-mono tabular-nums">
                      {totalHrs % 1 === 0 ? `${totalHrs}h` : `${totalHrs.toFixed(1)}h`}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}

            {/* Bottom total row */}
            <div className="bg-muted border-r border-border px-3 py-2 flex items-center">
              <Eyebrow as="span">{t("staffing.header.total")}</Eyebrow>
            </div>
            {weekDates.map((d) => {
              const ds = isoDate(d);
              const count = weekShifts.filter((s) => s.date === ds).length;
              const hrs = weekShifts.filter((s) => s.date === ds).reduce((a, s) => a + shiftHours(s), 0);
              return (
                <div key={ds} className="bg-muted border-r border-border px-2 py-2 text-center">
                  <div className="text-[13px] font-semibold text-foreground font-mono tabular-nums">{count}</div>
                  <div className="text-[10px] text-muted-foreground font-mono tabular-nums">{hrs % 1 === 0 ? `${hrs}h` : `${hrs.toFixed(1)}h`}</div>
                </div>
              );
            })}
            <div className="bg-muted px-2 py-2 text-center">
              <div className="text-[13px] font-semibold text-foreground font-mono tabular-nums">
                {weekShifts.reduce((a, s) => a + shiftHours(s), 0).toFixed(0)}h
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Roles Tab ────────────────────────────────────────────
  // ScheduleGrid / RolesTab are render helpers, NOT components: they are
  // declared inside StaffingDesktop, so using them as <JSX /> would hand React
  // a new component type on every parent render and remount the whole tab
  // (which killed the task-completion dialog the moment a table ticked).
  function RolesTab() {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* All-tasks completion overview, grouped by role */}
        <RoleTasksOverview
          orgId={organizationId ?? ""}
          roles={roles}
          className="shrink-0 max-h-[40%] overflow-y-auto border-b border-border"
        />
        <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Role list */}
        <div className="w-[280px] shrink-0 border-r border-border bg-background overflow-y-auto">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">{t("staffing.roles.title")}</span>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setEditingRole(null);
                  setRoleForm({ name: "", color: "#44403c", icon: "user", description: "", permissions: {} as StaffRolePermissions });
                  setRoleDialog(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>

          {roles.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Shield className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
              <p className="text-[13px] text-muted-foreground">{t("staffing.roles.noRolesYet")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {roles.map((r) => {
                const taskCount = roleTaskCounts[r.id] ?? 0;
                const isActive = selectedRole?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => { handleSelectRole(r); }}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      isActive ? "bg-muted" : "hover:bg-muted"
                    }`}
                  >
                    <div
                      className="h-8 w-8 shrink-0 flex items-center justify-center border rounded-lg"
                      style={{ borderColor: r.color, color: r.color }}
                    >
                      <RoleIconComp name={r.icon} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground truncate">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">{(taskCount === 1 ? t("staffing.roles.tasksCountSingular") : t("staffing.roles.tasksCountPlural")).replace("{count}", String(taskCount))}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected role detail */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-background">
          {!selectedRole ? (
            <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
              {t("staffing.schedule.selectRoleDetails")}
            </div>
          ) : (
            <div className="px-6 py-5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="h-10 w-10 shrink-0 flex items-center justify-center border rounded-lg"
                  style={{ borderColor: selectedRole.color, color: selectedRole.color }}
                >
                  <RoleIconComp name={selectedRole.icon} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-foreground">{selectedRole.name}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedRole.color }} />
                  </div>
                  {selectedRole.description && (
                    <p className="text-[13px] text-muted-foreground mt-0.5">{selectedRole.description}</p>
                  )}
                  {/* Members count */}
                  {(() => {
                    const memberCount = shifts.filter((s) =>
                      (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === selectedRole.name.toLowerCase())
                    ).map((s) => s.memberId).filter((v, i, a) => a.indexOf(v) === i).length;
                    return (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{(memberCount === 1 ? t("staffing.roles.membersAssignedSingular") : t("staffing.roles.membersAssignedPlural")).replace("{count}", String(memberCount))}</p>
                    );
                  })()}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        setEditingRole(selectedRole);
                        setRoleForm({
                          name: selectedRole.name,
                          color: selectedRole.color,
                          icon: selectedRole.icon,
                          description: selectedRole.description,
                          permissions: selectedRole.permissions,
                        });
                        loadRoleTasksFor(selectedRole.id);
                        setRoleDialog(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={async () => { await handleDeleteRole(selectedRole.id); setSelectedRole(null); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="flex items-center justify-between mb-3">
                <Eyebrow>{t("staffing.roles.taskTimeline")}</Eyebrow>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <div className="flex items-center gap-0.5 border border-border rounded-lg px-1 py-0.5">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => shiftStatusDate(-1)}
                        aria-label={t("staffing.roles.prevDay")}
                      >
                        <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <span className="text-[11px] font-medium tabular-nums min-w-[72px] text-center">
                        {statusDate === todayStr
                          ? t("staffing.roles.today")
                          : new Date(statusDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => shiftStatusDate(1)}
                        aria-label={t("staffing.roles.nextDay")}
                        disabled={statusDate >= todayStr}
                      >
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setTaskForm({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] });
                        setTaskDialog({ open: true, task: null });
                      }}
                    >
                      <Plus className="h-3 w-3" /> {t("staffing.roles.addTask")}
                    </Button>
                  )}
                </div>
              </div>

              {loadingTasks ? (
                <div className="flex justify-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </div>
              ) : (roleTasksCache[selectedRole.id] ?? []).length === 0 ? (
                <div className="text-center py-10">
                  <ClipboardList className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                  <p className="text-[13px] text-muted-foreground">{t("staffing.roles.noTasksYet")}</p>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  {(roleTasksCache[selectedRole.id] ?? []).map((task, i) => {
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
                        onComplete={statusDate === todayStr ? () => setCompleteTaskFor(task) : undefined}
                        onEdit={canEdit ? () => {
                          setTaskForm({
                            title: task.title,
                            description: task.description,
                            hasTime: !!(task.startTime && task.endTime),
                            startTime: task.startTime ?? "08:00",
                            endTime: task.endTime ?? "10:00",
                            requiresEvidence: task.requiresEvidence ?? false,
                            notifyChats: task.notifyChats ?? [],
                          });
                          setTaskDialog({ open: true, task });
                        } : undefined}
                        className={i > 0 ? "border-t border-border" : undefined}
                      />
                    );
                  })}
                </div>
              )}

              {/* Member chips */}
              {(() => {
                const assignedMemberIds = [...new Set(
                  shifts
                    .filter((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === selectedRole.name.toLowerCase()))
                    .map((s) => s.memberId)
                )];
                const assignedMembers = assignedMemberIds
                  .map((id) => team.find((m) => m.id === id))
                  .filter(Boolean) as OrgMember[];
                if (assignedMembers.length === 0) return null;
                return (
                  <div className="mt-6">
                    <Eyebrow className="mb-2">{t("staffing.roles.assignedMembers")}</Eyebrow>
                    <div className="flex flex-wrap gap-2">
                      {assignedMembers.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 border border-border rounded-lg">
                          <StaffAvatar name={m.displayName} avatarUrl={m.avatarUrl} size={20} />
                          <span className="text-[12px] font-medium text-foreground">{m.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        </div>
        {completeTaskFor && (
          <TaskCompleteDialog
            task={completeTaskFor}
            organizationId={organizationId ?? ""}
            onClose={() => setCompleteTaskFor(null)}
          />
        )}
      </div>
    );
  }

  // ─── Desktop Return ───────────────────────────────────────
  const tabLabels: Record<DesktopTab, string> = {
    schedule: t("staffing.tabs.schedule"),
    attendance: t("staffing.tabs.attendance"),
    roles: t("staffing.tabs.roles"),
  };
  const defaultDesktopTabs: DesktopTab[] = isStaff
    ? ["schedule", "roles"]
    : ["schedule", ...(canManageAttendance ? ["attendance" as const] : []), "roles"];
  const desktopTabs: DesktopTab[] = subtabsFilter
    ? defaultDesktopTabs.filter((t) => subtabsFilter.includes(t))
    : defaultDesktopTabs;
  // If the filter narrowed us down to a single tab, hide the tab bar entirely —
  // the parent (Personnel hub) is already showing a top-level tab for this view.
  const showTabBar = desktopTabs.length > 1;
  // Keep `dTab` valid if the filter changes (or on first render under a filter).
  if (!desktopTabs.includes(dTab) && desktopTabs.length > 0) {
    // safe — render-time guard; React will rerun the next effect cycle.
    queueMicrotask(() => setDTab(desktopTabs[0]));
  }

  return (
    <div className="flex flex-col bg-muted/30 min-h-0 flex-1">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Tab bar */}
          {showTabBar && (
            <div className="flex items-center gap-3 px-6 border-b border-border bg-background shrink-0">
              <div className="flex items-center gap-0">
                {desktopTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDTab(tab)}
                    className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${
                      dTab === tab
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tabLabels[tab]}
                    {dTab === tab && (
                      <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-foreground rounded-full" />
                    )}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
            </div>
          )}

          {/* Tab content */}
          {dTab === "schedule" && ScheduleGrid()}
          {dTab === "attendance" && canManageAttendance && organizationId && (
            <AttendanceWeek orgId={organizationId} />
          )}
          {dTab === "roles" && RolesTab()}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Needs React import for Fragment usage in desktop grid
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Spinner } from "@/components/ui/loaders/geometric";
import { dateKey } from "@/lib/date-key";

export function StaffingFull({ subtabs }: { subtabs?: DesktopTab[] } = {}) {
  const { organizationId, isOwner, can, currentOrg, role } = usePermissions();
  const t = useT();
  const formatDate = useDateFormat();
  // "On now" has to keep up on a tablet left open all day.
  const nowClock = useNow(60_000);

  const [presetDialog, setPresetDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ShiftPreset | null>(null);
  const [presetForm, setPresetForm] = useState({ name: "", startTime: "07:00", endTime: "14:00", color: "#44403c" });
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<string | null>(null);
  const stdb = useSpacetimeDB();
  const userId = stdb?.identity?.toHexString() ?? null;
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  const [mobileSection, setMobileSection] = useState<"overview" | "schedule" | "attendance">("overview");
  const [scheduleView, setScheduleView] = useState<"day" | "people">("day");

  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    return mon;
  });

  const [selectedDay, setSelectedDay] = useState(() => isoDate(new Date()));

  // ─── Add / Edit Shift ───
  const [addDialog,     setAddDialog]     = useState(false);
  const [editingShift,  setEditingShift]  = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState({
    memberId:  "",
    date:      isoDate(new Date()),
    shiftType: "morning" as ShiftType,
    startTime: "07:00",
    endTime:   "14:00",
    roleNames: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // ─── Role DynamicUIElement ───
  const [roleDialog,   setRoleDialog]   = useState(false);
  const [editingRole,  setEditingRole]  = useState<StaffRole | null>(null);
  const [roleForm,     setRoleForm]     = useState({
    name:        "",
    color:       "#44403c",
    icon:        "user",
    description: "",
    permissions: {} as StaffRolePermissions,
  });

  // ─── Role Detail / Tasks ───
  const [selectedRole,    setSelectedRole]    = useState<StaffRole | null>(null);
  const [roleTasksCache,  setRoleTasksCache]  = useState<Record<string, RoleTask[]>>({});
  const [loadingTasks,    setLoadingTasks]    = useState(false);
  const [taskDialog,      setTaskDialog]      = useState<{ open: boolean; task: RoleTask | null }>({ open: false, task: null });
  const [taskForm,        setTaskForm]        = useState({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] as string[] });
  // chatOptions managed by useStaffing hook below
  const [savingTask,      setSavingTask]      = useState(false);
  const [viewTasksDialog, setViewTasksDialog] = useState<{ open: boolean; role: StaffRole | null }>({ open: false, role: null });

  // ─── Today's Tasks ───
  const [todayTasks,       setTodayTasks]       = useState<RoleTask[]>([]);
  const [taskCompletions,  setTaskCompletions]  = useState<Record<string, boolean>>({});
  const [loadingTodayTasks, setLoadingTodayTasks] = useState(false);

  // ─── Shift card menu ───
  const [shiftMenuOpen, setShiftMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);


  // ─── Trade DynamicUIElement ───
  const [tradeDialog, setTradeDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [tradeMode, setTradeMode] = useState<"broadcast" | "specific">("broadcast");
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeDate,   setTradeDate]   = useState("");
  const [selectedTradeTarget, setSelectedTradeTarget] = useState<{ memberId: string; shiftId: string } | null>(null);
  const [selectedTradeTargets, setSelectedTradeTargets] = useState<Set<string>>(new Set());
  const [savingTrade, setSavingTrade] = useState(false);
  const [coworkersCache, setCoworkersCache] = useState<{
    memberId: string; name: string;
    shifts: { id: string; date: string; startTime: string; endTime: string }[];
  }[]>([]);

  // ─── Cover DynamicUIElement ───
  const [coverDialog, setCoverDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [selectedCover, setSelectedCover] = useState<string | null>(null);
  const [savingCover, setSavingCover] = useState(false);

  // ─── Availability DynamicUIElement ───
  const [availDialog, setAvailDialog] = useState(false);
  // myAvailability managed by useStaffing hook below
  const [availForm, setAvailForm] = useState({ ...DEFAULT_AVAIL_FORM });
  const [savingAvail, setSavingAvail] = useState(false);

  // ─── Time Off DynamicUIElement ───
  const [timeOffDialog, setTimeOffDialog] = useState(false);
  // myTimeOffRequests managed by useStaffing hook below
  const [timeOffForm, setTimeOffForm] = useState({
    fullDays:  true,
    startDate: isoDate(new Date()),
    endDate:   isoDate(new Date()),
    startTime: "09:00",
    endTime:   "17:00",
    comments:  "",
  });
  const [savingTimeOff, setSavingTimeOff] = useState(false);

  // ─── Manager Requests ───
  const [showRequests, setShowRequests] = useState(false);
  const mobileRequestsRef = useRef<HTMLDivElement>(null);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  // orgTimeOffRequests, orgShiftTrades managed by useStaffing hook below

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const isStaff   = role === "staff";
  const canEdit   = isOwner || can("staffing", "edit");
  const canManageAttendance = isOwner || role === "manager";

  // ─── Desktop detection ────────────────────────────────────────────────────
  // Must agree with the `md:` (768px) CSS fork in app/manager/personnel/* pages:
  // those pages only show StaffingFull at ≥768px, so anything else here would
  // surface a third, unmaintained layout in the 768–1023px range.
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // ─── Data via SpacetimeDB migration hook ──────────────────────────────────
  const {
    team, setTeam,
    shifts, setShifts,
    roles, setRoles,
    presets, setPresets,
    chatOptions, setChatOptions,
    myAvailability, setMyAvailability,
    myTimeOffRequests, setMyTimeOffRequests,
    orgTimeOffRequests, setOrgTimeOffRequests,
    orgShiftTrades, setOrgShiftTrades,
    loading, refreshing,
  } = useStaffing(organizationId, userId, isStaff);
  const [punchEvents] = useTable(tables.punchEvent);
  // Live per-role task counts for the roles list. The lazily filled
  // roleTasksCache only knows about roles the user has opened, so it can't
  // drive the count (every unopened role would show 0).
  const [roleTaskRows] = useTable(tables.roleTask);
  const roleTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of roleTaskRows) counts[row.roleId] = (counts[row.roleId] ?? 0) + 1;
    return counts;
  }, [roleTaskRows]);
  const [managerPunchingId, setManagerPunchingId] = useState<string | null>(null);
  const [managerSavingAttendanceId, setManagerSavingAttendanceId] = useState<string | null>(null);

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || team.length === 0) return;
    setMyMemberId(team.find((m) => m.userId === userId)?.id ?? null);
  }, [team, userId]);

  // Auto-fix shifts with a missing memberId by matching staffName to the team.
  //
  // This used to send `updateShift(s.id, { memberId })`, and updateShift
  // replaces the whole row — so the "repair" blanked date, shiftType,
  // startTime, endTime and staffRoles on every legacy shift, unprompted, as
  // soon as a manager opened the page, with `.catch(() => {})` hiding it.
  useEffect(() => {
    if (!canEdit) return;                       // staff devices must not issue org-wide writes
    if (team.length === 0 || shifts.length === 0) return;
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const orphaned = shifts.filter((s) => !s.memberId || !validUuid.test(s.memberId));
    for (const s of orphaned) {
      const matches = team.filter((m) => m.displayName === s.staffName);
      // Two people can share a display name; guessing would assign the shift
      // to whichever one came first.
      if (matches.length !== 1) continue;
      updateShift(s.id, { ...s, memberId: matches[0].id }).catch((err: unknown) =>
        console.error("[staffing] could not link shift", s.id, "to a member:", err),
      );
    }
  }, [team, shifts, canEdit]);

  // Handle table drag-select via non-passive touchmove
  useEffect(() => {
    const el = document.getElementById("table-grid-container");
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (!selectModeRef.current || !dragStartRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;

      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const td = target?.closest("td[data-cellkey]") as HTMLElement | null;
      if (!td?.dataset.cellkey) return;
      const targetKey = td.dataset.cellkey;
      const [startMember, startDate] = dragStartRef.current.split("|");
      const [curMember, curDate] = targetKey.split("|");

      // Get current member/date lists from data attributes on the table
      const allTds = el.querySelectorAll("td[data-cellkey]");
      const mIds: string[] = [], dIds: string[] = [];
      allTds.forEach((t) => {
        const [m, d] = (t as HTMLElement).dataset.cellkey!.split("|");
        if (!mIds.includes(m)) mIds.push(m);
        if (!dIds.includes(d)) dIds.push(d);
      });

      const r1 = mIds.indexOf(startMember), r2 = mIds.indexOf(curMember);
      const c1 = dIds.indexOf(startDate), c2 = dIds.indexOf(curDate);
      if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return;

      // Start from pre-drag snapshot + current rectangle
      const next = new Set(preDragSelectionRef.current);
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          next.add(`${mIds[r]}|${dIds[c]}` as CellKey);
        }
      }
      setSelectedCells(next);
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  });

  // ─── Shift Details DynamicUIElement ──────────────────────────────────────────────────
  const [shiftDetailShift, setShiftDetailShift] = useState<Shift | null>(null);

  // ─── Computed ──────────────────────────────────────────────────────────────

  const weekShifts = shifts.filter(
    (s) => s.date >= isoDate(weekDates[0]) && s.date <= isoDate(weekDates[6])
  );
  const activeMembers = useMemo(() => team.filter((m) => m.status === "active"), [team]);
  const orgPunchEvents = useMemo(() => {
    if (!organizationId) return [];
    return (punchEvents as unknown as PunchEventRow[]).filter((event) => event.organizationId === organizationId);
  }, [punchEvents, organizationId]);
  const attendanceRows = useMemo<AttendanceRow[]>(() => {
    return activeMembers.map((member) => {
      const memberEvents = orgPunchEvents
        .filter((event) => event.memberId === member.id)
        .sort((a, b) => punchEventTime(a).getTime() - punchEventTime(b).getTime());
      const dayEvents = memberEvents.filter((event) => dateKey(punchEventTime(event)) === selectedDay);
      const openIn = dayEvents.find((event) => event.action === "in" && !event.closed) ?? null;
      const openBreak = memberEvents.find((event) => event.action === "break-start" && !event.closed) ?? null;
      const inEvent = openIn ?? dayEvents.find((event) => event.action === "in") ?? null;
      const outEvent = inEvent
        ? memberEvents.find((event) => event.action === "out" && event.pairEventId === inEvent.id.toString()) ?? dayEvents.find((event) => event.action === "out") ?? null
        : null;
      return {
        member,
        inEvent,
        outEvent,
        openIn,
        openBreak,
        state: openIn ? (openBreak ? "break" : "on") : inEvent && outEvent ? "complete" : "off",
        startTime: inEvent ? formatClockDate(punchEventTime(inEvent)) : "",
        endTime: outEvent ? formatClockDate(punchEventTime(outEvent)) : "",
      };
    });
  }, [activeMembers, orgPunchEvents, selectedDay]);

  const pendingCount = orgTimeOffRequests.filter((r) => r.status === "pending").length
    + orgShiftTrades.filter((t) => t.status === "pending" || (t.status === "accepted" && !t.managerApproved)).length;


  const filteredCoworkers = useMemo(() => {
    return coworkersCache.filter((c) => {
      const matchesSearch = !tradeSearch || c.name.toLowerCase().includes(tradeSearch.toLowerCase());
      const matchesDate   = !tradeDate  || c.shifts.some((s) => s.date === tradeDate);
      return matchesSearch && matchesDate;
    });
  }, [coworkersCache, tradeSearch, tradeDate]);

  // ─── Helper ────────────────────────────────────────────────────────────────

  const getMemberName = useCallback(
    (memberId: string) => team.find((m) => m.id === memberId)?.displayName ?? t("staffing.unknown"),
    [team, t]
  );
  const handleManagerPunch = useCallback(async (memberId: string, action: "in" | "out") => {
    setManagerPunchingId(memberId);
    try {
      await managerRecordPunch(memberId, action);
      hapticSuccess();
      toast.success(action === "in" ? t("staffing.attendance.clockedIn") : t("staffing.attendance.clockedOut"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("punchIn.toastFailed"));
    } finally {
      setManagerPunchingId(null);
    }
  }, [t]);

  const handleManagerSetPunchWindow = useCallback(async (memberId: string, startTime: string, endTime: string) => {
    if (!startTime) {
      toast.error(t("staffing.attendance.startRequired"));
      return;
    }

    const startAt = dateTimeFromInput(selectedDay, startTime);
    const endAt = endTime ? dateTimeFromInput(selectedDay, endTime) : null;
    if (endAt && endAt <= startAt) {
      toast.error(t("staffing.attendance.invalidWindow"));
      return;
    }

    setManagerSavingAttendanceId(memberId);
    try {
      await managerSetPunchWindow(
        memberId,
        dayStartFromInput(selectedDay),
        nextDayStartFromInput(selectedDay),
        startAt,
        endAt,
      );
      hapticSuccess();
      toast.success(t("staffing.attendance.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("punchIn.toastFailed"));
    } finally {
      setManagerSavingAttendanceId(null);
    }
  }, [selectedDay, t]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const prevWeek = useCallback(() => { hapticLight(); setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }, []);
  const nextWeek = useCallback(() => { hapticLight(); setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }, []);

  // Touch-swipe week carousel
  const weekStripRef = useRef<HTMLDivElement>(null);
  const weekSwipeStartX = useRef(0);
  const weekSwipeLastX = useRef(0);
  const weekSwipeStartTime = useRef(0);
  const weekSwipeDragging = useRef(false);
  const weekSwipeAxis = useRef<boolean | null>(null);
  const weekSwipeStartY = useRef(0);
  const [weekSwipeOffset, setWeekSwipeOffset] = useState(0);
  const [weekSwiping, setWeekSwiping] = useState(false);
  const prevWeekCb = useRef(prevWeek);
  const nextWeekCb = useRef(nextWeek);
  prevWeekCb.current = prevWeek;
  nextWeekCb.current = nextWeek;

  useEffect(() => {
    const el = weekStripRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      weekSwipeStartX.current = t.clientX;
      weekSwipeStartY.current = t.clientY;
      weekSwipeLastX.current = t.clientX;
      weekSwipeStartTime.current = Date.now();
      weekSwipeDragging.current = false;
      weekSwipeAxis.current = null;
    }

    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      const dx = t.clientX - weekSwipeStartX.current;
      const dy = t.clientY - weekSwipeStartY.current;

      if (weekSwipeAxis.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        weekSwipeAxis.current = Math.abs(dx) > Math.abs(dy);
      }
      if (weekSwipeAxis.current === false) return;

      e.preventDefault();
      weekSwipeLastX.current = t.clientX;
      weekSwipeDragging.current = true;
      setWeekSwiping(true);
      setWeekSwipeOffset(dx);
    }

    function onTouchEnd() {
      if (!weekSwipeDragging.current) {
        weekSwipeAxis.current = null;
        return;
      }

      const dx = weekSwipeLastX.current - weekSwipeStartX.current;
      const dt = Math.max(1, Date.now() - weekSwipeStartTime.current);
      const velocity = dx / dt;
      const threshold = (el?.clientWidth ?? 300) * 0.25;

      if (dx < -threshold || velocity < -0.3) {
        nextWeekCb.current();
      } else if (dx > threshold || velocity > 0.3) {
        prevWeekCb.current();
      }

      setWeekSwiping(false);
      setWeekSwipeOffset(0);
      weekSwipeDragging.current = false;
      weekSwipeAxis.current = null;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Touch-swipe day timeline (slide between days)
  const dayContentRef = useRef<HTMLDivElement>(null);
  const daySwipeStartX = useRef(0);
  const daySwipeStartY = useRef(0);
  const daySwipeLastX = useRef(0);
  const daySwipeStartTime = useRef(0);
  const daySwipeDragging = useRef(false);
  const daySwipeAxis = useRef<boolean | null>(null);
  const [daySwipeOffset, setDaySwipeOffset] = useState(0);
  const [daySwiping, setDaySwiping] = useState(false);
  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;

  const goToDay = useCallback((offset: number) => {
    const d = new Date(selectedDayRef.current + "T00:00:00");
    d.setDate(d.getDate() + offset);
    const newDay = isoDate(d);
    setSelectedDay(newDay);
    // If new day is outside current week, also shift the week
    const wd = weekDates.map(w => isoDate(w));
    if (!wd.includes(newDay)) {
      setWeekStart(prev => {
        const n = new Date(prev);
        n.setDate(n.getDate() + (offset > 0 ? 7 : -7));
        return n;
      });
    }
  }, [weekDates, setSelectedDay, setWeekStart]);

  const goToDayRef = useRef(goToDay);
  goToDayRef.current = goToDay;

  useEffect(() => {
    const el = dayContentRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      daySwipeStartX.current = t.clientX;
      daySwipeStartY.current = t.clientY;
      daySwipeLastX.current = t.clientX;
      daySwipeStartTime.current = Date.now();
      daySwipeDragging.current = false;
      daySwipeAxis.current = null;
    }

    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      const dx = t.clientX - daySwipeStartX.current;
      const dy = t.clientY - daySwipeStartY.current;

      if (daySwipeAxis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        daySwipeAxis.current = Math.abs(dx) > Math.abs(dy);
      }
      if (daySwipeAxis.current === false) return;

      e.preventDefault();
      daySwipeLastX.current = t.clientX;
      daySwipeDragging.current = true;
      setDaySwiping(true);
      setDaySwipeOffset(dx);
    }

    function onTouchEnd() {
      if (!daySwipeDragging.current) {
        daySwipeAxis.current = null;
        return;
      }

      const dx = daySwipeLastX.current - daySwipeStartX.current;
      const velocity = dx / Math.max(1, Date.now() - daySwipeStartTime.current);
      const threshold = (el?.clientWidth ?? 300) * 0.2;

      if (dx < -threshold || velocity < -0.3) {
        goToDayRef.current(1);
      } else if (dx > threshold || velocity > 0.3) {
        goToDayRef.current(-1);
      }

      setDaySwiping(false);
      setDaySwipeOffset(0);
      daySwipeDragging.current = false;
      daySwipeAxis.current = null;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Merge default shift types with custom presets
  const allPresets = presets.map((p) => ({ name: p.name, startTime: p.startTime, endTime: p.endTime, color: p.color, id: p.id }));

  const applyShiftType = (type: ShiftType) => {
    const map: Record<ShiftType, { start: string; end: string }> = {
      morning:   { start: "07:00", end: "14:00" },
      afternoon: { start: "13:00", end: "20:00" },
      evening:   { start: "14:00", end: "21:00" },
      closing:   { start: "18:00", end: "22:00" },
    };
    setShiftForm((f) => ({ ...f, shiftType: type, startTime: map[type].start, endTime: map[type].end }));
  };

  const handleSavePreset = async () => {
    if (!organizationId || !presetForm.name) return;
    try {
      if (editingPreset) {
        await updateShiftPreset(editingPreset.id, presetForm);
        setPresets((prev) => prev.map((p) => p.id === editingPreset.id ? { ...p, ...presetForm } : p));
      } else {
        const presetId = uuid();
        await addShiftPreset(organizationId, presetForm);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPresets((prev) => [...prev, { id: presetId, organizationId, ...presetForm } as any]);
      }
      setPresetDialog(false);
      setEditingPreset(null);
    } catch (err) {
      console.error("Save preset failed:", err);
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deleteShiftPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Delete preset failed:", err);
    }
  };

  const handleAddShift = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      if (editingShift) {
        const member = team.find((m) => m.id === shiftForm.memberId);
        const updated = {
          ...editingShift,
          memberId:   shiftForm.memberId,
          staffName:  member?.displayName ?? editingShift.staffName,
          staffRoles: shiftForm.roleNames,
          date:       shiftForm.date,
          shiftType:  shiftForm.shiftType,
          startTime:  shiftForm.startTime,
          endTime:    shiftForm.endTime,
        };
        await updateShift(editingShift.id, updated);
        setShifts((prev) => prev.map((s) => s.id === editingShift.id ? updated : s));
      } else {
        const member = team.find((m) => m.id === shiftForm.memberId);
        if (!member) return;
        const shiftId = uuid();
        await addShift({
          memberId:        member.id,
          staffName:       member.displayName,
          staffRole:       shiftForm.roleNames[0] || null,
          staffRoles:      shiftForm.roleNames,
          date:            shiftForm.date,
          shiftType:       shiftForm.shiftType,
          startTime:       shiftForm.startTime,
          endTime:         shiftForm.endTime,
          predictedDemand: "medium",
        }, userId, organizationId ?? undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setShifts((prev) => [...prev, { id: shiftId, memberId: member.id, staffName: member.displayName, staffRoles: shiftForm.roleNames, date: shiftForm.date, shiftType: shiftForm.shiftType, startTime: shiftForm.startTime, endTime: shiftForm.endTime } as any]);
      }
      hapticSuccess();
      toast.success(editingShift ? t("staffing.toasts.shiftUpdated") : t("staffing.toasts.shiftAdded"));
      setAddDialog(false);
      setEditingShift(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedSaveShift"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (id: string) => {
    hapticWarning();
    try {
      await deleteShift(id);
      setShifts((prev) => prev.filter((s) => s.id !== id));
      toast.success(t("staffing.toasts.shiftDeleted"));
    } catch (err) {
      console.error(err);
      toast.error(t("staffing.toasts.failedDeleteShift"));
    }
  };

  const handleSaveRole = async () => {
    if (!roleForm.name || !userId) return;
    setSaving(true);
    try {
      if (editingRole) {
        await updateStaffRole(editingRole.id, roleForm);
        const updated = { ...editingRole, ...roleForm };
        setRoles((prev) => prev.map((r) => r.id === editingRole.id ? updated : r));
        if (selectedRole?.id === editingRole.id) setSelectedRole(updated);
      } else {
        const roleId = uuid();
        await addStaffRole(roleForm, userId, organizationId ?? undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRoles((prev) => [...prev, { id: roleId, ...roleForm } as any]);
      }
      hapticSuccess();
      toast.success(editingRole ? t("staffing.toasts.roleUpdated") : t("staffing.toasts.roleAdded"));
      setRoleDialog(false);
      setEditingRole(null);
      setRoleForm({ name: "", color: "#44403c", icon: "user", description: "", permissions: {} });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedSaveRole"));
    } finally {
      setSaving(false);
    }
  };

  const loadRoleTasksFor = async (roleId: string) => {
    if (roleTasksCache[roleId]) return;
    setLoadingTasks(true);
    try {
      const tasks = await getRoleTasks(roleId);
      setRoleTasksCache((prev) => ({ ...prev, [roleId]: tasks }));
      setCache(`role_tasks_${roleId}`, tasks);
    } catch (err) {
      console.error("Failed to load role tasks:", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const [roleDetailOpen, setRoleDetailOpen] = useState(false);
  // Mobile: nested task-detail panel opened on top of the role panel.
  const [taskDetail, setTaskDetail] = useState<RoleTask | null>(null);
  const handleSelectRole = (r: StaffRole) => {
    setSelectedRole(r);
    setRoleDetailOpen(true);
    loadRoleTasksFor(r.id);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title || !selectedRole) return;
    setSavingTask(true);
    try {
      const existing = roleTasksCache[selectedRole.id] ?? [];
      if (taskDialog.task) {
        const st = taskForm.hasTime ? taskForm.startTime : null;
        const et = taskForm.hasTime ? taskForm.endTime : null;
        await updateRoleTask(taskDialog.task.id, {
          title: taskForm.title,
          description: taskForm.description,
          startTime: st,
          endTime: et,
          requiresEvidence: taskForm.requiresEvidence,
          notifyChats: taskForm.notifyChats,
        });
        setRoleTasksCache((prev) => ({
          ...prev,
          [selectedRole.id]: existing.map((t) =>
            t.id === taskDialog.task!.id
              ? { ...t, title: taskForm.title, description: taskForm.description, startTime: st, endTime: et, requiresEvidence: taskForm.requiresEvidence, notifyChats: taskForm.notifyChats }
              : t
          ).sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")),
        }));
      } else {
        await addRoleTask({
          roleId: selectedRole.id,
          organizationId: organizationId ?? null,
          title: taskForm.title,
          description: taskForm.description,
          startTime: taskForm.hasTime ? taskForm.startTime : null,
          endTime: taskForm.hasTime ? taskForm.endTime : null,
          sortOrder: existing.length,
          requiresEvidence: taskForm.requiresEvidence,
          notifyChats: taskForm.notifyChats,
        });
        // The module assigns the id, so re-read the role's tasks rather than
        // caching a client-made id: editing or deleting it would fail with
        // "Role task not found". The reducer promise resolves after the
        // client cache has the new row.
        const fresh = await getRoleTasks(selectedRole.id);
        setCache(`role_tasks_${selectedRole.id}`, fresh);
        setRoleTasksCache((prev) => ({
          ...prev,
          [selectedRole.id]: fresh.sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")),
        }));
      }
      setTaskDialog({ open: false, task: null });
      setTaskForm({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedSaveTask"));
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedRole) return;
    await deleteRoleTask(taskId);
    setRoleTasksCache((prev) => ({
      ...prev,
      [selectedRole.id]: (prev[selectedRole.id] ?? []).filter((t) => t.id !== taskId),
    }));
  };

  const handleDeleteRole = async (id: string) => {
    hapticWarning();
    try {
      await deleteStaffRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("staffing.toasts.roleDeleted"));
    } catch (err) {
      console.error(err);
      toast.error(t("staffing.toasts.failedDeleteRole"));
    }
  };

  const openTradeDialog = async (shift: Shift) => {
    setTradeDialog({ open: true, shift });
    setTradeSearch("");
    setTradeDate("");
    setSelectedTradeTarget(null);
    if (organizationId && myMemberId) {
      const data = await getCoworkersWithShifts(organizationId, myMemberId);
      setCoworkersCache(data);
    }
  };

  const openCoverDialog = (shift: Shift) => {
    setCoverDialog({ open: true, shift });
    setSelectedCover(null);
  };

  const handleTradeRequest = async () => {
    if (!tradeDialog.shift || !myMemberId || !organizationId) return;
    if (tradeMode === "specific" && !selectedTradeTarget) return;
    setSavingTrade(true);
    try {
      await createShiftTrade({
        organizationId,
        shiftId:       tradeDialog.shift.id,
        requesterId:   myMemberId,
        broadcastToAll: tradeMode === "broadcast",
        targetId:      tradeMode === "specific" ? selectedTradeTarget?.memberId ?? "" : "",
        targetShiftId: tradeMode === "specific" ? selectedTradeTarget?.shiftId ?? null : null,
        type:          "trade",
        comments:      "",
      });
      hapticSuccess();
      toast.success(t("staffing.toasts.tradeSent"));
      setTradeDialog({ open: false, shift: null });
      setTradeMode("broadcast");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedTrade"));
    } finally {
      setSavingTrade(false);
    }
  };

  const handleCoverRequest = async () => {
    if (!coverDialog.shift || !myMemberId || !organizationId) return;
    const isBroadcast = !selectedCover;
    setSavingCover(true);
    try {
      await createShiftTrade({
        organizationId,
        shiftId:       coverDialog.shift.id,
        requesterId:   myMemberId,
        broadcastToAll: isBroadcast,
        targetId:      selectedCover || "",
        targetShiftId: null,
        type:          "cover",
        comments:      "",
      });
      hapticSuccess();
      toast.success(t("staffing.toasts.coverSent"));
      setCoverDialog({ open: false, shift: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedCover"));
    } finally {
      setSavingCover(false);
    }
  };

  const openAvailDialog = () => {
    if (myAvailability) {
      setAvailForm({
        type:      myAvailability.type,
        startDate: myAvailability.startDate ?? "",
        endDate:   myAvailability.endDate ?? "",
        dayTimes:  normalizeDayTimes(myAvailability.dayTimes),
        status:    myAvailability.status,
        comments:  myAvailability.comments,
      });
    } else {
      setAvailForm({ ...DEFAULT_AVAIL_FORM, dayTimes: normalizeDayTimes(undefined) });
    }
    setAvailDialog(true);
  };

  const handleSaveAvailability = async () => {
    if (!userId || !organizationId) return;
    setSavingAvail(true);
    try {
      const days = availForm.dayTimes.map((dt) => dt.enabled);
      const allFullDay = availForm.dayTimes.every((dt) => dt.fullDay || !dt.enabled);
      const savedId = myAvailability?.id ?? uuid();
      await upsertAvailability({
        id:             myAvailability?.id,
        userId,
        organizationId,
        type:           availForm.type,
        startDate:      availForm.type === "temporary" ? availForm.startDate || null : null,
        endDate:        availForm.type === "temporary" ? availForm.endDate || null : null,
        days,
        dayTimes:       availForm.dayTimes,
        status:         availForm.status,
        fullDay:        allFullDay,
        startTime:      null,
        endTime:        null,
        comments:       availForm.comments,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const optimisticAvail: any = { id: savedId, userId, organizationId, type: availForm.type, days, dayTimes: availForm.dayTimes, status: availForm.status, fullDay: allFullDay, comments: availForm.comments };
      setMyAvailability((prev: StaffAvailability[]) => {
        const idx = prev.findIndex((a) => a.id === savedId);
        return idx >= 0 ? prev.map((a) => a.id === savedId ? optimisticAvail : a) : [...prev, optimisticAvail];
      });
      setAvailDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedAvailability"));
    } finally {
      setSavingAvail(false);
    }
  };

  const handleTimeOffRequest = async () => {
    if (!userId || !organizationId) return;
    setSavingTimeOff(true);
    try {
      const reqId = uuid();
      await createTimeOffRequest({
        userId,
        organizationId,
        startDate: timeOffForm.startDate,
        endDate:   timeOffForm.endDate,
        fullDays:  timeOffForm.fullDays,
        startTime: timeOffForm.fullDays ? null : timeOffForm.startTime,
        endTime:   timeOffForm.fullDays ? null : timeOffForm.endTime,
        comments:  timeOffForm.comments,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyTimeOffRequests((prev) => [{ id: reqId, userId, organizationId, ...timeOffForm, status: "pending", createdAt: new Date().toISOString() } as any, ...prev]);
      setTimeOffDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedTimeOff"));
    } finally {
      setSavingTimeOff(false);
    }
  };

  const handleTimeOffStatusUpdate = async (id: string, status: "approved" | "denied") => {
    if (!userId) return;
    await updateTimeOffStatus(id, status, userId);
    setOrgTimeOffRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const handleTradeStatusUpdate = async (id: string, status: "accepted" | "denied") => {
    try {
      await updateTradeStatus(id, status, userId ?? undefined);
      hapticSuccess();
      if (status === "accepted") {
        toast.success(t("staffing.toasts.tradeAcceptedPending"));
        setOrgShiftTrades((prev) => prev.map((t) => t.id === id ? { ...t, status: "accepted" as const, acceptedById: myMemberId, targetId: myMemberId } : t));
      } else {
        toast.success(t("staffing.toasts.tradeDenied"));
        setOrgShiftTrades((prev) => prev.filter((t) => t.id !== id));
      }
    } catch {
      toast.error(t("staffing.toasts.failedUpdateTrade"));
    }
  };

  const handleStaffAcceptTrade = async (tradeId: string) => {
    if (!myMemberId) return;
    try {
      await updateTradeStatus(tradeId, "accepted");
      hapticSuccess();
      toast.success(t("staffing.toasts.tradeAcceptedPending"));
      setOrgShiftTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, status: "accepted" as const, acceptedById: myMemberId, targetId: myMemberId } : t));
    } catch { toast.error(t("staffing.toasts.failedAcceptTrade")); }
  };

  const handleManagerApproveTrade = async (tradeId: string, approved: boolean) => {
    if (!userId) return;
    try {
      await updateTradeStatus(tradeId, approved ? "accepted" : "denied");
      hapticSuccess();
      toast.success(approved ? "Trade approved" : "Trade denied");
      setOrgShiftTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, managerApproved: approved, managerId: userId, status: approved ? "accepted" as const : "denied" as const } : t));
    } catch { toast.error(t("staffing.toasts.failedUpdateTrade")); }
  };

  const todayStr = isoDate(new Date());
  const isToday  = (d: Date) => isoDate(d) === todayStr;
  const monthYear = formatDate(weekDates[0], { month: "long", year: "numeric" });

  // ─── Load today's role tasks (cache-first, then fresh) ────────────────────
  useEffect(() => {
    if (!myMemberId || shifts.length === 0) return;
    const todayShifts = shifts.filter((s) => s.memberId === myMemberId && s.date === todayStr);
    if (todayShifts.length === 0) { setTodayTasks([]); return; }

    const roleNames = [...new Set(todayShifts.flatMap((s) => s.staffRoles ?? []))];
    const roleIds = roleNames
      .map((name) => roles.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id)
      .filter(Boolean) as string[];

    if (roleIds.length === 0) { setTodayTasks([]); return; }

    // Show cached tasks immediately
    const cachedAll: RoleTask[] = [];
    for (const roleId of roleIds) {
      const cached = getCached<RoleTask[]>(`role_tasks_${roleId}`);
      if (cached) cachedAll.push(...cached);
    }
    cachedAll.sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
    setTodayTasks(cachedAll);

    // Load completions from localStorage
    const completions: Record<string, boolean> = {};
    for (const task of cachedAll) {
      completions[task.id] = getCached<boolean>(`task_done_${task.id}_${todayStr}`) ?? false;
    }
    setTaskCompletions(completions);

    // Fetch fresh in background
    setLoadingTodayTasks(true);
    Promise.all(
      roleIds.map((roleId) =>
        getRoleTasks(roleId).then((tasks) => {
          setCache(`role_tasks_${roleId}`, tasks);
          setRoleTasksCache((prev) => ({ ...prev, [roleId]: tasks }));
          return tasks;
        })
      )
    )
      .then((results) => {
        const fresh = results.flat().sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
        setTodayTasks(fresh);
        // Merge completions for any new tasks
        setTaskCompletions((prev) => {
          const next = { ...prev };
          for (const task of fresh) {
            if (!(task.id in next)) {
              next[task.id] = getCached<boolean>(`task_done_${task.id}_${todayStr}`) ?? false;
            }
          }
          return next;
        });
      })
      .catch((err) => console.error("Failed to load today tasks:", err))
      .finally(() => setLoadingTodayTasks(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, myMemberId, roles]);

  const toggleTaskDone = (taskId: string) => {
    hapticLight();
    setTaskCompletions((prev) => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      setCache(`task_done_${taskId}_${todayStr}`, next[taskId]);
      return next;
    });
  };

  const prevWeekDates = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7); return getWeekDates(d);
  }, [weekStart]);
  const nextWeekDates = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); return getWeekDates(d);
  }, [weekStart]);


  // Render a Lucide icon to PNG data URL by reading the existing DOM icon
  const renderIconToDataUrl = (iconName: string, color: string, size = 32): Promise<string> => {
    return new Promise((resolve) => {
      // Create a hidden container with the icon rendered via DOM
      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:-9999px;top:-9999px";
      document.body.appendChild(container);

      // Manually create SVG element from Lucide icon component
      // First render a temporary icon to get its SVG content
      const IconComp = ROLE_ICON_MAP[iconName] ?? User;
      const tempDiv = document.createElement("div");
      container.appendChild(tempDiv);

      // Use ReactDOM to render synchronously via flushSync
      import("react-dom/client").then(({ createRoot }) => {
        import("react-dom").then(({ flushSync }) => {
          import("react").then((React) => {
            const root = createRoot(tempDiv);
            flushSync(() => {
              root.render(React.createElement(IconComp, {
                width: size,
                height: size,
                stroke: color,
                strokeWidth: 2,
                fill: "none",
              }));
            });

            const svg = tempDiv.querySelector("svg");
            if (!svg) { root.unmount(); container.remove(); resolve(""); return; }

            // Clone and ensure attributes
            const clone = svg.cloneNode(true) as SVGElement;
            clone.setAttribute("width", String(size));
            clone.setAttribute("height", String(size));
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

            const svgStr = new XMLSerializer().serializeToString(clone);
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = size * 2;
              canvas.height = size * 2;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0, size * 2, size * 2);
              resolve(canvas.toDataURL("image/png"));
              root.unmount();
              container.remove();
            };
            img.onerror = () => { root.unmount(); container.remove(); resolve(""); };
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
          });
        });
      });
    });
  };

  // Get date array and filtered shifts for a date range
  const getExportData = (startStr: string, endStr: string) => {
    const start = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    const dates: Date[] = [];
    const d = new Date(start);
    while (d <= end) { dates.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const rangeShifts = shifts.filter((s) => s.date >= startStr && s.date <= endStr);
    // Split into weeks (max 7 days per chunk)
    const weeks: Date[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      weeks.push(dates.slice(i, i + 7));
    }
    return { dates, weeks, rangeShifts };
  };

  const handleDownloadPDF = async (startStr: string, endStr: string) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { weeks, rangeShifts } = getExportData(startStr, endStr);

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Pre-render all role icons
    const iconCache: Record<string, string> = {};
    const usedRoles = roles.filter((r) =>
      rangeShifts.some((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === r.name.toLowerCase()))
    );
    await Promise.all(usedRoles.map(async (r) => {
      iconCache[r.name.toLowerCase()] = await renderIconToDataUrl(r.icon, r.color, 16);
    }));

    type CellRole = { name: string; color: string; iconKey: string };

    for (let wi = 0; wi < weeks.length; wi++) {
      const weekDays = weeks[wi];
      if (wi > 0) doc.addPage();

      const wStart = formatDate(weekDays[0], { month: "short", day: "numeric" });
      const wEnd = formatDate(weekDays[weekDays.length - 1], { month: "short", day: "numeric", year: "numeric" });
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${currentOrg?.name ?? "Schedule"} — ${wStart} - ${wEnd}`, 20, 30);

      const dayHeaders = weekDays.map((d) =>
        `${formatDate(d, { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`
      );
      const weekShiftRange = rangeShifts.filter((s) => {
        const sd = isoDate(weekDays[0]), ed = isoDate(weekDays[weekDays.length - 1]);
        return s.date >= sd && s.date <= ed;
      });
      const staffNames = [...new Set(weekShiftRange.map((s) => s.staffName))].sort();
      const head = [["Name", ...dayHeaders]];
      const cellRoles: Record<string, CellRole[]> = {};

      const body = staffNames.map((name, rowIdx) => {
        const cells = weekDays.map((d, colIdx) => {
          const ds = isoDate(d);
          const dayShifts = weekShiftRange.filter((s) => s.date === ds && s.staffName === name);
          if (dayShifts.length === 0) return "";
          const shiftRoles: CellRole[] = [];
          const text = dayShifts.map((s) => {
            const time = `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`;
            (s.staffRoles ?? []).forEach((rn) => {
              const role = roles.find((ro) => ro.name.toLowerCase() === rn.toLowerCase());
              if (!shiftRoles.find((sr) => sr.name === rn)) {
                shiftRoles.push({ name: rn, color: role?.color ?? "#44403c", iconKey: rn.toLowerCase() });
              }
            });
            return time;
          }).join("\n");
          if (shiftRoles.length > 0) {
            cellRoles[`${rowIdx}-${colIdx + 1}`] = shiftRoles;
            return text + "\n ";
          }
          return text;
        });
        return [name, ...cells];
      });

      const totals = weekDays.map((d) => String(weekShiftRange.filter((s) => s.date === isoDate(d)).length));
      body.push(["Total", ...totals]);

      autoTable(doc, {
        startY: 45, head, body, theme: "grid",
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak", lineWidth: 0.5 },
        headStyles: { fillColor: [245, 245, 244], textColor: [41, 37, 36], fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } },
        bodyStyles: { valign: "top" },
        didParseCell: (data) => {
          if (data.row.index === body.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [245, 245, 244]; }
          if (data.section === "body" && data.column.index > 0 && data.row.index < body.length - 1 && data.cell.raw) {
            data.cell.styles.fillColor = [255, 247, 237];
          }
        },
        didDrawCell: (data) => {
          if (data.section !== "body" || data.column.index === 0) return;
          const key = `${data.row.index}-${data.column.index}`;
          const rls = cellRoles[key];
          if (!rls) return;
          const pad = data.cell.styles.cellPadding as number;
          const iconSize = 8;
          const iconsY = data.cell.y + data.cell.height - pad - iconSize;
          let iconX = data.cell.x + pad;
          for (const role of rls) {
            const imgData = iconCache[role.iconKey];
            if (imgData) { try { doc.addImage(imgData, "PNG", iconX, iconsY, iconSize, iconSize); } catch { /* skip */ } }
            iconX += iconSize + 3;
          }
        },
      });

      // Legend after each table
      if (usedRoles.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
        let legendY = finalY + 15;
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("Roles:", 20, legendY);
        doc.setFont("helvetica", "normal"); legendY += 14;
        let legendX = 20;
        for (const role of usedRoles) {
          const imgData = iconCache[role.name.toLowerCase()];
          if (imgData) { try { doc.addImage(imgData, "PNG", legendX, legendY - 9, 10, 10); } catch { /* skip */ } }
          legendX += 13; doc.setFontSize(8); doc.text(`= ${role.name}`, legendX, legendY);
          legendX += doc.getTextWidth(`= ${role.name}`) + 15;
          if (legendX > pageW - 60) { legendX = 20; legendY += 16; }
        }
      }
    }

    doc.save(`schedule-${startStr}.pdf`);
  };

  const handleDownloadCSV = (startStr: string, endStr: string) => {
    const { dates, rangeShifts } = getExportData(startStr, endStr);
    const dayHeaders = dates.map((d) =>
      `${formatDate(d, { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`
    );
    const staffNames = [...new Set(rangeShifts.map((s) => s.staffName))].sort();

    const rows = [["Name", ...dayHeaders]];
    for (const name of staffNames) {
      const cells = dates.map((d) => {
        const ds = isoDate(d);
        const dayShifts = rangeShifts.filter((s) => s.date === ds && s.staffName === name);
        if (dayShifts.length === 0) return "";
        return dayShifts.map((s) => {
          const time = `${formatTime(s.startTime)}-${formatTime(s.endTime)}`;
          const roleStr = (s.staffRoles ?? []).join(", ");
          return roleStr ? `${time} (${roleStr})` : time;
        }).join("; ");
      });
      rows.push([name, ...cells]);
    }
    const totals = dates.map((d) => String(rangeShifts.filter((s) => s.date === isoDate(d)).length));
    rows.push(["Total", ...totals]);

    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${startStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async (startStr: string, endStr: string) => {
    const { default: html2canvas } = await import("html2canvas");
    const { weeks, rangeShifts } = getExportData(startStr, endStr);

    // Pre-render role icons as PNG data URLs
    const pngIconCache: Record<string, string> = {};
    const allUsedRoles = roles.filter((r) =>
      rangeShifts.some((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === r.name.toLowerCase()))
    );
    await Promise.all(allUsedRoles.map(async (r) => {
      pngIconCache[r.name.toLowerCase()] = await renderIconToDataUrl(r.icon, r.color, 16);
    }));

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "background:#fff;padding:20px;font-family:system-ui,sans-serif;font-size:12px;width:max-content;";

    for (const weekDays of weeks) {
      const wStart = formatDate(weekDays[0], { month: "short", day: "numeric" });
      const wEnd = formatDate(weekDays[weekDays.length - 1], { month: "short", day: "numeric", year: "numeric" });
      const weekShiftRange = rangeShifts.filter((s) => s.date >= isoDate(weekDays[0]) && s.date <= isoDate(weekDays[weekDays.length - 1]));
      const staffNames = [...new Set(weekShiftRange.map((s) => s.staffName))].sort();

      const title = document.createElement("h2");
      title.style.cssText = "margin:16px 0 12px;font-size:16px;";
      title.textContent = `${currentOrg?.name ?? "Schedule"} — ${wStart} - ${wEnd}`;
      wrapper.appendChild(title);

      const table = document.createElement("table");
      table.style.cssText = "border-collapse:collapse;width:100%;margin-bottom:8px;";
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      ["Name", ...weekDays.map((d) => `${formatDate(d, { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`)].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.cssText = "border:1px solid #d6d3d1;padding:6px 8px;background:#f5f5f4;font-size:11px;text-align:center;";
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const name of staffNames) {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        nameTd.textContent = name;
        nameTd.style.cssText = "border:1px solid #d6d3d1;padding:6px 8px;font-weight:600;white-space:nowrap;";
        tr.appendChild(nameTd);
        for (const d of weekDays) {
          const ds = isoDate(d);
          const dayShifts = weekShiftRange.filter((s) => s.date === ds && s.staffName === name);
          const td = document.createElement("td");
          td.style.cssText = `border:1px solid #d6d3d1;padding:6px 8px;font-size:11px;vertical-align:middle;text-align:center;min-width:90px;${dayShifts.length > 0 ? "background:#fff7ed;" : ""}`;
          if (dayShifts.length > 0) {
            dayShifts.forEach((s) => {
              const timeDiv = document.createElement("div");
              timeDiv.textContent = `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`;
              td.appendChild(timeDiv);
            const iconsRow = document.createElement("div");
            iconsRow.style.cssText = "display:flex;justify-content:center;gap:3px;margin-top:7px;";
            (s.staffRoles ?? []).forEach((rn) => {
                const iconDataUrl = pngIconCache[rn.toLowerCase()];
                if (iconDataUrl) {
                  const iconImg = document.createElement("img");
                  iconImg.src = iconDataUrl;
                  iconImg.style.cssText = "width:12px;height:12px;";
                  iconsRow.appendChild(iconImg);
                }
              });
            td.appendChild(iconsRow);
            });
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrapper.appendChild(table);

      // Legend after each table
      const usedWeekRoles = roles.filter((r) =>
        weekShiftRange.some((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === r.name.toLowerCase()))
      );
      if (usedWeekRoles.length > 0) {
        const legend = document.createElement("div");
        legend.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 16px;";
        const label = document.createElement("span");
        label.textContent = "Roles:";
        label.style.cssText = "font-weight:600;font-size:11px;";
        legend.appendChild(label);
        for (const role of usedWeekRoles) {
          const item = document.createElement("span");
          item.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:10px;";
          const iconDataUrl = pngIconCache[role.name.toLowerCase()];
          if (iconDataUrl) {
            const iconImg = document.createElement("img");
            iconImg.src = iconDataUrl;
            iconImg.style.cssText = "width:12px;height:12px;position:relative;top:7px;";
            item.appendChild(iconImg);
          }
          const text = document.createTextNode(`= ${role.name}`);
          item.appendChild(text);
          legend.appendChild(item);
        }
        wrapper.appendChild(legend);
      }
    }

    // Render in an iframe to isolate from Tailwind's lab() colors
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:absolute;left:-9999px;top:0;width:1400px;border:none;";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument!;
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box;}</style></head><body>${wrapper.outerHTML}</body></html>`);
    iframeDoc.close();
    // Wait for all images (icons) to load
    const imgs = Array.from(iframeDoc.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })));
    await new Promise((r) => setTimeout(r, 100));
    const target = iframeDoc.body.firstElementChild as HTMLElement;
    // Size iframe to content
    const contentH = target.scrollHeight + 40;
    const contentW = target.scrollWidth + 40;
    iframe.style.width = `${contentW}px`;
    iframe.style.height = `${contentH}px`;
    const canvas = await html2canvas(target, { backgroundColor: "#ffffff", scale: 2, windowWidth: contentW, windowHeight: contentH });
    document.body.removeChild(iframe);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${startStr}.png`;
    a.click();
  };

  const [downloadDialog, setDownloadDialog] = useDynamicUIElementUrl(t("staffing.exportDialog.title"));
  const [downloadRange, setDownloadRange] = useState({ start: "", end: "" });
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "png" | "csv">("pdf");

  // Table view state
  type CellKey = `${string}|${string}`; // "memberId|date"
  const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set());
  const lastCellRef = useRef<CellKey | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const dragStartRef = useRef<CellKey | null>(null);
  const isDraggingRef = useRef(false);
  const preDragSelectionRef = useRef<Set<CellKey>>(new Set());
  const selectModeRef = useRef(false);
  selectModeRef.current = selectMode;
  const [batchDialog, setBatchDialog] = useState(false);
  const [batchForm, setBatchForm] = useState({ startTime: "09:00", endTime: "17:00", roleNames: [] as string[] });

  // ─── Desktop early return ────────────────────────────────────────────────
  if (isDesktop) return (
    <>
      <StaffingDesktop
        organizationId={organizationId}
        isOwner={isOwner}
        canEdit={canEdit}
        isStaff={isStaff}
        currentOrg={currentOrg}
        role={role}
        userId={userId}
        myMemberId={myMemberId}
        canManageAttendance={canManageAttendance}
        team={team}
        shifts={shifts}
        setShifts={setShifts}
        roles={roles}
        weekStart={weekStart}
        setWeekStart={setWeekStart}
        weekDates={weekDates}
        weekShifts={weekShifts}
        todayStr={todayStr}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        orgTimeOffRequests={orgTimeOffRequests}
        orgShiftTrades={orgShiftTrades}
        pendingCount={pendingCount}
        getMemberName={getMemberName}
        handleTimeOffStatusUpdate={handleTimeOffStatusUpdate}
        handleTradeStatusUpdate={handleTradeStatusUpdate}
        handleDeleteShift={handleDeleteShift}
        setEditingShift={setEditingShift}
        setShiftForm={setShiftForm}
        setAddDialog={setAddDialog}
        roleTasksCache={roleTasksCache}
        roleTaskCounts={roleTaskCounts}
        loadRoleTasksFor={loadRoleTasksFor}
        loadingTasks={loadingTasks}
        selectedRole={selectedRole}
        setSelectedRole={setSelectedRole}
        handleSelectRole={handleSelectRole}
        handleDeleteRole={handleDeleteRole}
        setEditingRole={setEditingRole}
        setRoleForm={setRoleForm}
        setRoleDialog={setRoleDialog}
        setTaskDialog={setTaskDialog}
        setTaskForm={setTaskForm}
        refreshing={refreshing}
        shiftDialog={addDialog ? { shift: editingShift, memberId: shiftForm.memberId, date: shiftForm.date } : null}
        subtabs={subtabs}
      />
      {/* ─── Dialogs still need to render (they are portals) ─── */}
      {/* Add / Edit Shift DynamicUIElement */}
      <DynamicUIElement open={addDialog} onOpenChange={(open) => { setAddDialog(open); if (!open) setEditingShift(null); }}>
        <DynamicUIElementContent className="max-w-md" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={editingShift ? t("staffing.shiftDialog.editTitle") : t("staffing.shiftDialog.createTitle")}>
              {editingShift ? t("staffing.shiftDialog.editTitle") : t("staffing.shiftDialog.createTitle")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">
              {editingShift ? t("staffing.shiftDialog.editDescription") : t("staffing.shiftDialog.createDescription")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pt-2 pb-4 space-y-4">
                <div className="flex items-center gap-3 py-2 border-b border-border">
                  <Input type="date" value={shiftForm.date} onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))} className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0" />
                </div>
                <div className="flex items-center gap-2 py-2 border-b border-border">
                  <Input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))} className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1" />
                  <span className="text-muted-foreground">&mdash;</span>
                  <Input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))} className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1" />
                </div>
              </div>
              <div className="h-2 bg-muted/50" />
              <div className="px-4 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.assignEmployee")}</Label>
                    <Select value={shiftForm.memberId} onValueChange={(v) => setShiftForm((f) => ({ ...f, memberId: v ?? "" }))}>
                      <SelectTrigger className="mt-1 border-0 border-b border-border rounded-none px-0 shadow-none focus:ring-0">
                        <SelectValue placeholder={t("staffing.shiftDialog.selectPlaceholder")}>{team.find((m) => m.id === shiftForm.memberId)?.displayName ?? t("staffing.shiftDialog.selectPlaceholder")}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {team.map((m) => (<SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.rolesLabel")}</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {roles.map((r) => {
                        const selected = shiftForm.roleNames.includes(r.name);
                        return (
                          <button key={r.id} onClick={() => setShiftForm((f) => ({ ...f, roleNames: selected ? f.roleNames.filter((n) => n !== r.name) : [...f.roleNames, r.name] }))}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors ${selected ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"}`}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selected ? "white" : r.color }} />
                            {r.name}
                          </button>
                        );
                      })}
                      {canEdit && (
                        <button onClick={() => { setEditingRole(null); setRoleForm({ name: "", color: "#44403c", description: "", icon: "briefcase", permissions: {} as StaffRolePermissions }); setRoleDialog(true); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-dashed border-border text-muted-foreground rounded hover:bg-muted transition-colors">
                          <Plus className="h-3 w-3" /> {t("staffing.roles.addRole")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-4 py-4 border-t border-border mt-auto">
              <Button onClick={handleAddShift} disabled={saving || (!editingShift && !shiftForm.memberId)} className="w-full h-12 text-sm font-semibold">
                {saving ? <Spinner size={16} /> : editingShift ? t("staffing.shiftDialog.saveCta") : t("staffing.shiftDialog.createCta")}
              </Button>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
      {/* Role DynamicUIElement */}
      <DynamicUIElement open={roleDialog} onOpenChange={(open) => { setRoleDialog(open); if (!open) setEditingRole(null); }}>
        <DynamicUIElementContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{editingRole ? t("staffing.roleDialog.editTitle") : t("staffing.roleDialog.addTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{editingRole ? t("staffing.roleDialog.editDescription") : t("staffing.roleDialog.addDescription")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.icon")}</Label>
              <div className="grid grid-cols-8 gap-1">
                {ROLE_ICON_LIST.map((iconName) => (
                  <button key={iconName} type="button" onClick={() => setRoleForm((f) => ({ ...f, icon: iconName }))}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${roleForm.icon === iconName ? "border-2 border-foreground bg-muted" : "border border-transparent bg-muted hover:bg-muted/80"}`} title={iconName}>
                    <RoleIconComp name={iconName} className="h-4 w-4 text-foreground" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.roleName")}</Label>
              <Input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("staffing.roleDialog.roleNamePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.color")}</Label>
              <RoleColorPicker value={roleForm.color} onChange={(c) => setRoleForm((f) => ({ ...f, color: c }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.description")}</Label>
              <Textarea value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("staffing.roleDialog.descriptionPlaceholder")} className="resize-none text-sm" rows={2} />
            </div>

            {/* Tasks section — only when editing an existing role */}
            {editingRole && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t("staffing.roles.tasksLabel") || "Tasks"}</Label>
                  <Button variant="ghost" size="xs" onClick={() => { setTaskForm({ title: "", description: "", hasTime: false, startTime: "09:00", endTime: "17:00", requiresEvidence: false, notifyChats: [] as string[] }); setTaskDialog({ open: true, task: null }); }}>
                    <Plus className="h-3 w-3 mr-1" /> {t("staffing.roles.addTask") || "Add"}
                  </Button>
                </div>
                {(roleTasksCache[editingRole.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("staffing.roles.noTasks") || "No tasks yet"}</p>
                ) : (
                  <div className="space-y-1">
                    {(roleTasksCache[editingRole.id] ?? []).map((task) => (
                      <button key={task.id} type="button" onClick={() => {
                        setTaskForm({ title: task.title, description: task.description ?? "", hasTime: !!(task.startTime && task.endTime), startTime: task.startTime ?? "09:00", endTime: task.endTime ?? "17:00", requiresEvidence: task.requiresEvidence ?? false, notifyChats: task.notifyChats ?? [] });
                        setTaskDialog({ open: true, task });
                      }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs rounded hover:bg-muted transition-colors border border-border">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: editingRole.color }} />
                        <span className="flex-1 truncate font-medium">{task.title}</span>
                        {task.startTime && <span className="text-muted-foreground font-mono tabular-nums text-[10px]">{task.startTime}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setRoleDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveRole} disabled={saving || !roleForm.name}>{saving ? <Spinner size={16} /> : editingRole ? t("staffing.roleDialog.saveCta") : t("staffing.roleDialog.addCta")}</Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
      {/* Task DynamicUIElement */}
      <DynamicUIElement open={taskDialog.open} onOpenChange={(open) => { if (!open) setTaskDialog({ open: false, task: null }); }}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{taskDialog.task ? t("staffing.taskDialog.editTitle") : t("staffing.taskDialog.addTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{taskDialog.task ? t("staffing.taskDialog.editDescription") : t("staffing.taskDialog.addDescription")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>{t("staffing.taskDialog.taskTitle")}</Label>
              <Input value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("staffing.taskDialog.taskTitlePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.taskDialog.details")} <span className="text-muted-foreground font-normal">{t("staffing.taskDialog.optional")}</span></Label>
              <Textarea value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("staffing.taskDialog.detailsPlaceholder")} className="resize-none text-sm" rows={3} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("staffing.taskDialog.timeWindow")}</Label>
              <Switch size="sm" checked={taskForm.hasTime} onCheckedChange={() => setTaskForm((f) => ({ ...f, hasTime: !f.hasTime }))} />
            </div>
            {taskForm.hasTime && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>{t("staffing.taskDialog.startTime")}</Label><Input type="time" value={taskForm.startTime} onChange={(e) => setTaskForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{t("staffing.taskDialog.endTime")}</Label><Input type="time" value={taskForm.endTime} onChange={(e) => setTaskForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label>{t("staffing.taskDialog.requireEvidence")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("staffing.taskDialog.requireEvidenceHint")}</p>
              </div>
              <Switch
                size="sm"
                checked={taskForm.requiresEvidence}
                onCheckedChange={() => setTaskForm((f) => ({ ...f, requiresEvidence: !f.requiresEvidence }))}
                aria-label={t("staffing.taskDialog.requireEvidence")}
                className="mt-0.5"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("staffing.taskDialog.notifyChat")}
                {taskForm.requiresEvidence && <span className="text-destructive ml-1">*</span>}
              </Label>
              <p className="text-xs text-muted-foreground">
                {taskForm.requiresEvidence
                  ? t("staffing.taskDialog.notifyChatRequired")
                  : t("staffing.taskDialog.notifyChatHint")}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {chatOptions.filter((c) => c.type === "group").map((c) => {
                  const selected = taskForm.notifyChats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTaskForm((f) => ({
                        ...f,
                        notifyChats: selected
                          ? f.notifyChats.filter((id) => id !== c.id)
                          : [...f.notifyChats, c.id],
                      }))}
                      className={`px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {c.name ?? t("staffing.unnamed")}
                    </button>
                  );
                })}
                {chatOptions.filter((c) => c.type === "group").length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("staffing.taskDialog.noGroupChats")}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setTaskDialog({ open: false, task: null })}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveTask} disabled={savingTask || !taskForm.title || (taskForm.requiresEvidence && taskForm.notifyChats.length === 0)}>{savingTask ? <Spinner size={16} /> : taskDialog.task ? t("staffing.taskDialog.saveCta") : t("staffing.taskDialog.addCta")}</Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </>
  );

  // ─── Mobile computed data ──────────────────────────────────────────────────
  const todayDate = new Date();
  const todayShiftsAll = shifts.filter((s) => s.memberId === myMemberId && s.date === todayStr);
  const todayAllShifts = weekShifts.filter((s) => s.date === selectedDay);
  const todayScheduledHours = (() => {
    const hrs = todayAllShifts.reduce((acc, s) => {
      return acc + shiftDurationHours(s.startTime, s.endTime);
    }, 0);
    return hrs % 1 === 0 ? `${hrs}` : hrs.toFixed(1);
  })();
  const todayStaffIds = [...new Set(todayAllShifts.map((s) => s.memberId))];
  const pendingTimeOff = orgTimeOffRequests.filter((r) => r.status === "pending");
  const pendingTrades = orgShiftTrades.filter((t) => t.status === "pending");
  const myPendingTrades = pendingTrades.filter((t) => t.targetId === myMemberId);
  const hasTradesForMe = myPendingTrades.length > 0;

  // Find earliest opening shift for today display
  const todayOpenTime = (() => {
    if (todayAllShifts.length === 0) return null;
    const earliest = todayAllShifts.reduce((min, s) => s.startTime < min ? s.startTime : min, todayAllShifts[0].startTime);
    return formatTime(earliest);
  })();

  // Timeline helper for schedule day view
  const TIMELINE_START = 6; // 6 AM
  const TIMELINE_END = 22; // 10 PM
  const TIMELINE_HOURS_COUNT = TIMELINE_END - TIMELINE_START;

  const getShiftTopPercent = (startTime: string) => {
    const [h, m] = startTime.split(":").map(Number);
    const hours = h + m / 60;
    return Math.max(0, Math.min(100, ((hours - TIMELINE_START) / TIMELINE_HOURS_COUNT) * 100));
  };

  const getShiftHeightPercent = (startTime: string, endTime: string) => {
    const duration = shiftDurationHours(startTime, endTime);
    return Math.max(2, (duration / TIMELINE_HOURS_COUNT) * 100);
  };

  // Compute lanes for overlapping shifts in day view
  const computeLanes = (dayShifts: Shift[]) => {
    const sorted = [...dayShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const lanes: Shift[][] = [];
    for (const shift of sorted) {
      let placed = false;
      for (const lane of lanes) {
        const last = lane[lane.length - 1];
        if (last.endTime <= shift.startTime) {
          lane.push(shift);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([shift]);
    }
    const laneMap = new Map<string, { lane: number; totalLanes: number }>();
    for (const shift of sorted) {
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i].includes(shift)) {
          laneMap.set(shift.id, { lane: i, totalLanes: lanes.length });
          break;
        }
      }
    }
    return laneMap;
  };

  // Current time position for red line
  const currentTimePercent = (() => {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    if (hours < TIMELINE_START || hours > TIMELINE_END) return null;
    return ((hours - TIMELINE_START) / TIMELINE_HOURS_COUNT) * 100;
  })();

  // Selected day data for schedule tab
  const selectedDayShifts = weekShifts.filter((s) => s.date === selectedDay);
  const selectedDayLanes = computeLanes(selectedDayShifts);

  // ─── Mobile computed helpers ─────────────────────────────────────────────
  // On-shift now: shifts that overlap with current time
  const nowOnShift = (() => {
    // String comparison could never match an overnight shift (22:00 > 01:00).
    const nowMinutes = nowClock.getHours() * 60 + nowClock.getMinutes();
    return todayAllShifts.filter((s) => isOnShiftAt(s.startTime, s.endTime, nowMinutes));
  })();

  // Upcoming shifts today (haven't started yet)
  const upNextToday = (() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return todayAllShifts
      .filter((s) => s.startTime > nowTime)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  })();

  // Minutes until a shift starts
  const minutesUntil = (startTime: string) => {
    const now = new Date();
    const [h, m] = startTime.split(":").map(Number);
    return Math.max(0, (h * 60 + m) - (now.getHours() * 60 + now.getMinutes()));
  };

  // Week hours
  const weekTotalHours = (() => {
    const hrs = weekShifts.reduce((acc, s) => {
      return acc + shiftDurationHours(s.startTime, s.endTime);
    }, 0);
    return hrs % 1 === 0 ? `${hrs}` : hrs.toFixed(1);
  })();

  // Week of label for schedule tab
  const weekOfLabel = formatDate(weekDates[0], { month: "short", day: "numeric" });

  // Selected day display for schedule tab
  const selectedDayDate = new Date(selectedDay + "T00:00:00");
  const selectedDayLabel = formatDate(selectedDayDate, { weekday: "long", month: "short", day: "numeric" });
  const selectedDayHours = (() => {
    const hrs = selectedDayShifts.reduce((acc, s) => {
      return acc + shiftDurationHours(s.startTime, s.endTime);
    }, 0);
    return hrs % 1 === 0 ? `${hrs}` : hrs.toFixed(1);
  })();

  return (
    <div className="flex flex-col min-h-screen bg-background flex-1">
      <div className="flex flex-col min-h-screen bg-background">
        <PageHeader
          title={t("staffing.title")}
          subtitle={`${currentOrg?.name ?? t("staffing.store")} · ${activeMembers.length} ${t("staffing.active")}`}
          actions={[
            { icon: <Search className="h-4 w-4" /> },
            { icon: <Bell className="h-4 w-4" />, onClick: () => { hapticLight(); setNotifPanelOpen(true); }, badge: pendingCount },
            ...(canEdit ? [{ icon: <Plus className="h-4 w-4" />, onClick: () => {
              hapticLight();
              setEditingShift(null);
              setShiftForm({ memberId: team[0]?.id ?? "", date: selectedDay, shiftType: "morning" as const, startTime: "07:00", endTime: "14:00", roleNames: [] });
              setAddDialog(true);
            } }] : []),
          ]}
          right={
            <div className="flex items-center gap-1">
              {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          }
        />

        {/* ─── Tabs: Overview | Schedule ────────────────────────── */}
        <div className="flex border-b border-border bg-background">
          {(["overview", "schedule"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { hapticLight(); setMobileSection(tab); }}
              className={`flex-1 py-2.5 text-[13px] text-center transition-colors ${
                mobileSection === tab
                  ? "font-semibold text-foreground border-b-2 border-foreground"
                  : "font-medium text-muted-foreground"
              }`}
            >
              {t(`staffing.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ─── OVERVIEW TAB ──────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {mobileSection === "overview" && (
          <div className="flex-1 overflow-y-auto pb-24">

            {/* ── KPI Grid: 2x2, cells separated by borders ── */}
            <div className="grid grid-cols-2 gap-3 p-4 border-b border-border">
              <StatTile
                label={t("staffing.overview.onShiftNow")}
                value={<>{nowOnShift.length}<span className="text-sm font-normal text-muted-foreground"> / {activeMembers.length}</span></>}
              />
              <StatTile label={t("staffing.overview.todayHours")} value={`${todayScheduledHours}h`} />
              <StatTile label={t("staffing.overview.openRequests")} value={pendingCount} tone={pendingCount > 0 ? "warning" : undefined} />
              <StatTile label={t("staffing.overview.thisWeek")} value={`${weekTotalHours}h`} />
            </div>

            <AttendanceManagerPanel
              rows={attendanceRows}
              canManage={canManageAttendance}
              date={selectedDay}
              onDateChange={setSelectedDay}
              busyMemberId={managerPunchingId}
              savingMemberId={managerSavingAttendanceId}
              onPunch={handleManagerPunch}
              onSaveWindow={handleManagerSetPunchWindow}
              compact
            />

            {/* ── Section: Currently on shift ── */}
            <div className="border-b border-border">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Eyebrow>{t("staffing.overview.currentlyOnShift")}</Eyebrow>
                  <span className="text-[10.5px] font-semibold text-muted-foreground bg-muted rounded px-1.5 py-0.5">{nowOnShift.length}</span>
                </div>
              </div>
              {nowOnShift.length === 0 ? (
                <div className="px-4 pb-3">
                  <p className="text-[12px] text-muted-foreground">{t("staffing.overview.nobodyOnShift")}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {nowOnShift.map((shift) => {
                    const member = team.find((m) => m.id === shift.memberId);
                    const name = member?.displayName ?? shift.staffName ?? t("staffing.staff");
                    const matchedRoles = (shift.staffRoles ?? [])
                      .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                      .filter(Boolean) as StaffRole[];
                    const isMine = shift.memberId === myMemberId;
                    return (
                      <button
                        key={shift.id}
                        onClick={() => {
                          if (canEdit) {
                            setEditingShift(shift);
                            setShiftForm({ memberId: shift.memberId ?? "", date: shift.date, shiftType: shift.shiftType, startTime: shift.startTime, endTime: shift.endTime, roleNames: shift.staffRoles ?? [] });
                            setAddDialog(true);
                          } else if (isMine) {
                            openTradeDialog(shift);
                          } else {
                            setShiftDetailShift(shift);
                          }
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-muted transition-colors"
                      >
                        <StaffAvatar name={name} avatarUrl={member?.avatarUrl} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate leading-tight">{name}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {matchedRoles.map((r) => r.name).join(", ") || t("staffing.staff")}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-foreground shrink-0">
                          {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                        </span>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Section: Up next today ── */}
            {upNextToday.length > 0 && (
              <div className="border-b border-border">
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <Eyebrow>{t("staffing.overview.upNextToday")}</Eyebrow>
                  <span className="text-[10.5px] font-semibold text-muted-foreground bg-muted rounded px-1.5 py-0.5">{upNextToday.length}</span>
                </div>
                <div className="divide-y divide-border">
                  {upNextToday.map((shift) => {
                    const member = team.find((m) => m.id === shift.memberId);
                    const name = member?.displayName ?? shift.staffName ?? t("staffing.staff");
                    const matchedRoles = (shift.staffRoles ?? [])
                      .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                      .filter(Boolean) as StaffRole[];
                    const mins = minutesUntil(shift.startTime);
                    const inLabel = mins >= 60
                      ? (mins % 60 > 0
                          ? t("staffing.overview.inHoursMinutes").replace("{h}", String(Math.floor(mins / 60))).replace("{min}", String(mins % 60))
                          : t("staffing.overview.inHours").replace("{h}", String(Math.floor(mins / 60))))
                      : t("staffing.overview.inMinutes").replace("{min}", String(mins));
                    const isMine = shift.memberId === myMemberId;
                    return (
                      <button
                        key={shift.id}
                        onClick={() => {
                          if (canEdit) {
                            setEditingShift(shift);
                            setShiftForm({ memberId: shift.memberId ?? "", date: shift.date, shiftType: shift.shiftType, startTime: shift.startTime, endTime: shift.endTime, roleNames: shift.staffRoles ?? [] });
                            setAddDialog(true);
                          } else if (isMine) {
                            openTradeDialog(shift);
                          } else {
                            setShiftDetailShift(shift);
                          }
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-muted transition-colors"
                      >
                        <StaffAvatar name={name} avatarUrl={member?.avatarUrl} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate leading-tight">{name}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {matchedRoles.map((r) => r.name).join(", ") || t("staffing.staff")}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-medium text-foreground">{inLabel}</p>
                          <p className="text-[10.5px] font-mono tabular-nums text-muted-foreground">
                            {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Section: Needs attention — managers see all, staff see trades targeted at them ── */}
            {((canEdit && (pendingTimeOff.length > 0 || pendingTrades.length > 0)) || hasTradesForMe) && (
              <div className="border-b border-border">
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <Eyebrow>{t("staffing.overview.needsAttention")}</Eyebrow>
                </div>
                <div className="divide-y divide-border">
                  {canEdit && pendingTimeOff.length > 0 && (
                    <button
                      onClick={() => { hapticLight(); setTimeOffDialog(true); }}
                      className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-muted transition-colors"
                    >
                      <div className="h-9 w-9 shrink-0 rounded border border-border bg-muted flex items-center justify-center">
                        <CalendarX className="h-4 w-4 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground leading-tight">{(pendingTimeOff.length === 1 ? t("staffing.overview.timeOffRequestSingular") : t("staffing.overview.timeOffRequestPlural")).replace("{count}", String(pendingTimeOff.length))}</p>
                        <p className="text-[11px] text-muted-foreground leading-tight">{t("staffing.overview.awaitingApproval")}</p>
                      </div>
                      <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-100 rounded px-2 py-0.5 shrink-0">{t("staffing.pending")}</span>
                    </button>
                  )}
                  {((canEdit && pendingTrades.length > 0) || hasTradesForMe) && (
                    <button
                      onClick={() => {
                        hapticLight(); setShowRequests(true); setMobileSection("schedule");
                        setTimeout(() => mobileRequestsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                      }}
                      className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-muted transition-colors"
                    >
                      <div className="h-9 w-9 shrink-0 rounded border border-border bg-muted flex items-center justify-center">
                        <ArrowLeftRight className="h-4 w-4 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {!canEdit ? (
                          <>
                            <p className="text-[13px] font-medium text-foreground leading-tight">{(myPendingTrades.length === 1 ? t("staffing.overview.shiftTradeSingular") : t("staffing.overview.shiftTradePlural")).replace("{count}", String(myPendingTrades.length))}</p>
                            <p className="text-[11px] text-muted-foreground leading-tight">{t("staffing.overview.tradeTargetHint")}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[13px] font-medium text-foreground leading-tight">{(pendingTrades.length === 1 ? t("staffing.overview.shiftTradeSingular") : t("staffing.overview.shiftTradePlural")).replace("{count}", String(pendingTrades.length))}</p>
                            <p className="text-[11px] text-muted-foreground leading-tight">{t("staffing.overview.awaitingApproval")}</p>
                          </>
                        )}
                      </div>
                      <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-100 rounded px-2 py-0.5 shrink-0">{t("staffing.pending")}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ─── SCHEDULE TAB ──────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {mobileSection === "schedule" && (
          <div className="flex-1 overflow-y-auto pb-24">

            {/* ── Week strip ── */}
            <div className="bg-background border-b border-border">
              {/* Week nav header */}
              <div className="flex items-center justify-between px-4 py-2">
                <p className="text-[12px] font-semibold text-foreground">{t("staffing.schedule.weekOf").replace("{date}", weekOfLabel)}</p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" onClick={prevWeek}>
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="outline" size="icon-sm" onClick={nextWeek}>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              {/* 7-column day buttons — touch-swipe */}
              <div
                ref={weekStripRef}
                className="overflow-hidden pb-2"
              >
                <div
                  className="grid grid-cols-7 gap-0 px-2"
                  style={{
                    transform: weekSwiping ? `translateX(${weekSwipeOffset}px)` : undefined,
                    transition: weekSwiping ? "none" : "transform 0.25s ease-out",
                  }}
                >
                  {weekDates.map((d) => {
                    const ds = isoDate(d);
                    const isSelected = ds === selectedDay;
                    const dayShiftCount = weekShifts.filter((s) => s.date === ds).length;
                    return (
                      <button
                        key={ds}
                        onClick={() => { hapticLight(); setSelectedDay(ds); }}
                        className={`flex flex-col items-center py-1.5 rounded-lg transition-colors ${
                          isSelected ? "bg-foreground text-background" : "hover:bg-muted"
                        }`}
                      >
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isSelected ? "text-muted-foreground" : "text-muted-foreground"
                        }`}>
                          {formatDate(d, { weekday: "short" })}
                        </span>
                        <span className={`text-[17px] font-mono tabular-nums font-semibold leading-snug ${
                          isSelected ? "text-background" : "text-foreground"
                        }`}>
                          {d.getDate()}
                        </span>
                        <span className={`text-[9.5px] font-mono tabular-nums ${
                          isSelected ? "text-muted-foreground" : "text-muted-foreground"
                        }`}>
                          {dayShiftCount > 0 ? `${dayShiftCount}` : " "}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Day header ── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div>
                <p className="text-[15px] font-semibold text-foreground">{selectedDayLabel}</p>
                <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  {(selectedDayShifts.length === 1 ? t("staffing.schedule.shiftsCountSingular") : t("staffing.schedule.shiftsCountPlural")).replace("{count}", String(selectedDayShifts.length))} &middot; {selectedDayHours}h
                </p>
              </div>
              {canEdit && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    hapticLight();
                    setEditingShift(null);
                    setShiftForm({
                      memberId: team[0]?.id ?? "",
                      date: selectedDay,
                      shiftType: "morning",
                      startTime: "07:00",
                      endTime: "14:00",
                      roleNames: [],
                    });
                    setAddDialog(true);
                  }}
                >
                  <Plus className="h-3 w-3" /> {t("staffing.header.addShiftShort")}
                </Button>
              )}
            </div>

            <AttendanceManagerPanel
              rows={attendanceRows}
              canManage={canManageAttendance}
              date={selectedDay}
              onDateChange={setSelectedDay}
              busyMemberId={managerPunchingId}
              savingMemberId={managerSavingAttendanceId}
              onPunch={handleManagerPunch}
              onSaveWindow={handleManagerSetPunchWindow}
              compact
            />

            {/* ── Day Timeline (swipe left/right to change day) ── */}
            <div
              ref={dayContentRef}
              className="px-0 overflow-hidden"
              style={{
                transform: daySwiping ? `translateX(${daySwipeOffset}px)` : undefined,
                opacity: daySwiping ? Math.max(0.3, 1 - Math.abs(daySwipeOffset) / 400) : 1,
                transition: daySwiping ? "none" : "transform 0.2s ease-out, opacity 0.2s ease-out",
              }}
            >
              {selectedDayShifts.length === 0 ? (
                <EmptyState icon={Clock} description={t("staffing.schedule.noShiftsScheduled")} className="py-16" />
              ) : (
                <div className="relative" style={{ height: `${TIMELINE_HOURS_COUNT * 48}px` }}>
                  {/* Hour labels + grid lines */}
                  {Array.from({ length: TIMELINE_HOURS_COUNT + 1 }, (_, i) => {
                    const hour = TIMELINE_START + i;
                    const top = (i / TIMELINE_HOURS_COUNT) * 100;
                    return (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 flex items-start"
                        style={{ top: `${top}%` }}
                      >
                        <span className="text-[10.5px] text-muted-foreground font-mono tabular-nums w-12 text-right pr-2.5 -mt-2 shrink-0">
                          {hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`}
                        </span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                    );
                  })}

                  {/* Current time line */}
                  {currentTimePercent !== null && selectedDay === todayStr && (
                    <div
                      className="absolute left-12 right-0 z-10 flex items-center"
                      style={{ top: `${currentTimePercent}%` }}
                    >
                      <div className="h-2 w-2 rounded-full bg-destructive -ml-1 shrink-0" />
                      <div className="flex-1 bg-destructive h-[1.5px]" />
                    </div>
                  )}

                  {/* Shift bars */}
                  {selectedDayShifts.map((shift) => {
                    const top = getShiftTopPercent(shift.startTime);
                    const height = getShiftHeightPercent(shift.startTime, shift.endTime);
                    const laneInfo = selectedDayLanes.get(shift.id);
                    const totalLanes = laneInfo?.totalLanes ?? 1;
                    const lane = laneInfo?.lane ?? 0;
                    const laneWidthPercent = totalLanes > 1 ? (100 - 15) / totalLanes : 100 - 15;
                    const laneLeftPercent = 15 + lane * laneWidthPercent;
                    const matchedRoles = (shift.staffRoles ?? [])
                      .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                      .filter(Boolean) as StaffRole[];
                    const member = team.find((m) => m.id === shift.memberId);
                    const name = member?.displayName ?? shift.staffName ?? t("staffing.staff");
                    const firstName = name.split(" ")[0];

                    return (
                      <button
                        key={shift.id}
                        onClick={() => {
                          if (canEdit) {
                            setEditingShift(shift);
                            setShiftForm({
                              memberId: shift.memberId ?? team[0]?.id ?? "",
                              date: shift.date,
                              shiftType: shift.shiftType,
                              startTime: shift.startTime,
                              endTime: shift.endTime,
                              roleNames: shift.staffRoles ?? [],
                            });
                            setAddDialog(true);
                          } else if (shift.memberId === myMemberId) {
                            openTradeDialog(shift);
                          } else {
                            setShiftDetailShift(shift);
                          }
                        }}
                        className="absolute bg-background border border-border flex overflow-hidden text-left rounded"
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          left: `${laneLeftPercent}%`,
                          width: `${laneWidthPercent - 1}%`,
                          minHeight: "28px",
                          borderLeftWidth: "2px",
                          borderLeftColor: "#1c1917",
                        }}
                      >
                        <div className="flex-1 min-w-0 px-2 py-1 flex items-start gap-1.5">
                          <StaffAvatar name={name} avatarUrl={member?.avatarUrl} size={18} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{firstName}</p>
                            <p className="text-[10.5px] font-mono tabular-nums text-muted-foreground leading-tight">
                              {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                            </p>
                            {matchedRoles.length > 0 && (
                              <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                {matchedRoles.map((r) => r.name).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Requests Section (in Schedule tab) — managers see all, staff see trades targeted at them ── */}
            {((canEdit && (pendingTimeOff.length > 0 || pendingTrades.length > 0)) || hasTradesForMe) && (
              <div ref={mobileRequestsRef} className="border-t border-border">
                <button
                  onClick={() => setShowRequests(!showRequests)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 border-b border-border"
                >
                  <Eyebrow>{t("staffing.requests.title")}</Eyebrow>
                  <span className="text-[10.5px] font-semibold text-background bg-foreground rounded px-1.5 py-0.5">
                    {pendingCount}
                  </span>
                  {showRequests
                    ? <ChevronUp className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                  }
                </button>
                {showRequests && (
                  <div className="divide-y divide-border">
                    {pendingTimeOff.map((req) => (
                      <div key={req.id} className="px-4 py-3">
                        <p className="text-[13px] font-medium text-foreground">{getMemberName(req.userId)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDateShort(req.startDate, formatDate)} &ndash; {formatDateShort(req.endDate, formatDate)}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTimeOffStatusUpdate(req.id, "approved")}>
                            <Check className="h-3 w-3" /> {t("staffing.requests.approve")}
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTimeOffStatusUpdate(req.id, "denied")}>
                            <Ban className="h-3 w-3" /> {t("staffing.requests.deny")}
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(canEdit ? pendingTrades : myPendingTrades).map((trade) => {
                      const shift = shifts.find((s) => s.id === trade.shiftId);
                      const isTarget = trade.targetId === myMemberId;
                      return (
                        <div key={trade.id} className="px-4 py-3">
                          <p className="text-[13px] font-medium text-foreground">
                            {getMemberName(trade.requesterId)} &rarr; {trade.targetId ? getMemberName(trade.targetId) : t("staffing.unknown")}
                          </p>
                          {shift && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatDateShort(shift.date, formatDate)} &middot; {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                            </p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTradeStatusUpdate(trade.id, "accepted")}>
                              <Check className="h-3 w-3" /> {isTarget ? t("staffing.requests.accept") : t("staffing.requests.approve")}
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTradeStatusUpdate(trade.id, "denied")}>
                              <Ban className="h-3 w-3" /> {t("staffing.requests.deny")}
                            </Button>
                            {canEdit && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  hapticLight();
                                  setTradeDialog({ open: true, shift: shift ?? null });
                                }}
                              >
                                <UserPlus className="h-3 w-3" /> {t("staffing.requests.reassign")}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Role detail dialog (shared between tabs) ── */}
        <DynamicUIElement open={roleDetailOpen && !!selectedRole} onOpenChange={(open) => { if (!open) { setRoleDetailOpen(false); } }}>
          <DynamicUIElementContent noPadding>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={selectedRole?.name ?? t("staffing.roles.rolePlaceholder")}>
                {selectedRole?.name ?? t("staffing.roles.rolePlaceholder")}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription className="hidden">{t("staffing.roleDialog.editDescription")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            {selectedRole && (
              <div className="space-y-4 px-4 pb-4 overflow-y-auto">
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div
                      className="h-8 w-8 shrink-0 flex items-center justify-center border rounded"
                      style={{ borderColor: selectedRole.color, color: selectedRole.color }}
                    >
                      <RoleIconComp name={selectedRole.icon} className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-foreground">{selectedRole.name}</span>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }} />
                      </div>
                      {selectedRole.description && (
                        <p className="text-xs text-muted-foreground truncate">{selectedRole.description}</p>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingRole(selectedRole);
                          setRoleForm({
                            name: selectedRole.name,
                            color: selectedRole.color,
                            icon: selectedRole.icon,
                            description: selectedRole.description,
                            permissions: selectedRole.permissions,
                          });
                          setRoleDialog(true);
                        }}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={async () => { await handleDeleteRole(selectedRole.id); setSelectedRole(null); setRoleDetailOpen(false); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Eyebrow>{t("staffing.roles.taskTimeline")}</Eyebrow>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setTaskForm({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] });
                          setTaskDialog({ open: true, task: null });
                        }}
                      >
                        <Plus className="h-3 w-3" /> {t("staffing.roles.addTask")}
                      </Button>
                    )}
                  </div>
                  {loadingTasks ? (
                    <div className="flex justify-center py-8">
                      <Spinner size={20} className="text-muted-foreground" />
                    </div>
                  ) : (roleTasksCache[selectedRole.id] ?? []).length === 0 ? (
                    <div className="text-center py-10">
                      <ClipboardList className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                      <p className="text-[13px] text-muted-foreground">{t("staffing.roles.noTasksYetDot")}</p>
                    </div>
                  ) : (
                    <div className="space-y-0 pl-3 border-l-2" style={{ borderColor: selectedRole.color }}>
                      {(roleTasksCache[selectedRole.id] ?? []).map((task) => (
                        <button
                          type="button"
                          key={task.id}
                          onClick={() => setTaskDetail(task)}
                          className="relative w-full text-left pl-4 pb-4 flex items-start justify-between gap-2 active:opacity-70 transition-opacity"
                        >
                          <span
                            className="absolute -left-[5px] top-1 h-2 w-2 rounded-full border-2 bg-background"
                            style={{ borderColor: selectedRole.color }}
                          />
                          <span className="flex-1 min-w-0 block">
                            {task.startTime && task.endTime && (
                              <span className="block font-mono text-[11px] text-muted-foreground leading-none mb-0.5 tabular-nums">
                                {formatTime(task.startTime)} &ndash; {formatTime(task.endTime)}
                              </span>
                            )}
                            <span className="block text-[13px] font-semibold text-foreground leading-snug">{task.title}</span>
                            {task.description && (
                              <span className="block text-[12px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">{task.description}</span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ── Task detail panel (nested on top of the role panel) ── */}
        <DynamicUIElement open={!!taskDetail} onOpenChange={(open) => { if (!open) setTaskDetail(null); }}>
          <DynamicUIElementContent noPadding>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={taskDetail?.title ?? t("staffing.roles.taskPlaceholder")}>
                {taskDetail?.title ?? t("staffing.roles.taskPlaceholder")}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription className="hidden">{taskDetail?.title ?? ""}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            {taskDetail && (
              <div className="space-y-5 px-4 pb-4 pt-2 overflow-y-auto">
                <div className="flex items-start gap-2.5">
                  {selectedRole && (
                    <span
                      className="h-9 w-9 shrink-0 flex items-center justify-center border rounded"
                      style={{ borderColor: selectedRole.color, color: selectedRole.color }}
                    >
                      <ClipboardList className="h-4 w-4" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground leading-snug">{taskDetail.title}</p>
                    {taskDetail.startTime && taskDetail.endTime ? (
                      <p className="font-mono text-[12px] text-muted-foreground mt-0.5 tabular-nums">
                        {formatTime(taskDetail.startTime)} &ndash; {formatTime(taskDetail.endTime)}
                      </p>
                    ) : (
                      <p className="text-[12px] text-muted-foreground mt-0.5">{t("staffing.roles.anyTime")}</p>
                    )}
                  </div>
                </div>

                {taskDetail.description && (
                  <div>
                    <Eyebrow className="mb-1.5">{t("staffing.roles.taskDescription")}</Eyebrow>
                    <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{taskDetail.description}</p>
                  </div>
                )}

                {(taskDetail.requiresEvidence || (taskDetail.notifyChats?.length ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {taskDetail.requiresEvidence && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-border rounded text-foreground">
                        <Camera className="h-3 w-3" /> {t("staffing.roles.requiresEvidence")}
                      </span>
                    )}
                    {(taskDetail.notifyChats?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-border rounded text-foreground">
                        <Bell className="h-3 w-3" /> {t("staffing.roles.notifiesChats").replace("{count}", String(taskDetail.notifyChats.length))}
                      </span>
                    )}
                  </div>
                )}

                {canEdit && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const tsk = taskDetail;
                        setTaskDetail(null);
                        setTaskForm({ title: tsk.title, description: tsk.description, hasTime: !!(tsk.startTime && tsk.endTime), startTime: tsk.startTime ?? "08:00", endTime: tsk.endTime ?? "10:00", requiresEvidence: tsk.requiresEvidence ?? false, notifyChats: tsk.notifyChats ?? [] });
                        setTaskDialog({ open: true, task: tsk });
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> {t("staffing.roles.editTask")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => { const id = taskDetail.id; setTaskDetail(null); await handleDeleteTask(id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DynamicUIElementContent>
        </DynamicUIElement>
      </div>
      {/* ─── Add / Edit Shift DynamicUIElement (7shifts-style) ─────────────── */}
      <DynamicUIElement open={addDialog} onOpenChange={(open) => { setAddDialog(open); if (!open) setEditingShift(null); }}>
        <DynamicUIElementContent className="max-w-md" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={editingShift ? t("staffing.shiftDialog.editTitle") : t("staffing.shiftDialog.createTitle")}>
              {editingShift ? t("staffing.shiftDialog.editTitle") : t("staffing.shiftDialog.createTitle")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">
              {editingShift ? t("staffing.shiftDialog.editDescription") : t("staffing.shiftDialog.createDescription")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>

          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {/* Top section — date & time */}
              <div className="px-4 pt-2 pb-4 space-y-4">
                {/* Date */}
                <div className="flex items-center gap-3 py-2 border-b border-border">
                  <Input
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0"
                  />
                </div>

                {/* Time range */}
                <div className="flex items-center gap-2 py-2 border-b border-border">
                  <Input
                    type="time"
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({(() => {
                      const h = shiftDurationHours(shiftForm.startTime, shiftForm.endTime);
                      return h % 1 === 0 ? `${h}hr` : `${h.toFixed(1)}hr`;
                    })()})
                  </span>
                </div>

                {/* Time Template */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Eyebrow as="span">{t("staffing.shiftDialog.timeTemplate")}</Eyebrow>
                    {canEdit && (
                      <button
                        onClick={() => { setEditingPreset(null); setPresetForm({ name: "", startTime: shiftForm.startTime, endTime: shiftForm.endTime, color: "#44403c" }); setPresetDialog(true); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> {t("staffing.shiftDialog.addTemplate")}
                      </button>
                    )}
                  </div>
                  {allPresets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("staffing.shiftDialog.noTemplatesYet")}</p>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {allPresets.map((p) => {
                        const active = shiftForm.startTime === p.startTime && shiftForm.endTime === p.endTime;
                        return (
                          <div key={p.id} className="relative group">
                            <button
                              onClick={() => setShiftForm((f) => ({ ...f, startTime: p.startTime, endTime: p.endTime }))}
                              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded transition-all text-center ${
                                active ? "text-white" : "text-muted-foreground bg-muted hover:bg-muted/80"
                              }`}
                              style={active ? { backgroundColor: p.color } : undefined}
                            >
                              <div>{p.name}</div>
                              <div className={`text-[9px] font-normal ${active ? "text-white/70" : "text-muted-foreground/60"}`}>{formatTime(p.startTime)}–{formatTime(p.endTime)}</div>
                            </button>
                            {canEdit && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletePresetConfirm(p.id); }}
                                className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center hover:bg-destructive transition-colors"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-2 bg-muted/50" />

              {/* Bottom section — employee, role, notes */}
              <div className="px-4 py-4 space-y-4">
                {/* Employee & Role side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.assignEmployee")}</Label>
                    <Select
                      value={shiftForm.memberId}
                      onValueChange={(v) => setShiftForm((f) => ({ ...f, memberId: v ?? "" }))}
                    >
                      <SelectTrigger className="mt-1 border-0 border-b border-border rounded-none px-0 shadow-none focus:ring-0">
                        <SelectValue placeholder={t("staffing.shiftDialog.selectPlaceholder")}>
                          {team.find((m) => m.id === shiftForm.memberId)?.displayName ?? t("staffing.shiftDialog.selectPlaceholder")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {team.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.rolesLabel")}</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {roles.map((r) => {
                        const selected = shiftForm.roleNames.includes(r.name);
                        return (
                          <button
                            key={r.id}
                            onClick={() => setShiftForm((f) => ({
                              ...f,
                              roleNames: selected
                                ? f.roleNames.filter((n) => n !== r.name)
                                : [...f.roleNames, r.name],
                            }))}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                              selected
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selected ? "white" : r.color }} />
                            {r.name}
                          </button>
                        );
                      })}
                      {canEdit && (
                        <button onClick={() => { setEditingRole(null); setRoleForm({ name: "", color: "#44403c", description: "", icon: "briefcase", permissions: {} as StaffRolePermissions }); setRoleDialog(true); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-dashed border-border text-muted-foreground rounded hover:bg-muted transition-colors">
                          <Plus className="h-3 w-3" /> {t("staffing.roles.addRole")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Shift notes */}
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("staffing.shiftDialog.shiftNotes")}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("staffing.shiftDialog.shiftNotesHint")}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="px-4 py-4 border-t border-border mt-auto">
              <Button
                onClick={handleAddShift}
                disabled={saving || (!editingShift && !shiftForm.memberId)}
                className="w-full h-12 text-sm font-semibold"
              >
                {saving ? <Spinner size={16} /> : editingShift ? t("staffing.shiftDialog.saveCta") : t("staffing.shiftDialog.createCta")}
              </Button>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Role DynamicUIElement ─────────────────────────────────────────── */}
      <DynamicUIElement open={roleDialog} onOpenChange={(open) => { setRoleDialog(open); if (!open) setEditingRole(null); }}>
        <DynamicUIElementContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{editingRole ? t("staffing.roleDialog.editTitle") : t("staffing.roleDialog.addTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>
              {editingRole ? t("staffing.roleDialog.editDescription") : t("staffing.roleDialog.addDescription")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4 py-1">
            {/* Icon picker */}
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.icon")}</Label>
              <div className="grid grid-cols-8 gap-1">
                {ROLE_ICON_LIST.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setRoleForm((f) => ({ ...f, icon: iconName }))}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${
                      roleForm.icon === iconName
                        ? "border-2 border-foreground bg-muted"
                        : "border border-transparent bg-muted hover:bg-muted/80"
                    }`}
                    title={iconName}
                  >
                    <RoleIconComp name={iconName} className="h-4 w-4 text-foreground" />
                  </button>
                ))}
              </div>
            </div>

            {/* Role name */}
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.roleName")}</Label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("staffing.roleDialog.roleNamePlaceholder")}
              />
            </div>

            {/* Color picker */}
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.color")}</Label>
              <RoleColorPicker
                value={roleForm.color}
                onChange={(c) => setRoleForm((f) => ({ ...f, color: c }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>{t("staffing.roleDialog.description")}</Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("staffing.roleDialog.descriptionPlaceholder")}
                className="resize-none text-sm"
                rows={2}
              />
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> {t("staffing.roleDialog.permissionsLabel")}
              </Label>
              <div className="space-y-0.5">
                {ROLE_PERMISSION_KEYS.map(({ key, tKey }) => (
                  <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions[key] === true}
                      onChange={() =>
                        setRoleForm((f) => ({
                          ...f,
                          permissions: { ...f.permissions, [key]: !f.permissions[key] },
                        }))
                      }
                      className="h-4 w-4 accent-foreground cursor-pointer"
                    />
                    <span className="text-sm">{t(tKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogActions
            divider={false}
            className="pt-1"
            onCancel={() => setRoleDialog(false)}
            onConfirm={handleSaveRole}
            saving={saving}
            disabled={!roleForm.name}
            cancelLabel={t("common.cancel")}
            confirmLabel={editingRole ? t("staffing.roleDialog.saveCta") : t("staffing.roleDialog.addCta")}
          />
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Add/Edit Task DynamicUIElement ────────────────────────────────── */}
      <DynamicUIElement open={taskDialog.open} onOpenChange={(open) => { if (!open) setTaskDialog({ open: false, task: null }); }}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{taskDialog.task ? t("staffing.taskDialog.editTitle") : t("staffing.taskDialog.addTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>
              {taskDialog.task ? t("staffing.taskDialog.editDescription") : t("staffing.taskDialog.addDescription")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>{t("staffing.taskDialog.taskTitle")}</Label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("staffing.taskDialog.taskTitlePlaceholderAlt")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.taskDialog.details")} <span className="text-muted-foreground font-normal">{t("staffing.taskDialog.optional")}</span></Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("staffing.taskDialog.detailsPlaceholder")}
                className="resize-none text-sm"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("staffing.taskDialog.timeWindow")}</Label>
              <Switch size="sm" checked={taskForm.hasTime} onCheckedChange={() => setTaskForm((f) => ({ ...f, hasTime: !f.hasTime }))} />
            </div>
            {taskForm.hasTime && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("staffing.taskDialog.startTime")}</Label>
                  <Input
                    type="time"
                    value={taskForm.startTime}
                    onChange={(e) => setTaskForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("staffing.taskDialog.endTime")}</Label>
                  <Input
                    type="time"
                    value={taskForm.endTime}
                    onChange={(e) => setTaskForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("staffing.taskDialog.requireEvidence")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("staffing.taskDialog.requireEvidenceHint")}</p>
              </div>
              <Switch size="sm" checked={taskForm.requiresEvidence} onCheckedChange={() => setTaskForm((f) => ({ ...f, requiresEvidence: !f.requiresEvidence }))} />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("staffing.taskDialog.notifyChat")}
                {taskForm.requiresEvidence && <span className="text-destructive ml-1">*</span>}
              </Label>
              <p className="text-xs text-muted-foreground">
                {taskForm.requiresEvidence
                  ? t("staffing.taskDialog.notifyChatRequired")
                  : t("staffing.taskDialog.notifyChatHint")}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {chatOptions.filter((c) => c.type === "group").map((c) => {
                  const selected = taskForm.notifyChats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setTaskForm((f) => ({
                        ...f,
                        notifyChats: selected
                          ? f.notifyChats.filter((id) => id !== c.id)
                          : [...f.notifyChats, c.id],
                      }))}
                      className={`px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {c.name ?? t("staffing.unnamed")}
                    </button>
                  );
                })}
                {chatOptions.filter((c) => c.type === "group").length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("staffing.taskDialog.noGroupChats")}</p>
                )}
              </div>
            </div>
          </div>
          <DialogActions
            divider={false}
            className="pt-1"
            onCancel={() => setTaskDialog({ open: false, task: null })}
            onConfirm={handleSaveTask}
            saving={savingTask}
            disabled={!taskForm.title || (taskForm.requiresEvidence && taskForm.notifyChats.length === 0)}
            cancelLabel={t("common.cancel")}
            confirmLabel={taskDialog.task ? t("staffing.taskDialog.saveCta") : t("staffing.taskDialog.addCta")}
          />
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── View Role Tasks DynamicUIElement (read-only for staff) ─────────── */}
      <DynamicUIElement open={viewTasksDialog.open} onOpenChange={(open) => { if (!open) setViewTasksDialog({ open: false, role: null }); }}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle className="flex items-center gap-2">
              {viewTasksDialog.role && (
                <div className="h-6 w-6 flex items-center justify-center" style={{ color: viewTasksDialog.role.color }}>
                  <RoleIconComp name={viewTasksDialog.role.icon} className="h-4 w-4" />
                </div>
              )}
              {t("staffing.roles.roleTasksTitle").replace("{role}", viewTasksDialog.role?.name ?? t("staffing.roles.rolePlaceholder"))}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription>
              {viewTasksDialog.role?.description || t("staffing.roles.roleTasksDefaultDesc")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>
          {viewTasksDialog.role && (
            <div className="py-1">
              {(roleTasksCache[viewTasksDialog.role.id] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("staffing.roles.noTasksDefined")}</p>
              ) : (
                <div className="space-y-0 pl-3 border-l-2" style={{ borderColor: viewTasksDialog.role.color }}>
                  {(roleTasksCache[viewTasksDialog.role.id] ?? []).map((task) => (
                    <div key={task.id} className="relative pl-4 pb-4">
                      <div
                        className="absolute -left-[5px] top-1 h-2 w-2 rounded-full border-2 bg-background"
                        style={{ borderColor: viewTasksDialog.role!.color }}
                      />
                      {task.startTime && task.endTime && (
                        <p className="font-mono tabular-nums text-[11px] text-muted-foreground leading-none mb-0.5">
                          {formatTime(task.startTime)} – {formatTime(task.endTime)}
                        </p>
                      )}
                      <p className="text-sm font-semibold text-foreground leading-snug">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button variant="outline" onClick={() => setViewTasksDialog({ open: false, role: null })}>{t("staffing.viewTasksDialog.closeCta")}</Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Trade Shift DynamicUIElement ───────────────────────────────────── */}
      <DynamicUIElement open={tradeDialog.open} onOpenChange={(open) => { if (!open) setTradeDialog({ open: false, shift: null }); }}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{t("staffing.tradeDialog.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("staffing.tradeDialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          {tradeDialog.shift && (
            <div className="space-y-4 py-1">
              {/* Your shift */}
              <div className="bg-muted border border-border p-3">
                <Eyebrow className="mb-1">{t("staffing.tradeDialog.yourShift")}</Eyebrow>
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(tradeDialog.shift.date + "T00:00:00", { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(tradeDialog.shift.startTime)} – {formatTime(tradeDialog.shift.endTime)}
                  &nbsp;&middot;&nbsp;{currentOrg?.name ?? t("staffing.store")}
                </p>
              </div>

              {/* Broadcast or specific */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTradeMode("broadcast")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                    tradeMode === "broadcast" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  {t("staffing.tradeDialog.offerToEveryone")}
                </button>
                <button
                  onClick={() => setTradeMode("specific")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                    tradeMode === "specific" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  {t("staffing.tradeDialog.pickSpecificPeople")}
                </button>
              </div>

              {tradeMode === "broadcast" && (
                <p className="text-xs text-muted-foreground px-1">{t("staffing.tradeDialog.broadcastHint")}</p>
              )}

              {/* Filters + Coworker list — only show for specific mode */}
              {tradeMode === "specific" && (<>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("staffing.tradeDialog.filterByDate")}</Label>
                  <Input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("staffing.tradeDialog.searchCoworkers")}</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={tradeSearch}
                      onChange={(e) => setTradeSearch(e.target.value)}
                      placeholder={t("staffing.tradeDialog.namePlaceholder")}
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Coworker list */}
              <div className="border border-border divide-y divide-border max-h-48 overflow-y-auto">
                {filteredCoworkers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("staffing.tradeDialog.noCoworkers")}</p>
                ) : (
                  filteredCoworkers.flatMap((c) =>
                    (tradeDate
                      ? c.shifts.filter((s) => s.date === tradeDate)
                      : c.shifts
                    ).map((s) => {
                      const key = `${c.memberId}:${s.id}`;
                      const selected = selectedTradeTarget?.shiftId === s.id;
                      const coworkerMember = team.find((m) => m.id === c.memberId);
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                            selected ? "bg-muted" : "hover:bg-muted"
                          }`}
                        >
                          <input
                            type="radio"
                            name="tradeTarget"
                            checked={selected}
                            onChange={() => setSelectedTradeTarget({ memberId: c.memberId, shiftId: s.id })}
                            className="accent-foreground shrink-0"
                          />
                          <StaffAvatar name={c.name} avatarUrl={coworkerMember?.avatarUrl} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateShort(s.date, formatDate)} &middot; {formatTime(s.startTime)}–{formatTime(s.endTime)}
                            </p>
                          </div>
                          <span className="h-2 w-2 rounded-full shrink-0 bg-foreground" />
                        </label>
                      );
                    })
                  )
                )}
              </div>
              </>)}
            </div>
          )}
          <DialogActions
            divider={false}
            className="pt-1"
            onCancel={() => setTradeDialog({ open: false, shift: null })}
            onConfirm={handleTradeRequest}
            saving={savingTrade}
            disabled={tradeMode === "specific" && !selectedTradeTarget}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("staffing.tradeDialog.sendRequest")}
          />
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Find Cover DynamicUIElement ────────────────────────────────────── */}
      <DynamicUIElement open={coverDialog.open} onOpenChange={(open) => { if (!open) setCoverDialog({ open: false, shift: null }); }}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{t("staffing.coverDialog.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("staffing.coverDialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          {coverDialog.shift && (
            <div className="space-y-4 py-1">
              {/* Your shift */}
              <div className="bg-muted border border-border p-3">
                <Eyebrow className="mb-1">{t("staffing.coverDialog.yourShift")}</Eyebrow>
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(coverDialog.shift.date + "T00:00:00", { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(coverDialog.shift.startTime)} – {formatTime(coverDialog.shift.endTime)}
                  &nbsp;&middot;&nbsp;{currentOrg?.name ?? t("staffing.store")}
                </p>
              </div>

              {/* Team list */}
              <div className="border border-border divide-y divide-border max-h-52 overflow-y-auto">
                {team.filter((m) => m.id !== myMemberId).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("staffing.coverDialog.noOtherMembers")}</p>
                ) : (
                  team
                    .filter((m) => m.id !== myMemberId)
                    .map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          selectedCover === m.id ? "bg-muted" : "hover:bg-muted"
                        }`}
                      >
                        <input
                          type="radio"
                          name="coverTarget"
                          checked={selectedCover === m.id}
                          onChange={() => setSelectedCover(m.id)}
                          className="accent-foreground shrink-0"
                        />
                        <StaffAvatar name={m.displayName} avatarUrl={m.avatarUrl} size={28} />
                        <p className="text-sm font-medium text-foreground">{m.displayName}</p>
                      </label>
                    ))
                )}
              </div>
            </div>
          )}
          <DialogActions
            divider={false}
            className="pt-1"
            onCancel={() => setCoverDialog({ open: false, shift: null })}
            onConfirm={handleCoverRequest}
            saving={savingCover}
            disabled={!selectedCover}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("staffing.coverDialog.sendRequest")}
          />
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Availability DynamicUIElement ──────────────────────────────────── */}
      <DynamicUIElement open={availDialog} onOpenChange={setAvailDialog}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{t("staffing.availDialog.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("staffing.availDialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4 py-1">
            {/* Type */}
            <div className="space-y-1.5">
              <Label>{t("staffing.availDialog.type")}</Label>
              <div className="flex border border-border overflow-hidden w-fit">
                {(["permanent", "temporary"] as const).map((tp, i) => (
                  <button
                    key={tp}
                    onClick={() => setAvailForm((f) => ({ ...f, type: tp }))}
                    className={`px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                      i > 0 ? "border-l border-border" : ""
                    } ${
                      availForm.type === tp
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t(`staffing.availDialog.${tp}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range (temporary only) */}
            {availForm.type === "temporary" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("staffing.availDialog.startDate")}</Label>
                  <Input
                    type="date"
                    value={availForm.startDate}
                    onChange={(e) => setAvailForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("staffing.availDialog.endDate")}</Label>
                  <Input
                    type="date"
                    value={availForm.endDate}
                    onChange={(e) => setAvailForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Day selector */}
            <div className="space-y-1.5">
              <Label>{t("staffing.availDialog.availableDays")}</Label>
              <div className="flex gap-1.5">
                {DAY_NAME_KEYS.map((dKey, i) => {
                  const enabled = !!availForm.dayTimes[i]?.enabled;
                  return (
                    <button
                      key={dKey}
                      onClick={() =>
                        setAvailForm((f) => {
                          const base = normalizeDayTimes(f.dayTimes);
                          const dayTimes = base.map((dt, j) => j === i ? { ...dt, enabled: !dt.enabled } : dt);
                          return { ...f, dayTimes };
                        })
                      }
                      className={`flex-1 py-1.5 text-xs font-semibold border transition-colors ${
                        enabled
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {t(dKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>{t("staffing.availDialog.status")}</Label>
              <Select
                value={availForm.status}
                onValueChange={(v) => setAvailForm((f) => ({ ...f, status: v ?? f.status }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">{t("staffing.availDialog.available")}</SelectItem>
                  <SelectItem value="unavailable">{t("staffing.availDialog.unavailable")}</SelectItem>
                  <SelectItem value="preferred">{t("staffing.availDialog.preferred")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Per-day time settings */}
            <div className="space-y-2">
              {availForm.dayTimes.map((dt, i) => {
                if (!dt.enabled) return null;
                return (
                  <div key={DAY_NAME_KEYS[i]} className="space-y-1.5 rounded border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{t(DAY_NAME_KEYS[i])}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{t("staffing.availDialog.fullDay")}</span>
                        <Switch size="sm" checked={dt.fullDay} onCheckedChange={() => setAvailForm((f) => {
                          const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, fullDay: !d.fullDay } : d);
                          return { ...f, dayTimes };
                        })} />
                      </div>
                    </div>
                    {!dt.fullDay && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="time" value={dt.startTime} className="h-8 text-xs" onChange={(e) => setAvailForm((f) => {
                          const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, startTime: e.target.value } : d);
                          return { ...f, dayTimes };
                        })} />
                        <Input type="time" value={dt.endTime} className="h-8 text-xs" onChange={(e) => setAvailForm((f) => {
                          const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, endTime: e.target.value } : d);
                          return { ...f, dayTimes };
                        })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Comments */}
            <div className="space-y-1.5">
              <Label>{t("staffing.availDialog.comments")}</Label>
              <Textarea
                value={availForm.comments}
                onChange={(e) => setAvailForm((f) => ({ ...f, comments: e.target.value }))}
                placeholder={t("staffing.availDialog.commentsPlaceholder")}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogActions
            divider={false}
            className="pt-1"
            onCancel={() => setAvailDialog(false)}
            onConfirm={handleSaveAvailability}
            saving={savingAvail}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("staffing.availDialog.saveCta")}
          />
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Time Off Request DynamicUIElement ──────────────────────────────── */}
      <DynamicUIElement open={timeOffDialog} onOpenChange={setTimeOffDialog}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{t("staffing.timeOffDialog.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("staffing.timeOffDialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4 py-1">
            {/* Full Days toggle */}
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">{t("staffing.timeOffDialog.fullDays")}</Label>
              <Switch size="sm" checked={timeOffForm.fullDays} onCheckedChange={() => setTimeOffForm((f) => ({ ...f, fullDays: !f.fullDays }))} />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("staffing.timeOffDialog.startDate")}</Label>
                <Input
                  type="date"
                  value={timeOffForm.startDate}
                  onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("staffing.timeOffDialog.endDate")}</Label>
                <Input
                  type="date"
                  value={timeOffForm.endDate}
                  onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Times (if not full days) */}
            {!timeOffForm.fullDays && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("staffing.timeOffDialog.startTime")}</Label>
                  <Input
                    type="time"
                    value={timeOffForm.startTime}
                    onChange={(e) => setTimeOffForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("staffing.timeOffDialog.endTime")}</Label>
                  <Input
                    type="time"
                    value={timeOffForm.endTime}
                    onChange={(e) => setTimeOffForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-1.5">
              <Label>{t("staffing.timeOffDialog.comments")}</Label>
              <Textarea
                value={timeOffForm.comments}
                onChange={(e) => setTimeOffForm((f) => ({ ...f, comments: e.target.value }))}
                placeholder={t("staffing.timeOffDialog.commentsPlaceholder")}
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <Button
            onClick={handleTimeOffRequest}
            disabled={savingTimeOff || !timeOffForm.startDate || !timeOffForm.endDate}
            className="w-full mt-1"
          >
            {savingTimeOff ? <Spinner size={16} /> : t("staffing.timeOffDialog.submitCta")}
          </Button>
        </DynamicUIElementContent>
      </DynamicUIElement>
      {/* ─── Delete Preset Confirm ─────────────────────────────── */}
      <AlertDialog open={!!deletePresetConfirm} onOpenChange={(open) => { if (!open) setDeletePresetConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("staffing.deletePresetDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("staffing.deletePresetDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePresetConfirm(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePresetConfirm) handleDeletePreset(deletePresetConfirm);
                setDeletePresetConfirm(null);
              }}
            >
              {t("staffing.deletePresetDialog.deleteCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Shift Preset DynamicUIElement ──────────────────────────────── */}
      <DynamicUIElement open={presetDialog} onOpenChange={(open) => { if (!open) { setPresetDialog(false); setEditingPreset(null); } }}>
        <DynamicUIElementContent className="max-w-xs">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{editingPreset ? t("staffing.presetDialog.editTitle") : t("staffing.presetDialog.addTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("staffing.presetDialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>{t("staffing.presetDialog.name")}</Label>
              <Input value={presetForm.name} onChange={(e) => setPresetForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("staffing.presetDialog.namePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("staffing.presetDialog.startTime")}</Label>
                <Input type="time" value={presetForm.startTime} onChange={(e) => setPresetForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("staffing.presetDialog.endTime")}</Label>
                <Input type="time" value={presetForm.endTime} onChange={(e) => setPresetForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.presetDialog.color")}</Label>
              <div className="flex gap-2 flex-wrap">
                {["#44403c", "#dc2626", "#ea580c", "#d97706", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setPresetForm((f) => ({ ...f, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${presetForm.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between pt-1">
            <div>
              {editingPreset && (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { handleDeletePreset(editingPreset.id); setPresetDialog(false); setEditingPreset(null); }}>
                  {t("staffing.presetDialog.deleteCta")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPresetDialog(false); setEditingPreset(null); }}>{t("common.cancel")}</Button>
              <Button onClick={handleSavePreset} disabled={!presetForm.name}>
                {editingPreset ? t("staffing.presetDialog.saveCta") : t("staffing.presetDialog.createCta")}
              </Button>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Export Schedule DynamicUIElement ─────────────────────────── */}
      <DynamicUIElement open={downloadDialog} onOpenChange={(open) => { if (!open) setDownloadDialog(false); }}>
        <DynamicUIElementContent className="max-w-xs">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{t("staffing.exportDialog.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("staffing.exportDialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>{t("staffing.exportDialog.startDate")}</Label>
              <Input type="date" value={downloadRange.start} onChange={(e) => setDownloadRange((r) => ({ ...r, start: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.exportDialog.endDate")}</Label>
              <Input type="date" value={downloadRange.end} onChange={(e) => setDownloadRange((r) => ({ ...r, end: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffing.exportDialog.format")}</Label>
              <div className="flex border border-border overflow-hidden w-fit rounded">
                {(["pdf", "png", "csv"] as const).map((fmt, i) => (
                  <button key={fmt} onClick={() => setDownloadFormat(fmt)}
                    className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${i > 0 ? "border-l border-border" : ""} ${downloadFormat === fmt ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >{fmt === "csv" ? "CSV" : fmt.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDownloadDialog(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={!downloadRange.start || !downloadRange.end || downloadRange.start > downloadRange.end}
              onClick={() => {
                setDownloadDialog(false);
                const { start, end } = downloadRange;
                if (downloadFormat === "pdf") handleDownloadPDF(start, end);
                else if (downloadFormat === "png") handleDownloadPNG(start, end);
                else handleDownloadCSV(start, end);
              }}
            >
              <Download className="h-4 w-4 mr-1.5" /> {t("staffing.exportDialog.exportCta")}
            </Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Shift Details DynamicUIElement ─────────────────────────────── */}
      {shiftDetailShift && (() => {
        const s = shiftDetailShift;
        const dateLabel = formatDate(s.date + "T00:00:00", { weekday: "short", month: "short", day: "numeric" });
        const matchedRoles = (s.staffRoles ?? [])
          .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
          .filter(Boolean) as StaffRole[];
        // Coworkers: same date, same org, different member
        const coworkerShifts = shifts.filter(
          (cs) => cs.date === s.date && cs.memberId !== myMemberId && cs.memberId !== null
        );
        return (
          <DynamicUIElement open onOpenChange={(open) => { if (!open) setShiftDetailShift(null); }}>
            <DynamicUIElementContent className="max-w-sm p-0 overflow-hidden">
              <DynamicUIElementHeader className="sr-only">
                <DynamicUIElementTitle>{t("staffing.shiftDetails.title")}</DynamicUIElementTitle>
                <DynamicUIElementDescription>{t("staffing.shiftDetails.descriptionPrefix").replace("{date}", dateLabel)}</DynamicUIElementDescription>
              </DynamicUIElementHeader>

              {/* Top section */}
              <div className="px-5 pt-5 pb-4 space-y-3">
                <Eyebrow>{dateLabel}</Eyebrow>
                <p className="text-3xl font-bold font-mono tabular-nums tracking-tight text-foreground">
                  {formatTime(s.startTime)}<span className="text-muted-foreground mx-2">→</span>{formatTime(s.endTime)}
                </p>

                {/* Shift type + roles */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: SHIFT_COLORS[s.shiftType] }}
                  />
                  <span className="text-sm text-foreground">{currentOrg?.name ?? t("staffing.store")} · {t(SHIFT_LABEL_KEYS[s.shiftType])}</span>
                  {matchedRoles.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1.5">
                      <span className="text-muted-foreground">·</span>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-medium text-muted-foreground">{r.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Working with */}
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2.5">{t("staffing.shiftDetails.workingWith")}</p>
                {coworkerShifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("staffing.shiftDetails.noOtherStaff")}</p>
                ) : (
                  <div className="space-y-2.5">
                    {coworkerShifts.map((cs) => {
                      const member = team.find((m) => m.id === cs.memberId);
                      const name = member?.displayName ?? cs.staffName ?? t("staffing.staff");
                      const cwRoles = (cs.staffRoles ?? [])
                        .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                        .filter(Boolean) as StaffRole[];
                      return (
                        <div key={cs.id} className="flex items-center gap-2.5">
                          <StaffAvatar name={name} avatarUrl={member?.avatarUrl} size={28} shape="square" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{formatTime(cs.startTime)}–{formatTime(cs.endTime)}</span>
                              {cwRoles.slice(0, 2).map((r) => (
                                <span key={r.id} className="inline-flex items-center gap-1">
                                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                                  <span className="text-[11px] text-muted-foreground">{r.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Today's tasks for this shift */}
              {s.date === todayStr && todayTasks.length > 0 && (
                <div className="border-t border-border px-5 py-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">{t("staffing.shiftDetails.tasks")}</p>
                    <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 border border-border">
                      {t("staffing.shiftDetails.tasksDone")
                        .replace("{done}", String(todayTasks.filter((tk) => taskCompletions[tk.id]).length))
                        .replace("{total}", String(todayTasks.length))}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {todayTasks.map((task) => {
                      const done = !!taskCompletions[task.id];
                      return (
                        <button
                          key={task.id}
                          onClick={() => toggleTaskDone(task.id)}
                          className="flex items-start gap-2.5 w-full text-left py-1 hover:bg-muted -mx-1 px-1 transition-colors"
                        >
                          <div className={`mt-0.5 h-4 w-4 shrink-0 border flex items-center justify-center transition-colors ${done ? "bg-foreground border-foreground" : "border-muted-foreground"}`}>
                            {done && <Check className="h-2.5 w-2.5 text-background" />}
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            {task.startTime && task.endTime && (
                              <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular-nums">
                                {task.startTime.slice(0, 5)}–{task.endTime.slice(0, 5)}
                              </span>
                            )}
                            <span className={`text-sm leading-snug ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {task.title}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="border-t border-border p-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => { openCoverDialog(s); }}
                >
                  <UserPlus className="h-4 w-4 mr-2" /> {t("staffing.shiftDetails.findCover")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { openTradeDialog(s); }}
                >
                  <ArrowLeftRight className="h-4 w-4 mr-2" /> {t("staffing.shiftDetails.tradeShift")}
                </Button>
              </div>
            </DynamicUIElementContent>
          </DynamicUIElement>
        );
      })()}

      <DynamicUIElement open={notifPanelOpen} onOpenChange={setNotifPanelOpen}>
        <DynamicUIElementContent side="right">
          <DynamicUIElementTitle mobileTitle="Notifications">Notifications</DynamicUIElementTitle>
          <NotificationPanel
            trades={canEdit ? orgShiftTrades.filter(t => t.status === "pending" || (t.status === "accepted" && !t.managerApproved)) : myPendingTrades}
            timeOff={canEdit ? pendingTimeOff : []}
            shifts={shifts}
            myMemberId={myMemberId}
            canEdit={canEdit}
            getMemberName={getMemberName}
            formatTime={formatTime}
            formatDateShort={(iso: string) => formatDateShort(iso, formatDate)}
            onAcceptTrade={handleStaffAcceptTrade}
            onDenyTrade={(id) => handleTradeStatusUpdate(id, "denied")}
            onManagerApproveTrade={handleManagerApproveTrade}
            onApproveTimeOff={(id) => handleTimeOffStatusUpdate(id, "approved")}
            onDenyTimeOff={(id) => handleTimeOffStatusUpdate(id, "denied")}
          />
        </DynamicUIElementContent>
      </DynamicUIElement>

    </div>
  );
}
