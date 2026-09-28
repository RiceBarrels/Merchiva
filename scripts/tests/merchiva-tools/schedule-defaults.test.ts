import { describe, expect, test } from "bun:test";
import {
  assumedAvailability,
  defaultPresetsOn,
  fitDefaultPresets,
  openWindow,
  rolesFromMembers,
  teamSizedCoverage,
} from "@/lib/merchiva/tools/schedule-defaults";
import { isAvailableOnDate, DEFAULT_PRESETS } from "@/lib/scheduler";
import type { WeeklyHours } from "@/lib/holidays";
import type { OrgMember, SalesRecord, ShiftPreset, StaffAvailability, StaffRole } from "@/lib/types";

const member = (id: string, role = "staff"): OrgMember => ({
  id,
  organizationId: "org-1",
  userId: `u-${id}`,
  role: role as OrgMember["role"],
  displayName: id.toUpperCase(),
  email: "",
  permissions: {} as OrgMember["permissions"],
  status: "active",
});
const HOURS = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "22:00" },
  sat: { open: "10:00", close: "16:00" },
  sun: { closed: true },
} as WeeklyHours;
const times = (presets: ShiftPreset[]) => presets.map((p) => `${p.name} ${p.startTime}-${p.endTime}`);

describe("openWindow", () => {
  test("reads opening hours the way isOpenOn does", () => {
    expect(openWindow(null, 1)).toBe("all-day");
    expect(openWindow(HOURS, 1)).toEqual({ open: "09:00", close: "18:00" });
    expect(openWindow(HOURS, 0)).toBeNull(); // Sunday closed
    expect(openWindow({ ...HOURS, mon: {} } as WeeklyHours, 1)).toBeNull(); // no times → closed
    expect(openWindow({ tue: HOURS.tue } as WeeklyHours, 1)).toBe("all-day"); // day not listed → open
  });
});

describe("assumedAvailability", () => {
  const onFile = (m: OrgMember, status = "available"): StaffAvailability => ({
    id: `av-${m.id}`, userId: m.userId, organizationId: "org-1", type: "permanent", startDate: null, endDate: null,
    days: [true, true, true, true, true, true, true], dayTimes: [], status, fullDay: true, startTime: null, endTime: null, comments: "",
  });

  test("only for members the engine would read no availability for", () => {
    const [a, b, c] = [member("a"), member("b"), member("c")];
    const out = assumedAvailability([a, b, c], [onFile(a), onFile(b, "disabled")], HOURS);
    expect(out.names).toEqual(["B", "C"]);
    expect(out.rows.map((r) => r.userId)).toEqual(["u-b", "u-c"]);
  });

  test("available while the store is open, inside its hours", () => {
    const m = member("a");
    const { rows } = assumedAvailability([m], [], HOURS);
    expect(rows[0].days).toEqual([false, true, true, true, true, true, true]);
    expect(isAvailableOnDate(m, "2026-09-28", rows, [])).toEqual({ available: true, timeWindow: { start: "09:00", end: "18:00" } });
    expect(isAvailableOnDate(m, "2026-10-03", rows, [])).toEqual({ available: true, timeWindow: { start: "10:00", end: "16:00" } });
    expect(isAvailableOnDate(m, "2026-10-04", rows, []).available).toBe(false);
  });

  test("any time when no opening hours are set; approved time off still wins", () => {
    const m = member("a");
    const { rows } = assumedAvailability([m], [], null);
    expect(isAvailableOnDate(m, "2026-10-04", rows, [])).toEqual({ available: true, timeWindow: { start: "00:00", end: "23:59" } });
    const off = {
      id: "t", userId: m.userId, organizationId: "org-1", startDate: "2026-10-04", endDate: "2026-10-04", fullDays: true,
      startTime: null, endTime: null, comments: "", status: "approved" as const, reviewedBy: null, reviewedAt: null,
    };
    expect(isAvailableOnDate(m, "2026-10-04", rows, [off]).available).toBe(false);
  });
});

