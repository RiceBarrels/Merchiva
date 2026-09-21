"use client";

import { useCallback } from "react";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, type DateFormatter } from "@/lib/i18n/dates";

/**
 * `formatDate` bound to the active locale.
 *
 * The returned function is stable for a given locale, so it is safe in a
 * dependency array.
 */
export function useDateFormat(): DateFormatter {
  const { locale } = useI18n();
  return useCallback(
    (date, options) => formatDate(date, locale, options),
    [locale],
  );
}
