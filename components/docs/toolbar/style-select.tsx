"use client";

import { useMemo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BLOCK_STYLE_LABEL_KEYS, BLOCK_STYLES, type BlockStyle } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const PREVIEW_CLASS: Readonly<Record<BlockStyle, string>> = {
  normal: "text-[13px]",
  title: "text-[20px] leading-tight",
  subtitle: "text-[15px] text-muted-foreground",
  h1: "text-[17px]",
  h2: "text-[15px]",
  h3: "text-[13.5px] font-semibold",
};

export function StyleSelect({
  value,
  onChange,
  disabled,
  onClosed,
  className,
}: {
  value: BlockStyle;
  onChange(style: BlockStyle): void;
  disabled?: boolean;
  /** Called after the popup closes (return focus to the editor). */
  onClosed?: () => void;
  className?: string;
}) {
  const t = useT();
  const items = useMemo(() => BLOCK_STYLES.map((style) => ({ value: style, label: t(BLOCK_STYLE_LABEL_KEYS[style]) })), [t]);
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onChange(next as BlockStyle);
      }}
      onOpenChangeComplete={(open) => {
        if (!open) onClosed?.();
      }}
    >
      <SelectTrigger size="sm" aria-label={t("docs.toolbar.styles")} className={cn("w-32 text-[12.5px]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-44">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <span className={PREVIEW_CLASS[item.value]}>{item.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
