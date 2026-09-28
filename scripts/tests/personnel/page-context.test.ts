import { describe, expect, test } from "bun:test";
import {
  attendanceContext,
  payContext,
  rolesContext,
  scheduleContext,
  teamContext,
  trainingContext,
} from "@/components/personnel/page-context";
import { sanitizePageContext, type MerchivaPageContext } from "@/lib/merchiva/page-context";

// What the Personnel pages tell Mr. Merchiva they show. The page-context store keeps at most 12
// params with keys matching KEY_RE and a 300-char summary, so every builder must fit in that —
// sanitizing must not drop a single param or change the sentence.

const KEY_RE = /^[A-Za-z][\w-]{0,40}$/;
const MEMBER_ID = "5f0c2d4e-8a1b-4c3d-9e2f-0a1b2c3d4e5f";
const ROLE_ID = "0e1d2c3b-4a59-4687-9a0b-1c2d3e4f5a6b";

function expectFits(ctx: MerchivaPageContext): void {
  expect(ctx.summary.length).toBeLessThanOrEqual(300);
  expect(ctx.summary.endsWith(".")).toBe(true);
  const keys = Object.keys(ctx.params ?? {});
  expect(keys.length).toBeLessThanOrEqual(12);
  for (const key of keys) expect(key).toMatch(KEY_RE);
  for (const value of Object.values(ctx.params ?? {})) {
    expect(["string", "number", "boolean"]).toContain(typeof value);
    if (typeof value === "string") expect(value.length).toBeGreaterThan(0);
  }
  const clean = sanitizePageContext(ctx);
  expect(clean?.summary).toBe(ctx.summary);
  expect(Object.keys(clean?.params ?? {})).toEqual(keys);
}

describe("scheduleContext", () => {
  test("desktop week grid: range, counts, no dialog", () => {
    const ctx = scheduleContext({
      view: "week",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      staffCount: 2,
      weekShiftCount: 3,
    });
    expect(ctx.summary).toBe("Schedule, week view of 2026-09-28 to 2026-10-04; 2 active staff; 3 shifts this week.");
    expect(ctx.params).toEqual({
      view: "week",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      staffCount: 2,
      shiftCount: 3,
    });
    expectFits(ctx);
  });

  test("an open edit dialog names the shift and the member by id", () => {
    const ctx = scheduleContext({
      view: "week",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      staffCount: 2,
      weekShiftCount: 1,
      shift: { mode: "edit", shiftId: "shift-1", memberId: MEMBER_ID, memberName: "Muheng Fan", date: "2026-09-29" },
    });
    expect(ctx.summary).toContain("1 shift this week");
    expect(ctx.summary).toContain("editing the shift of Muheng Fan on 2026-09-29");
    expect(ctx.params).toMatchObject({ shiftDialog: "edit", shiftId: "shift-1", memberId: MEMBER_ID, memberName: "Muheng Fan", shiftDate: "2026-09-29" });
    expectFits(ctx);
  });

  test("phone day view with every field set still fits the param budget", () => {
    const ctx = scheduleContext({
      view: "day",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      day: "2026-09-30",
      staffCount: 4,
      weekShiftCount: 9,
      dayShiftCount: 1,
      shift: { mode: "view", shiftId: "shift-2", memberId: MEMBER_ID, memberName: "Sam", date: "2026-09-30" },
    });
    expect(ctx.summary).toBe(
      "Schedule, day view of 2026-09-30 (week 2026-09-28 to 2026-10-04); 4 active staff; 1 shift that day, 9 this week; viewing the shift of Sam on 2026-09-30.",
    );
    expect(Object.keys(ctx.params ?? {})).toHaveLength(12);
    expect(ctx.params?.date).toBe("2026-09-30");
    expectFits(ctx);
  });

  test("a new shift without a member leaves the member out", () => {
    const ctx = scheduleContext({
      view: "week",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      staffCount: 0,
      weekShiftCount: 0,
      shift: { mode: "new", shiftId: null, memberId: null, memberName: null, date: "2026-10-01" },
    });
    expect(ctx.summary).toContain("adding a shift on 2026-10-01");
    expect(ctx.params).not.toHaveProperty("memberId");
    expect(ctx.params).not.toHaveProperty("shiftId");
    expectFits(ctx);
  });

  test("a very long member name is clipped", () => {
    const ctx = scheduleContext({
      view: "week",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      staffCount: 1,
      weekShiftCount: 1,
      shift: { mode: "view", shiftId: "s", memberId: MEMBER_ID, memberName: "x".repeat(500), date: "2026-09-29" },
    });
    expect(ctx.summary).not.toContain("x".repeat(61));
    expectFits(ctx);
  });
});

describe("attendanceContext", () => {
  test("week grid counts and the open punch editor", () => {
    const ctx = attendanceContext({
      view: "week",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      staffCount: 3,
      recorded: 5,
      clockedIn: 1,
      missingClockOut: 1,
      editing: { memberId: MEMBER_ID, memberName: "Muheng Fan", date: "2026-09-29" },
    });
    expect(ctx.summary).toBe(
      "Attendance, week view of 2026-09-28 to 2026-10-04; 3 active staff; 5 attendance records, 1 clocked in now, 1 missing a clock-out; editing the punches of Muheng Fan on 2026-09-29.",
    );
    expect(ctx.params).toMatchObject({ memberId: MEMBER_ID, editDate: "2026-09-29", missingClockOutCount: 1 });
    expectFits(ctx);
  });

  test("phone day view reports the day", () => {
    const ctx = attendanceContext({
      view: "day",
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      day: "2026-09-29",
      staffCount: 3,
      recorded: 1,
      clockedIn: 0,
    });
    expect(ctx.summary).toContain("day view of 2026-09-29");
    expect(ctx.summary).toContain("1 attendance record that day");
    expect(ctx.params).not.toHaveProperty("missingClockOutCount");
    expectFits(ctx);
  });
});

