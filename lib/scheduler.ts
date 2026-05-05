// ─── Smart Scheduling Algorithm Engine ──────────────────────────────────────
//
// Pure utility — no React, no Supabase calls.
// All data is passed in; the function returns a deterministic schedule.

import type {
  OrgMember,
  StaffAvailability,
  DayTime,
  ShiftPreset,
  StaffRole,
  Shift,
  TimeOffRequest,
  SalesRecord,
} from "@/lib/types";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface ScheduleConfig {
  dateRange: { start: string; end: string }; // YYYY-MM-DD (inclusive)
  maxHoursPerWeek: number; // default 40
  maxConsecutiveDays: number; // default 6
  minRestHours: number; // default 10 (between shifts)
  staffPerShift: Record<string, number>; // shiftType -> count override
}

export interface ScheduledShift {
  memberId: string;
  memberName: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  roles: string[];
  score: number; // 0–100
  reasons: string[];
  warnings: string[];
}

export interface ScheduleResult {
  shifts: ScheduledShift[];
  unfilledSlots: { date: string; shiftType: string; reason: string }[];
  warnings: string[];
  stats: {
    totalShifts: number;
    totalHours: number;
    avgHoursPerStaff: number;
    fairnessScore: number; // 0–100
  };
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ScheduleConfig = {
  dateRange: { start: "", end: "" },
  maxHoursPerWeek: 40,
  maxConsecutiveDays: 6,
  minRestHours: 10,
  staffPerShift: {},
};

const DEFAULT_PRESETS: ShiftPreset[] = [
  {
    id: "default-morning",
    organizationId: "",
    name: "morning",
    startTime: "07:00",
    endTime: "14:00",
    color: "#facc15",
    sortOrder: 0,
  },
  {
    id: "default-afternoon",
    organizationId: "",
    name: "afternoon",
    startTime: "13:00",
    endTime: "20:00",
    color: "#fb923c",
    sortOrder: 1,
  },
  {
    id: "default-evening",
    organizationId: "",
    name: "evening",
    startTime: "17:00",
    endTime: "22:00",
    color: "#a78bfa",
    sortOrder: 2,
  },
];

const DEMAND_STAFF_DEFAULTS: Record<string, number> = {
  low: 2,
  medium: 3,
  high: 4,
};

// ─── Helper: date arithmetic ────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function dayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getDay(); // 0=Sun … 6=Sat
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

/** ISO week number (Mon-start) for grouping weekly hours. */
function isoWeekKey(dateStr: string): string {
  const d = parseDate(dateStr);
  const tmp = new Date(d.getTime());
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 4);
  const weekNo = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${tmp.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ─── Helper: time arithmetic ────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Shift duration in hours. Handles overnight shifts (end < start). */
export function getShiftDuration(startTime: string, endTime: string): number {
  let startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) {
    endMin += 24 * 60; // overnight
  }
  return (endMin - startMin) / 60;
}

/** Overlap in minutes between two time ranges. Returns 0 if no overlap. */
function timeOverlapMinutes(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const a0 = timeToMinutes(aStart);
  let a1 = timeToMinutes(aEnd);
  if (a1 <= a0) a1 += 24 * 60;

  const b0 = timeToMinutes(bStart);
  let b1 = timeToMinutes(bEnd);
  if (b1 <= b0) b1 += 24 * 60;

  const overlapStart = Math.max(a0, b0);
  const overlapEnd = Math.min(a1, b1);
  return Math.max(0, overlapEnd - overlapStart);
}

/** Hours between end of one shift and start of next (same or next day). */
function restHoursBetween(
  prevDate: string,
  prevEnd: string,
  nextDate: string,
  nextStart: string,
): number {
  const prevD = parseDate(prevDate);
  const nextD = parseDate(nextDate);
  const dayDiffMs = nextD.getTime() - prevD.getTime();
  const dayDiffHours = dayDiffMs / (1000 * 60 * 60);

  const prevEndMin = timeToMinutes(prevEnd);
  const nextStartMin = timeToMinutes(nextStart);

  return dayDiffHours - prevEndMin / 60 + nextStartMin / 60;
}

// ─── Exported Helpers ───────────────────────────────────────────────────────

/**
 * Check whether a member is available on a specific date.
 * Returns the available time window (or null if unavailable).
 */
export function isAvailableOnDate(
  member: OrgMember,
  date: string,
  availability: StaffAvailability[],
  timeOff: TimeOffRequest[],
): { available: boolean; timeWindow: { start: string; end: string } | null } {
  // Check approved time-off first
  for (const req of timeOff) {
    if (req.userId !== member.userId) continue;
    if (req.status !== "approved") continue;
    if (date >= req.startDate && date <= req.endDate) {
      // If partial-day time-off, only block that window — but for simplicity
      // and safety we block the entire date when fullDays is true.
      if (req.fullDays) {
        return { available: false, timeWindow: null };
      }
      // Partial time-off: still mark unavailable for the whole date to be safe.
      // A more advanced version could carve out partial windows.
      return { available: false, timeWindow: null };
    }
  }

  // Find matching availability records for this member
  const memberAvail = availability.filter(
    (a) => a.userId === member.userId && a.status !== "disabled",
  );

  if (memberAvail.length === 0) {
    // No availability data — treat as unavailable
    return { available: false, timeWindow: null };
  }

  const dow = dayOfWeek(date);

  // Prefer temporary availability that covers this date, then permanent
  const sorted = [...memberAvail].sort((a, b) => {
    if (a.type === "temporary" && b.type === "permanent") return -1;
    if (a.type === "permanent" && b.type === "temporary") return 1;
    return 0;
  });

  for (const avail of sorted) {
    // Check date bounds for temporary availability
    if (avail.type === "temporary") {
      if (avail.startDate && date < avail.startDate) continue;
      if (avail.endDate && date > avail.endDate) continue;
    }

    // Check if the day is enabled
    const dayEnabled = avail.days[dow] ?? false;
    if (!dayEnabled) continue;

    // Determine time window from dayTimes or legacy fields
    const dayTime: DayTime | undefined = avail.dayTimes[dow];
    if (dayTime && dayTime.enabled) {
      if (dayTime.fullDay) {
        return {
          available: true,
          timeWindow: { start: "00:00", end: "23:59" },
        };
      }
      return {
        available: true,
        timeWindow: { start: dayTime.startTime, end: dayTime.endTime },
      };
    }

    // Legacy fallback: use top-level fields
    if (avail.fullDay) {
      return {
        available: true,
        timeWindow: { start: "00:00", end: "23:59" },
      };
    }
    if (avail.startTime && avail.endTime) {
      return {
        available: true,
        timeWindow: { start: avail.startTime, end: avail.endTime },
      };
    }
  }

  return { available: false, timeWindow: null };
}

/**
 * Estimate demand for a given date based on historical sales data.
 * Groups by day-of-week and compares to median.
 */
export function estimateDemand(
  date: string,
  salesHistory: SalesRecord[],
): "low" | "medium" | "high" {
  if (salesHistory.length === 0) return "medium";

  const dow = dayOfWeek(date);

  // Group sales by day-of-week
  const byDow: Map<number, number[]> = new Map();
  for (const rec of salesHistory) {
    const d = dayOfWeek(rec.date);
    const arr = byDow.get(d) ?? [];
    arr.push(rec.actual);
    byDow.set(d, arr);
  }

  // Sales for target day-of-week
  const targetSales = byDow.get(dow);
  if (!targetSales || targetSales.length === 0) return "medium";

  const avgTarget =
    targetSales.reduce((a, b) => a + b, 0) / targetSales.length;

  // Overall average
  const allSales = salesHistory.map((r) => r.actual);
  const overallAvg = allSales.reduce((a, b) => a + b, 0) / allSales.length;

  if (overallAvg === 0) return "medium";

  const ratio = avgTarget / overallAvg;

  if (ratio < 0.8) return "low";
  if (ratio > 1.2) return "high";
  return "medium";
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface SlotCandidate {
  memberId: string;
  memberName: string;
  roles: string[];
  score: number;
  reasons: string[];
}

interface ShiftSlot {
  date: string;
  preset: ShiftPreset;
  demand: "low" | "medium" | "high";
  candidates: SlotCandidate[];
}

// ─── Core Algorithm ─────────────────────────────────────────────────────────

export function generateSchedule(
  config: ScheduleConfig,
  members: OrgMember[],
  availability: StaffAvailability[],
  timeOff: TimeOffRequest[],
  existingShifts: Shift[],
  presets: ShiftPreset[],
  roles: StaffRole[],
  salesHistory: SalesRecord[],
): ScheduleResult {
  // Merge defaults
  const cfg: ScheduleConfig = { ...DEFAULT_CONFIG, ...config };
  const activePresets = presets.length > 0 ? presets : DEFAULT_PRESETS;
  const activeMembers = members.filter((m) => m.status === "active");

  const globalWarnings: string[] = [];

  if (activeMembers.length === 0) {
    return {
      shifts: [],
      unfilledSlots: [],
      warnings: ["No active members available for scheduling."],
      stats: {
        totalShifts: 0,
        totalHours: 0,
        avgHoursPerStaff: 0,
        fairnessScore: 100,
      },
    };
  }

  if (!cfg.dateRange.start || !cfg.dateRange.end) {
    return {
      shifts: [],
      unfilledSlots: [],
      warnings: ["Invalid date range."],
      stats: {
        totalShifts: 0,
        totalHours: 0,
        avgHoursPerStaff: 0,
        fairnessScore: 100,
      },
    };
  }

  const dates = dateRange(cfg.dateRange.start, cfg.dateRange.end);

  // Build a lookup of existing shifts by memberId+date for quick access
  const existingByMemberDate = new Map<string, Shift[]>();
  for (const s of existingShifts) {
    if (!s.memberId) continue;
    const key = `${s.memberId}::${s.date}`;
    const arr = existingByMemberDate.get(key) ?? [];
    arr.push(s);
    existingByMemberDate.set(key, arr);
  }

  // Build role lookup: memberId -> role names
  // We infer roles from existing shifts (staffRoles field)
  const memberRoles = new Map<string, Set<string>>();
  for (const s of existingShifts) {
    if (!s.memberId) continue;
    const set = memberRoles.get(s.memberId) ?? new Set();
    if (s.staffRoles) {
      for (const r of s.staffRoles) set.add(r);
    }
    if (s.staffRole) set.add(s.staffRole);
    memberRoles.set(s.memberId, set);
  }

  // ── Step 1: Determine demand per day ──────────────────────────────────────

  const demandByDate = new Map<string, "low" | "medium" | "high">();
  for (const d of dates) {
    demandByDate.set(d, estimateDemand(d, salesHistory));
  }

  // ── Step 2 & 3: Build slots with scored candidates ───────────────────────

  // Tracking structures for assignment
  const assignedHoursByWeek = new Map<string, Map<string, number>>(); // weekKey -> memberId -> hours
  const assignedShifts: ScheduledShift[] = [];
  const lastShiftByMember = new Map<
    string,
    { date: string; endTime: string }
  >();
  const consecutiveDaysByMember = new Map<string, string[]>(); // memberId -> sorted dates assigned

  // Initialize tracking from existing shifts
  for (const s of existingShifts) {
    if (!s.memberId) continue;
    const wk = isoWeekKey(s.date);
    if (!assignedHoursByWeek.has(wk)) assignedHoursByWeek.set(wk, new Map());
    const weekMap = assignedHoursByWeek.get(wk)!;
    const cur = weekMap.get(s.memberId) ?? 0;
    weekMap.set(s.memberId, cur + getShiftDuration(s.startTime, s.endTime));

    // Track last shift for rest-hour calculation
    const prev = lastShiftByMember.get(s.memberId);
    if (!prev || s.date > prev.date || (s.date === prev.date && s.endTime > prev.endTime)) {
      lastShiftByMember.set(s.memberId, {
        date: s.date,
        endTime: s.endTime,
      });
    }

    // Track consecutive days
    const days = consecutiveDaysByMember.get(s.memberId) ?? [];
    if (!days.includes(s.date)) days.push(s.date);
    consecutiveDaysByMember.set(s.memberId, days);
  }

  // Total hours assigned in this run (for fairness scoring during assignment)
  const totalHoursThisRun = new Map<string, number>();
  // Days since last shift (for recency scoring)
  const lastAssignedDate = new Map<string, string>();
  for (const s of existingShifts) {
    if (!s.memberId) continue;
    const prev = lastAssignedDate.get(s.memberId);
    if (!prev || s.date > prev) lastAssignedDate.set(s.memberId, s.date);
  }

  // Build all slots
  const allSlots: ShiftSlot[] = [];

  for (const date of dates) {
    const demand = demandByDate.get(date) ?? "medium";

    for (const preset of activePresets) {
      const shiftType = preset.name;
      const staffNeeded =
        cfg.staffPerShift[shiftType] ?? DEMAND_STAFF_DEFAULTS[demand] ?? 3;

      // Check how many are already scheduled for this slot
      let alreadyScheduled = 0;
      for (const s of existingShifts) {
        if (s.date === date && s.startTime === preset.startTime && s.endTime === preset.endTime) {
          alreadyScheduled++;
        }
      }

      const needed = Math.max(0, staffNeeded - alreadyScheduled);

      for (let i = 0; i < needed; i++) {
        // Score each active member
        const candidates: SlotCandidate[] = [];

        for (const member of activeMembers) {
          const result = isAvailableOnDate(
            member,
            date,
            availability,
            timeOff,
          );
          if (!result.available || !result.timeWindow) continue;

          // Check not already assigned to this exact slot in existing shifts
          const existingOnDate =
            existingByMemberDate.get(`${member.id}::${date}`) ?? [];
          const alreadyHasThisSlot = existingOnDate.some(
            (s) =>
              s.startTime === preset.startTime &&
              s.endTime === preset.endTime,
          );
          if (alreadyHasThisSlot) continue;

          // ── Score calculation ─────────────────────────────────────────

          let score = 0;
          const reasons: string[] = [];

          // Availability fit (30 pts)
          const shiftDurationMin =
            getShiftDuration(preset.startTime, preset.endTime) * 60;
          const overlapMin = timeOverlapMinutes(
            result.timeWindow.start,
            result.timeWindow.end,
            preset.startTime,
            preset.endTime,
          );
          if (shiftDurationMin > 0) {
            const fitRatio = overlapMin / shiftDurationMin;
            const fitScore = Math.round(fitRatio * 30);
            score += fitScore;
            if (fitRatio >= 1) {
              reasons.push("Fully available during shift window");
            } else {
              reasons.push(
                `Partial availability (${Math.round(fitRatio * 100)}% overlap)`,
              );
            }
          }

          // Role match (25 pts)
          const mRoles = memberRoles.get(member.id);
          if (mRoles && mRoles.size > 0) {
            // Any role is useful; we don't filter by specific shift-role requirements
            // since the data model doesn't tie roles to shift presets directly.
            score += 25;
            reasons.push(
              `Has roles: ${Array.from(mRoles).join(", ")}`,
            );
          } else {
            // No role data — give partial credit (general staff)
            score += 10;
            reasons.push("General staff (no specific roles assigned)");
          }

          // Fairness (25 pts) — fewer hours this week = higher score
          const wk = isoWeekKey(date);
          const weekMap = assignedHoursByWeek.get(wk);
          const weekHours = weekMap?.get(member.id) ?? 0;
          const runHours = totalHoursThisRun.get(member.id) ?? 0;
          const totalH = weekHours + runHours;
          // Scale: 0 hours => 25 pts, maxHoursPerWeek => 0 pts
          const fairnessScore = Math.round(
            Math.max(0, 25 * (1 - totalH / cfg.maxHoursPerWeek)),
          );
          score += fairnessScore;
          if (fairnessScore >= 20) {
            reasons.push("Low weekly hours — good for fairness");
          } else if (fairnessScore >= 10) {
            reasons.push("Moderate weekly hours");
          } else {
            reasons.push("Approaching weekly hour limit");
          }

          // Recency (10 pts) — more days since last shift = higher score
          const lastDate = lastAssignedDate.get(member.id);
          if (lastDate) {
            const daysSince = Math.max(
              0,
              (parseDate(date).getTime() - parseDate(lastDate).getTime()) /
                86400000,
            );
            const recencyScore = Math.min(10, Math.round(daysSince * 2));
            score += recencyScore;
            if (daysSince >= 3) {
              reasons.push(`${daysSince} days since last shift`);
            }
          } else {
            // Never scheduled — give max recency
            score += 10;
            reasons.push("No recent shifts");
          }

          // Preference (10 pts) — permanent availability on this day
          const memberAvail = availability.filter(
            (a) => a.userId === member.userId,
          );
          const hasPermanent = memberAvail.some(
            (a) =>
              a.type === "permanent" &&
              a.days[dayOfWeek(date)] &&
              a.status !== "disabled",
          );
          if (hasPermanent) {
            score += 10;
            reasons.push("Permanently available on this day");
          }

          candidates.push({
            memberId: member.id,
            memberName: member.displayName,
            roles: mRoles ? Array.from(mRoles) : [],
            score: Math.min(100, score),
            reasons,
          });
        }

        allSlots.push({
          date,
          preset,
          demand,
          candidates,
        });
      }
    }
  }

  // ── Step 4: Assign greedily, hardest slots first ─────────────────────────

  // Sort by difficulty: fewer candidates = fill first
  allSlots.sort((a, b) => a.candidates.length - b.candidates.length);

  const unfilledSlots: { date: string; shiftType: string; reason: string }[] =
    [];

  for (const slot of allSlots) {
    if (slot.candidates.length === 0) {
      unfilledSlots.push({
        date: slot.date,
        shiftType: slot.preset.name,
        reason: "No available candidates",
      });
      continue;
    }

    // Sort candidates by score descending
    const sorted = [...slot.candidates].sort((a, b) => b.score - a.score);

    let assigned = false;

    for (const candidate of sorted) {
      const warnings: string[] = [];

      const shiftDuration = getShiftDuration(
        slot.preset.startTime,
        slot.preset.endTime,
      );

      // ── Constraint: weekly hours ──────────────────────────────────
      const wk = isoWeekKey(slot.date);
      if (!assignedHoursByWeek.has(wk)) assignedHoursByWeek.set(wk, new Map());
      const weekMap = assignedHoursByWeek.get(wk)!;
      const currentWeekHours = weekMap.get(candidate.memberId) ?? 0;

      if (currentWeekHours + shiftDuration > cfg.maxHoursPerWeek) {
        // Hard constraint
        continue;
      }

      if (currentWeekHours + shiftDuration > cfg.maxHoursPerWeek * 0.9) {
        warnings.push(
          `Near weekly hour limit (${(currentWeekHours + shiftDuration).toFixed(1)}/${cfg.maxHoursPerWeek}h)`,
        );
      }

      // ── Constraint: consecutive days ──────────────────────────────
      const memberDays = consecutiveDaysByMember.get(candidate.memberId) ?? [];
      const daysWithNew = [...memberDays, slot.date].sort();
      const maxConsec = longestConsecutiveRun(daysWithNew);

      if (maxConsec > cfg.maxConsecutiveDays) {
        continue;
      }

      if (maxConsec === cfg.maxConsecutiveDays) {
        warnings.push(
          `At max consecutive days (${maxConsec}/${cfg.maxConsecutiveDays})`,
        );
      }

      // ── Constraint: rest hours ────────────────────────────────────
      const prevShift = lastShiftByMember.get(candidate.memberId);
      if (prevShift) {
        const rest = restHoursBetween(
          prevShift.date,
          prevShift.endTime,
          slot.date,
          slot.preset.startTime,
        );
        if (rest < cfg.minRestHours && rest >= 0) {
          continue;
        }
        if (rest >= 0 && rest < cfg.minRestHours + 2) {
          warnings.push(`Tight rest period (${rest.toFixed(1)}h)`);
        }
      }

      // ── Also check that the member isn't already assigned to a
      //    different shift on the same date that would violate rest ──
      const alreadyOnDate =
        existingByMemberDate.get(`${candidate.memberId}::${slot.date}`) ?? [];
      // Also check shifts we've assigned in this run
      const runOnDate = assignedShifts.filter(
        (s) => s.memberId === candidate.memberId && s.date === slot.date,
      );
      const allOnDate = [
        ...alreadyOnDate.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        ...runOnDate.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      ];

      let overlapViolation = false;
      for (const other of allOnDate) {
        const overlap = timeOverlapMinutes(
          slot.preset.startTime,
          slot.preset.endTime,
          other.startTime,
          other.endTime,
        );
        if (overlap > 0) {
          overlapViolation = true;
          break;
        }
      }
      if (overlapViolation) continue;

      // ── All checks passed — assign ────────────────────────────────

      const scheduledShift: ScheduledShift = {
        memberId: candidate.memberId,
        memberName: candidate.memberName,
        date: slot.date,
        shiftType: slot.preset.name,
        startTime: slot.preset.startTime,
        endTime: slot.preset.endTime,
        roles: candidate.roles,
        score: candidate.score,
        reasons: candidate.reasons,
        warnings,
      };

      assignedShifts.push(scheduledShift);

      // Update tracking
      weekMap.set(
        candidate.memberId,
        (weekMap.get(candidate.memberId) ?? 0) + shiftDuration,
      );
      totalHoursThisRun.set(
        candidate.memberId,
        (totalHoursThisRun.get(candidate.memberId) ?? 0) + shiftDuration,
      );
      lastShiftByMember.set(candidate.memberId, {
        date: slot.date,
        endTime: slot.preset.endTime,
      });
      lastAssignedDate.set(candidate.memberId, slot.date);

      // Update consecutive days
      const updatedDays =
        consecutiveDaysByMember.get(candidate.memberId) ?? [];
      if (!updatedDays.includes(slot.date)) updatedDays.push(slot.date);
      updatedDays.sort();
      consecutiveDaysByMember.set(candidate.memberId, updatedDays);

      // Update existing-by-member-date for overlap checks on future slots
      const key = `${candidate.memberId}::${slot.date}`;
      const existing = existingByMemberDate.get(key) ?? [];
      existing.push({
        id: `generated-${assignedShifts.length}`,
        memberId: candidate.memberId,
        staffName: candidate.memberName,
        staffRole: null,
        staffRoles: candidate.roles,
        date: slot.date,
        shiftType: slot.preset.name as Shift["shiftType"],
        startTime: slot.preset.startTime,
        endTime: slot.preset.endTime,
        predictedDemand: slot.demand,
      });
      existingByMemberDate.set(key, existing);

      assigned = true;
      break;
    }

    if (!assigned) {
      unfilledSlots.push({
        date: slot.date,
        shiftType: slot.preset.name,
        reason:
          sorted.length > 0
            ? "All candidates exceeded constraints (hours/consecutive/rest)"
            : "No available candidates",
      });
    }
  }

  // ── Step 5: Calculate stats ───────────────────────────────────────────────

  const totalShifts = assignedShifts.length;
  let totalHours = 0;
  const hoursPerMember = new Map<string, number>();

  for (const s of assignedShifts) {
    const dur = getShiftDuration(s.startTime, s.endTime);
    totalHours += dur;
    hoursPerMember.set(
      s.memberId,
      (hoursPerMember.get(s.memberId) ?? 0) + dur,
    );
  }

  const memberCount = hoursPerMember.size || 1;
  const avgHoursPerStaff = totalHours / memberCount;

  // Fairness: 100 - (coefficient of variation * 100), clamped to 0–100
  let fairnessScore = 100;
  if (hoursPerMember.size > 1) {
    const hours = Array.from(hoursPerMember.values());
    const mean = hours.reduce((a, b) => a + b, 0) / hours.length;
    if (mean > 0) {
      const variance =
        hours.reduce((sum, h) => sum + (h - mean) ** 2, 0) / hours.length;
      const stddev = Math.sqrt(variance);
      const cv = stddev / mean;
      fairnessScore = Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
    }
  }

  // Collect global warnings
  if (unfilledSlots.length > 0) {
    globalWarnings.push(
      `${unfilledSlots.length} shift slot(s) could not be filled.`,
    );
  }

  if (fairnessScore < 50) {
    globalWarnings.push(
      `Low fairness score (${fairnessScore}/100). Hours are unevenly distributed.`,
    );
  }

  const membersNearLimit: string[] = [];
  for (const [memberId, hours] of Array.from(totalHoursThisRun.entries())) {
    if (hours > cfg.maxHoursPerWeek * 0.85) {
      const member = activeMembers.find((m) => m.id === memberId);
      if (member) membersNearLimit.push(member.displayName);
    }
  }
  if (membersNearLimit.length > 0) {
    globalWarnings.push(
      `Staff near weekly hour limit: ${membersNearLimit.join(", ")}`,
    );
  }

  return {
    shifts: assignedShifts,
    unfilledSlots,
    warnings: globalWarnings,
    stats: {
      totalShifts,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerStaff: Math.round(avgHoursPerStaff * 100) / 100,
      fairnessScore,
    },
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Find the longest run of consecutive dates in a sorted array of YYYY-MM-DD strings.
 */
function longestConsecutiveRun(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;

  // Deduplicate
  const unique = Array.from(new Set(sortedDates)).sort();

  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < unique.length; i++) {
    const prev = parseDate(unique[i - 1]);
    const curr = parseDate(unique[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000;

    if (diffDays === 1) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return maxRun;
}
