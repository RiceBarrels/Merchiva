"use client";

// Date stamps for the docs home and the "Open a document" picker, plus a shared
// minute clock so "Today" groups and time stamps roll over without a reload.

import { useSyncExternalStore } from "react";

// Shared with the rest of the app; re-exported because the docs modules
// already import it from here.
export { intlLocaleTag } from "@/lib/i18n/dates";
import { intlLocaleTag } from "@/lib/i18n/dates";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(tag: string, key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${tag}|${key}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(tag, options);
  } catch {
    formatter = new Intl.DateTimeFormat("en", options);
  }
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * Compact stamp in the style of Google Docs lists: the time for today, "Sep 12"
 * earlier this year, and a medium date ("Sep 12, 2025") for older dates.
 */
export function formatDocStamp(date: Date, locale: string, now: number): string {
  const tag = intlLocaleTag(locale);
  const current = new Date(now);
  if (
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth() &&
    date.getDate() === current.getDate()
  ) {
    return dateFormatter(tag, "time", { timeStyle: "short" }).format(date);
  }
  if (date.getFullYear() === current.getFullYear()) {
    return dateFormatter(tag, "monthDay", { month: "short", day: "numeric" }).format(date);
  }
  return dateFormatter(tag, "date", { dateStyle: "medium" }).format(date);
}

/** Full date and time for tooltips. */
export function formatDocDateTime(date: Date, locale: string): string {
  return dateFormatter(intlLocaleTag(locale), "dateTime", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// ── Minute clock ─────────────────────────────────────────────────────────────

const CLOCK_TICK_MS = 60_000;
const clockListeners = new Set<() => void>();
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  clockNow = Date.now();
  for (const listener of [...clockListeners]) listener();
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") tick();
}

function readClock(): number {
  if (clockNow === 0) clockNow = Date.now();
  return clockNow;
}

function subscribeClock(onChange: () => void): () => void {
  clockListeners.add(onChange);
  if (!clockTimer) {
    clockTimer = setInterval(tick, CLOCK_TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    clockListeners.delete(onChange);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
      clockNow = 0;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

const getServerClock = (): number => 0;

/** Epoch ms, refreshed every minute and when the page becomes visible again. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribeClock, readClock, getServerClock);
}
