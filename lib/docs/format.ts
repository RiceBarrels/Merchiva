/**
 * Locale-aware date/time formatting for the docs editor (last edit, versions, inserted dates).
 * `t()` has no interpolation; callers combine these with `fmt()` from `lib/i18n/fmt`.
 */
import { LOCALE_BCP47, isLocale } from "@/lib/i18n/config";

/** BCP-47 tag for an app locale (`zh-cn` → `zh-CN`); passes other tags through, falls back to `en`. */
export function intlLocale(locale: string): string {
  const tag = isLocale(locale) ? LOCALE_BCP47[locale] : locale;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0 ? tag : "en";
  } catch {
    return "en";
  }
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "2 minutes ago", "yesterday", "now" — `Intl.RelativeTimeFormat` with `numeric: "auto"`. */
export function formatRelativeTime(date: Date, locale: string, now: number = Date.now()): string {
  const tag = intlLocale(locale);
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  } catch {
    return date.toLocaleString();
  }
  if (abs < 45) return rtf.format(0, "second");
  for (const [unit, size] of UNITS) {
    if (abs >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60) || (seconds < 0 ? -1 : 1), "minute");
}

/** Medium date, e.g. "Sep 15, 2026" / "2026年9月15日". Used by Insert ▸ Date. */
export function formatInsertedDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(date);
}

/** Medium date + short time, e.g. for version names ("Before restoring Sep 15, 2026, 3:04 PM"). */
export function formatDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Parses the `YYYY-MM-DD` value of `<Input type="date">` as a local date. */
export function parseLocalIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Today as `YYYY-MM-DD` (local time). */
export function todayIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Paper size follows the locale: US English → Letter, everything else → A4 (docs-editor-ui spec §4.6). */
export function paperForLocale(locale: string): "letter" | "a4" {
  return locale === "en" ? "letter" : "a4";
}
