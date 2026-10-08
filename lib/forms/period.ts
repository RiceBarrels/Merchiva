/**
 * Forms per-member periods: the key a response counts against (`form_response.period`,
 * `form_completion.id`). Import through `lib/forms/schema.ts`.
 */
import { dateKey } from "@/lib/date-key";
import { isValidDateKey } from "./limits";
import type { PerMemberRule } from "./types";

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;
/* ─── Periods (per-member rule) ──────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** ISO-8601 week of a `YYYY-MM-DD` key as `YYYY-Www` (week year, Monday start). Timezone independent. */
export function isoWeekKey(dayKey: string): string {
  if (!isValidDateKey(dayKey)) throw new RangeError(`invalid date key: ${dayKey}`);
  const [y, m, d] = dayKey.split("-").map(Number);
  const day = Date.UTC(y, m - 1, d);
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(day + (3 - weekday) * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * The period a response counts against, from the store-local day `dayKey` (`YYYY-MM-DD`):
 * unlimited → '', once → 'once', daily → the day, weekly → its ISO week `YYYY-Www`.
 */
export function formPeriodForDateKey(rule: PerMemberRule, dayKey: string): string {
  switch (rule) {
    case "unlimited":
      return "";
    case "once":
      return "once";
    case "daily":
      if (!isValidDateKey(dayKey)) throw new RangeError(`invalid date key: ${dayKey}`);
      return dayKey;
    case "weekly":
      return isoWeekKey(dayKey);
  }
}

/** `formPeriodForDateKey` for the local calendar day of `now` (via `lib/date-key.ts`, never the UTC day). */
export function formPeriod(rule: PerMemberRule, now: Date = new Date()): string {
  return formPeriodForDateKey(rule, dateKey(now));
}

/** Whether `period` is a well-formed period for `rule`. */
export function isValidPeriod(rule: PerMemberRule, period: string): boolean {
  switch (rule) {
    case "unlimited":
      return period === "";
    case "once":
      return period === "once";
    case "daily":
      return isValidDateKey(period);
    case "weekly": {
      const m = WEEK_KEY_RE.exec(period);
      if (!m) return false;
      const week = Number(m[2]);
      if (week < 1) return false;
      // Dec 28 is always in the last ISO week of its year.
      return week <= Number(isoWeekKey(`${m[1]}-12-28`).slice(6));
    }
  }
}

