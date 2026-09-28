import { describe, expect, test } from "bun:test";
import {
  matchMember,
  matchPreset,
  proposeSchedule,
  proposeScheduleTool,
  resolveConstraints,
  shiftTypeFor,
  type ScheduleInputs,
} from "@/lib/merchiva/tools/propose-schedule";
import { planViolations, restHoursBetween } from "@/lib/merchiva/tools/schedule-plan";
import { getShiftDuration, type ScheduledShift } from "@/lib/scheduler";
import type { OrgMember, Shift, ShiftPreset, StaffAvailability, StaffRole } from "@/lib/types";
import { CALL, fakeConn, fakeCtx, identity, uuid } from "./fixtures";

const TODAY = "2026-09-26"; // Saturday → "next week" starts Mon 2026-09-28
const WEEK = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

const member = (id: string, name: string): OrgMember => ({
  id,
  organizationId: "org-1",
  userId: `u-${id}`,
  role: "staff",
  displayName: name,
  email: `${id}@x.test`,
  permissions: {} as OrgMember["permissions"],
  status: "active",
});
const always = (m: OrgMember): StaffAvailability => ({
  id: `av-${m.id}`,
  userId: m.userId,
  organizationId: "org-1",
  type: "permanent",
  startDate: null,
  endDate: null,
  days: [true, true, true, true, true, true, true],
  dayTimes: [],
  status: "available",
  fullDay: true,
  startTime: null,
  endTime: null,
  comments: "",
});
const preset = (name: string, startTime: string, endTime: string, sortOrder = 0): ShiftPreset => ({
  id: `p-${name}`, organizationId: "org-1", name, startTime, endTime, color: "", sortOrder,
});
const role = (name: string): StaffRole => ({ id: `r-${name}`, name, color: "", icon: "", description: "", permissions: {} as StaffRole["permissions"] });

const ANN = member("m-ann", "Ann Lee");
const BO = member("m-bo", "Bo Chen");
const CY = member("m-cy", "Cy Park");
const DAY = preset("day", "09:00", "17:00");

function inputs(over: Partial<ScheduleInputs> = {}): ScheduleInputs {
  const members = over.members ?? [ANN, BO, CY];
  return {
    today: TODAY,
    members,
    placeholders: [],
    availability: members.map(always),
    timeOff: [],
    shifts: [],
    presets: [DAY],
    roles: [role("Barista")],
    salesHistory: [],
    openingHoursRaw: null,
    ...over,
  };
}

/** A shift already on the schedule. */
const onFile = (memberId: string, date: string, startTime: string, endTime: string): Shift => ({
  id: `s-${memberId}-${date}-${startTime}`, memberId, staffName: "", staffRole: null, staffRoles: ["Barista"], date,
  shiftType: "morning", startTime, endTime, predictedDemand: "medium",
});

const hoursOf = (shifts: { staffName: string; startTime: string; endTime: string }[], name: string) =>
  shifts.filter((s) => s.staffName === name).reduce((h, s) => h + getShiftDuration(s.startTime, s.endTime), 0);

describe("name resolution", () => {
  const team = [ANN, BO, member("m-al", "Alice Wong")];
  test("exact, then unique first name, prefix or substring; ambiguous → null", () => {
    expect(matchMember("ann lee", team)?.id).toBe("m-ann");
    expect(matchMember("Bo", team)?.id).toBe("m-bo");
    expect(matchMember("Chen", team)?.id).toBe("m-bo");
    expect(matchMember("al", team)?.id).toBe("m-al"); // prefix beats substring
    expect(matchMember("e", team)).toBeNull();
    expect(matchMember("Zed", team)).toBeNull();
  });

  test("presets by name, case-insensitive, or the one that contains it", () => {
    const presets = [preset("Morning", "07:00", "13:00"), preset("Evening close", "16:00", "22:00")];
    expect(matchPreset("morning", presets)?.name).toBe("Morning");
    expect(matchPreset("morning shift", presets)?.name).toBe("Morning");
    expect(matchPreset("evening", presets)?.name).toBe("Evening close");
    expect(matchPreset("night", presets)).toBeNull();
  });

  test("addShift shiftType from the preset name or its start time", () => {
    expect(shiftTypeFor("Morning", "07:00")).toBe("morning");
    expect(shiftTypeFor("Late close", "18:00")).toBe("closing");
    expect(shiftTypeFor("Opening", "06:30")).toBe("morning");
    expect(shiftTypeFor("Middle", "13:00")).toBe("afternoon");
    expect(shiftTypeFor("Late", "18:00")).toBe("evening");
  });
});

