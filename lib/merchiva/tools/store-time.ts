/**
 * The store's calendar, on the server.
 *
 * Every date column stores the store's own `YYYY-MM-DD` (see lib/date-key.ts),
 * and the browser computes it with the device's local clock. The tools run on
 * the server, whose local zone is UTC on Vercel — so "today" and every
 * day-boundary instant must come from the store, not from the server clock.
 *
 * Two inputs can describe the store's calendar:
 *   - `today`, the key the chat client computed with `todayKey()` — the same
 *     key every /manager page compares against. Authoritative when present.
 *   - `timeZone`, an IANA zone the client may send. Needed only where an
 *     instant (a payment's `createdAt`, a punch) is bucketed into a store day.
 *
 * `settings.timezone` is deliberately NOT used: `createOrganization` seeds it
 * with "America/Los_Angeles" and no screen lets an owner change it, so for
 * most stores it names the wrong zone. When neither input is present the
 * server's local calendar is used (via lib/date-key.ts), which is UTC in
 * production — an approximation the tools say out loud where it matters.
 */

import { dateFromKey, dateKey } from "@/lib/date-key";

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = KEY_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Pure calendar arithmetic on a key — no zone involved. */
export function addDaysToKey(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for the calendar day itself. */
export function weekdayOfKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The Monday on or before `key` — the week every schedule and payroll screen keys by. */
export function mondayKeyOf(key: string): string {
  return addDaysToKey(key, -((weekdayOfKey(key) + 6) % 7));
}

/** Every key from `start` to `end`, inclusive. */
export function keysInRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= end && out.length < 400; k = addDaysToKey(k, 1)) out.push(k);
  return out;
}

/** The IANA zone if the runtime knows it, else null. */
export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz.trim()) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return null;
  }
}

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** The store's calendar day of an instant. No zone → the server's local day. */
export function zonedDateKey(ms: number, timeZone: string | null): string {
  if (!timeZone) return dateKey(new Date(ms));
  const p = zonedParts(ms, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** How far the zone's wall clock is ahead of UTC at `ms`. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const p = zonedParts(whole, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - whole;
}

/** The instant the store's day `key` starts. No zone → server-local midnight. */
export function zonedMidnightMs(key: string, timeZone: string | null): number {
  if (!timeZone) return dateFromKey(key).getTime();
  const wall = Date.parse(`${key}T00:00:00Z`);
  const first = wall - zoneOffsetMs(wall, timeZone);
  // A DST change between the guess and the answer moves the offset once.
  const second = wall - zoneOffsetMs(first, timeZone);
  return second;
}

/**
 * The store's today: the client's key when it sent a valid one, else today in
 * the client's zone, else the server's local day (UTC in production).
 */
export function resolveStoreToday(requested: unknown, timeZone: string | null, nowMs: number = Date.now()): string {
  if (isDateKey(requested)) return requested;
  return zonedDateKey(nowMs, timeZone);
}
