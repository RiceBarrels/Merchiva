"use client";

import { useMemo } from "react";
import { dateKey } from "@/lib/date-key";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import { useTrainingDays } from "@/lib/spacetimedb/hooks";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  attendanceContext,
  payContext,
  rolesContext,
  scheduleContext,
  teamContext,
  trainingContext,
  type OpenShift,
  type TeamContextInput,
  type TeamSelection,
} from "@/components/personnel/page-context";

/*
 * The Personnel pages describe themselves to Mr. Merchiva (lib/merchiva/page-context.ts).
 *
 * The schedule and roles routes mount their phone and desktop layouts side by side and let CSS
 * hide one, so each hook here publishes only from the layout on screen — two publishers in one
 * tab would overwrite each other. Every hook reduces its input to scalars first and memoizes the
 * context on those; useMerchivaPageContext itself re-publishes only when the context's JSON
 * changes, so a re-render with the same facts sends nothing.
 */

interface MemberLike {
  id: string;
  displayName: string;
}

interface ShiftLike {
  id: string;
  memberId: string | null;
  staffName: string;
  date: string;
}

interface RoleLike {
  id: string;
  name: string;
}

function nameOf(members: readonly MemberLike[], id: string | null): string | null {
  return id ? members.find((m) => m.id === id)?.displayName ?? null : null;
}

function countInRange(shifts: readonly ShiftLike[], from: string, to: string): number {
  let n = 0;
  for (const s of shifts) if (s.date >= from && s.date <= to) n++;
  return n;
}

/** The shift an open dialog or sheet shows, resolved to scalars (or null when none is open). */
function useOpenShift(
  mode: OpenShift["mode"] | null,
  shift: ShiftLike | null,
  memberId: string | null,
  date: string | null,
  members: readonly MemberLike[],
): OpenShift | null {
  const shiftId = shift?.id ?? null;
  const resolvedMemberId = memberId || shift?.memberId || null;
  const memberName = nameOf(members, resolvedMemberId) ?? (shift?.staffName || null);
  const day = date ?? shift?.date ?? null;
  return useMemo(
    () => (mode && day ? { mode, shiftId, memberId: resolvedMemberId, memberName, date: day } : null),
    [mode, shiftId, resolvedMemberId, memberName, day],
  );
}

// ─── Desktop schedule + roles (StaffingDesktop) ─────────────────────────────

/** The add / edit shift dialog of the desktop schedule; `shift` is null when adding one. */
export interface ShiftDialogState {
  shift: ShiftLike | null;
  memberId: string;
  date: string;
}

export function useStaffingDesktopPageContext(input: {
  tab: "schedule" | "attendance" | "roles";
  weekDates: readonly Date[];
  weekShifts: readonly ShiftLike[];
  members: readonly MemberLike[];
  roles: readonly RoleLike[];
  selectedRole: RoleLike | null;
  roleTaskCounts: Readonly<Record<string, number>>;
  statusDate: string;
  todayStr: string;
  shiftDialog: ShiftDialogState | null;
}): void {
  const { tab, statusDate, todayStr, shiftDialog, selectedRole } = input;
  const weekStart = dateKey(input.weekDates[0]);
  const weekEnd = dateKey(input.weekDates[input.weekDates.length - 1]);
  const staffCount = input.members.length;
  const weekShiftCount = input.weekShifts.length;
  const roleCount = input.roles.length;
  const roleId = selectedRole?.id ?? null;
  const roleName = selectedRole?.name ?? null;
  const roleTaskCount = roleId ? input.roleTaskCounts[roleId] ?? 0 : 0;
  const openShift = useOpenShift(
    shiftDialog ? (shiftDialog.shift ? "edit" : "new") : null,
    shiftDialog?.shift ?? null,
    shiftDialog?.memberId ?? null,
    shiftDialog?.date ?? null,
    input.members,
  );

  const context = useMemo(() => {
    if (tab === "schedule") {
      return scheduleContext({ view: "week", weekStart, weekEnd, staffCount, weekShiftCount, shift: openShift });
    }
    if (tab === "roles") {
      const role = roleId && roleName ? { id: roleId, name: roleName, taskCount: roleTaskCount } : null;
      return rolesContext({ roleCount, role, statusDate, today: todayStr });
    }
    // The attendance tab is AttendanceWeek, which describes itself.
    return null;
  }, [tab, weekStart, weekEnd, staffCount, weekShiftCount, openShift, roleCount, roleId, roleName, roleTaskCount, statusDate, todayStr]);

  useMerchivaPageContext(context);
}

// ─── Phone schedule (MobileSchedule) ────────────────────────────────────────