describe("resolveConstraints", () => {
  test("weekdays and dates become blocked days; unknown people and shifts are reported", () => {
    const r = resolveConstraints(
      {
        unavailable: [{ staffName: "Ann", weekdays: ["Mon", "Sun"] }, { staffName: "Bo", dates: ["2026-10-01"] }, { staffName: "Cy" }, { staffName: "Dee" }],
        maxHours: [{ staffName: "bo chen", hours: 16 }],
        coverage: [
          { shift: "day", staff: 1 },
          { shift: "day", staff: 2, weekdays: ["Sat"] },
          { shift: "night", staff: 1 },
        ],
      },
      WEEK,
      [ANN, BO, CY],
      [DAY],
    );
    expect([...r.blocked.get("m-ann")!]).toEqual(["2026-09-28", "2026-10-04"]);
    expect([...r.blocked.get("m-bo")!]).toEqual(["2026-10-01"]);
    expect(r.blocked.get("m-cy")!.size).toBe(7);
    expect(r.caps.get("m-bo")).toBe(16);
    expect(r.everyDay).toEqual({ day: 1 });
    expect(r.perDay).toEqual([{ date: "2026-10-03", preset: "day", staff: 2 }]);
    expect(r.problems).toHaveLength(2);
    expect(r.problems.join(" ")).toContain("Dee");
    expect(r.problems.join(" ")).toContain("night");
  });
});

