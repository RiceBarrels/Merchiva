export const LOCALES = ["en", "zh-cn", "zh-tw", "zh-hk", "fr", "es", "hi", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "merchiva_locale";
export const RTL_LOCALES = new Set<Locale>(["ar"]);

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-cn": "简体中文",
  "zh-tw": "繁體中文",
  "zh-hk": "繁體中文（香港）",
  fr: "Français",
  es: "Español",
  hi: "हिन्दी",
  ar: "العربية",
};

// BCP-47 tags for <html lang> / hreflang. Keep in sync with LOCALES.
export const LOCALE_BCP47: Record<Locale, string> = {
  en: "en",
  "zh-cn": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hk": "zh-HK",
  fr: "fr",
  es: "es",
  hi: "hi",
  ar: "ar",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

// Normalize an arbitrary language tag (cookie value, browser tag, route param)
// to one of our supported locales, or null if there's no reasonable match.
// Handles legacy "zh" (→ zh-cn) and region variants (zh-TW → zh-tw, etc.).
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (isLocale(lower)) return lower;

  // Chinese: map script/region to our three variants.
  if (lower === "zh" || lower.startsWith("zh-")) {
    if (lower.includes("tw") || lower.includes("hant")) return "zh-tw";
    if (lower.includes("hk") || lower.includes("mo")) return "zh-hk";
    return "zh-cn"; // zh, zh-cn, zh-sg, zh-hans, bare zh
  }

  // Everything else: match on the primary subtag (en-US → en, fr-CA → fr).
  const short = lower.split("-")[0];
  if (isLocale(short)) return short;
  return null;
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  for (const raw of langs) {
    const match = normalizeLocale(raw);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export async function detectNativeLocale(): Promise<Locale | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Device } = await import("@capacitor/device");
    const info = await Device.getLanguageCode();
    return normalizeLocale(info.value);
  } catch {
    /* not running in Capacitor */
  }
  return null;
}
