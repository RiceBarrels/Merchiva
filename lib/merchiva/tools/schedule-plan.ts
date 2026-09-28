/**
 * Runs lib/scheduler.ts `generateSchedule` under constraints it has no
 * parameter for — the ones a manager states in chat.
 *
 * The engine is run ONE DAY AT A TIME, oldest first, with every shift placed
 * on earlier days passed back in as an existing shift. The engine scores all
 * candidates before it assigns anything, so within a single multi-day run its
 * fairness ("fewer hours this week") and recency terms only ever see shifts
 * that existed beforehand, and the first names on the roster collect every
 * slot until they hit the hour cap. Fed day by day, those terms see the plan
 * so far and the hours rotate — the engine's scoring is otherwise unchanged.
 *
 * Constraints, in the engine's own terms:
 *   - "X can't work on D"         → an approved full-day time-off for X on D;
 *   - store closed on D           → no run for D (no shifts, no gaps);
 *   - "N people on shift S"       → the engine's `staffPerShift` for that day
 *                                   (every-day counts, overridden per day);
 *   - "X at most H hours a week"  → the engine runs with the highest cap; a
 *                                   shift that takes X past H blocks X for
 *                                   that day and the day is run again.
 *
 * Shifts already on the schedule AFTER the day being planned count too ("fill
 * next Monday" when Tuesday to Sunday are done). The engine is given the rest
 * of that day's week, so its weekly hours and days-in-a-row are complete. It
 * checks rest only against a person's latest known shift, though, and skips
 * the check when that shift is later — so every day's result also goes
 * through `planViolations` against everything known on both sides of it
 * (weekly cap, rest before and after, days in a row), and a person who breaks
 * a rule is blocked for that day and the day is run again, as with the caps.
 * Every shift in the result was placed by the engine.
 */

import {
  DEFAULT_PRESETS,
  generateSchedule,
  getShiftDuration,
  type ScheduleConfig,
  type ScheduledShift,
} from "@/lib/scheduler";
import type {
  OrgMember,
  SalesRecord,
  Shift,
  ShiftPreset,
  StaffAvailability,
  StaffRole,
  TimeOffRequest,
} from "@/lib/types";
import { addDaysToKey, daysBetweenKeys, keysInRange, mondayKeyOf } from "@/lib/merchiva/tools/store-time";

/** A head count for one shift preset on one day. */
export interface CoverageRule {
  date: string;
  preset: string;
  staff: number;
}

export interface PlanRequest {
  start: string;
  end: string;
  members: OrgMember[];
  availability: StaffAvailability[];
  timeOff: TimeOffRequest[];
  /** Shifts already on the schedule, before and after the range; the ones near it are used. */
  existingShifts: Shift[];
  /** The org's presets; empty → the engine's defaults. */
  presets: ShiftPreset[];
  /** The shifts to plan on a given day, when they differ by day; default `presets`. */
  presetsOn?: (date: string) => ShiftPreset[];
  roles: StaffRole[];
  salesHistory: SalesRecord[];
  maxHoursPerWeek: number;
  maxConsecutiveDays: number;
  minRestHours: number;
  /** Preset name → head count on every day (the engine's `staffPerShift`). */
  everyDay: Record<string, number>;
  /** Day-specific head counts; they override `everyDay` on their day. */
  perDay: CoverageRule[];
  /** Member id → days they cannot work. */
  blocked: Map<string, Set<string>>;
  /** Member id → a personal weekly cap (may be above or below `maxHoursPerWeek`). */
  caps: Map<string, number>;
  /** Days the store is closed. */
  closedDates: Set<string>;
}

/** Why a person was kept off a day: weekly hours, rest between shifts, days in a row. */
export type BlockReason = "cap" | "rest" | "streak";

export interface PlanResult {
  shifts: ScheduledShift[];
  unfilled: { date: string; shiftType: string; reason: string }[];
  /** Days a rule took someone off, in the order it happened. */
  blocks: { memberId: string; date: string; reason: BlockReason }[];
  /** The presets the engine worked from. */
  presets: ShiftPreset[];
  runs: number;
}

