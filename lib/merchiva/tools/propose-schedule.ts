/**
 * proposeSchedule — the scheduling engine (lib/scheduler.ts) as a read tool.
 *
 * The model's only job is to turn what the manager said ("Mia is off Tuesday,
 * Leo max 20 hours, 3 people on Saturday morning") into `constraints`. This
 * file resolves those names against the roster and the shift presets, feeds
 * the engine the org's members, availability, approved time off, nearby
 * shifts, presets, roles and 90 days of daily sales (for demand), and returns
 * a proposal whose shifts carry exactly the fields of an addShift action.
 * Whatever the store has not set up yet (availability, presets, roles, a team
 * big enough for the default head counts) is filled in by
 * lib/merchiva/tools/schedule-defaults.ts and reported as an assumption.
 */

import { tool } from "ai";
import { z } from "zod";
import { DEFAULT_PRESETS, getShiftDuration } from "@/lib/scheduler";
import { isOpenOn, parseOpeningHours } from "@/lib/holidays";
import { dateFromKey } from "@/lib/date-key";
import type {
  OrgMember,
  SalesRecord,
  Shift,
  ShiftPreset,
  StaffAvailability,
  StaffRole,
  TimeOffRequest,
} from "@/lib/types";
import { opt, orgRows, toShift, type ToolContext } from "@/lib/merchiva/tools/rows";
import { toAvailability, toOrgMember, toPreset, toRole, toTimeOff } from "@/lib/merchiva/tools/staff-rows";
import { dailySalesCents, dailySalesRecords, toPaymentLite, toSalesRowLite } from "@/lib/merchiva/tools/sales-history";
import { describeBlocks, planSchedule, type CoverageRule } from "@/lib/merchiva/tools/schedule-plan";
import {
  assumedAvailability,
  DEFAULT_ROLE,
  defaultPresetsOn,
  rolesFromMembers,
  teamSizedCoverage,
} from "@/lib/merchiva/tools/schedule-defaults";
import { addDaysToKey, isDateKey, keysInRange, mondayKeyOf, weekdayOfKey } from "@/lib/merchiva/tools/store-time";

// ── Input ────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const weekday = z.enum(WEEKDAYS);
const dateKeyField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const proposeScheduleInput = z.object({
  weekStart: dateKeyField
    .optional()
    .describe("First day to schedule, YYYY-MM-DD. Omit for next Monday. For 'this week' pass this week's Monday; days before today are skipped."),
  days: z.number().int().min(1).max(14).optional().describe("How many days to schedule from weekStart. Default 7."),
  constraints: z
    .object({
      unavailable: z
        .array(
          z.object({
            staffName: z.string().describe("The person's name as the user said it."),
            dates: z.array(dateKeyField).optional().describe("Days they cannot work, YYYY-MM-DD."),
            weekdays: z.array(weekday).optional().describe("Weekdays they cannot work, e.g. [\"Sat\",\"Sun\"]."),
          }),
        )
        .optional()
        .describe("People who cannot work some days. Give neither dates nor weekdays to leave the person out of the whole schedule."),
      maxHours: z
        .array(
          z.object({
            staffName: z.string().describe("The person's name as the user said it."),
            hours: z.number().min(0).max(80).describe("Most hours they may work per week."),
          }),
        )
        .optional()
        .describe("Personal weekly hour limits, e.g. 'Leo max 20 hours'."),
      coverage: z
        .array(
          z.object({
            shift: z.string().describe("Shift preset name from viewShiftPresets, e.g. \"morning\"."),
            staff: z.number().int().min(0).max(20).describe("How many people that shift needs. 0 = do not staff it."),
            weekdays: z.array(weekday).optional().describe("Only on these weekdays."),
            dates: z.array(dateKeyField).optional().describe("Only on these days, YYYY-MM-DD."),
          }),
        )
        .optional()
        .describe("Required head count per shift. No weekdays and no dates = every day. Without coverage the engine sizes each shift from past sales (2-4 people)."),
      maxHoursPerWeek: z.number().min(1).max(80).optional().describe("Weekly hour limit for everyone. Default 40."),
      maxConsecutiveDays: z.number().int().min(1).max(14).optional().describe("Most days in a row anyone works. Default 6."),
      minRestHours: z.number().min(0).max(24).optional().describe("Least hours between two shifts of one person. Default 10."),
    })
    .optional()
    .describe("Only what the user actually asked for. Leave out anything they did not say."),
});
export type ProposeScheduleArgs = z.infer<typeof proposeScheduleInput>;
type Constraints = NonNullable<ProposeScheduleArgs["constraints"]>;