describe("proposeSchedule", () => {
  test("defaults to next Monday for 7 days and returns addShift-ready shifts", () => {
    const out = proposeSchedule({ constraints: { coverage: [{ shift: "day", staff: 1 }] } }, inputs());
    expect(out.range).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(out.shifts).toHaveLength(7);
    const optional = new Set(["preset", "warnings"]);
    for (const s of out.shifts) {
      const required = Object.keys(s).filter((k) => !optional.has(k)).sort();
      expect(required).toEqual(["date", "endTime", "memberId", "shiftType", "staffName", "staffRoles", "startTime"]);
      expect(s.shiftType).toBe("morning");
      expect(s.staffRoles).toEqual(["Barista"]); // the org's only role
      expect(s.startTime).toBe("09:00");
    }
    expect(out.uncovered).toEqual([]);
  });

  test("hours rotate across the team instead of piling on the first names", () => {
    const out = proposeSchedule({ constraints: { coverage: [{ shift: "day", staff: 2 }] } }, inputs());
    const hours = [ANN, BO, CY].map((m) => hoursOf(out.shifts, m.displayName));
    expect(out.shifts).toHaveLength(14);
    expect(Math.max(...hours) - Math.min(...hours)).toBeLessThanOrEqual(8);
  });

  test("unavailability is respected", () => {
    const out = proposeSchedule(
      { constraints: { coverage: [{ shift: "day", staff: 2 }], unavailable: [{ staffName: "Ann", weekdays: ["Mon", "Tue"] }] } },
      inputs(),
    );
    const annDays = out.shifts.filter((s) => s.staffName === "Ann Lee").map((s) => s.date);
    expect(annDays).not.toContain("2026-09-28");
    expect(annDays).not.toContain("2026-09-29");
    expect(out.shifts.filter((s) => s.date === "2026-09-28")).toHaveLength(2);
  });

  test("a personal hour cap holds and the slots go to others", () => {
    const out = proposeSchedule(
      { constraints: { coverage: [{ shift: "day", staff: 1 }], maxHours: [{ staffName: "Ann", hours: 16 }] } },
      inputs({ members: [ANN, BO] }),
    );
    expect(hoursOf(out.shifts, "Ann Lee")).toBeLessThanOrEqual(16);
    expect(hoursOf(out.shifts, "Bo Chen")).toBeLessThanOrEqual(40);
    expect(out.shifts).toHaveLength(7);
    expect(out.uncovered).toEqual([]);
    expect(out.hoursByStaff.find((h) => h.staffName === "Ann Lee")?.weeklyCap).toBe(16);
  });

  test("a cap above the everyone-cap is honored for that person only", () => {
    const out = proposeSchedule(
      { constraints: { coverage: [{ shift: "day", staff: 1 }], maxHoursPerWeek: 16, maxHours: [{ staffName: "Bo", hours: 40 }] } },
      inputs({ members: [ANN, BO] }),
    );
    expect(hoursOf(out.shifts, "Ann Lee")).toBeLessThanOrEqual(16);
    expect(hoursOf(out.shifts, "Bo Chen")).toBeLessThanOrEqual(40);
    expect(out.shifts).toHaveLength(7);
  });

  test("day-specific head counts trim and top up; closed days stay empty and are not gaps", () => {
    const hours = JSON.stringify({
      mon: { open: "08:00", close: "18:00" }, tue: { open: "08:00", close: "18:00" }, wed: { open: "08:00", close: "18:00" },
      thu: { open: "08:00", close: "18:00" }, fri: { open: "08:00", close: "18:00" }, sat: { open: "08:00", close: "18:00" },
      sun: { closed: true },
    });
    const out = proposeSchedule(
      {
        constraints: {
          coverage: [
            { shift: "day", staff: 2 },
            { shift: "day", staff: 3, weekdays: ["Sat"] },
            { shift: "day", staff: 1, dates: ["2026-09-30"] },
          ],
        },
      },
      inputs({ openingHoursRaw: hours }),
    );
    const count = (d: string) => out.shifts.filter((s) => s.date === d).length;
    expect(count("2026-09-28")).toBe(2);
    expect(count("2026-09-30")).toBe(1);
    expect(count("2026-10-03")).toBe(3);
    expect(count("2026-10-04")).toBe(0);
    expect(out.uncovered).toEqual([]);
    expect(out.assumptions.join(" ")).toContain("2026-10-04");
  });

  test("gaps are reported when nobody is left, grouped per day and shift", () => {
    const out = proposeSchedule(
      { constraints: { coverage: [{ shift: "day", staff: 2 }], unavailable: [{ staffName: "Bo" }, { staffName: "Cy" }] } },
      inputs(),
    );
    expect(out.shifts.every((s) => s.staffName === "Ann Lee")).toBe(true);
    expect(out.uncovered.reduce((n, g) => n + g.missing, 0)).toBe(7 * 2 - out.shifts.length);
    expect(out.uncovered[0]).toMatchObject({ shift: "day" });
  });

  test("assumes missing availability; warns about pending time off, missing roles and placeholders", () => {
    const out = proposeSchedule(
      {},
      inputs({
        availability: [always(ANN), always(BO)],
        roles: [role("Barista"), role("Cashier")],
        placeholders: ["Temp Tom"],
        timeOff: [{
          id: "t1", userId: BO.userId, organizationId: "org-1", startDate: "2026-09-29", endDate: "2026-09-30",
          fullDays: true, startTime: null, endTime: null, comments: "", status: "pending", reviewedBy: null, reviewedAt: null,
        }],
      }),
    );
    const text = out.warnings.join("\n");
    expect(out.assumptions.join("\n")).toContain("No availability on file for Cy Park — assumed available whenever the store is open");
    expect(out.shifts.some((s) => s.staffName === "Cy Park")).toBe(true);
    expect(text).not.toContain("No availability on file");
    expect(text).toContain("Pending time-off for Bo Chen");
    expect(text).toContain("No job role on file");
    expect(text).toContain("(Barista, Cashier)"); // the roles to pick from, for an /ask card
    expect(text).toContain("Temp Tom");
    expect(out.shifts.every((s) => s.staffRoles.length === 0)).toBe(true);
    expect(out).not.toHaveProperty("rolesToCreate");
  });

  test("a member whose team-page role names a job role gets it", () => {
    const out = proposeSchedule(
      { constraints: { coverage: [{ shift: "day", staff: 2 }] }, days: 1 },
      inputs({ members: [{ ...ANN, role: "cashier" as OrgMember["role"] }, BO], roles: [role("Barista"), role("Cashier")] }),
    );
    const rolesOf = (name: string) => out.shifts.find((s) => s.staffName === name)?.staffRoles;
    expect(rolesOf("Ann Lee")).toEqual(["Cashier"]);
    expect(rolesOf("Bo Chen")).toEqual([]);
  });

  test("no team members: says so instead of returning nothing", () => {
    const out = proposeSchedule({}, inputs({ members: [] }));
    expect(out.shifts).toEqual([]);
    expect(out.warnings.join(" ")).toContain("No team members with an app login");
  });

  test("roles come from the person's shifts, including ones older than a week", () => {
    const old = (memberId: string, date: string, roles: string[]) => ({
      id: `s-${memberId}-${date}`, memberId, staffName: "", staffRole: null, staffRoles: roles, date,
      shiftType: "morning" as const, startTime: "09:00", endTime: "17:00", predictedDemand: "medium" as const,
    });
    const out = proposeSchedule(
      { constraints: { coverage: [{ shift: "day", staff: 3 }] }, days: 1 },
      inputs({
        roles: [role("Barista"), role("Cashier")],
        shifts: [old("m-ann", "2026-08-01", ["Cashier"]), old("m-ann", "2026-08-15", ["Barista", "Retired role"]), old("m-bo", "2026-09-22", ["Cashier"])],
      }),
    );
    const rolesOf = (name: string) => out.shifts.find((s) => s.staffName === name)?.staffRoles;
    expect(rolesOf("Ann Lee")).toEqual(["Barista"]);
    expect(rolesOf("Bo Chen")).toEqual(["Cashier"]);
    expect(rolesOf("Cy Park")).toEqual([]);
    expect(out.warnings.join(" ")).toContain("No job role on file for Cy Park");
  });

  test("existing shifts are kept and counted; past days are skipped", () => {
    const out = proposeSchedule(
      { weekStart: "2026-09-21", constraints: { coverage: [{ shift: "day", staff: 1 }] } },
      inputs({
        shifts: [{
          id: "s1", memberId: "m-ann", staffName: "Ann Lee", staffRole: null, staffRoles: ["Barista"], date: "2026-09-26",
          shiftType: "morning", startTime: "09:00", endTime: "17:00", predictedDemand: "medium",
        }],
      }),
    );
    expect(out.range).toEqual({ start: TODAY, end: "2026-09-27" });
    expect(out.shifts.map((s) => s.date)).toEqual(["2026-09-27"]);
    expect(out.assumptions.join(" ")).toContain("already on the schedule");
  });
});

