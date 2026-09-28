/**
 * The store's calendar for Mr. Merchiva's system prompt: today with its weekday, and the exact
 * dates of this week, last week, next week and the months around it.
 *
 * The prompt used to carry only the server's clock (`new Date().toLocaleString()`, UTC on
 * Vercel), so the model worked weeks out for itself. L1 read "上周" on Sunday 2026-09-27 as
 * Wed 09-16 – Tue 09-22, called 09-19 a Thursday, and once asked the user to confirm its own
 * wrong range instead of answering. Here the dates are computed from the store's day — the
 * `today` key the chat client sends, as the read tools use it — with the same Monday-to-Sunday
 * weeks and calendar months as the schedule, payroll and Finances pages
 * (resolveFinancePeriod). Pure: `nowMs` only decides the local time.
 */

import { resolveFinancePeriod } from "@/lib/merchiva/tools/view-finance";
import { addDaysToKey, resolveStoreToday, validTimeZone, weekdayOfKey } from "@/lib/merchiva/tools/store-time";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function day(key: string): string {
  return `${key} (${WEEKDAYS[weekdayOfKey(key)]})`;
}

function localTime(nowMs: number, timeZone: string | null): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(nowMs));
  return timeZone ? `Local time ${time} (${timeZone}).` : `Server time ${time} UTC; the store's time zone is unknown.`;
}

/** The CURRENT DATE AND TIME block, from the request's store context (`today`, `timeZone`). */
export function storeCalendarBlock(context: Record<string, unknown>, nowMs: number = Date.now()): string {
  const timeZone = validTimeZone(context.timeZone);
  const today = resolveStoreToday(context.today, timeZone, nowMs);
  const range = (period: "this_week" | "last_week" | "this_month" | "last_month") => {
    const { start, end } = resolveFinancePeriod(today, { period });
    return `${start} – ${end}`;
  };
  const thisWeek = resolveFinancePeriod(today, { period: "this_week" });
  return [
    "CURRENT DATE AND TIME — the store's calendar. Use these dates exactly as given: never work out a weekday or a week's dates yourself, and never ask the user to confirm a range listed here.",
    `- Today: ${day(today)}. ${localTime(nowMs, timeZone)}`,
    `- Yesterday: ${day(addDaysToKey(today, -1))}. Tomorrow: ${day(addDaysToKey(today, 1))}.`,
    `- This week (本周 / 这周): ${day(thisWeek.start)} – ${day(thisWeek.end)}.`,
    `- Last week (上周): ${range("last_week")}. Next week (下周): ${addDaysToKey(thisWeek.start, 7)} – ${addDaysToKey(thisWeek.end, 7)}.`,
    `- This month (本月): ${range("this_month")}. Last month (上个月): ${range("last_month")}.`,
    "Weeks run Monday to Sunday, the same weeks the schedule, payroll and finance pages use, and the this_week / last_week / this_month / last_month periods of the read tools.",
  ].join("\n");
}
