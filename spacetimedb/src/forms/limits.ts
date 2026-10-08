// Forms limits (design B.2), string primitives and per-member periods. PURE: its
// one import, ../drive/storage (utf8ByteLength), loads nothing of the SpacetimeDB
// runtime, so Bun tests import it directly. Re-exported by ./logic.ts.
//
// Client mirror (same names; µs bigint here, ms number there): lib/forms/limits.ts
// and lib/forms/period.ts. scripts/tests/forms/parity.test.ts pairs them: change both.
// No TextEncoder in the module runtime, so UTF-8 sizes are counted by hand.

import { utf8ByteLength } from '../drive/storage';

/* ─── Limits ───────────────────────────────────────────────────────────────── */

export const FORM_MAX_DEFINITION_BYTES = 64 * 1024;
export const FORM_MAX_QUESTIONS = 100;
export const FORM_MAX_OPTIONS = 50;
export const FORM_MAX_TITLE_LENGTH = 140;
export const FORM_MAX_DESCRIPTION_LENGTH = 2000;
export const FORM_MAX_QUESTION_TITLE_LENGTH = 300;
export const FORM_MAX_HELP_LENGTH = 500;
export const FORM_MAX_OPTION_LABEL_LENGTH = 200;
export const FORM_MAX_SCALE_LABEL_LENGTH = 60;
export const FORM_MAX_CONFIRMATION_LENGTH = 500;
export const FORM_MAX_ACCEPT_LENGTH = 200;

export const FORM_MAX_SHORT_TEXT_LENGTH = 300;
export const FORM_MAX_LONG_TEXT_LENGTH = 4000;
export const FORM_MAX_ANSWERS_BYTES = 32 * 1024;
export const FORM_MAX_FILES_PER_RESPONSE = 10;

export const FORM_DEFAULT_RESPONSE_LIMIT = 1000;
export const FORM_MAX_RESPONSE_LIMIT = 5000;

export const FORM_MAX_FORMS_PER_ORG = 300;
/** Members' stored responses per store (their answers, row overhead and review notes). Public responses never count here. */
export const FORM_MAX_ORG_ANSWER_BYTES = 20 * 1024 * 1024;
/** Anonymous (public link) responses per store: a separate budget, so a public link can never fill the members' one. */
export const FORM_MAX_ORG_PUBLIC_ANSWER_BYTES = 4 * 1024 * 1024;
/**
 * Module-only: what one response row costs beyond its answersJson — ids, the name/title snapshots, the identity,
 * timestamps and the owner's notification row. Charged per response, so empty submissions still fill the caps.
 */
export const FORM_RESPONSE_ROW_OVERHEAD_BYTES = 1024;

export const FORM_PUBLIC_MAX_PER_HOUR = 120;
/** The public submission window, in µs (client: FORM_PUBLIC_WINDOW_MS). */
export const FORM_PUBLIC_WINDOW_MICROS = 3_600_000_000n;

export const FORM_MAX_REVIEW_NOTE_LENGTH = 2000;

export const FORM_RATING_MAX = 5;
/** Scale bounds: `min` is 0 or 1, `max` is 2..10, integers. */
export const FORM_SCALE_MIN_LOW = 0;
export const FORM_SCALE_MIN_HIGH = 1;
export const FORM_SCALE_MAX_LOW = 2;
export const FORM_SCALE_MAX_HIGH = 10;

/* ─── Primitives ───────────────────────────────────────────────────────────── */

/**
 * UTF-8 byte length of a JS string (lone surrogates count as U+FFFD, 3 bytes, like TextEncoder). The Drive storage
 * helper, re-exported: the module may declare one function per name (scripts/tests/docs/server-source.ts).
 */
export { utf8ByteLength };

/** Length in code points (an emoji counts once). */
export function textLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++, n++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
  }
  return n;
}

export const QUESTION_ID_RE = /^q_[0-9a-z]{12}$/;
export const OPTION_ID_RE = /^o_[0-9a-z]{8}$/;
/** Drive item ids, form ids and response ids: lowercase uuid. */
export const DRIVE_ITEM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A public link token: two uuid v4s as 64 lowercase hex. */
export const FORM_PUBLIC_TOKEN_RE = /^[0-9a-f]{64}$/;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ACCEPT_RE = /^[a-z0-9.*/+\-, ]*$/i;
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

/** A `file` question's `accept`: extensions and MIME patterns only (`.pdf, image/*`). */
export function isValidAccept(value: unknown): value is string {
  return typeof value === 'string' && value.length <= FORM_MAX_ACCEPT_LENGTH && ACCEPT_RE.test(value);
}

export function isQuestionId(value: unknown): value is string {
  return typeof value === 'string' && QUESTION_ID_RE.test(value);
}

export function isOptionId(value: unknown): value is string {
  return typeof value === 'string' && OPTION_ID_RE.test(value);
}

export function isFormPublicToken(value: unknown): value is string {
  return typeof value === 'string' && FORM_PUBLIC_TOKEN_RE.test(value);
}