describe("a store that has set nothing up", () => {
  // The report: "给我排一下班" on a new store — two people, no availability on file, no job roles,
  // no shift presets. The engine used to propose nothing and the model asked for ids and setup.
  const open9to6 = JSON.stringify(
    Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "09:00", close: "18:00" }])),
  );
  const bare = (over: Partial<ScheduleInputs> = {}) =>
    inputs({ members: [ANN, BO], availability: [], presets: [], roles: [], openingHoursRaw: open9to6, ...over });

  test("proposes a usable week: everyone assumed available, shifts fitted to opening hours, one person per shift", () => {
    const out = proposeSchedule({}, bare());
    const monToSat = WEEK.slice(0, 6);
    expect(out.shifts.map((s) => s.date).filter((d, i, all) => all.indexOf(d) === i)).toEqual(monToSat);
    for (const date of monToSat) {
      const day = out.shifts.filter((s) => s.date === date);
      expect(day.map((s) => `${s.startTime}-${s.endTime}`).sort()).toEqual(["09:00-14:00", "13:00-18:00"]);
      expect(new Set(day.map((s) => s.staffName)).size).toBe(2);
    }
    // Both have worked six days in a row by Sunday: that day is a gap, and it says why.
    expect(out.uncovered.map((g) => g.date)).toEqual(["2026-10-04", "2026-10-04"]);
    const assumed = out.assumptions.join("\n");
    expect(assumed).toContain("No availability on file for Ann Lee, Bo Chen — assumed available whenever the store is open (its opening hours)");
    expect(assumed).toContain("fitted to each day's opening hours");
    expect(assumed).toContain("never more per shift than a team of 2");
    expect(out.warnings.join(" ")).not.toContain("availability");
  });

  test("no job roles: every shift uses one new role, to be created first", () => {
    const out = proposeSchedule({}, bare());
    expect(out.rolesToCreate).toEqual([{ name: "Staff", description: "General shift work", icon: "user", color: "#44403c" }]);
    expect(out.shifts.length).toBeGreaterThan(0);
    expect(out.shifts.every((s) => s.staffRoles.length === 1 && s.staffRoles[0] === "Staff")).toBe(true);
    expect(out.assumptions.join(" ")).toContain('emit its addRole block (rolesToCreate) before the addShift blocks');
    expect(out.warnings.join(" ")).not.toContain("No job role on file");
  });

  test("one person, no opening hours: the engine's default shifts, one a day up to the weekly cap", () => {
    const out = proposeSchedule({}, bare({ members: [ANN], openingHoursRaw: null }));
    // Five 7h mornings, then the 5h evening that still fits under 40h; Sunday would be a 7th day in a row.
    expect(out.shifts.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      ...Array(5).fill("07:00-14:00"),
      "17:00-22:00",
    ]);
    expect(out.assumptions.join(" ")).toContain("(opening hours are not set, so any time)");
    expect(out.hoursByStaff).toEqual([{ staffName: "Ann Lee", proposedHours: 40, existingHours: 0, weeklyCap: 40 }]);
  });

  test("head counts the manager set are kept, whatever the team size", () => {
    const out = proposeSchedule({ constraints: { coverage: [{ shift: "morning", staff: 2 }] }, days: 1 }, bare());
    expect(out.shifts.filter((s) => s.startTime === "09:00")).toHaveLength(2);
  });

  test("availability that is on file is still what counts", () => {
    const monOnly: StaffAvailability = { ...always(ANN), days: [false, true, false, false, false, false, false] };
    const out = proposeSchedule({}, bare({ availability: [monOnly] }));
    expect(out.shifts.filter((s) => s.staffName === "Ann Lee").map((s) => s.date)).toEqual(["2026-09-28"]);
    expect(out.assumptions.join(" ")).toContain("No availability on file for Bo Chen —");
  });
});

