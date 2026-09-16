// Payroll computation from punch_event rows.
//
// Sessions are actual worked time: each "in" punch paired with its "out"
// (via pairEventId, falling back to the next unpaired "out"), with closed
// break-start/break-end pairs deducted. An open "in" counts up to `nowMs`
// so today's in-progress shift shows live numbers. All day bucketing uses
// the client's local timezone — same convention as the attendance matrix.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayrollEvent {
  id: string;
  memberId: string;
  action: string; // "in" | "out" | "break-start" | "break-end"
  atMs: number;
  closed: boolean;
  pairEventId: string | null;
}

export interface WorkSession {
  inMs: number;
  /** null = still clocked in (counts up to nowMs). */
  outMs: number | null;
  /** Break time inside this session, ms. */
  breakMs: number;
}

export interface DayBreakdown {
  date: string; // local ISO date
  workedMs: number; // gross (in→out) clipped to this day
  breakMs: number;
  paidMs: number; // workedMs - breakMs
  open: boolean; // an open session touches this day
}

export interface MemberPayroll {
  memberId: string;
  workedMs: number;
  breakMs: number;
  paidMs: number;
  paidHours: number;
  /** Currently clocked in (an open session overlaps the range). */
  openNow: boolean;
  days: DayBreakdown[];
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

/** SpacetimeDB timestamp → epoch ms (mirrors the attendance matrix helper). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function punchAtMs(at: any): number {
  if (at && typeof at.toDate === "function") return at.toDate().getTime();
  if (typeof at?.microsSinceUnixEpoch === "bigint") {
    return Number(at.microsSinceUnixEpoch / BigInt(1000));
  }
  return NaN;
}

/** Map raw punch_event rows (already org-filtered or not) to PayrollEvent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPayrollEvents(raw: any[], orgId: string): PayrollEvent[] {
  return raw
    .filter((e) => e.organizationId === orgId)
    .map((e) => ({
      id: e.id?.toString?.() ?? String(e.id),
      memberId: String(e.memberId),
      action: String(e.action),
      atMs: punchAtMs(e.at),
      closed: !!e.closed,
      pairEventId: e.pairEventId ? String(e.pairEventId) : null,
    }))
    .filter((e) => Number.isFinite(e.atMs));
}

// ─── Session building ────────────────────────────────────────────────────────

interface Interval {
  start: number;
  end: number | null; // null = open (runs to nowMs)
}

/** Pair start events with their end events via pairEventId, with a nearest-next fallback. */
function pairIntervals(
  starts: PayrollEvent[],
  ends: PayrollEvent[],
): Interval[] {
  const endByPair = new Map<string, PayrollEvent>();
  const unpairedEnds: PayrollEvent[] = [];
  for (const e of ends) {
    if (e.pairEventId) endByPair.set(e.pairEventId, e);
    else unpairedEnds.push(e);
  }
  unpairedEnds.sort((a, b) => a.atMs - b.atMs);
  const usedEnds = new Set<string>();
  const out: Interval[] = [];
  for (const s of [...starts].sort((a, b) => a.atMs - b.atMs)) {
    const paired = endByPair.get(s.id);
    if (paired) {
      out.push({ start: s.atMs, end: Math.max(s.atMs, paired.atMs) });
      continue;
    }
    if (!s.closed) {
      out.push({ start: s.atMs, end: null });
      continue;
    }
    // Closed start with no pairEventId'd end — take the nearest later unused end.
    const fallback = unpairedEnds.find((e) => !usedEnds.has(e.id) && e.atMs >= s.atMs);
    if (fallback) {
      usedEnds.add(fallback.id);
      out.push({ start: s.atMs, end: fallback.atMs });
    }
    // Closed start with no end at all → unrecoverable row; contribute nothing.
  }
  return out;
}

/** Build work sessions (with break deduction) for ONE member's events. */
export function buildSessions(events: PayrollEvent[], nowMs: number): WorkSession[] {
  const ins = events.filter((e) => e.action === "in");
  const outs = events.filter((e) => e.action === "out");
  const breakStarts = events.filter((e) => e.action === "break-start");
  const breakEnds = events.filter((e) => e.action === "break-end");

  const work = pairIntervals(ins, outs);
  const breaks = pairIntervals(breakStarts, breakEnds);

  return work.map((w) => {
    const wEnd = w.end ?? nowMs;
    let breakMs = 0;
    for (const b of breaks) {
      const bEnd = b.end ?? nowMs;
      const overlap = Math.min(wEnd, bEnd) - Math.max(w.start, b.start);
      if (overlap > 0) breakMs += overlap;
    }
    return { inMs: w.start, outMs: w.end, breakMs: Math.min(breakMs, wEnd - w.start) };
  });
}

// ─── Range math ──────────────────────────────────────────────────────────────

function localIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextLocalMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/**
 * Compute one member's payroll over [rangeStartMs, rangeEndMs].
 * Sessions are clipped to the range; breaks are deducted proportionally to the
 * clipped portion (break intervals are themselves clipped, so this is exact).
 */
export function computeMemberPayroll(
  memberEvents: PayrollEvent[],
  rangeStartMs: number,
  rangeEndMs: number,
  nowMs: number,
): MemberPayroll & { memberId: string } {
  const sessions = buildSessions(memberEvents, nowMs);
  const byDay = new Map<string, DayBreakdown>();
  let workedMs = 0;
  let breakMs = 0;
  let openNow = false;

  const breaks = (() => {
    // Rebuild break intervals once so day-level deduction clips exactly.
    const bs = memberEvents.filter((e) => e.action === "break-start");
    const be = memberEvents.filter((e) => e.action === "break-end");
    return pairIntervals(bs, be).map((b) => ({ start: b.start, end: b.end ?? nowMs }));
  })();

  for (const s of sessions) {
    const sEnd = s.outMs ?? nowMs;
    const clipStart = Math.max(s.inMs, rangeStartMs);
    const clipEnd = Math.min(sEnd, rangeEndMs);
    if (clipEnd <= clipStart) continue;
    if (s.outMs == null) openNow = true;

    // Walk the clipped session day by day (local midnights).
    let cursor = clipStart;
    while (cursor < clipEnd) {
      const dayEnd = Math.min(nextLocalMidnight(cursor), clipEnd);
      const date = localIsoDate(cursor);
      const chunkMs = dayEnd - cursor;
      let chunkBreak = 0;
      for (const b of breaks) {
        const overlap = Math.min(dayEnd, b.end) - Math.max(cursor, b.start);
        if (overlap > 0) chunkBreak += overlap;
      }
      chunkBreak = Math.min(chunkBreak, chunkMs);
      const day = byDay.get(date) ?? { date, workedMs: 0, breakMs: 0, paidMs: 0, open: false };
      day.workedMs += chunkMs;
      day.breakMs += chunkBreak;
      day.paidMs += chunkMs - chunkBreak;
      if (s.outMs == null) day.open = true;
      byDay.set(date, day);
      workedMs += chunkMs;
      breakMs += chunkBreak;
      cursor = dayEnd;
    }
  }

  const paidMs = workedMs - breakMs;
  return {
    memberId: memberEvents[0]?.memberId ?? "",
    workedMs,
    breakMs,
    paidMs,
    paidHours: paidMs / 3_600_000,
    openNow,
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function fmtHours(ms: number): string {
  const h = ms / 3_600_000;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(2)}h`;
}

export function fmtHM(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function grossPay(paidMs: number, hourlyRate: number): number {
  return grossPayCents(paidMs, Math.round(hourlyRate * 100)) / 100;
}

/**
 * Gross pay in exact minor units.
 *
 * Pay is the one number in this app that is both derived by multiplication and
 * then summed across people, so f64 error compounds twice. Taking the rate in
 * cents and rounding once, at the end, keeps a payroll run reconcilable:
 * `sum(grossPayCents(...))` is exact, whereas summing the rounded float
 * `grossPay` results drifts by a cent per employee.
 *
 * Read the rate with `centsOf(member, "hourlyRate")` from lib/money so it comes
 * from the exact `hourlyRateCents` column when present.
 */
export function grossPayCents(paidMs: number, hourlyRateCents: number): number {
  if (!Number.isFinite(paidMs) || !Number.isFinite(hourlyRateCents)) return 0;
  return Math.round((paidMs / 3_600_000) * hourlyRateCents);
}
