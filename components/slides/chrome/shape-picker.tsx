"use client";

// The shape picker (slides.md §3, §7.3): the 25 preset shapes as outline glyphs drawn from the same geometry the
// renderer uses (presetPath), in a grid for the toolbar popover and the phone "Add" sheet (S8), and as menu icons
// for Insert ▸ Shape.
import { useState, type ComponentType } from "react";
import { Shapes } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/context";
import { SHAPE_PRESETS, presetPath } from "@/lib/slides/geometry/presets";
import type { ShapePreset } from "@/lib/slides/model/types";
import { cn } from "@/lib/utils";

/** Presets drawn in a square box (the rest in a wide one), as newShape() sizes them. */
const SQUARE: ReadonlySet<ShapePreset> = new Set<ShapePreset>(["ellipse", "star4", "star5", "plus", "heart", "donut", "octagon", "hexagon", "pentagon", "diamond"]);

/** Path data of a glyph inside a 20×20 view box (callout tails reach below the box, so wide shapes sit high). */
function glyphPath(preset: ShapePreset): { d: string; x: number; y: number } {
  if (SQUARE.has(preset)) return { d: presetPath(preset, 16, 16), x: 2, y: 2 };
  return { d: presetPath(preset, 18, 13), x: 1, y: 2.5 };
}

export function ShapeGlyph({ preset, className }: { preset: ShapePreset; className?: string }) {
  const { d, x, y } = glyphPath(preset);
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn("h-4 w-4 shrink-0 overflow-visible", className)}>
      <path d={d} transform={`translate(${x} ${y})`} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}

function glyphComponent(preset: ShapePreset): ComponentType<{ className?: string }> {
  function Glyph({ className }: { className?: string }) {
    return <ShapeGlyph preset={preset} className={className} />;
  }
  Glyph.displayName = `ShapeGlyph(${preset})`;
  return Glyph;
}

/** One icon component per preset (DocMenuItem takes an icon component). */
export const SHAPE_GLYPHS: Readonly<Record<ShapePreset, ComponentType<{ className?: string }>>> = Object.fromEntries(
  SHAPE_PRESETS.map((preset) => [preset, glyphComponent(preset)]),
) as Record<ShapePreset, ComponentType<{ className?: string }>>;

export function ShapeGrid({ onPick, className }: { onPick(preset: ShapePreset): void; className?: string }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("slides.insert.shape")} className={cn("grid grid-cols-5 gap-0.5", className)}>
      {SHAPE_PRESETS.map((preset) => {
        const label = t(`slides.shapes.${preset}`);
        return (
          <button
            key={preset}
            type="button"
            aria-label={label}
            title={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(preset)}
            className="flex h-8 w-8 items-center justify-center rounded text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10 pointer-coarse:w-10"
          >
            <ShapeGlyph preset={preset} className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}

/** Toolbar button opening the shape grid. */
export function ShapePicker({ onPick, disabled }: { onPick(preset: ShapePreset): void; disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.insert.shape");
  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger render={<ToolbarIconButton aria-label={label} title={label} disabled={disabled} />}>
        <Shapes className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1.5" finalFocus={finalFocus} data-slides-picker="">
        <ShapeGrid
          onPick={(preset) => {
            setOpen(false);
            onPick(preset);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
