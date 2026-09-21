"use client";

// Locale-aware date and time formatting.
//
// `new Date().toLocaleDateString("en-US", …)` renders an English date for every
// user, whatever locale they picked — the app ships in 8. These helpers format
// against the active locale instead, and cache the Intl formatters because
// constructing one per render is the expensive part.
//
// Machine-readable output (CSV columns, file names, the `YYYY-MM-DD` keys the
// schema stores) deliberately does NOT go through here: that format must stay
// stable across locales.

import { useCallback } from "react";
import { LOCALE_BCP47, isLocale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";

/** App locale ("zh-cn") → BCP-47 tag ("zh-CN"); other tags pass through. */
export function intlLocaleTag(locale: string): string {
  return isLocale(locale) ? LOCALE_BCP47[locale] : locale;
}

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

/**
 * `formatDate` bound to the active locale.
 *
 * The returned function is stable for a given locale, so it is safe in a
 * dependency array.
 */
export function useDateFormat(): (date: Date | number | string, options: Intl.DateTimeFormatOptions) => string {
  const { locale } = useI18n();
  return useCallback(
    (date: Date | number | string, options: Intl.DateTimeFormatOptions) => formatDate(date, locale, options),
    [locale],
  );
}