/** Approved full-day time-off rows the engine understands, one per blocked day. */
function blockingTimeOff(blocked: Map<string, Set<string>>, members: OrgMember[]): TimeOffRequest[] {
  const out: TimeOffRequest[] = [];
  for (const m of members) {
    for (const date of blocked.get(m.id) ?? []) {
      out.push({
        id: `block:${m.id}:${date}`,
        userId: m.userId,
        organizationId: m.organizationId,
        startDate: date,
        endDate: date,
        fullDays: true,
        startTime: null,
        endTime: null,
        comments: "",
        status: "approved",
        reviewedBy: null,
        reviewedAt: null,
      });
    }
  }
  return out;
}

/** A placed shift as an existing one, so later days count its hours, rest and streak. */
function asShift(s: ScheduledShift, i: number): Shift {
  return {
    id: `planned-${i}`,
    memberId: s.memberId,
    staffName: s.memberName,
    staffRole: null,
    staffRoles: s.roles,
    date: s.date,
    shiftType: s.shiftType as Shift["shiftType"],
    startTime: s.startTime,
    endTime: s.endTime,
    predictedDemand: "medium",
  };
}

type Timed = Pick<Shift, "date" | "startTime" | "endTime">;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Start and end of a shift in minutes on one timeline (overnight shifts end the next day). */
function span(s: Timed): [number, number] {
  const start = daysBetweenKeys("2000-01-01", s.date) * 1440 + minutesOf(s.startTime);
  return [start, start + getShiftDuration(s.startTime, s.endTime) * 60];
}

/** Hours off between two shifts, whichever comes first; negative when they overlap. */
export function restHoursBetween(a: Timed, b: Timed): number {
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return (a0 <= b0 ? b0 - a1 : a0 - b1) / 60;
}

/** Length of the run of consecutive work days that contains `date`. */
function runThrough(days: Set<string>, date: string): number {
  let run = 1;
  for (let d = addDaysToKey(date, -1); days.has(d); d = addDaysToKey(d, -1)) run++;
  for (let d = addDaysToKey(date, 1); days.has(d); d = addDaysToKey(d, 1)) run++;
  return run;
}

export interface PlanRules {
  /** A person's weekly hour cap. */
  capOf: (memberId: string) => number;
  minRestHours: number;
  maxConsecutiveDays: number;
}

export interface PlanViolation {
  memberId: string;
  date: string;
  shift: ScheduledShift;
  reason: BlockReason;
}

/**
 * Proposed shifts that break a rule once everything in `known` counts — shifts
 * before AND after them: past the person's weekly cap (per Monday week), less
 * than `minRestHours` between it and another of their shifts (or overlapping
 * one), or making a run longer than `maxConsecutiveDays`. Shifts are taken in
 * time order and each one that passes counts for the next.
 */
export function planViolations(shifts: ScheduledShift[], known: Shift[], rules: PlanRules): PlanViolation[] {
  const byMember = new Map<string, Timed[]>();
  const add = (memberId: string, s: Timed) => byMember.set(memberId, [...(byMember.get(memberId) ?? []), s]);
  for (const s of known) if (s.memberId) add(s.memberId, s);

  const out: PlanViolation[] = [];
  const ordered = [...shifts].sort((a, b) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1));
  for (const s of ordered) {
    const mine = byMember.get(s.memberId) ?? [];
    const week = mondayKeyOf(s.date);
    const weekHours = mine
      .filter((o) => mondayKeyOf(o.date) === week)
      .reduce((h, o) => h + getShiftDuration(o.startTime, o.endTime), 0);
    const days = new Set([...mine.map((o) => o.date), s.date]);
    const reason: BlockReason | null =
      weekHours + getShiftDuration(s.startTime, s.endTime) > rules.capOf(s.memberId) + 1e-9
        ? "cap"
        : mine.some((o) => restHoursBetween(o, s) < rules.minRestHours - 1e-9)
          ? "rest"
          : runThrough(days, s.date) > rules.maxConsecutiveDays
            ? "streak"
            : null;
    if (reason) out.push({ memberId: s.memberId, date: s.date, shift: s, reason });
    else add(s.memberId, s);
  }
  return out;
}

const UNFILLED_REASON: Record<BlockReason, string> = {
  cap: "Weekly hour cap reached",
  rest: "Not enough rest between shifts",
  streak: "Too many days in a row",
};

