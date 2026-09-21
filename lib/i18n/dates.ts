// Locale-aware date and time formatting.
//
// `new Date().toLocaleDateString("en-US", …)` renders an English date for every
// user, whatever locale they picked — the app ships in 8. These helpers format
// against a given locale instead, and cache the Intl formatters because
// constructing one per render is the expensive part.
//
// No "use client": the marketing pages are server components and call
// `formatDate` directly. The React hook lives in ./use-date-format.
//
// Machine-readable output (CSV columns, file names, the `YYYY-MM-DD` keys the
// schema stores — see lib/date-key.ts) deliberately does NOT go through here:
// that format must stay stable across locales.

import { LOCALE_BCP47, isLocale } from "@/lib/i18n/config";

/** App locale ("zh-cn") → BCP-47 tag ("zh-CN"); other tags pass through. */
export function intlLocaleTag(locale: string): string {
  return isLocale(locale) ? LOCALE_BCP47[locale] : locale;
}

/** A `formatDate` bound to one locale — what `useDateFormat()` returns. */
export type DateFormatter = (
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions,
) => string;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const tag = intlLocaleTag(locale);
  const key = `${tag}|${JSON.stringify(options)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let made: Intl.DateTimeFormat;
  try {
    made = new Intl.DateTimeFormat(tag, options);
  } catch {
    // An unsupported tag must not take the screen down.
    made = new Intl.DateTimeFormat("en", options);
  }
  cache.set(key, made);
  return made;
}

/** Format a date in `locale`. Invalid dates render as an empty string. */
export function formatDate(
  date: Date | number | string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return formatter(locale, options).format(d);
}