// ── Constraint resolution ────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A roster member for a name as the user said it: exact, then unique first name, prefix or substring. */
export function matchMember(name: string, members: OrgMember[]): OrgMember | null {
  const n = norm(name);
  if (!n) return null;
  const tiers: ((m: string) => boolean)[] = [
    (m) => m === n,
    (m) => m.split(" ")[0] === n,
    (m) => m.startsWith(n),
    (m) => m.includes(n),
  ];
  for (const test of tiers) {
    const hits = members.filter((m) => test(norm(m.displayName)));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

/** A preset for a shift name: exact (case-insensitive), else the one preset whose name contains it. */
export function matchPreset(shift: string, presets: ShiftPreset[]): ShiftPreset | null {
  const n = norm(shift);
  const exact = presets.find((p) => norm(p.name) === n);
  if (exact) return exact;
  const partial = presets.filter((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
  return partial.length === 1 ? partial[0] : null;
}

/** The days of `dates` a rule applies to: its dates, its weekdays, or every day when it names neither. */
function ruleDays(dates: string[], rule: { dates?: string[]; weekdays?: string[] }): string[] {
  const hasDates = !!rule.dates?.length;
  const hasWeekdays = !!rule.weekdays?.length;
  if (!hasDates && !hasWeekdays) return dates;
  return dates.filter(
    (d) => (hasDates && rule.dates!.includes(d)) || (hasWeekdays && rule.weekdays!.includes(WEEKDAYS[weekdayOfKey(d)])),
  );
}

export interface ResolvedConstraints {
  blocked: Map<string, Set<string>>;
  caps: Map<string, number>;
  everyDay: Record<string, number>;
  perDay: CoverageRule[];
  maxHoursPerWeek: number;
  maxConsecutiveDays: number;
  minRestHours: number;
  /** Names or shifts that could not be matched — told back to the model. */
  problems: string[];
}

export function resolveConstraints(
  constraints: Constraints | undefined,
  dates: string[],
  members: OrgMember[],
  presets: ShiftPreset[],
): ResolvedConstraints {
  const c = constraints ?? {};
  const out: ResolvedConstraints = {
    blocked: new Map(),
    caps: new Map(),
    everyDay: {},
    perDay: [],
    maxHoursPerWeek: c.maxHoursPerWeek ?? 40,
    maxConsecutiveDays: c.maxConsecutiveDays ?? 6,
    minRestHours: c.minRestHours ?? 10,
    problems: [],
  };
  const roster = members.map((m) => m.displayName).join(", ") || "(nobody)";
  const unknownPerson = (name: string) => out.problems.push(`No team member matches "${name}" — that constraint was ignored. Team: ${roster}.`);

  for (const u of c.unavailable ?? []) {
    const m = matchMember(u.staffName, members);
    if (!m) {
      unknownPerson(u.staffName);
      continue;
    }
    const days = out.blocked.get(m.id) ?? new Set<string>();
    for (const d of ruleDays(dates, u)) days.add(d);
    out.blocked.set(m.id, days);
  }
  for (const h of c.maxHours ?? []) {
    const m = matchMember(h.staffName, members);
    if (m) out.caps.set(m.id, h.hours);
    else unknownPerson(h.staffName);
  }

  const shiftNames = presets.map((p) => p.name).join(", ");
  const perDay = new Map<string, CoverageRule>();
  for (const rule of c.coverage ?? []) {
    const preset = matchPreset(rule.shift, presets);
    if (!preset) {
      out.problems.push(`No shift preset matches "${rule.shift}" — that coverage rule was ignored. Shifts: ${shiftNames}.`);
      continue;
    }
    if (!rule.dates?.length && !rule.weekdays?.length) {
      out.everyDay[preset.name] = rule.staff;
      continue;
    }
    // A later rule for the same day and shift replaces an earlier one.
    for (const date of ruleDays(dates, rule)) perDay.set(`${date}|${preset.name}`, { date, preset: preset.name, staff: rule.staff });
  }
  out.perDay = [...perDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// ── Output ───────────────────────────────────────────────────────────────────

const SHIFT_TYPES = ["morning", "afternoon", "evening", "closing"] as const;

/** addShift's `shiftType` enum, from the preset's name or else its start time. */
export function shiftTypeFor(presetName: string, startTime: string): (typeof SHIFT_TYPES)[number] {
  const n = norm(presetName);
  const named = SHIFT_TYPES.find((t) => n === t || n.includes(t));
  if (named) return named;
  if (n.includes("clos")) return "closing";
  const hour = Number(startTime.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ScheduleInputs {
  today: string;
  members: OrgMember[];
  placeholders: string[];
  availability: StaffAvailability[];
  timeOff: TimeOffRequest[];
  shifts: Shift[];
  presets: ShiftPreset[];
  roles: StaffRole[];
  salesHistory: SalesRecord[];
  openingHoursRaw: string | null;
}

/** Resolve, plan and present. Pure: everything it reads is in `inputs`. */
export function proposeSchedule(args: ProposeScheduleArgs, inputs: ScheduleInputs) {
  const { today } = inputs;
  const warnings: string[] = [];
  const assumptions: string[] = [];

  const nextMonday = addDaysToKey(today, weekdayOfKey(today) === 0 ? 1 : 8 - weekdayOfKey(today));
  let start = args.weekStart && isDateKey(args.weekStart) ? args.weekStart : nextMonday;
  const end = addDaysToKey(start, (args.days ?? 7) - 1);
  if (start < today) {
    assumptions.push(`Days before today (${today}) were skipped.`);
    start = today;
  }
  if (start > end) return { range: { start, end }, shifts: [], uncovered: [], hoursByStaff: [], warnings: ["That range is already over."], assumptions };
  const dates = keysInRange(start, end);

  const members = inputs.members.filter((m) => m.status === "active");
  const presets = [...inputs.presets].sort((a, b) => a.sortOrder - b.sortOrder);
  // With no presets of its own the org is scheduled on the engine's defaults, so names resolve against those.
  const resolved = resolveConstraints(args.constraints, dates, members, presets.length ? presets : DEFAULT_PRESETS);
  warnings.push(...resolved.problems);

  const hours = parseOpeningHours(inputs.openingHoursRaw);
  const closedDates = new Set(dates.filter((d) => !isOpenOn(dateFromKey(d), hours)));
  if (closedDates.size > 0) assumptions.push(`Closed per opening hours, left empty: ${[...closedDates].join(", ")}.`);
  // A store with no presets gets the engine's default shifts, cut to each day's opening hours.
  const presetsOn = (date: string) => (presets.length ? presets : defaultPresetsOn(hours, date));
  if (presets.length === 0) {
    assumptions.push(
      hours
        ? "No shift presets on file; used the default morning, afternoon and evening shifts, fitted to each day's opening hours."
        : "No shift presets on file; used the engine's defaults (morning 07:00-14:00, afternoon 13:00-20:00, evening 17:00-22:00).",
    );
  }

  // The engine never schedules someone with no availability on file: take them as available while the store is open.
  const assumed = assumedAvailability(members, inputs.availability, hours);
  if (assumed.names.length) {
    assumptions.push(
      `No availability on file for ${assumed.names.join(", ")} — assumed available whenever the store is open${
        hours ? " (its opening hours)" : " (opening hours are not set, so any time)"
      }. Say so in the reply.`,
    );
  }

  // Head counts the manager did not set: from past sales, sized to the team.
  const sized = teamSizedCoverage({
    dates: dates.filter((d) => !closedDates.has(d)),
    teamSize: members.length,
    presetsOn,
    everyDay: resolved.everyDay,
    perDay: resolved.perDay,
    salesHistory: inputs.salesHistory,
  });
  assumptions.push(
    `Head counts not set in coverage come from past sales per weekday: 2 (slow), 3 (normal) or 4 (busy) per shift${
      sized.length ? `, but never more per shift than a team of ${members.length} can staff across the day's shifts` : ""
    }.`,
  );

  // Everything already on the schedule: planSchedule takes the shifts on both
  // sides of the range that bear on hours, rest and days in a row.
  const plan = planSchedule({
    start,
    end,
    members,
    availability: [...inputs.availability, ...assumed.rows],
    timeOff: inputs.timeOff,
    existingShifts: inputs.shifts,
    presets,
    presetsOn,
    roles: inputs.roles,
    salesHistory: inputs.salesHistory,
    maxHoursPerWeek: resolved.maxHoursPerWeek,
    maxConsecutiveDays: resolved.maxConsecutiveDays,
    minRestHours: resolved.minRestHours,
    everyDay: resolved.everyDay,
    perDay: [...resolved.perDay, ...sized],
    blocked: resolved.blocked,
    caps: resolved.caps,
    closedDates,
  });

  // ── Roles: addShift needs at least one real job role per shift. The engine
  // infers roles from the shifts it was given (the last week); older history
  // fills in for people who did not work then — their most recent roles —
  // then the job role the team page gives them, then the org's only role.
  // A store with no roles at all gets one to create first (rolesToCreate). ──
  const roleNames = new Set(inputs.roles.map((r) => r.name));
  const onlyRole = inputs.roles.length === 1 ? inputs.roles[0].name : null;
  const newRole = inputs.roles.length === 0 ? DEFAULT_ROLE : null;
  const memberRole = rolesFromMembers(members, inputs.roles);
  const lastRoles = new Map<string, { date: string; roles: string[] }>();
  for (const s of inputs.shifts) {
    const roles = s.staffRoles.filter((r) => roleNames.has(r));
    if (!s.memberId || roles.length === 0 || (lastRoles.get(s.memberId)?.date ?? "") > s.date) continue;
    lastRoles.set(s.memberId, { date: s.date, roles });
  }
  const needsRole = new Set<string>();
  const byName = new Map(members.map((m) => [m.id, m.displayName]));
  const shifts = [...plan.shifts]
    .sort((a, b) => (a.date + a.startTime + a.memberName < b.date + b.startTime + b.memberName ? -1 : 1))
    .map((s) => {
      let staffRoles = s.roles.filter((r) => roleNames.has(r));
      if (staffRoles.length === 0) staffRoles = lastRoles.get(s.memberId)?.roles ?? [];
      if (staffRoles.length === 0 && memberRole.has(s.memberId)) staffRoles = [memberRole.get(s.memberId)!];
      if (staffRoles.length === 0 && onlyRole) staffRoles = [onlyRole];
      if (staffRoles.length === 0 && newRole) staffRoles = [newRole.name];
      if (staffRoles.length === 0) needsRole.add(s.memberName);
      const shiftType = shiftTypeFor(s.shiftType, s.startTime);
      return {
        staffName: s.memberName,
        memberId: s.memberId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        shiftType,
        staffRoles,
        ...(norm(s.shiftType) !== shiftType ? { preset: s.shiftType } : {}),
        ...(s.warnings.length ? { warnings: s.warnings } : {}),
      };
    });

  // ── Gaps, grouped per day and shift. ──
  const gaps = new Map<string, { date: string; shift: string; missing: number; reason: string }>();
  for (const u of plan.unfilled) {
    const key = `${u.date}|${u.shiftType}|${u.reason}`;
    const cur = gaps.get(key) ?? { date: u.date, shift: u.shiftType, missing: 0, reason: u.reason };
    cur.missing += 1;
    gaps.set(key, cur);
  }

  // ── Hours per person: proposed over the range, existing over the Monday
  // weeks it touches — the hours the weekly caps count. ──
  const weeksFrom = mondayKeyOf(start);
  const weeksTo = addDaysToKey(mondayKeyOf(end), 6);
  const hoursFor = new Map<string, { proposed: number; existing: number }>();
  const bump = (id: string, field: "proposed" | "existing", h: number) => {
    const cur = hoursFor.get(id) ?? { proposed: 0, existing: 0 };
    cur[field] += h;
    hoursFor.set(id, cur);
  };
  for (const s of plan.shifts) bump(s.memberId, "proposed", getShiftDuration(s.startTime, s.endTime));
  for (const s of inputs.shifts) {
    if (s.memberId && s.date >= weeksFrom && s.date <= weeksTo && byName.has(s.memberId)) bump(s.memberId, "existing", getShiftDuration(s.startTime, s.endTime));
  }
  const hoursByStaff = [...hoursFor]
    .map(([id, h]) => ({
      staffName: byName.get(id) ?? id,
      proposedHours: r1(h.proposed),
      existingHours: r1(h.existing),
      weeklyCap: resolved.caps.get(id) ?? resolved.maxHoursPerWeek,
    }))
    .sort((a, b) => b.proposedHours - a.proposedHours);

  // ── What the manager should know. ──
  if (members.length === 0) warnings.push("No team members with an app login to schedule — invite people on the team page first.");
  const pending = inputs.timeOff.filter((t) => t.status === "pending" && t.startDate <= end && t.endDate >= start);
  for (const t of pending) {
    const who = members.find((m) => m.userId === t.userId)?.displayName ?? "someone";
    warnings.push(`Pending time-off for ${who} (${t.startDate} to ${t.endDate}) is not approved, so it was not applied.`);
  }
  warnings.push(...describeBlocks(plan.blocks, (id) => byName.get(id) ?? id, {
    capOf: (id) => resolved.caps.get(id) ?? resolved.maxHoursPerWeek,
    minRestHours: resolved.minRestHours,
    maxConsecutiveDays: resolved.maxConsecutiveDays,
  }));
  if (needsRole.size) {
    const options = inputs.roles.slice(0, 6).map((r) => r.name).join(", ");
    warnings.push(`No job role on file for ${[...needsRole].join(", ")} — ask which role (${options}) before adding their shifts (addShift needs staffRoles).`);
  }
  const rolesToCreate = newRole && shifts.length > 0 ? [{ ...newRole }] : [];
  if (rolesToCreate.length) {
    assumptions.push(`The store has no job roles yet, so every shift uses a new "${DEFAULT_ROLE.name}" role: emit its addRole block (rolesToCreate) before the addShift blocks.`);
  }
  if (inputs.placeholders.length) warnings.push(`Staff without an app login are never auto-scheduled: ${inputs.placeholders.join(", ")}.`);
  const inRange = inputs.shifts.filter((s) => s.date >= start && s.date <= end).length;
  if (inRange) assumptions.push(`${inRange} shift(s) already on the schedule in this range were kept and counted; the proposal only adds to them.`);

  return {
    range: { start, end },
    ...(rolesToCreate.length ? { rolesToCreate } : {}),
    shifts,
    uncovered: [...gaps.values()],
    hoursByStaff,
    warnings,
    assumptions,
  };
}

/** The roster, its constraints, the schedule so far, and the sales that set demand. */
const SCHEDULE_TABLES = [
  "salesRecord", "payment", "settings", "orgMember", "staffMember",
  "staffAvailability", "timeOffRequest", "shift", "shiftPreset", "staffRole",
] as const;

export function proposeScheduleTool(ctx: ToolContext) {
  return tool({
    description:
      "Build a shift schedule with the scheduling engine (fair hours, availability, approved time off, rest time, demand from past sales). Put every constraint the user stated into `constraints` — who can't work when, personal hour limits, how many people a shift needs. Works for a store that has set nothing up: people with no availability on file count as available while the store is open, and a store with no job roles gets one in `rolesToCreate`. Returns a PROPOSAL: rolesToCreate (when present), shifts already in addShift's fields, uncovered slots, hours per person, warnings and assumptions. In the same reply, emit one addRole block per rolesToCreate entry first, then exactly one addShift block per returned shift with those field values — each block is an approval card, so don't ask first. Never add, drop or move shifts yourself — to change the plan, call proposeSchedule again with new constraints.",
    inputSchema: proposeScheduleInput,
    execute: ctx.exec("proposeSchedule", SCHEDULE_TABLES, async (data, args: ProposeScheduleArgs) => {
      const org = ctx.organizationId;
      const daily = dailySalesCents(
        orgRows(data, "salesRecord", org).map(toSalesRowLite),
        orgRows(data, "payment", org).map(toPaymentLite),
        ctx.timeZone,
      );
      const settings = orgRows(data, "settings", org)[0];
      return proposeSchedule(args ?? {}, {
        today: ctx.today,
        members: orgRows(data, "orgMember", org).map(toOrgMember),
        placeholders: orgRows(data, "staffMember", org).map((r) => String(r?.name ?? "")).filter(Boolean),
        availability: orgRows(data, "staffAvailability", org).map(toAvailability),
        timeOff: orgRows(data, "timeOffRequest", org).map(toTimeOff),
        shifts: orgRows(data, "shift", org).map(toShift),
        presets: orgRows(data, "shiftPreset", org).map(toPreset),
        roles: orgRows(data, "staffRole", org).map(toRole),
        salesHistory: dailySalesRecords(daily, addDaysToKey(ctx.today, -90)),
        openingHoursRaw: opt(settings?.openingHours),
      });
    }),
  });
}
