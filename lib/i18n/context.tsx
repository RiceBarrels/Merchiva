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

// If the current path is locale-prefixed (a public marketing page served under
// /<locale>/…), return that locale; otherwise null. Used so a language switch on
// a public page navigates to the matching prefix instead of only flipping the
// client cookie (which wouldn't change the server-rendered language).
function localePrefixOfPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  // Server-resolved locale (from the URL prefix via the proxy + root layout).
  // Seeds the first render so SSR markup is already in the right language.
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    // On a locale-prefixed public page the URL is authoritative — trust it and
    // keep the cookie in sync, skipping cookie/browser detection.
    if (typeof window !== "undefined") {
      const fromPath = localePrefixOfPath(window.location.pathname);
      if (fromPath) {
        writeCookie(LOCALE_COOKIE, fromPath);
        if (fromPath !== locale) setLocaleState(fromPath);
        return;
      }
    }
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
    // On a locale-prefixed public page, swap the prefix and navigate so the
    // server re-renders the page in the new language (full reload guarantees
    // fresh SSR HTML for SEO/correctness). App pages under /manager/ are unaffected.
    if (typeof window !== "undefined") {
      const { pathname, search, hash } = window.location;
      const current = localePrefixOfPath(pathname);
      if (current && current !== next) {
        const rest = pathname.slice(`/${current}`.length) || "/";
        window.location.assign(`/${next}${rest === "/" ? "" : rest}${search}${hash}`);
      }
    }
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