describe("existing shifts after the planned days", () => {
  // Ann already works Tue-Sat of next week, 8h a day: 40h.
  const annWeek = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"].map((date) => onFile("m-ann", date, "09:00", "17:00"));
  const monday = { weekStart: "2026-09-28", days: 1, constraints: { coverage: [{ shift: "day", staff: 1 }] } };

  test("the rest of the week's hours count toward the weekly cap", () => {
    const alone = proposeSchedule(monday, inputs({ members: [ANN], shifts: annWeek }));
    expect(alone.shifts).toEqual([]);
    expect(alone.uncovered).toHaveLength(1);
    expect(alone.hoursByStaff).toEqual([{ staffName: "Ann Lee", proposedHours: 0, existingHours: 40, weeklyCap: 40 }]);

    const withBo = proposeSchedule(monday, inputs({ members: [ANN, BO], shifts: annWeek }));
    expect(withBo.shifts.map((s) => s.staffName)).toEqual(["Bo Chen"]);
  });

  test("a personal cap counts them too", () => {
    const out = proposeSchedule(
      { ...monday, constraints: { ...monday.constraints, maxHours: [{ staffName: "Ann", hours: 20 }] } },
      inputs({ members: [ANN, BO], shifts: annWeek.slice(0, 2) }), // 16h on file
    );
    expect(out.shifts.map((s) => s.staffName)).toEqual(["Bo Chen"]);
  });

  test("rest before the next day's early shift is kept", () => {
    const req = { weekStart: "2026-09-28", days: 1, constraints: { coverage: [{ shift: "late", staff: 1 }] } };
    const presets = [preset("late", "16:00", "23:00")];
    const early = [onFile("m-ann", "2026-09-29", "06:00", "14:00")];

    const alone = proposeSchedule(req, inputs({ members: [ANN], presets, shifts: early }));
    expect(alone.shifts).toEqual([]);
    expect(alone.uncovered).toMatchObject([{ date: "2026-09-28", shift: "late", missing: 1 }]);
    expect(alone.warnings.join(" ")).toContain("Ann Lee kept off 2026-09-28: less than 10h rest");

    const withBo = proposeSchedule(req, inputs({ members: [ANN, BO], presets, shifts: early }));
    expect(withBo.shifts.map((s) => s.staffName)).toEqual(["Bo Chen"]);
    // A shorter rest rule the manager set is honored instead.
    const relaxed = proposeSchedule(
      { ...req, constraints: { ...req.constraints, minRestHours: 6 } },
      inputs({ members: [ANN], presets, shifts: early }),
    );
    expect(relaxed.shifts.map((s) => s.staffName)).toEqual(["Ann Lee"]);
  });

  test("days in a row count the days after the range, into the next week", () => {
    // Sunday requested; Ann works the six days after it (next Monday week).
    const after = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map((d) => onFile("m-ann", d, "09:00", "17:00"));
    const out = proposeSchedule(
      { weekStart: "2026-10-04", days: 1, constraints: { coverage: [{ shift: "day", staff: 1 }] } },
      inputs({ members: [ANN], shifts: after }),
    );
    expect(out.shifts).toEqual([]);
    expect(out.warnings.join(" ")).toContain("more than 6 days in a row");
  });

  test("the default next week is unchanged by shifts far after it", () => {
    const later = onFile("m-ann", "2026-11-02", "09:00", "17:00");
    const base = proposeSchedule({ constraints: { coverage: [{ shift: "day", staff: 1 }] } }, inputs());
    const withLater = proposeSchedule({ constraints: { coverage: [{ shift: "day", staff: 1 }] } }, inputs({ shifts: [later] }));
    expect(withLater.shifts).toEqual(base.shifts);
  });
});