export function useMobileSchedulePageContext(input: {
  view: "shifts" | "attendance";
  /** Managers get the attendance view, which AttendanceWeek describes itself. */
  canManageAttendance: boolean;
  week: readonly Date[];
  day: string;
  members: readonly MemberLike[];
  shifts: readonly ShiftLike[];
  /** The shift whose detail sheet is open. */
  selectedShift: ShiftLike | null;
  /** The add-shift form while its dialog is open. */
  addShift: { memberId: string; date: string } | null;
}): void {
  const isMobile = useIsMobile();
  const { view, canManageAttendance, day, members, shifts, selectedShift, addShift } = input;
  const weekStart = dateKey(input.week[0]);
  const weekEnd = dateKey(input.week[input.week.length - 1]);
  const weekShiftCount = useMemo(() => countInRange(shifts, weekStart, weekEnd), [shifts, weekStart, weekEnd]);
  const dayShiftCount = useMemo(() => countInRange(shifts, day, day), [shifts, day]);
  const openShift = useOpenShift(
    addShift ? "new" : selectedShift ? "view" : null,
    addShift ? null : selectedShift,
    addShift?.memberId ?? null,
    addShift?.date ?? null,
    members,
  );
  const staffCount = members.length;
  const shown = isMobile && !(view === "attendance" && canManageAttendance);

  const context = useMemo(
    () =>
      shown
        ? scheduleContext({
            view: "day",
            weekStart,
            weekEnd,
            day,
            staffCount,
            weekShiftCount,
            dayShiftCount,
            shift: openShift,
          })
        : null,
    [shown, weekStart, weekEnd, day, staffCount, weekShiftCount, dayShiftCount, openShift],
  );

  useMerchivaPageContext(context);
}

// ─── Attendance (AttendanceWeek) ────────────────────────────────────────────

interface AttendanceStats {
  recorded: number;
  stillIn: number;
  missing?: number;
}

export function useAttendancePageContext(input: {
  /** The layout the host shows this instance in; omitted when it is only mounted on screen. */
  shownOn?: "mobile" | "desktop";
  canManage: boolean;
  weekIsos: readonly string[];
  day: string;
  members: readonly MemberLike[];
  weekStats: AttendanceStats;
  dayStats: AttendanceStats;
  editing: { memberId: string; date: string } | null;
}): void {
  const isMobile = useIsMobile();
  const { shownOn, canManage, weekIsos, day, members, editing } = input;
  const shown = canManage && (!shownOn || (shownOn === "mobile") === isMobile);
  // The phone layout lists one day; the desktop one is the member × week grid.
  const view = isMobile ? "day" : "week";
  const stats = view === "day" ? input.dayStats : input.weekStats;
  const weekStart = weekIsos[0] ?? "";
  const weekEnd = weekIsos[weekIsos.length - 1] ?? "";
  const staffCount = members.length;
  const recorded = stats.recorded;
  const clockedIn = stats.stillIn;
  const missingClockOut = view === "week" ? input.weekStats.missing ?? null : null;
  const editMemberId = editing?.memberId ?? null;
  const editMemberName = nameOf(members, editMemberId);
  const editDate = editing?.date ?? null;

  const context = useMemo(
    () =>
      shown
        ? attendanceContext({
            view,
            weekStart,
            weekEnd,
            day,
            staffCount,
            recorded,
            clockedIn,
            missingClockOut,
            editing: editMemberId && editDate ? { memberId: editMemberId, memberName: editMemberName, date: editDate } : null,
          })
        : null,
    [shown, view, weekStart, weekEnd, day, staffCount, recorded, clockedIn, missingClockOut, editMemberId, editMemberName, editDate],
  );

  useMerchivaPageContext(context);
}

// ─── Phone roles (MobileRoles) ──────────────────────────────────────────────

export function useMobileRolesPageContext(input: {
  roleCount: number;
  selectedRole: RoleLike | null;
  selectedTaskCount: number;
  statusDate: string;
  todayStr: string;
}): void {
  const isMobile = useIsMobile();
  const { roleCount, selectedRole, selectedTaskCount, statusDate, todayStr } = input;
  const roleId = selectedRole?.id ?? null;
  const roleName = selectedRole?.name ?? null;

  const context = useMemo(() => {
    if (!isMobile) return null;
    const role = roleId && roleName ? { id: roleId, name: roleName, taskCount: selectedTaskCount } : null;
    return rolesContext({ roleCount, role, statusDate, today: todayStr });
  }, [isMobile, roleCount, roleId, roleName, selectedTaskCount, statusDate, todayStr]);

  useMerchivaPageContext(context);
}

