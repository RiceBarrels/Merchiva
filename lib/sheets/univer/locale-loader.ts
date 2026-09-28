// The app locale → Univer's language pack (sheets.md §9.5). Univer 1.0.2 has no Hindi pack, so `hi` falls back
// to English for Univer's own ribbon and menus (our chrome stays Hindi). Each language is its own small chunk,
// loaded through a static switch (no template-literal import), and white-labelled once loaded.

import type { ILanguagePack, LocaleType } from "@univerjs/presets";
import { UNIVER_LOCALE } from "@/lib/sheets/univer-constants";
import { viewOnlyOverrides, whiteLabelLocale } from "./white-label";

export type UniverLocaleTag = "en-US" | "es-ES" | "fr-FR" | "ar-SA" | "zh-CN" | "zh-TW" | "zh-HK";

export interface UniverLocaleChoice {
  type: LocaleType;
  tag: UniverLocaleTag;
  /** The editor chrome's direction; the grid itself stays left to right. */
  direction: "ltr" | "rtl";
  /** True when Univer has no pack for the app locale and English is used instead. */
  fallback: boolean;
}

export interface SheetUniverLocale {
  type: LocaleType;
  pack: ILanguagePack;
  direction: "ltr" | "rtl";
  fallback: boolean;
}

const CHOICES: Readonly<Record<string, Omit<UniverLocaleChoice, "fallback">>> = {
  en: { type: UNIVER_LOCALE.EN_US, tag: "en-US", direction: "ltr" },
  es: { type: UNIVER_LOCALE.ES_ES, tag: "es-ES", direction: "ltr" },
  fr: { type: UNIVER_LOCALE.FR_FR, tag: "fr-FR", direction: "ltr" },
  ar: { type: UNIVER_LOCALE.AR_SA, tag: "ar-SA", direction: "rtl" },
  "zh-cn": { type: UNIVER_LOCALE.ZH_CN, tag: "zh-CN", direction: "ltr" },
  "zh-tw": { type: UNIVER_LOCALE.ZH_TW, tag: "zh-TW", direction: "ltr" },
  "zh-hk": { type: UNIVER_LOCALE.ZH_HK, tag: "zh-HK", direction: "ltr" },
};

/** Univer's locale for an app locale (lib/i18n/config.ts); anything without a pack (hi) → English. */
export function univerLocaleFor(appLocale: string): UniverLocaleChoice {
  const choice = CHOICES[appLocale.toLowerCase()];
  return choice ? { ...choice, fallback: false } : { ...CHOICES.en, fallback: true };
}

/** The merged (not yet white-labelled) pack of one language. */
export async function importUniverPack(tag: UniverLocaleTag): Promise<ILanguagePack> {
  switch (tag) {
    case "es-ES":
      return (await import("./locales/es-ES")).default;
    case "fr-FR":
      return (await import("./locales/fr-FR")).default;
    case "ar-SA":
      return (await import("./locales/ar-SA")).default;
    case "zh-CN":
      return (await import("./locales/zh-CN")).default;
    case "zh-TW":
      return (await import("./locales/zh-TW")).default;
    case "zh-HK":
      return (await import("./locales/zh-HK")).default;
    case "en-US":
      return (await import("./locales/en-US")).default;
  }
}

/**
 * Loads and white-labels Univer's pack for `appLocale`. `viewOnlyHint` (t("sheets.lease.viewOnlyHint"))
 * replaces the text of every permission-denied message a viewer can trigger.
 */
export async function loadUniverLocale(appLocale: string, brand: string, viewOnlyHint?: string): Promise<SheetUniverLocale> {
  const choice = univerLocaleFor(appLocale);
  const merged = await importUniverPack(choice.tag);
  const overrides = viewOnlyHint ? viewOnlyOverrides(merged, viewOnlyHint) : undefined;
  return {
    type: choice.type,
    pack: whiteLabelLocale(merged, { brand, overrides }),
    direction: choice.direction,
    fallback: choice.fallback,
  };
}
