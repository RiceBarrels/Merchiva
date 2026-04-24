"use client";

import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
        <SelectTrigger
          size="sm"
          aria-label="Language"
          className={cn(
            "rounded border border-stone-200 bg-white text-[12px] text-stone-700 hover:bg-stone-50 focus-visible:border-stone-400 focus-visible:ring-0",
            className,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((l) => (
            <SelectItem key={l} value={l}>
              {LOCALE_LABELS[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger
        size="sm"
        aria-label="Language"
        className={cn(
          "w-full gap-2 rounded border border-stone-200 bg-transparent px-2.5 text-[13px] text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-0",
          className,
        )}
      >
        <Globe className="h-[15px] w-[15px] shrink-0 text-stone-500" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {LOCALE_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
