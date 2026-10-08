// Runtime strings for the Forms renderer (design B.8). The renderer's own dictionaries are mostly machine
// translated and say "survey", so every string a Forms screen can show comes from our `forms.runtime.*` keys and
// is registered under our own locale code (zh-hk included). This file never imports the renderer package —
// survey-host.tsx is its only importer — so the localization object is passed in.

import { LOCALE_LABELS, RTL_LOCALES, type Locale } from "@/lib/i18n/config";

/** The renderer strings Forms can show, each read from `forms.runtime.<name>`. */
export const SURVEY_RUNTIME_STRINGS = [
  "pagePrevText",
  "pageNextText",
  "completeText",
  "progressText",
  "emptySurvey",
  "completingSurvey",
  "loadingSurvey",
  "placeholder",
  "ratingOptionsCaption",
  "requiredError",
  "numericError",
  "minError",
  "maxError",
  "numericMinMax",
  "numericMin",
  "numericMax",
  "invalidInputError",
  "textMaxLength",
  "minSelectError",
  "maxSelectError",
  "exceedMaxSize",
  "fileSizeUnits",
  "exceedMaxFiles",
  "uploadingFile",
  "loadingFile",
  "chooseFile",
  "noFileChosen",
  "filePlaceholder",
  "chooseFileCaption",
  "takePhotoCaption",
  "photoPlaceholder",
  "fileOrPhotoPlaceholder",
  "replaceFileCaption",
  "removeFileCaption",
  "confirmRemoveFile",
  "confirmRemoveAllFiles",
  "clearCaption",
  "selectCaption",
  "booleanCheckedLabel",
  "booleanUncheckedLabel",
  "savingData",
  "savingDataError",
  "savingDataSuccess",
  "saveAgainButton",
  "modalApplyButtonText",
  "modalCancelButtonText",
  "filterStringPlaceholder",
  "emptyMessage",
  "loadingData",
  "tagboxDoneButtonCaption",
  "more",
  "ok",
  "cancel",
] as const;

export type SurveyRuntimeString = (typeof SURVEY_RUNTIME_STRINGS)[number];

/** The i18n key of one renderer string. */
export function runtimeKey(name: SurveyRuntimeString): string {
  return `forms.runtime.${name}`;
}

/** The part of the renderer's localization object this file uses. */
export interface SurveyLocalizationLike {
  getLocaleStrings(loc: string): unknown;
  setupLocale(config: { localeCode: string; strings: unknown; nativeName: string; englishName: string; rtl?: boolean }): void;
}

/** The renderer strings for one locale: our copy where a key resolves, never the raw key path. */
export function runtimeStrings(t: (key: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SURVEY_RUNTIME_STRINGS) {
    const key = runtimeKey(name);
    const value = t(key);
    if (typeof value === "string" && value !== "" && value !== key) out[name] = value;
  }
  return out;
}

const ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  "zh-hk": "Chinese (Hong Kong)",
  fr: "French",
  es: "Spanish",
  hi: "Hindi",
  ar: "Arabic",
};

// The renderer's built-in English, captured before "en" is replaced, so a string we do not list still has a
// fallback (its lookup ends at "en").
let builtInEnglish: Record<string, unknown> | null = null;

/**
 * Registers `locale`'s strings with the renderer. The renderer's English stays underneath, so any string not in
 * SURVEY_RUNTIME_STRINGS still resolves. `ar` registers as right-to-left.
 */
export function setupSurveyLocale(loc: SurveyLocalizationLike, locale: Locale, t: (key: string) => string): void {
  if (builtInEnglish === null) {
    const en = loc.getLocaleStrings("en");
    builtInEnglish = en && typeof en === "object" ? { ...(en as Record<string, unknown>) } : {};
  }
  loc.setupLocale({
    localeCode: locale,
    strings: { ...builtInEnglish, ...runtimeStrings(t) },
    nativeName: LOCALE_LABELS[locale],
    englishName: ENGLISH_NAMES[locale],
    rtl: RTL_LOCALES.has(locale),
  });
}