// ─── Team (OrgPanel) ────────────────────────────────────────────────────────

interface TeamNodeLike {
  id: string;
  kind: "person" | "group";
  name: string;
  groupId?: string | null;
  role?: string;
  orgRole?: string;
  status?: string;
  hasPunchCode?: boolean;
}

/** Pending invitations are graph people with this id prefix (use-org-graph.ts). */
const INVITE_NODE_PREFIX = "inv-";

function teamSelection(node: TeamNodeLike | null, nodes: readonly TeamNodeLike[]): TeamSelection | null {
  if (!node) return null;
  if (node.kind === "group") {
    const memberCount = nodes.filter((n) => n.kind === "person" && n.groupId === node.id).length;
    return { kind: "group", name: node.name, memberCount };
  }
  // The stored role, as viewTeam returns it (built-in role names are translated on screen).
  const role = node.orgRole ?? node.role ?? "";
  if (node.id.startsWith(INVITE_NODE_PREFIX)) {
    return { kind: "invite", invitationId: node.id.slice(INVITE_NODE_PREFIX.length), role };
  }
  return {
    kind: "member",
    memberId: node.id,
    name: node.name,
    role,
    status: node.status ?? "active",
    hasPunchInCode: node.hasPunchCode === true,
  };
}

export function useTeamPageContext(input: {
  view: "graph" | "list";
  nodes: readonly TeamNodeLike[];
  search: string;
  selected: TeamNodeLike | null;
  /** The member in the edit dialog; it wins over the canvas selection. */
  editingMemberId: string | null;
  inviteOpen: boolean;
  roleManagerOpen: boolean;
}): void {
  const { view, nodes, search, editingMemberId, inviteOpen, roleManagerOpen } = input;
  const counts = useMemo(() => {
    let members = 0;
    let invites = 0;
    let groups = 0;
    for (const n of nodes) {
      if (n.kind === "group") groups++;
      else if (n.id.startsWith(INVITE_NODE_PREFIX)) invites++;
      else members++;
    }
    return { members, invites, groups };
  }, [nodes]);
  const node = (editingMemberId ? nodes.find((n) => n.id === editingMemberId) : null) ?? input.selected;
  // A drag re-creates the node objects; the published context only changes when the sentence does.
  const selection = useMemo(() => teamSelection(node, nodes), [node, nodes]);
  const panel: TeamContextInput["panel"] = editingMemberId
    ? "editMember"
    : inviteOpen
      ? "invite"
      : roleManagerOpen
        ? "roleManager"
        : null;

  const context = useMemo(
    () =>
      teamContext({
        view,
        memberCount: counts.members,
        inviteCount: counts.invites,
        groupCount: counts.groups,
        search,
        selected: selection,
        panel,
      }),
    [view, counts, search, selection, panel],
  );

  useMerchivaPageContext(context);
}

// ─── Pay (PayrollPanel) ─────────────────────────────────────────────────────

export function usePayPageContext(input: {
  unit: "day" | "week" | "month" | "year";
  /** Period start, and its exclusive end (the next period's first midnight). */
  start: Date;
  end: Date;
  canViewAll: boolean;
  staffCount: number;
  missingRateCount: number;
  onClockCount: number;
  detail: MemberLike | null;
}): void {
  const { unit, canViewAll, staffCount, missingRateCount, onClockCount, detail } = input;
  const periodStart = dateKey(input.start);
  const lastDay = new Date(input.end);
  lastDay.setDate(lastDay.getDate() - 1);
  const periodEnd = dateKey(lastDay);
  const detailId = detail?.id ?? null;
  const detailName = detail?.displayName ?? null;

  const context = useMemo(
    () =>
      payContext({
        unit,
        periodStart,
        periodEnd,
        scope: canViewAll ? "all" : "self",
        staffCount,
        missingRateCount,
        onClockCount,
        detail: detailId && detailName ? { memberId: detailId, name: detailName } : null,
      }),
    [unit, periodStart, periodEnd, canViewAll, staffCount, missingRateCount, onClockCount, detailId, detailName],
  );

  useMerchivaPageContext(context);
}

// ─── Training (personnel/training page) ─────────────────────────────────────

export function useTrainingPageContext(input: {
  orgId: string | null;
  view: "manager" | "trainer" | "intern";
}): void {
  const { orgId, view } = input;
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const dayCount = useMemo(
    () => (rawDays as Array<{ organizationId?: unknown }>).filter((d) => d.organizationId === orgId).length,
    [rawDays, orgId],
  );

  const context = useMemo(() => (orgId ? trainingContext({ view, dayCount }) : null), [orgId, view, dayCount]);

  useMerchivaPageContext(context);
}
