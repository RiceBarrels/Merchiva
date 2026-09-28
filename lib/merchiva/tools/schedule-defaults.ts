/**
 * What proposeSchedule assumes when a store has not set scheduling up — the
 * usual state of a new, small store: nobody has entered availability, there
 * are no shift presets and no job roles, and the team is smaller than the
 * engine's default head counts. Pure.
 *
 * Without these the engine proposes nothing (it treats a person with no
 * availability on file as never available) or a week of gaps (2-4 people on
 * every one of three shifts, for a team of two). Every assumption is reported
 * back in proposeSchedule's `assumptions`, so the reply can say what the
 * proposal took for granted.
 */

import { DEFAULT_PRESETS, estimateDemand } from "@/lib/scheduler";
import type { DayKey, WeeklyHours } from "@/lib/holidays";
import type { DayTime, OrgMember, SalesRecord, ShiftPreset, StaffAvailability, StaffRole } from "@/lib/types";
import type { CoverageRule } from "@/lib/merchiva/tools/schedule-plan";
import { weekdayOfKey } from "@/lib/merchiva/tools/store-time";

/** `StaffAvailability.days` order: 0 = Sunday … 6 = Saturday. */
const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type OpenWindow = { open: string; close: string } | "all-day" | null;

/**
 * When the store is open on weekday `dow`, read the way lib/holidays' `isOpenOn`
 * reads it: no hours set, or none for that day → open all day; `closed` or a
 * day without both times → closed (null).
 */
export function openWindow(hours: WeeklyHours | null, dow: number): OpenWindow {
  if (!hours) return "all-day";
  const day = hours[DAY_KEYS[dow]];
  if (!day) return "all-day";
  if (day.closed || !day.open || !day.close) return null;
  return { open: day.open, close: day.close };
}

// ── Availability ─────────────────────────────────────────────────────────────

const CLOSED_DAY: DayTime = { enabled: false, fullDay: false, startTime: "", endTime: "" };

/**
 * An availability row for every member who has none the engine would read
 * (none on file, or only disabled ones): available whenever the store is open.
 */
export function assumedAvailability(
  members: OrgMember[],
  availability: StaffAvailability[],
  hours: WeeklyHours | null,
): { rows: StaffAvailability[]; names: string[] } {
  const rows: StaffAvailability[] = [];
  const names: string[] = [];
  for (const m of members) {
    if (availability.some((a) => a.userId === m.userId && a.status !== "disabled")) continue;
    const windows = DAY_KEYS.map((_, dow) => openWindow(hours, dow));
    rows.push({
      id: `assumed:${m.id}`,
      userId: m.userId,
      organizationId: m.organizationId,
      type: "permanent",
      startDate: null,
      endDate: null,
      days: windows.map((w) => w !== null),
      dayTimes: windows.map((w): DayTime =>
        w === null
          ? CLOSED_DAY
          : w === "all-day"
            ? { enabled: true, fullDay: true, startTime: "00:00", endTime: "23:59" }
            : { enabled: true, fullDay: false, startTime: w.open, endTime: w.close },
      ),
      status: "assumed",
      fullDay: false,
      startTime: null,
      endTime: null,
      comments: "",
    });
    names.push(m.displayName);
  }
  return { rows, names };
}

// ── Shift times ──────────────────────────────────────────────────────────────

/** A default shift shorter than this inside the opening hours is dropped. */
const MIN_SHIFT_MINUTES = 3 * 60;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * The engine's default shifts (morning 07-14, afternoon 13-20, evening 17-22)
 * cut to one day's opening hours: each is clipped to [open, close], one left
 * with under 3 hours is dropped, and the first starts at opening and the last
 * ends at closing so the whole day is covered. A day too short for any of them
 * gets one shift from opening to closing, named after the default it overlaps
 * most. Names are kept, so coverage rules ("2 on the morning shift") still match.
 */
export function fitDefaultPresets(open: string, close: string): ShiftPreset[] {
  const o = minutesOf(open);
  let c = minutesOf(close);
  if (c <= o) c += 1440; // closes after midnight
  const clipped = DEFAULT_PRESETS.map((p) => ({
    preset: p,
    start: Math.max(minutesOf(p.startTime), o),
    end: Math.min(minutesOf(p.endTime), c),
  }));
  const kept = clipped.filter((x) => x.end - x.start >= MIN_SHIFT_MINUTES);
  if (kept.length === 0) {
    const best = clipped.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    return [{ ...best.preset, startTime: hhmm(o), endTime: hhmm(c) }];
  }
  kept[0].start = o;
  kept[kept.length - 1].end = c;
  return kept.map((x) => ({ ...x.preset, startTime: hhmm(x.start), endTime: hhmm(x.end) }));
}

/** The shifts to plan on `date` for a store with no presets of its own. */
export function defaultPresetsOn(hours: WeeklyHours | null, date: string): ShiftPreset[] {
  const w = openWindow(hours, weekdayOfKey(date));
  return w && w !== "all-day" ? fitDefaultPresets(w.open, w.close) : DEFAULT_PRESETS;
}

// ── Head counts ──────────────────────────────────────────────────────────────

/** The engine's head count per shift from past sales — `DEMAND_STAFF_DEFAULTS` in lib/scheduler.ts. */
const DEMAND_HEAD_COUNT = { low: 2, medium: 3, high: 4 } as const;

/**
 * Head counts for the shifts the manager set none for: the engine's own count
 * from past sales, but never more people on one shift than the team can staff
 * when spread over that day's shifts — ceil(team / shifts). Only the counts
 * that differ from the engine's are returned, as day-specific rules.
 */
export function teamSizedCoverage(opts: {
  dates: string[];
  teamSize: number;
  presetsOn: (date: string) => ShiftPreset[];
  everyDay: Record<string, number>;
  perDay: CoverageRule[];
  salesHistory: SalesRecord[];
}): CoverageRule[] {
  const set = new Set(opts.perDay.map((r) => `${r.date}|${r.preset}`));
  const out: CoverageRule[] = [];
  for (const date of opts.dates) {
    const presets = opts.presetsOn(date);
    const cap = Math.max(1, Math.ceil(opts.teamSize / Math.max(1, presets.length)));
    const engine = DEMAND_HEAD_COUNT[estimateDemand(date, opts.salesHistory)];
    if (cap >= engine) continue;
    for (const p of presets) {
      if (p.name in opts.everyDay || set.has(`${date}|${p.name}`)) continue;
      out.push({ date, preset: p.name, staff: cap });
    }
  }
  return out;
}

// ── Roles ────────────────────────────────────────────────────────────────────

/** The role every shift gets when the store has no job roles yet; the model creates it with addRole. */
export const DEFAULT_ROLE = {
  name: "Staff",
  description: "General shift work",
  icon: "user",
  color: "#44403c",
} as const;

/**
 * Member id → the job role their team-page role names, when it names one of
 * the store's roles (the team page stores a job role's name there, or a
 * permission level: owner / manager / staff). Canonical role names.
 */
export function rolesFromMembers(members: OrgMember[], roles: StaffRole[]): Map<string, string> {
  const byLower = new Map(roles.map((r) => [r.name.trim().toLowerCase(), r.name]));
  const out = new Map<string, string>();
  for (const m of members) {
    const role = byLower.get(String(m.role ?? "").trim().toLowerCase());
    if (role) out.set(m.id, role);
  }
  return out;
}