describe("fitDefaultPresets", () => {
  test("clips to the day, drops what is left too short, and covers opening to closing", () => {
    expect(times(fitDefaultPresets("09:00", "18:00"))).toEqual(["morning 09:00-14:00", "afternoon 13:00-18:00"]);
    expect(times(fitDefaultPresets("06:00", "23:00"))).toEqual(["morning 06:00-14:00", "afternoon 13:00-20:00", "evening 17:00-23:00"]);
    // The morning would be 12:00-14:00: dropped, and the afternoon starts at opening instead.
    expect(times(fitDefaultPresets("12:00", "22:00"))).toEqual(["afternoon 12:00-20:00", "evening 17:00-22:00"]);
  });

  test("a short day gets one shift from opening to closing", () => {
    expect(times(fitDefaultPresets("13:30", "16:00"))).toEqual(["afternoon 13:30-16:00"]);
  });

  test("hours past midnight", () => {
    expect(times(fitDefaultPresets("18:00", "02:00"))).toEqual(["evening 18:00-02:00"]);
  });

  test("keeps the default's name and id, so coverage rules and colors still apply", () => {
    const [morning] = fitDefaultPresets("09:00", "18:00");
    expect(morning).toMatchObject({ id: DEFAULT_PRESETS[0].id, name: "morning", color: DEFAULT_PRESETS[0].color });
  });

  test("per day: fitted where hours are set, the plain defaults otherwise", () => {
    expect(times(defaultPresetsOn(HOURS, "2026-10-02"))).toEqual(["morning 09:00-14:00", "afternoon 13:00-20:00", "evening 17:00-22:00"]);
    expect(times(defaultPresetsOn(HOURS, "2026-10-03"))).toEqual(["morning 10:00-14:00", "afternoon 13:00-16:00"]);
    expect(defaultPresetsOn(null, "2026-10-03")).toBe(DEFAULT_PRESETS);
  });
});

describe("teamSizedCoverage", () => {
  const two = fitDefaultPresets("09:00", "18:00");
  const three = DEFAULT_PRESETS;
  const base = { everyDay: {}, perDay: [], salesHistory: [] as SalesRecord[] };

  test("never more per shift than the team can staff across the day's shifts", () => {
    const rules = teamSizedCoverage({ ...base, dates: ["2026-09-28"], teamSize: 2, presetsOn: () => two });
    expect(rules).toEqual([
      { date: "2026-09-28", preset: "morning", staff: 1 },
      { date: "2026-09-28", preset: "afternoon", staff: 1 },
    ]);
    expect(teamSizedCoverage({ ...base, dates: ["2026-09-28"], teamSize: 5, presetsOn: () => three }).map((r) => r.staff)).toEqual([2, 2, 2]);
  });

  test("a team big enough for the engine's own head counts is left alone", () => {
    expect(teamSizedCoverage({ ...base, dates: ["2026-09-28"], teamSize: 9, presetsOn: () => three })).toEqual([]);
  });

  test("the engine's count follows past sales: a busy weekday needs a bigger team before it is left alone", () => {
    // Mondays sell far more than the other days → "high" demand (4 a shift) on a Monday.
    const sales = ["2026-09-07", "2026-09-14", "2026-09-21"].flatMap((monday) => [
      { date: monday, actual: 3000 },
      { date: monday.replace(/-(\d\d)$/, (_, d) => `-${String(Number(d) + 2).padStart(2, "0")}`), actual: 500 },
    ]) as SalesRecord[];
    const rules = teamSizedCoverage({ ...base, salesHistory: sales, dates: ["2026-09-28"], teamSize: 9, presetsOn: () => three });
    expect(rules.map((r) => r.staff)).toEqual([3, 3, 3]);
  });

  test("head counts the manager set are never touched", () => {
    const rules = teamSizedCoverage({
      ...base,
      dates: ["2026-09-28", "2026-09-29"],
      teamSize: 2,
      presetsOn: () => two,
      everyDay: { morning: 2 },
      perDay: [{ date: "2026-09-29", preset: "afternoon", staff: 0 }],
    });
    expect(rules).toEqual([{ date: "2026-09-28", preset: "afternoon", staff: 1 }]);
  });
});

describe("rolesFromMembers", () => {
  const role = (name: string): StaffRole => ({ id: name, name, color: "", icon: "", description: "", permissions: {} as StaffRole["permissions"] });

  test("a team-page role that names a job role maps to that role's exact name", () => {
    const roles = [role("Morning Cashier / 早班收银员"), role("Barista")];
    const out = rolesFromMembers([member("a", "morning cashier / 早班收银员"), member("b", "owner"), member("c", "Barista")], roles);
    expect([...out]).toEqual([["a", "Morning Cashier / 早班收银员"], ["c", "Barista"]]);
  });
});
