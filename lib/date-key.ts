/**
 * The app's calendar-day key: local `YYYY-MM-DD`.
 *
 * Every date column in the schema (`shift.date`, `sales_record.date`,
 * `expense.date`, `waste_log.date`, `inventory_item.lastRestocked`, …) stores
 * the *store's own* calendar day, and every reader compares it as a string.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC day, which is a different
 * day from the store's for most of the world: in UTC+8 it returns yesterday
 * until 08:00 local, and in UTC-8 it returns tomorrow from 16:00 local. Use
 * these helpers instead — they read the local calendar fields.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local calendar day of `d` as `YYYY-MM-DD`. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local calendar day as `YYYY-MM-DD`. */
export function todayKey(): string {
  return dateKey(new Date());
}

/** `offsetDays` from today, as a local `YYYY-MM-DD`. Negative goes back. */
export function dateKeyOffset(offsetDays: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  return dateKey(d);
}

/** Parse a `YYYY-MM-DD` key into local midnight. Invalid input → Invalid Date. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}