describe("rolesContext", () => {
  test("selected role with its task count, today", () => {
    const ctx = rolesContext({
      roleCount: 3,
      role: { id: ROLE_ID, name: "Cashier", taskCount: 4 },
      statusDate: "2026-09-27",
      today: "2026-09-27",
    });
    expect(ctx.summary).toBe("Roles, 3 roles; selected role Cashier (4 tasks); task completions shown for today.");
    expect(ctx.params).toEqual({ roleId: ROLE_ID, roleName: "Cashier", roleTaskCount: 4, statusDate: "2026-09-27", roleCount: 3 });
    expectFits(ctx);
  });

  test("no selection, an earlier status day", () => {
    const ctx = rolesContext({ roleCount: 1, role: null, statusDate: "2026-09-25", today: "2026-09-27" });
    expect(ctx.summary).toBe("Roles, 1 role; task completions shown for 2026-09-25.");
    expect(ctx.params).not.toHaveProperty("roleId");
    expectFits(ctx);
  });
});

describe("teamContext", () => {
  test("selected member carries the org_member id and punch-code state, never the code", () => {
    const ctx = teamContext({
      view: "graph",
      memberCount: 2,
      inviteCount: 1,
      groupCount: 0,
      search: "",
      selected: {
        kind: "member",
        memberId: MEMBER_ID,
        name: "Muheng Fan",
        role: "Staff",
        status: "active",
        hasPunchInCode: false,
      },
      panel: null,
    });
    expect(ctx.summary).toBe(
      "Team, graph view; 2 members, 1 pending invite; selected member Muheng Fan (Staff, no punch-in code).",
    );
    expect(ctx.params).toMatchObject({
      view: "graph",
      memberId: MEMBER_ID,
      memberName: "Muheng Fan",
      memberRole: "Staff",
      hasPunchInCode: false,
    });
    expectFits(ctx);
  });

  test("an invitation is described without its email", () => {
    const ctx = teamContext({
      view: "list",
      memberCount: 1,
      inviteCount: 1,
      groupCount: 2,
      search: "  sam ",
      selected: { kind: "invite", invitationId: "abc", role: "staff" },
      panel: "invite",
    });
    expect(ctx.summary).toBe(
      'Team, list view; 1 member, 1 pending invite, 2 groups; filtered by "sam"; selected a pending invitation (staff); the invite dialog is open.',
    );
    expect(ctx.params).toMatchObject({ invitationId: "abc", search: "sam", panel: "invite" });
    expect(ctx.params).not.toHaveProperty("memberId");
    expect(JSON.stringify(ctx)).not.toContain("@");
    expectFits(ctx);
  });

  test("a group selection names the group", () => {
    const ctx = teamContext({
      view: "graph",
      memberCount: 4,
      inviteCount: 0,
      groupCount: 1,
      search: "",
      selected: { kind: "group", name: "Kitchen", memberCount: 3 },
      panel: null,
    });
    expect(ctx.summary).toContain("selected group Kitchen (3 members)");
    expect(ctx.params).toMatchObject({ groupName: "Kitchen" });
    expectFits(ctx);
  });
});

describe("payContext", () => {
  test("manager view: period, counts and the open member, no money", () => {
    const ctx = payContext({
      unit: "week",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
      scope: "all",
      staffCount: 4,
      missingRateCount: 1,
      onClockCount: 1,
      detail: { memberId: MEMBER_ID, name: "Muheng Fan" },
    });
    expect(ctx.summary).toBe(
      "Pay, week period 2026-09-21 to 2026-09-27; 4 active staff; 1 with paid time but no hourly rate; 1 on the clock now; pay details open for Muheng Fan.",
    );
    expect(ctx.params).toMatchObject({ unit: "week", periodStart: "2026-09-21", periodEnd: "2026-09-27", memberId: MEMBER_ID });
    expectFits(ctx);
  });

  test("staff view says it is their own pay; a one-day period is a single date", () => {
    const ctx = payContext({
      unit: "day",
      periodStart: "2026-09-27",
      periodEnd: "2026-09-27",
      scope: "self",
      staffCount: 1,
      missingRateCount: 0,
      onClockCount: 0,
    });
    expect(ctx.summary).toBe("Pay, day period 2026-09-27; showing only the viewer's own pay.");
    expect(ctx.params?.scope).toBe("self");
    expectFits(ctx);
  });
});

describe("trainingContext", () => {
  test("names the view and the curriculum size", () => {
    const ctx = trainingContext({ view: "manager", dayCount: 5 });
    expect(ctx.summary).toBe("Training, manager view (editing the curriculum); 5 training days in the curriculum.");
    expect(ctx.params).toEqual({ view: "manager", dayCount: 5 });
    expectFits(ctx);
  });
});