describe("planViolations", () => {
  const s = (date: string, startTime = "09:00", endTime = "17:00"): ScheduledShift => ({
    memberId: "m-ann", memberName: "Ann", date, shiftType: "day", startTime, endTime, roles: [], score: 50, reasons: [], warnings: [],
  });
  const rules = { capOf: () => 40, minRestHours: 10, maxConsecutiveDays: 6 };

  test("flags the first shift of a member-week that crosses the cap, counting existing hours", () => {
    const existing = [onFile("m-ann", "2026-09-28", "09:00", "17:00")];
    const over = planViolations([s("2026-09-29"), s("2026-09-30"), s("2026-10-05")], existing, { ...rules, capOf: () => 16 });
    expect(over.map((o) => [o.date, o.reason])).toEqual([["2026-09-30", "cap"]]);
  });

  test("counts existing hours dated after the shift in the same Monday week", () => {
    const later = [onFile("m-ann", "2026-10-04", "09:00", "17:00")];
    expect(planViolations([s("2026-09-28")], later, { ...rules, capOf: () => 12 }).map((o) => o.reason)).toEqual(["cap"]);
    expect(planViolations([s("2026-10-05")], later, { ...rules, capOf: () => 12 })).toEqual([]);
  });

  test("rest is checked against the shifts before AND after, overnight and overlaps included", () => {
    const nextEarly = [onFile("m-ann", "2026-09-29", "06:00", "14:00")];
    expect(planViolations([s("2026-09-28", "16:00", "23:00")], nextEarly, rules).map((o) => o.reason)).toEqual(["rest"]);
    expect(planViolations([s("2026-09-28", "07:00", "15:00")], nextEarly, rules)).toEqual([]);
    const prevLate = [onFile("m-ann", "2026-09-27", "22:00", "02:00")]; // ends 02:00 on the 28th
    expect(planViolations([s("2026-09-28", "09:00", "17:00")], prevLate, rules).map((o) => o.reason)).toEqual(["rest"]);
    expect(planViolations([s("2026-09-28", "12:00", "17:00")], prevLate, rules)).toEqual([]);
    const overlap = [onFile("m-ann", "2026-09-28", "12:00", "18:00")];
    expect(planViolations([s("2026-09-28")], overlap, { ...rules, minRestHours: 0 }).map((o) => o.reason)).toEqual(["rest"]);
  });

  test("two proposed shifts of one person on one day: the later one is flagged", () => {
    const over = planViolations([s("2026-09-28", "17:00", "22:00"), s("2026-09-28", "07:00", "14:00")], [], rules);
    expect(over.map((o) => o.shift.startTime)).toEqual(["17:00"]);
  });

  test("days in a row join the days before and after", () => {
    const around = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-29", "2026-09-30", "2026-10-01"].map((d) => onFile("m-ann", d, "09:00", "17:00"));
    expect(planViolations([s("2026-09-28")], around, rules).map((o) => o.reason)).toEqual(["streak"]);
    expect(planViolations([s("2026-09-28")], around, { ...rules, maxConsecutiveDays: 7 })).toEqual([]);
  });

  test("restHoursBetween reads either order", () => {
    const a = { date: "2026-09-28", startTime: "16:00", endTime: "23:00" };
    const b = { date: "2026-09-29", startTime: "06:00", endTime: "14:00" };
    expect(restHoursBetween(a, b)).toBe(7);
    expect(restHoursBetween(b, a)).toBe(7);
  });
});