/** One warning per person and rule: who was kept off which days, and why. */
export function describeBlocks(blocks: PlanResult["blocks"], nameOf: (memberId: string) => string, rules: PlanRules): string[] {
  const kept = new Map<string, { memberId: string; reason: BlockReason; days: Set<string> }>();
  for (const b of blocks) {
    const key = `${b.memberId}|${b.reason}`;
    if (!kept.has(key)) kept.set(key, { memberId: b.memberId, reason: b.reason, days: new Set() });
    kept.get(key)!.days.add(b.date);
  }
  return [...kept.values()].map(({ memberId, reason, days }) => {
    const who = nameOf(memberId);
    const on = [...days].join(", ");
    if (reason === "cap") return `${who} hit their ${rules.capOf(memberId)}h weekly cap; kept off ${on}.`;
    if (reason === "rest") return `${who} kept off ${on}: less than ${rules.minRestHours}h rest next to another of their shifts.`;
    return `${who} kept off ${on}: more than ${rules.maxConsecutiveDays} days in a row.`;
  });
}

/** The engine, day by day, until every constraint holds. Pure and deterministic. */
export function planSchedule(req: PlanRequest): PlanResult {
  const presets = req.presets.length > 0 ? req.presets : DEFAULT_PRESETS;
  const cap = Math.max(req.maxHoursPerWeek, ...req.caps.values());
  const rules: PlanRules = {
    capOf: (id: string) => req.caps.get(id) ?? req.maxHoursPerWeek,
    minRestHours: req.minRestHours,
    maxConsecutiveDays: req.maxConsecutiveDays,
  };
  const blocked = new Map([...req.blocked].map(([id, days]) => [id, new Set(days)]));
  const perDay = new Map<string, Record<string, number>>();
  for (const rule of req.perDay) perDay.set(rule.date, { ...perDay.get(rule.date), [rule.preset]: rule.staff });

  // Existing shifts that can bear on a planned day: a streak's length before
  // the range, and after it the rest of the last week or a streak's length,
  // whichever reaches further.
  const reach = Math.max(7, req.maxConsecutiveDays);
  const lastWeekEnd = addDaysToKey(mondayKeyOf(req.end), 6);
  const afterReach = addDaysToKey(req.end, req.maxConsecutiveDays);
  const from = addDaysToKey(req.start, -reach);
  const to = afterReach > lastWeekEnd ? afterReach : lastWeekEnd;
  const nearby = req.existingShifts.filter((s) => s.date >= from && s.date <= to);

  let placed: ScheduledShift[] = [];
  const unfilled: PlanResult["unfilled"] = [];
  const blocks: PlanResult["blocks"] = [];
  let runs = 0;

  for (const date of keysInRange(req.start, req.end)) {
    if (req.closedDates.has(date)) continue;
    const config: ScheduleConfig = {
      dateRange: { start: date, end: date },
      maxHoursPerWeek: cap,
      maxConsecutiveDays: req.maxConsecutiveDays,
      minRestHours: req.minRestHours,
      staffPerShift: { ...req.everyDay, ...perDay.get(date) },
    };
    // The engine sees up to the end of this day's week (complete weekly hours);
    // later weeks would only zero its recency term.
    const weekEnd = addDaysToKey(mondayKeyOf(date), 6);
    const engineKnown = nearby.filter((s) => s.date <= weekEnd);
    const dayPresets = req.presetsOn?.(date) ?? presets;
    // Each retry blocks at least one more person for the day, so this ends.
    for (let attempt = 0; ; attempt++) {
      const planned = placed.map(asShift);
      const timeOff = [...req.timeOff, ...blockingTimeOff(blocked, req.members)];
      const day = generateSchedule(
        config, req.members, req.availability, timeOff, [...engineKnown, ...planned], dayPresets, req.roles, req.salesHistory,
      );
      runs += 1;
      const over = planViolations(day.shifts, [...nearby, ...planned], rules);
      if (over.length === 0 || attempt >= req.members.length) {
        const drop = new Set(over.map((o) => o.shift));
        placed = [...placed, ...day.shifts.filter((s) => !drop.has(s))];
        unfilled.push(
          ...day.unfilledSlots,
          ...over.map((o) => ({ date, shiftType: o.shift.shiftType, reason: UNFILLED_REASON[o.reason] })),
        );
        break;
      }
      for (const o of over) {
        const days = blocked.get(o.memberId) ?? new Set<string>();
        days.add(date);
        blocked.set(o.memberId, days);
        blocks.push({ memberId: o.memberId, date, reason: o.reason });
      }
    }
  }
  return { shifts: placed, unfilled, blocks, presets, runs };
}