/** A real calendar day `YYYY-MM-DD` (rejects 2026-02-30). */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_KEY_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** `HH:MM`, 24-hour. */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/* ─── Periods (per-member rule) ────────────────────────────────────────────── */

export const PER_MEMBER_RULES = ['unlimited', 'once', 'daily', 'weekly'] as const;
export type PerMemberRule = (typeof PER_MEMBER_RULES)[number];

const DAY_MS = 86_400_000;

/** ISO-8601 week of a `YYYY-MM-DD` key as `YYYY-Www` (week year, Monday start). Timezone independent. */
export function isoWeekKey(dayKey: string): string {
  if (!isValidDateKey(dayKey)) throw new RangeError(`invalid date key: ${dayKey}`);
  const [y, m, d] = dayKey.split('-').map(Number);
  const day = Date.UTC(y, m - 1, d);
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(day + (3 - weekday) * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * The period a response counts against, from the store-local day `dayKey` (`YYYY-MM-DD`):
 * unlimited → '', once → 'once', daily → the day, weekly → its ISO week `YYYY-Www`.
 */
export function formPeriodForDateKey(rule: PerMemberRule, dayKey: string): string {
  switch (rule) {
    case 'unlimited':
      return '';
    case 'once':
      return 'once';
    case 'daily':
      if (!isValidDateKey(dayKey)) throw new RangeError(`invalid date key: ${dayKey}`);
      return dayKey;
    case 'weekly':
      return isoWeekKey(dayKey);
  }
}

/** Whether `period` is a well-formed period for `rule`. */
export function isValidPeriod(rule: PerMemberRule, period: string): boolean {
  switch (rule) {
    case 'unlimited':
      return period === '';
    case 'once':
      return period === 'once';
    case 'daily':
      return isValidDateKey(period);
    case 'weekly': {
      const m = WEEK_KEY_RE.exec(period);
      if (!m) return false;
      const week = Number(m[2]);
      if (week < 1) return false;
      // Dec 28 is always in the last ISO week of its year.
      return week <= Number(isoWeekKey(`${m[1]}-12-28`).slice(6));
    }
  }
}

/** The UTC calendar day of a µs timestamp, `YYYY-MM-DD`. */
export function utcDayKeyOfMicros(micros: bigint): string {
  const d = new Date(Number(micros / 1000n));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Every real UTC offset lies in [−12h, +14h] (Baker Island … Kiribati), in µs. */
const MIN_UTC_OFFSET_MICROS = -12n * 3_600_000_000n;
const MAX_UTC_OFFSET_MICROS = 14n * 3_600_000_000n;

/**
 * The client's store-local day must be a day some timezone is in right now: between the UTC day at now−12h and the
 * one at now+14h (design B.4 check 4). That is two days most of the hour and three only while 10:00–12:00 UTC.
 * The module has no timezone data, so it cannot pin the store's own day; the client sends the device's local day.
 */
export function isDateKeyNear(dayKey: string, nowMicros: bigint): boolean {
  if (!isValidDateKey(dayKey)) return false;
  // YYYY-MM-DD compares correctly as a string.
  return dayKey >= utcDayKeyOfMicros(nowMicros + MIN_UTC_OFFSET_MICROS)
    && dayKey <= utcDayKeyOfMicros(nowMicros + MAX_UTC_OFFSET_MICROS);
}

/** form_meta's public window state: the current hour's count and the hour before it. */
export interface PublicWindow { windowStart: bigint; windowCount: number; prevWindowCount: number }

/**
 * The public hourly cap (form_meta.publicWindowStart / publicWindowCount / publicPrevWindowCount): the state after one
 * more submission at `nowMicros`, or null when it would break FORM_PUBLIC_MAX_PER_HOUR. Two back-to-back hour
 * buckets, and a submission must fit in their SUM: every rolling hour lies within two adjacent buckets, so no rolling
 * hour ever takes more than the cap (a plain fixed window lets 2× through across its boundary).
 */
export function nextPublicWindow(
  windowStart: bigint,
  windowCount: number,
  prevWindowCount: number,
  nowMicros: bigint,
): PublicWindow | null {
  let state: PublicWindow = { windowStart, windowCount, prevWindowCount };
  if (windowStart === 0n || nowMicros < windowStart || nowMicros - windowStart >= 2n * FORM_PUBLIC_WINDOW_MICROS) {
    state = { windowStart: nowMicros, windowCount: 0, prevWindowCount: 0 };
  } else if (nowMicros - windowStart >= FORM_PUBLIC_WINDOW_MICROS) {
    state = { windowStart: windowStart + FORM_PUBLIC_WINDOW_MICROS, windowCount: 0, prevWindowCount: windowCount };
  }
  if (state.prevWindowCount + state.windowCount >= FORM_PUBLIC_MAX_PER_HOUR) return null;
  return { ...state, windowCount: state.windowCount + 1 };
}
