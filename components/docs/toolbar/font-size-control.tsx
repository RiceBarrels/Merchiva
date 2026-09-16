"use client";

/** `[−][size][+]` font size stepper (docs-editor-ui spec §4.6). Typed sizes accept 1–400 pt. */
import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";

export function FontSizeControl({
  value,
  onChange,
  onStep,
  disabled,
}: {
  value: number;
  onChange(pt: number): void;
  onStep(dir: 1 | -1): void;
  disabled?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 10) / 10);

  const apply = () => {
    if (draft === null) return;
    const n = Number(draft.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) onChange(n);
  };

  return (
    <div className="flex items-center" dir="ltr">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("docs.toolbar.fontSizeDown")}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onStep(-1)}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <input
        value={shown}
        disabled={disabled}
        inputMode="decimal"
        aria-label={t("docs.toolbar.fontSize")}
        className="h-6 w-9 rounded border border-input bg-transparent text-center font-mono text-[12px] tabular-nums text-foreground outline-none focus-visible:border-ring disabled:opacity-50"
        onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setDraft(null);
            onStep(event.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("docs.toolbar.fontSizeUp")}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onStep(1)}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