describe("proposeSchedule tool", () => {
  test("maps the org's rows and runs end to end", async () => {
    const annId = uuid(301);
    const conn = fakeConn({
      salesRecord: [],
      payment: [],
      settings: [{ organizationId: "org-1" }],
      orgMember: [{ organizationId: "org-1", id: annId, userId: identity("aa01"), displayName: "Ann Lee", status: "active", permissions: "{}" }],
      staffMember: [],
      staffAvailability: [{
        organizationId: "org-1", id: uuid(), userId: identity("aa01"), type: "permanent", days: JSON.stringify([true, true, true, true, true, true, true]),
        dayTimes: "[]", status: "available", fullDay: true, comments: "",
      }],
      timeOffRequest: [],
      shift: [],
      shiftPreset: [{ organizationId: "org-1", id: uuid(), name: "day", startTime: "09:00", endTime: "15:00", sortOrder: 0 }],
      staffRole: [{ organizationId: "org-1", id: uuid(), name: "Barista", permissions: "{}" }],
    });
    const out = (await proposeScheduleTool(fakeCtx(conn, TODAY)).execute!(
      { days: 2, constraints: { coverage: [{ shift: "day", staff: 1 }] } },
      CALL,
    )) as { shifts: { staffName: string; memberId: string; staffRoles: string[] }[] };
    expect(out.shifts).toHaveLength(2);
    expect(out.shifts[0]).toMatchObject({ staffName: "Ann Lee", memberId: annId.toString(), staffRoles: ["Barista"] });
  });
});
