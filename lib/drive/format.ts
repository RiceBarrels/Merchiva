// Byte sizes for people: Drive file sizes, the storage meter, upload limits.
//
// Binary steps (1 KB = 1024 bytes), like the quota constants in lib/drive/rules.ts, so the
// default 10 GiB quota reads "10 GB" and not "10.7 GB". The unit names come from Intl
// (CLDR), so each locale gets its own ("12,3 Mo" in French, "12.3 MB" in Chinese) without
// any i18n keys. Pure: no React, no DOM.

import { intlLocaleTag } from "@/lib/i18n/dates";

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte", "petabyte"] as const;
type ByteUnit = (typeof UNITS)[number];

const STEP = 1024;
const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, unit: ByteUnit, fractionDigits: number): Intl.NumberFormat {
  const tag = intlLocaleTag(locale);
  const key = `${tag}|${unit}|${fractionDigits}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Whole bytes read better spelled out ("512 bytes"); larger units use the short symbol ("1.5 kB").
  const options: Intl.NumberFormatOptions = {
    style: "unit",
    unit,
    unitDisplay: unit === "byte" ? "long" : "short",
    maximumFractionDigits: fractionDigits,
  };
  let made: Intl.NumberFormat;
  try {
    made = new Intl.NumberFormat(tag, options);
  } catch {
    // An unsupported tag must not take the screen down.
    made = new Intl.NumberFormat("en", options);
  }
  cache.set(key, made);
  return made;
}

/**
 * `bytes` in the largest binary unit that keeps the number below 1024: one decimal below 100
 * ("1.5 kB", "12.3 MB"), none from 100 up ("512 bytes", "250 MB"). A value that would round up
 * to 1024 moves to the next unit ("1 MB", not "1,024 kB"). Negative or non-finite input reads as 0.
 */
export function formatDriveBytes(bytes: number, locale: string): string {
  let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let index = 0;
  while (index < UNITS.length - 1 && value >= STEP) {
    value /= STEP;
    index += 1;
  }
  let digits = index === 0 || value >= 100 ? 0 : 1;
  // Rounding can reach the next step (1023.96 kB → "1,024 kB"); show it in the next unit instead.
  const factor = 10 ** digits;
  if (index < UNITS.length - 1 && Math.round(value * factor) / factor >= STEP) {
    value /= STEP;
    index += 1;
    digits = 1;
  }
  return formatter(locale, UNITS[index], digits).format(value);
}
