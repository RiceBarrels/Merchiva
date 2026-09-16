"use client";

import { useMemo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_FONT_VALUE, DOC_FONTS, findDocFont } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function FontFamilySelect({
  value,
  onChange,
  disabled,
  onClosed,
  className,
}: {
  /** Stored `fontFamily` mark value, or null for the default. */
  value: string | null;
  onChange(css: string | null): void;
  disabled?: boolean;
  onClosed?: () => void;
  className?: string;
}) {
  const t = useT();
  const items = useMemo(
    () => [{ value: DEFAULT_FONT_VALUE, label: t("docs.toolbar.fontDefault") }, ...DOC_FONTS.map((font) => ({ value: font.css, label: font.label }))],
    [t],
  );
  const selected = findDocFont(value)?.css ?? DEFAULT_FONT_VALUE;

  return (
    <Select
      items={items}
      value={selected}
      disabled={disabled}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next === DEFAULT_FONT_VALUE ? null : String(next));
      }}
      onOpenChangeComplete={(open) => {
        if (!open) onClosed?.();
      }}
    >
      <SelectTrigger size="sm" aria-label={t("docs.toolbar.font")} className={cn("w-28 text-[12.5px]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-44">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <span style={item.value === DEFAULT_FONT_VALUE ? undefined : { fontFamily: item.value }}>{item.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
