"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  RTL_LOCALES,
  detectBrowserLocale,
  detectNativeLocale,
  isLocale,
  type Locale,
} from "./config";
import { getDictionary, lookup } from "./dictionaries";

type I18nContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (next: Locale) => void;
  t: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const cookieVal = readCookie(LOCALE_COOKIE);
    if (isLocale(cookieVal)) {
      if (cookieVal !== locale) setLocaleState(cookieVal);
      return;
    }
    // No cookie — try native device language first, then browser
    detectNativeLocale().then((native) => {
      const initial = native ?? detectBrowserLocale();
      writeCookie(LOCALE_COOKIE, initial);
      if (initial !== locale) setLocaleState(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dir: "ltr" | "rtl" = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    writeCookie(LOCALE_COOKIE, next);
    setLocaleState(next);
  }, []);

  const dict = useMemo(() => getDictionary(locale), [locale]);
  const t = useCallback((path: string) => lookup(dict, path), [dict]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir, setLocale, t }),
    [locale, dir, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      dir: "ltr",
      setLocale: () => {},
      t: (path: string) => lookup(getDictionary(DEFAULT_LOCALE), path),
    };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
