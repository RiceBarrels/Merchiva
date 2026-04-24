export const LOCALES = ["en", "zh", "es", "hi", "ar", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "merchiva_locale";
export const RTL_LOCALES = new Set<Locale>(["ar"]);

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  es: "Español",
  hi: "हिन्दी",
  ar: "العربية",
  fr: "Français",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  for (const raw of langs) {
    if (!raw) continue;
    const short = raw.toLowerCase().split("-")[0];
    if (isLocale(short)) return short;
  }
  return DEFAULT_LOCALE;
}
