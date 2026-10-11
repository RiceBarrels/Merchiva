"use client";

import { Check } from "lucide-react";
import { LitePage } from "@/components/device/apps/lite-page";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_BCP47, LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/config";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Each language's icon: a letter of its own script, never a flag — a flag is a country, and one
 * language spans many (Spanish, French, Arabic) while one country speaks several.
 */
const LOCALE_GLYPHS: Record<Locale, string> = {
  en: "Aa",
  "zh-cn": "简",
  "zh-tw": "繁",
  "zh-hk": "粵",
  fr: "Ç",
  es: "Ñ",
  hi: "अ",
  ar: "ع",
};

/** Settings → Language as its own page: one big row per language, the current one checked. */
export function LanguagePage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <LitePage open={open} onClose={onClose} title={t("personalDevice.settings.language")}>
      <div className="space-y-2" role="radiogroup" aria-label={t("personalDevice.settings.language")}>
        {LOCALES.map((l) => {
          const on = l === locale;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => { hapticLight(); setLocale(l); }}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start active:bg-muted",
                on ? "border-primary" : "border-border",
              )}
            >
              <span
                lang={LOCALE_BCP47[l]}
                aria-hidden
                className={cn(
                  "grid h-10 w-10 flex-none place-items-center rounded text-[18px] font-semibold leading-none",
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {LOCALE_GLYPHS[l]}
              </span>
              <span lang={LOCALE_BCP47[l]} dir="auto" className="min-w-0 flex-1 truncate text-[16px] font-medium">{LOCALE_LABELS[l]}</span>
              {on && <Check className="h-5 w-5 flex-none text-primary" />}
            </button>
          );
        })}
      </div>
    </LitePage>
  );
}
