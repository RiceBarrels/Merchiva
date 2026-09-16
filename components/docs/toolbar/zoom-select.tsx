"use client";

import { useMemo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZOOM_LEVELS, type DocZoom } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";

export function ZoomSelect({ value, onChange, onClosed }: { value: DocZoom; onChange(zoom: DocZoom): void; onClosed?: () => void }) {
  const t = useT();
  const items = useMemo(
    () => [...ZOOM_LEVELS.map((level) => ({ value: String(level), label: `${level}%` })), { value: "fit", label: t("docs.view.zoomFit") }],
    [t],
  );
  return (
    <Select
      items={items}
      value={String(value)}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next === "fit" ? "fit" : Number(next));
      }}
      onOpenChangeComplete={(open) => {
        if (!open) onClosed?.();
      }}
    >
      <SelectTrigger size="sm" aria-label={t("docs.view.zoom")} className="w-[72px] font-mono text-[12px] tabular-nums">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <span className={item.value === "fit" ? undefined : "font-mono tabular-nums"}>{item.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
