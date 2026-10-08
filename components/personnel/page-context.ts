/*
 * What each Personnel page tells Mr. Merchiva it is showing: one short English sentence plus the
 * facts worth acting on (see lib/merchiva/page-context.ts). Pure, so the wording is unit-tested;
 * the hooks in use-page-context.ts feed it from page state.
 *
 * Ids are the hyphenated uuids the read tools return and the actions take — `memberId` is the
 * org_member id. Nothing here carries pay rates, punch-in codes or emails.
 */

import type { MerchivaPageContext, PageContextValue } from "@/lib/merchiva/page-context";

/** Keeps set values only, so the page-context param budget goes to facts that exist. */
function params(input: Record<string, PageContextValue | undefined>): Record<string, PageContextValue> {
  const out: Record<string, PageContextValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Names are user data; a long one must not crowd the rest of the sentence out. */
function clip(name: string, max = 60): string {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function sentence(parts: readonly string[]): string {
  return `${parts.join("; ")}.`;
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export interface OpenShift {
  /** "new" / "edit": the add or edit shift dialog; "view": the shift's detail sheet. */
  mode: "new" | "edit" | "view";
  shiftId: string | null;
  memberId: string | null;
  memberName: string | null;
  date: string;
}

export interface ScheduleContextInput {
  /** "week": the staff × week grid; "day": one day's shifts under a week strip. */
  view: "week" | "day";
  weekStart: string;
  weekEnd: string;
  /** The day a day view shows. */
  day?: string | null;
  staffCount: number;
  weekShiftCount: number;
  dayShiftCount?: number | null;
  shift?: OpenShift | null;
}

function openShiftPhrase(shift: OpenShift): string {
  const who = shift.memberName ? clip(shift.memberName) : null;
  switch (shift.mode) {
    case "new":
      return who ? `adding a shift for ${who} on ${shift.date}` : `adding a shift on ${shift.date}`;
    case "edit":
      return who ? `editing the shift of ${who} on ${shift.date}` : `editing a shift on ${shift.date}`;
    case "view":
      return who ? `viewing the shift of ${who} on ${shift.date}` : `viewing a shift on ${shift.date}`;
  }
}

export function scheduleContext(input: ScheduleContextInput): MerchivaPageContext {
  const { view, weekStart, weekEnd, shift } = input;
  const day = view === "day" && input.day ? input.day : null;
  const dayShiftCount = day ? input.dayShiftCount ?? null : null;
  const week = `week ${weekStart} to ${weekEnd}`;
  const parts = [
    day ? `Schedule, day view of ${day} (${week})` : `Schedule, week view of ${weekStart} to ${weekEnd}`,
    `${input.staffCount} active staff`,
    dayShiftCount != null
      ? `${count(dayShiftCount, "shift")} that day, ${input.weekShiftCount} this week`
      : `${count(input.weekShiftCount, "shift")} this week`,
  ];
  if (shift) parts.push(openShiftPhrase(shift));
  return {
    summary: sentence(parts),
    params: params({
      view,
      weekStart,
      weekEnd,
      date: day,
      shiftDialog: shift?.mode,
      shiftId: shift?.shiftId,
      memberId: shift?.memberId,
      memberName: shift?.memberName,
      shiftDate: shift?.date,
      staffCount: input.staffCount,
      shiftCount: input.weekShiftCount,
      dayShiftCount,
    }),
  };
}

// ─── Attendance ──────────────────────────────────────────────────────────────

export interface AttendanceContextInput {
  /** "week": the member × week grid; "day": one day's list under a week strip. */
  view: "week" | "day";
  weekStart: string;
  weekEnd: string;
  day?: string | null;
  staffCount: number;
  /** Member-days with a clock-in, in the range shown (the week, or the day). */
  recorded: number;
  clockedIn: number;
  missingClockOut?: number | null;
  /** The member-day whose punches are open in the editor. */
  editing?: { memberId: string; memberName: string | null; date: string } | null;
}

export function attendanceContext(input: AttendanceContextInput): MerchivaPageContext {
  const { view, weekStart, weekEnd, editing } = input;
  const day = view === "day" && input.day ? input.day : null;
  const week = `week ${weekStart} to ${weekEnd}`;
  const records = [
    `${count(input.recorded, "attendance record")}${day ? " that day" : ""}`,
    `${input.clockedIn} clocked in now`,
  ];
  if (input.missingClockOut) records.push(`${input.missingClockOut} missing a clock-out`);
  const parts = [
    day ? `Attendance, day view of ${day} (${week})` : `Attendance, week view of ${weekStart} to ${weekEnd}`,
    `${input.staffCount} active staff`,
    records.join(", "),
  ];
  if (editing) {
    parts.push(
      editing.memberName
        ? `editing the punches of ${clip(editing.memberName)} on ${editing.date}`
        : `editing punches on ${editing.date}`,
    );
  }
  return {
    summary: sentence(parts),
    params: params({
      view,
      weekStart,
      weekEnd,
      date: day,
      memberId: editing?.memberId,
      memberName: editing?.memberName,
      editDate: editing?.date,
      staffCount: input.staffCount,
      recordCount: input.recorded,
      clockedInCount: input.clockedIn,
      missingClockOutCount: input.missingClockOut ?? undefined,
    }),
  };
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface RolesContextInput {
  roleCount: number;
  role?: { id: string; name: string; taskCount: number } | null;
  /** The day whose task completions are shown; today unless the user stepped back. */
  statusDate: string;
  today: string;
}

export function rolesContext(input: RolesContextInput): MerchivaPageContext {
  const { role, statusDate, today } = input;
  const parts = [`Roles, ${count(input.roleCount, "role")}`];
  if (role) parts.push(`selected role ${clip(role.name)} (${count(role.taskCount, "task")})`);
  parts.push(
    statusDate === today ? "task completions shown for today" : `task completions shown for ${statusDate}`,
  );
  return {
    summary: sentence(parts),
    params: params({
      roleId: role?.id,
      roleName: role?.name,
      roleTaskCount: role?.taskCount,
      statusDate,
      roleCount: input.roleCount,
    }),
  };
}

// ─── Team ────────────────────────────────────────────────────────────────────

export type TeamSelection =
  | {
      kind: "member";
      memberId: string;
      name: string;
      role: string;
      status: string;
      hasPunchInCode: boolean;
    }
  | { kind: "invite"; invitationId: string; role: string }
  | { kind: "group"; name: string; memberCount: number };

export interface TeamContextInput {
  view: "graph" | "list";
  memberCount: number;
  inviteCount: number;
  groupCount: number;
  search: string;
  selected: TeamSelection | null;
  /** A dialog or panel open over the page. */
  panel: "editMember" | "invite" | "roleManager" | null;
}

const TEAM_PANEL_PHRASE: Record<NonNullable<TeamContextInput["panel"]>, string> = {
  editMember: "the edit-member dialog is open",
  invite: "the invite dialog is open",
  roleManager: "the role manager is open",
};

function selectionPhrase(selected: TeamSelection): string {
  switch (selected.kind) {
    case "member": {
      const code = selected.hasPunchInCode ? "has a punch-in code" : "no punch-in code";
      const status = selected.status && selected.status !== "active" ? `, ${selected.status}` : "";
      return `selected member ${clip(selected.name)} (${clip(selected.role, 40)}${status}, ${code})`;
    }
    case "invite":
      return `selected a pending invitation (${clip(selected.role, 40)})`;
    case "group":
      return `selected group ${clip(selected.name)} (${count(selected.memberCount, "member")})`;
  }
}

export function teamContext(input: TeamContextInput): MerchivaPageContext {
  const { selected, panel } = input;
  const people = [count(input.memberCount, "member")];
  if (input.inviteCount > 0) people.push(count(input.inviteCount, "pending invite"));
  if (input.groupCount > 0) people.push(count(input.groupCount, "group"));
  const parts = [`Team, ${input.view} view`, people.join(", ")];
  const search = input.search.trim();
  if (search) parts.push(`filtered by "${clip(search, 40)}"`);
  if (selected) parts.push(selectionPhrase(selected));
  if (panel) parts.push(TEAM_PANEL_PHRASE[panel]);
  const member = selected?.kind === "member" ? selected : null;
  return {
    summary: sentence(parts),
    params: params({
      view: input.view,
      memberId: member?.memberId,
      memberName: member?.name,
      memberRole: member?.role,
      memberStatus: member?.status,
      hasPunchInCode: member?.hasPunchInCode,
      invitationId: selected?.kind === "invite" ? selected.invitationId : undefined,
      groupName: selected?.kind === "group" ? selected.name : undefined,
      panel,
      search,
      memberCount: input.memberCount,
      inviteCount: input.inviteCount,
      groupCount: input.groupCount,
    }),
  };
}

// ─── Pay ─────────────────────────────────────────────────────────────────────

export interface PayContextInput {
  unit: "day" | "week" | "month" | "year";
  /** First and last calendar day of the period, inclusive. */
  periodStart: string;
  periodEnd: string;
  /** "self": the viewer sees only their own pay. */
  scope: "all" | "self";
  staffCount: number;
  /** Staff with paid time in the period but no hourly rate set. */
  missingRateCount: number;
  onClockCount: number;
  detail?: { memberId: string; name: string } | null;
}

export function payContext(input: PayContextInput): MerchivaPageContext {
  const { unit, periodStart, periodEnd, detail } = input;
  const range = periodStart === periodEnd ? periodStart : `${periodStart} to ${periodEnd}`;
  const parts = [`Pay, ${unit} period ${range}`];
  if (input.scope === "self") {
    parts.push("showing only the viewer's own pay");
  } else {
    parts.push(`${input.staffCount} active staff`);
    if (input.missingRateCount > 0) {
      parts.push(`${input.missingRateCount} with paid time but no hourly rate`);
    }
  }
  if (input.onClockCount > 0) parts.push(`${input.onClockCount} on the clock now`);
  if (detail) parts.push(`pay details open for ${clip(detail.name)}`);
  return {
    summary: sentence(parts),
    params: params({
      unit,
      periodStart,
      periodEnd,
      memberId: detail?.memberId,
      memberName: detail?.name,
      scope: input.scope,
      staffCount: input.staffCount,
      missingRateCount: input.missingRateCount,
      onClockCount: input.onClockCount,
    }),
  };
}

// ─── Training ────────────────────────────────────────────────────────────────

export interface TrainingContextInput {
  view: "manager" | "trainer" | "intern";
  dayCount: number;
}

const TRAINING_VIEW_PHRASE: Record<TrainingContextInput["view"], string> = {
  manager: "manager view (editing the curriculum)",
  trainer: "trainer view (grading trainees)",
  intern: "trainee view (the viewer's own progress)",
};

export function trainingContext(input: TrainingContextInput): MerchivaPageContext {
  return {
    summary: sentence([
      `Training, ${TRAINING_VIEW_PHRASE[input.view]}`,
      `${count(input.dayCount, "training day")} in the curriculum`,
    ]),
    params: params({ view: input.view, dayCount: input.dayCount }),
  };
}
