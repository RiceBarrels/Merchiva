"use client";

// Colour picker of the Slides toolbar and menus (slides.md §7.3), reused by the phone sheets (S8): the deck theme's
// colours first (stored as `theme:<slot>`, so they follow a theme change), then the tint/shade grid Docs uses, the
// viewer's recent colours and a custom colour. A pick is final: every pick is one undo step, so nothing is applied
// while a custom colour is still being chosen.
import { useId, useState, type ComponentType } from "react";
import { Ban, Check } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DOC_COLOR_GRID, isLightColor, normalizeHex, pushRecentColor, readRecentColors } from "@/lib/docs/colors";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import type { ColorValue, ThemeColorSlot, ThemeSpec } from "@/lib/slides/model/types";
import { resolveColor } from "@/lib/slides/themes/themes";
import { cn } from "@/lib/utils";

/** Theme slots offered, in the order the swatches show them. */
const THEME_SLOTS: readonly ThemeColorSlot[] = ["text", "bg", "muted", "surface", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];

function slotLabel(slot: ThemeColorSlot, t: (key: string) => string): string {
  if (slot.startsWith("accent")) return fmt(t("slides.color.slotAccent"), { n: slot.slice("accent".length) });
  const keys: Partial<Record<ThemeColorSlot, string>> = {
    bg: "slides.color.slotBg",
    text: "slides.color.slotText",
    muted: "slides.color.slotMuted",
    surface: "slides.color.slotSurface",
  };
  return t(keys[slot] ?? "slides.color.slotText");
}

function Swatch({ hex, label, selected, onPick }: { hex: string; label: string; selected: boolean; onPick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        "relative h-[18px] w-[18px] rounded-[2px] border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-foreground" : "border-black/15 dark:border-white/20",
      )}
      style={{ backgroundColor: hex }}
    >
      {selected && <Check aria-hidden className={cn("absolute inset-0 m-auto h-3 w-3", isLightColor(hex) ? "text-black" : "text-white")} />}
    </button>
  );
}

const SECTION_LABEL = "text-[11px] font-medium text-muted-foreground";

export interface SlidesColorSwatchesProps {
  /** Names the picker for assistive technology ("Fill color"). */
  label: string;
  value: ColorValue | null;
  theme: ThemeSpec;
  onPick(color: ColorValue | null): void;
  /** Label of the "no colour" choice ("No fill", "No border"); without it there is none. */
  noneLabel?: string;
}

export function SlidesColorSwatches({ label, value, theme, onPick, noneLabel }: SlidesColorSwatchesProps) {
  const t = useT();
  const customId = useId();
  const [recent, setRecent] = useState<string[]>(() => readRecentColors());
  // null until the viewer types or picks a custom colour: tabbing through the fields must not replace a theme colour
  // with its current hex.
  const [custom, setCustom] = useState<string | null>(null);
  const shown = custom ?? (value ? resolveColor(value, theme) : "#000000");
  const pick = (color: ColorValue | null) => {
    if (color && color.startsWith("#")) setRecent(pushRecentColor(color));
    onPick(color);
  };
  const pickCustom = () => {
    const hex = custom === null ? null : normalizeHex(custom);
    if (hex && hex !== value) pick(hex as ColorValue);
  };

  return (
    <div role="group" aria-label={label} className="grid w-[222px] gap-2.5">
      {noneLabel && (
        <button
          type="button"
          aria-pressed={value === null}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(null)}
          className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-start text-[12.5px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted"
        >
          <Ban aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
          {noneLabel}
        </button>
      )}
      <div className="grid gap-1">
        <span className={SECTION_LABEL}>{t("slides.color.themeColors")}</span>
        <div className="flex flex-wrap gap-[3px]">
          {THEME_SLOTS.map((slot) => {
            const ref = `theme:${slot}` as ColorValue;
            return <Swatch key={slot} hex={theme.colors[slot]} label={slotLabel(slot, t)} selected={value === ref} onPick={() => pick(ref)} />;
          })}
        </div>
      </div>
      <div className="grid gap-[3px]">
        {DOC_COLOR_GRID.map((row, index) => (
          <div key={index} className="flex gap-[3px]">
            {row.map((hex) => (
              <Swatch key={hex} hex={hex} label={hex.toUpperCase()} selected={value === hex} onPick={() => pick(hex as ColorValue)} />
            ))}
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="grid gap-1">
          <span className={SECTION_LABEL}>{t("docs.colors.recent")}</span>
          <div className="flex flex-wrap gap-[3px]">
            {recent.map((hex) => (
              <Swatch key={hex} hex={hex} label={hex.toUpperCase()} selected={value === hex} onPick={() => pick(hex as ColorValue)} />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <label htmlFor={customId} className="shrink-0 text-[12.5px] text-muted-foreground">
          {t("docs.colors.custom")}
        </label>
        <input
          type="color"
          aria-label={t("docs.colors.custom")}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
          value={normalizeHex(shown) ?? "#000000"}
          onChange={(event) => setCustom(event.target.value)}
          onBlur={pickCustom}
        />
        <input
          id={customId}
          type="text"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          placeholder="#000000"
          className="h-7 min-w-0 flex-1 rounded border border-border bg-transparent px-2 font-mono text-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          value={shown}
          onChange={(event) => setCustom(event.target.value.slice(0, 7))}
          onBlur={pickCustom}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              pickCustom();
            }
          }}
        />
      </div>
    </div>
  );
}

export interface SlidesColorPickerProps extends SlidesColorSwatchesProps {
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

/** A toolbar button showing the current colour under its icon, opening the swatches. */
export function SlidesColorPicker({ icon: Icon, label, value, theme, onPick, noneLabel, disabled }: SlidesColorPickerProps) {
  const [open, setOpen] = useState(false);
  const finalFocus = useSlidesFinalFocus();
  const bar = value ? resolveColor(value, theme) : "transparent";
  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger render={<ToolbarIconButton aria-label={label} title={label} disabled={disabled} className="flex-col gap-0" />}>
        <Icon className="h-3.5 w-3.5" />
        <span aria-hidden className="mt-px h-[3px] w-3.5 rounded-[1px] border border-border/60" style={{ backgroundColor: bar }} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" finalFocus={finalFocus} data-slides-picker="">
        <SlidesColorSwatches
          label={label}
          value={value}
          theme={theme}
          noneLabel={noneLabel}
          onPick={(color) => {
            onPick(color);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
