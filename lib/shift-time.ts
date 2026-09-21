/**
 * Shift clock arithmetic.
 *
 * A shift is two wall-clock times on the same calendar day, so a closing shift
 * is stored as 22:00 → 06:00 and its end time is NUMERICALLY smaller than its
 * start. Every hand-rolled `end - start` in the app clamped that to zero with
 * `Math.max(0, …)`, so a week of night shifts reported 0 hours scheduled, the
 * timeline drew them as a 2% sliver, and nobody working one ever appeared
 * under "on now".
 *
 * Nothing prevents creating such a shift — the forms have no validation — so
 * the wrap has to be handled here.
 */

/** Minutes since local midnight for a "HH:MM" string; NaN if unparseable. */
export function minutesOfDay(time: string): number {
  const [h, m] = String(time).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
  return h * 60 + m;
}

/** Minutes from `startTime` to `endTime`, wrapping past midnight. */
export function shiftDurationMinutes(startTime: string, endTime: string): number {
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const span = end - start;
  // Equal times mean a zero-length shift, not a 24-hour one.
  return span < 0 ? span + 24 * 60 : span;
}

/** Hours from `startTime` to `endTime`, wrapping past midnight. */
export function shiftDurationHours(startTime: string, endTime: string): number {
  return shiftDurationMinutes(startTime, endTime) / 60;
}

/** True when the shift covers `nowMinutes`, wrapping past midnight. */
export function isOnShiftAt(startTime: string, endTime: string, nowMinutes: number): boolean {
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (end > start) return nowMinutes >= start && nowMinutes < end;
  if (end === start) return false;
  // Wraps midnight: on shift from start to 24:00, and from 00:00 to end.
  return nowMinutes >= start || nowMinutes < end;
}
