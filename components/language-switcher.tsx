"use client";

import { Globe } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n/context";
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
  const t = useT();

  if (variant === "inline") {
    return (
      <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
        <SelectTrigger
          size="sm"
          aria-label={t("common.language")}
          className={cn(
            "rounded border border-border bg-background text-[12px] text-foreground hover:bg-muted focus-visible:border-muted-foreground focus-visible:ring-0",
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
          "w-full gap-2 rounded border border-border bg-transparent px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-0",
          className,
        )}
      >
        <Globe className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
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
