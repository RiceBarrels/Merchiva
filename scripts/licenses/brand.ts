// Third-party product names that new user-facing copy must never use (Drive, Sheets, Slides, notices).
// One implementation for every check: the i18n fragment validator (scripts/i18n/drive/fragment.ts), the legal
// branding test and drive-ui's copy-branding test all call brandViolation. No imports, so it outlives the
// i18n fragments.

/** Third-party marks. Case-insensitive where the word has no ordinary English meaning. */
export const BRAND_TERMS_CI = /\b(excel|powerpoint|univer)\b/i;

/** Case-sensitive: "google", "microsoft" never appear as ordinary words, and lowercase "keynote" is an ordinary noun. */
export const BRAND_TERMS_CS = /\b(Google|Microsoft|Keynote|iWork)\b/;
// "Numbers" is deliberately not matched: it is an ordinary English word, capitalized at the start of a
// sentence. The product name is still forbidden; reviewers catch it.

/** Transliterations, per locale (\b does not work in these scripts). */
export const BRAND_TRANSLITERATIONS: Readonly<Record<string, RegExp>> = {
  hi: /एक्सेल|पावर\s?पॉइंट|गूगल|माइक्रोसॉफ्ट/,
  ar: /إكسل|اكسل|إكسيل|باور\s?بوينت|جوجل|غوغل|مايكروسوفت/,
  "zh-cn": /微软|谷歌|埃克塞尔/,
  "zh-tw": /微軟|谷歌|埃克塞爾/,
  "zh-hk": /微軟|谷歌|埃克塞爾/,
};

/** The first forbidden term found in `value` for `locale`, or null. */
export function brandViolation(locale: string, value: string): string | null {
  return BRAND_TERMS_CI.exec(value)?.[0] ?? BRAND_TERMS_CS.exec(value)?.[0] ?? BRAND_TRANSLITERATIONS[locale]?.exec(value)?.[0] ?? null;
}
