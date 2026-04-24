"use client";

import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "inline";
}) {
  const { locale, setLocale } = useI18n();

  if (variant === "inline") {
    return (
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className={cn(
          "h-8 rounded border border-stone-200 bg-white px-2 text-[12px] text-stone-700 outline-none focus:border-stone-400",
          className,
        )}
        aria-label="Language"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5",
        className,
      )}
    >
      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="flex-1 bg-transparent text-[12px] text-foreground outline-none"
        aria-label="Language"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
