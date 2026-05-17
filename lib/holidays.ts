// Lightweight public-holiday lookup. Intentionally NOT a full calendar — just
// the major US / CN / international observances the AI scheduler should flag
// when proposing shifts (extra demand, possible closures, special hours).
//
// Returns ISO YYYY-MM-DD → { name, kind } so callers can pick the dates within
// their window. A real implementation would call a calendar API; this in-app
// table avoids a network round-trip and works offline.

export type HolidayKind = "public" | "religious" | "observance";

export interface HolidayInfo {
  date: string;       // ISO YYYY-MM-DD
  name: string;       // human-readable
  kind: HolidayKind;
  countryCode: string;
}

// Fixed-date holidays per country. (Easter-derived / lunar dates are added
// per-year below.) The list is intentionally small — adding more is safe.
const FIXED: Record<string, Array<{ month: number; day: number; name: string; kind: HolidayKind }>> = {
  US: [
    { month: 1, day: 1, name: "New Year's Day", kind: "public" },
    { month: 6, day: 19, name: "Juneteenth", kind: "public" },
    { month: 7, day: 4, name: "Independence Day", kind: "public" },
    { month: 11, day: 11, name: "Veterans Day", kind: "public" },
    { month: 12, day: 24, name: "Christmas Eve", kind: "observance" },
    { month: 12, day: 25, name: "Christmas Day", kind: "public" },
    { month: 12, day: 31, name: "New Year's Eve", kind: "observance" },
  ],
  CN: [
    { month: 1, day: 1, name: "元旦 / New Year's Day", kind: "public" },
    { month: 5, day: 1, name: "劳动节 / Labour Day", kind: "public" },
    { month: 10, day: 1, name: "国庆节 / National Day", kind: "public" },
    { month: 10, day: 2, name: "国庆节假期 / National Day Holiday", kind: "public" },
    { month: 10, day: 3, name: "国庆节假期 / National Day Holiday", kind: "public" },
    { month: 12, day: 24, name: "平安夜 / Christmas Eve", kind: "observance" },
    { month: 12, day: 25, name: "圣诞节 / Christmas", kind: "observance" },
  ],
  GB: [
    { month: 1, day: 1, name: "New Year's Day", kind: "public" },
    { month: 12, day: 25, name: "Christmas Day", kind: "public" },
    { month: 12, day: 26, name: "Boxing Day", kind: "public" },
  ],
  CA: [
    { month: 1, day: 1, name: "New Year's Day", kind: "public" },
    { month: 7, day: 1, name: "Canada Day", kind: "public" },
    { month: 12, day: 25, name: "Christmas Day", kind: "public" },
    { month: 12, day: 26, name: "Boxing Day", kind: "public" },
  ],
};

// US "Nth weekday of month" holidays — Memorial Day (last Mon May), Labor Day
// (1st Mon Sep), Thanksgiving (4th Thu Nov), MLK Day (3rd Mon Jan), etc.
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): Date {
  // n = 1..5 (1 = first occurrence). weekday = 0 (Sun) .. 6 (Sat).
  const d = new Date(year, month - 1, 1);
  const offset = (weekday - d.getDay() + 7) % 7;
  d.setDate(1 + offset + (n - 1) * 7);
  return d;
}

function lastWeekdayOf(year: number, month: number, weekday: number): Date {
  // last day of month, walk back to the weekday
  const d = new Date(year, month, 0);
  const offset = (d.getDay() - weekday + 7) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function usCalculated(year: number): Array<{ date: Date; name: string; kind: HolidayKind }> {
  return [
    { date: nthWeekdayOf(year, 1, 1, 3), name: "Martin Luther King Jr. Day", kind: "public" },
    { date: nthWeekdayOf(year, 2, 1, 3), name: "Presidents' Day", kind: "public" },
    { date: lastWeekdayOf(year, 5, 1), name: "Memorial Day", kind: "public" },
    { date: nthWeekdayOf(year, 9, 1, 1), name: "Labor Day", kind: "public" },
    { date: nthWeekdayOf(year, 10, 1, 2), name: "Columbus Day", kind: "observance" },
    { date: nthWeekdayOf(year, 11, 4, 4), name: "Thanksgiving", kind: "public" },
    // Black Friday is the day after Thanksgiving — high-demand for retail.
    { date: (() => {
      const t = nthWeekdayOf(year, 11, 4, 4);
      const d = new Date(t);
      d.setDate(t.getDate() + 1);
      return d;
    })(), name: "Black Friday", kind: "observance" },
  ];
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Resolve a country code from a locale string like "en", "en-US", "zh", "zh-CN".
// Falls back to US for "en", CN for "zh", GB for "en-GB" etc.
export function inferCountryFromLocale(locale?: string | null): string {
  if (!locale) return "US";
  const parts = locale.replace("_", "-").split("-");
  const region = parts[1]?.toUpperCase();
  if (region && FIXED[region]) return region;
  const lang = parts[0]?.toLowerCase();
  if (lang === "zh") return "CN";
  if (lang === "en") return "US";
  return "US";
}

export function getHolidaysInRange(
  startIso: string,
  endIso: string,
  countryCode: string,
): HolidayInfo[] {
  const startY = Number(startIso.slice(0, 4));
  const endY = Number(endIso.slice(0, 4));
  const code = countryCode in FIXED ? countryCode : "US";
  const out: HolidayInfo[] = [];

  for (let y = startY; y <= endY; y++) {
    // Fixed-date holidays for this country
    for (const h of FIXED[code]) {
      const iso = toIso(new Date(y, h.month - 1, h.day));
      if (iso >= startIso && iso <= endIso) {
        out.push({ date: iso, name: h.name, kind: h.kind, countryCode: code });
      }
    }
    // US calculated holidays
    if (code === "US") {
      for (const h of usCalculated(y)) {
        const iso = toIso(h.date);
        if (iso >= startIso && iso <= endIso) {
          out.push({ date: iso, name: h.name, kind: h.kind, countryCode: code });
        }
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Convenience: get holidays for the next N days from today (local time).
export function getUpcomingHolidays(
  countryCode: string,
  days = 14,
  from: Date = new Date(),
): HolidayInfo[] {
  const startIso = toIso(from);
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return getHolidaysInRange(startIso, toIso(end), countryCode);
}

// ─── Opening hours ──────────────────────────────────────────────────────────

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayHours {
  open?: string;        // "HH:MM" (24h)
  close?: string;
  closed?: boolean;
}

export type WeeklyHours = Record<DayKey, DayHours>;

export function parseOpeningHours(raw: string | null | undefined): WeeklyHours | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as WeeklyHours;
  } catch {
    return null;
  }
}

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function dayKeyForDate(date: Date): DayKey {
  // JS getDay(): 0 = Sunday … 6 = Saturday. Map to mon-first.
  const idx = (date.getDay() + 6) % 7;
  return DAY_ORDER[idx];
}

export function isOpenOn(date: Date, hours: WeeklyHours | null): boolean {
  if (!hours) return true; // unset → assume open
  const day = hours[dayKeyForDate(date)];
  if (!day) return true;
  if (day.closed) return false;
  return !!(day.open && day.close);
}
