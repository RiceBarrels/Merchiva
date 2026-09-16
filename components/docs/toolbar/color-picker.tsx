"use client";

/**
 * Text / highlight colour picker (docs-editor-ui spec §4.6).
 *
 * Three tiers, the way every word processor does it: the named basics, the full tint/shade grid, and a custom
 * colour. Recently used colours are kept per viewer so a brand colour is one click away after the first time.
 */
import { useId, useState } from "react";
import { Baseline, Check, ChevronDown, Highlighter, Pipette } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DOC_COLOR_GRID,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  isLightColor,
  normalizeHex,
  pushRecentColor,
  readRecentColors,
  type DocSwatch,
} from "@/lib/docs/colors";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { ToolbarIconButton } from "./toolbar-button";

function Swatch({
  hex,
  label,
  selected,
  onPick,
  className,
}: {
  hex: string;
  label: string;
  selected: boolean;
  onPick(): void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        "relative h-[18px] w-[18px] rounded-[2px] border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-foreground" : "border-black/15",
        className,
      )}
      style={{ backgroundColor: hex }}
    >
      {selected && <Check className={cn("absolute inset-0 m-auto h-3 w-3", isLightColor(hex) ? "text-black" : "text-white")} />}
    </button>
  );
}

export function ColorSwatches({
  kind,
  value,
  onChange,
  onCommit,
  variant = "full",
}: {
  kind: "text" | "highlight";
  value: string | null;
  onChange(hex: string | null): void;
  /** Fired only when a choice is final (a swatch click, or a custom colour the member stopped editing). */
  onCommit?: (hex: string | null) => void;
  /** `compact` keeps the full grid behind a disclosure — the mobile format sheet shows two of these at once. */
  variant?: "full" | "compact";
}) {
  const t = useT();
  const customId = useId();
  const swatches: readonly DocSwatch[] = kind === "text" ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const [recent, setRecent] = useState<string[]>(() => readRecentColors());
  const [custom, setCustom] = useState(() => value ?? "#000000");
  const [gridOpen, setGridOpen] = useState(variant === "full");

  // Applied live so the selection updates as a custom colour is typed or dragged.
  const preview = (hex: string | null) => onChange(hex);
  const pick = (hex: string | null) => {
    if (hex) setRecent(pushRecentColor(hex));
    onChange(hex);
    onCommit?.(hex);
  };

  return (
    <div className="grid gap-2.5" role="radiogroup" aria-label={kind === "text" ? t("docs.toolbar.textColor") : t("docs.toolbar.highlight")}>
      <div className="flex flex-wrap gap-1">
        {swatches.map((swatch) => (
          <Swatch
            key={swatch.name}
            hex={swatch.hex}
            label={t(`docs.colors.${swatch.name}`)}
            selected={value === swatch.hex}
            onPick={() => pick(swatch.hex)}
          />
        ))}
      </div>

      {variant === "compact" && !gridOpen && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setGridOpen(true)}
          className="flex h-7 items-center gap-1 rounded border border-border px-2 text-[12.5px] hover:bg-muted"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {t("docs.colors.more")}
        </button>
      )}

      {gridOpen && (
        <div className="grid gap-[3px]">
          {DOC_COLOR_GRID.map((row, index) => (
            <div key={index} className="flex gap-[3px]">
              {row.map((hex) => (
                <Swatch key={hex} hex={hex} label={hex.toUpperCase()} selected={value === hex} onPick={() => pick(hex)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="grid gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">{t("docs.colors.recent")}</span>
          <div className="flex flex-wrap gap-1">
            {recent.map((hex) => (
              <Swatch key={hex} hex={hex} label={hex.toUpperCase()} selected={value === hex} onPick={() => pick(hex)} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <label
          htmlFor={customId}
          title={t("docs.colors.custom")}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded border border-border px-2 text-[12.5px] hover:bg-muted"
        >
          <Pipette className="h-3.5 w-3.5" />
          {t("docs.colors.custom")}
        </label>
        <input
          id={customId}
          type="color"
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
          value={normalizeHex(custom) ?? "#000000"}
          onChange={(event) => {
            setCustom(event.target.value);
            preview(normalizeHex(event.target.value));
          }}
          onBlur={() => pick(normalizeHex(custom))}
        />
        <input
          type="text"
          dir="ltr"
          spellCheck={false}
          aria-label={t("docs.colors.custom")}
          placeholder="#000000"
          className="h-7 w-[86px] rounded border border-border bg-transparent px-2 font-mono text-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          value={custom}
          onChange={(event) => {
            setCustom(event.target.value);
            const hex = normalizeHex(event.target.value);
            if (hex) preview(hex);
          }}
          onBlur={() => pick(normalizeHex(custom))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              pick(normalizeHex(custom));
            }
          }}
        />
      </div>

      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick(null)}
        className="h-7 rounded border border-border px-2 text-start text-[12.5px] text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("docs.toolbar.noColor")}
      </button>
    </div>
  );
}

export function ColorPicker({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: "text" | "highlight";
  value: string | null;
  onChange(hex: string | null): void;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const label = kind === "text" ? t("docs.toolbar.textColor") : t("docs.toolbar.highlight");
  const Icon = kind === "text" ? Baseline : Highlighter;
  const bar = value ?? (kind === "text" ? "#0a0a0a" : "transparent");

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger
        render={<ToolbarIconButton aria-label={label} title={label} disabled={disabled} className="flex-col gap-0" />}
      >
        <Icon className="h-3.5 w-3.5" />
        <span aria-hidden className="mt-px h-[3px] w-3.5 rounded-[1px] border border-border/60" style={{ backgroundColor: bar }} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <ColorSwatches kind={kind} value={value} onChange={onChange} onCommit={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
