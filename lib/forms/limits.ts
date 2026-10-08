/**
 * Forms limits (design B.2) and string primitives: UTF-8 size, code-point length, id formats, calendar-day and
 * time formats. Mirrored in `spacetimedb/src/forms/logic.ts` and parity-tested. Import through
 * `lib/forms/schema.ts`.
 */

/* ─── Limits (design B.2) ────────────────────────────────────────────────── */

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
export const FORM_MAX_ORG_ANSWER_BYTES = 20 * 1024 * 1024;

export const FORM_PUBLIC_MAX_PER_HOUR = 120;
export const FORM_PUBLIC_WINDOW_MS = 60 * 60 * 1000;

export const FORM_MAX_REVIEW_NOTE_LENGTH = 2000;

export const FORM_RATING_MAX = 5;
/** Scale bounds: `min` is 0 or 1, `max` is 2..10, integers. */
export const FORM_SCALE_MIN_LOW = 0;
export const FORM_SCALE_MIN_HIGH = 1;
export const FORM_SCALE_MAX_LOW = 2;
export const FORM_SCALE_MAX_HIGH = 10;

/* ─── Primitives ─────────────────────────────────────────────────────────── */

/** UTF-8 byte length of a JS string (lone surrogates count as U+FFFD, 3 bytes, like TextEncoder). */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

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
/** Drive item ids: lowercase uuid. */
export const DRIVE_ITEM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ACCEPT_RE = /^[a-z0-9.*/+\-, ]*$/i;

/** A `file` question's `accept`: extensions and MIME patterns only (`.pdf, image/*`). */
export function isValidAccept(value: unknown): value is string {
  return typeof value === "string" && value.length <= FORM_MAX_ACCEPT_LENGTH && ACCEPT_RE.test(value);
}

export function isQuestionId(value: unknown): value is string {
  return typeof value === "string" && QUESTION_ID_RE.test(value);
}

export function isOptionId(value: unknown): value is string {
  return typeof value === "string" && OPTION_ID_RE.test(value);
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBase36(length: number, random: () => number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += BASE36[Math.floor(random() * 36) % 36];
  return out;
}

function defaultRandom(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 0x1_0000_0000;
  }
  return Math.random();
}

/** A fresh `q_<12 base36>` id. `random` returns [0, 1); pass a seeded one in tests. */
export function newQuestionId(random: () => number = defaultRandom): string {
  return `q_${randomBase36(12, random)}`;
}

/** A fresh `o_<8 base36>` option id. */
export function newOptionId(random: () => number = defaultRandom): string {
  return `o_${randomBase36(8, random)}`;
}

/** A real calendar day `YYYY-MM-DD` (rejects 2026-02-30). */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
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
  return typeof value === "string" && TIME_RE.test(value);
}

