"use client";

// Currency utilities — single source of truth for money formatting across the app.
// The active currency is stored per-organization in SpacetimeDB (settings.paymentCurrency).
// Use the `useCurrency()` hook inside client components to format amounts; use the pure
// `formatCurrency` / `getCurrencyInfo` helpers anywhere a code is already known.

import { useMemo } from "react";
import { useSettings } from "@/lib/spacetimedb/hooks/useSettings";

export interface CurrencyInfo {
  /** ISO 4217 code, e.g. "USD" */
  code: string;
  /** Display symbol, e.g. "$" */
  symbol: string;
  /** English fallback name (i18n labels live in messages/*.json under settings.currencyName.*) */
  name: string;
  /** i18n key for the localized currency name */
  labelKey: string;
  /** Natural fraction digits for this currency (JPY/KRW have 0) */
  decimals: number;
}

// Common currencies. Order is the display order in the settings picker.
export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", symbol: "$",   name: "US Dollar",         labelKey: "settings.currencyName.USD", decimals: 2 },
  { code: "EUR", symbol: "€",   name: "Euro",              labelKey: "settings.currencyName.EUR", decimals: 2 },
  { code: "GBP", symbol: "£",   name: "British Pound",     labelKey: "settings.currencyName.GBP", decimals: 2 },
  { code: "CNY", symbol: "¥",   name: "Chinese Yuan",      labelKey: "settings.currencyName.CNY", decimals: 2 },
  { code: "JPY", symbol: "¥",   name: "Japanese Yen",      labelKey: "settings.currencyName.JPY", decimals: 0 },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar",  labelKey: "settings.currencyName.HKD", decimals: 2 },
  { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar", labelKey: "settings.currencyName.TWD", decimals: 2 },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar",   labelKey: "settings.currencyName.CAD", decimals: 2 },
  { code: "AUD", symbol: "A$",  name: "Australian Dollar", labelKey: "settings.currencyName.AUD", decimals: 2 },
  { code: "KRW", symbol: "₩",   name: "South Korean Won",  labelKey: "settings.currencyName.KRW", decimals: 0 },
  { code: "INR", symbol: "₹",   name: "Indian Rupee",      labelKey: "settings.currencyName.INR", decimals: 2 },
  { code: "SAR", symbol: "﷼",   name: "Saudi Riyal",       labelKey: "settings.currencyName.SAR", decimals: 2 },
];

export const DEFAULT_CURRENCY = "USD";

const BY_CODE: Record<string, CurrencyInfo> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

export function getCurrencyInfo(code: string | null | undefined): CurrencyInfo {
  return (code && BY_CODE[code]) || BY_CODE[DEFAULT_CURRENCY];
}

export function getCurrencySymbol(code: string | null | undefined): string {
  return getCurrencyInfo(code).symbol;
}

export interface FormatOptions {
  /** Override the natural decimal count (e.g. 0 for whole-number summaries). */
  decimals?: number;
  /** Group thousands with separators (default true). */
  grouping?: boolean;
  /** Render the bare number with no currency symbol. */
  noSymbol?: boolean;
}

/**
 * Format an amount in the given currency, e.g. formatCurrency(1234.5, "EUR") → "€1,234.50".
 * Symbol is always a prefix to match the app's existing "$x.xx" convention.
 */
export function formatCurrency(
  amount: number | null | undefined,
  code: string | null | undefined = DEFAULT_CURRENCY,
  opts: FormatOptions = {},
): string {
  const info = getCurrencyInfo(code);
  const decimals = opts.decimals ?? info.decimals;
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const grouped =
    opts.grouping === false
      ? n.toFixed(decimals)
      : n.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
  return opts.noSymbol ? grouped : `${info.symbol}${grouped}`;
}

export interface UseCurrencyResult {
  /** Active ISO code, e.g. "USD". */
  code: string;
  /** Active symbol, e.g. "$". */
  symbol: string;
  info: CurrencyInfo;
  /** Format an amount in the active currency. */
  format: (amount: number | null | undefined, opts?: FormatOptions) => string;
}

/**
 * React hook returning the organization's active currency and a bound formatter.
 * Reactive — updates everywhere when the setting changes in SpacetimeDB.
 */
export function useCurrency(): UseCurrencyResult {
  const { settings } = useSettings();
  const code = settings?.paymentCurrency || DEFAULT_CURRENCY;
  return useMemo<UseCurrencyResult>(() => {
    const info = getCurrencyInfo(code);
    return {
      code: info.code,
      symbol: info.symbol,
      info,
      format: (amount, opts) => formatCurrency(amount, info.code, opts),
    };
  }, [code]);
}
