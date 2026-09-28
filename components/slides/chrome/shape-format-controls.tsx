"use client";

// Object controls of the Slides toolbar (slides.md §3, §7.3), by what is selected: fill for text boxes and shapes;
// outline colour, weight and dash for them, pictures and lines; line start and end for lines; the mask of a picture;
// cell colour and the table menu for a table; and the Arrange menu for anything. Each change is one el.patch() call,
// so it is one undo step.
import type { ComponentType, ReactNode } from "react";
import { ArrowLeftToLine, ArrowRightToLine, Circle, Layers, Minus, PaintBucket, PenLine, SquareDashed } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { DocMenu, DocMenuContent, DocMenuRadioGroup, DocMenuRadioItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { SlidesColorPicker } from "@/components/slides/chrome/color-picker";
import {
  DASH_STYLES, IMAGE_MASKS, LINE_ENDS, STROKE_WEIGHTS, currentFill, currentStroke, fillPatches, lineEndPatches, maskPatches,
  strokeColorPatches, strokeDashPatches, strokeWeightPatches,
} from "@/components/slides/chrome/format-patches";
import type { SlidesSelectionInfo } from "@/components/slides/chrome/selection-info";
import { TableMenu } from "@/components/slides/chrome/table-controls";
import type { ToolbarGroupDef } from "@/components/slides/chrome/toolbar-parts";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { ArrangeItems } from "@/components/slides/menubar/arrange-menu";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import type { DashStyle, ImageElement, LineEnd } from "@/lib/slides/model/types";

const ICON = 30;

/** SVG stroke-dasharray of a dash style (for the previews), at stroke width 2. */
const DASH_ARRAY: Readonly<Record<DashStyle, string | undefined>> = { solid: undefined, dash: "6 3", dot: "2 3", dashDot: "6 3 2 3" };
const DASH_KEYS: Readonly<Record<DashStyle, string>> = {
  solid: "slides.format.dashSolid",
  dash: "slides.format.dashDash",
  dot: "slides.format.dashDot",
  dashDot: "slides.format.dashDashDot",
};
const END_KEYS: Readonly<Record<LineEnd, string>> = {
  none: "slides.format.endNone",
  arrow: "slides.format.endArrow",
  triangle: "slides.format.endTriangle",
  stealth: "slides.format.endStealth",
  oval: "slides.format.endOval",
  diamond: "slides.format.endDiamond",
};
const MASK_KEYS: Readonly<Record<ImageElement["mask"], string>> = {
  "": "slides.format.maskNone",
  ellipse: "slides.format.maskEllipse",
  roundRect: "slides.format.maskRounded",
};

/** A toolbar menu of radio choices. */
function ChoiceMenu({ label, icon: Icon, value, options, disabled, onChange }: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; preview?: ReactNode }>;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const finalFocus = useSlidesFinalFocus();
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarIconButton aria-label={label} title={label} />}>
        <Icon className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-44">
        <DocMenuRadioGroup value={value} onValueChange={(next: string) => onChange(next)}>
          {options.map((option) => (
            <DocMenuRadioItem closeOnClick key={option.value} value={option.value} label={option.label}>
              <span className="flex items-center gap-2">
                {option.preview}
                {option.label}
              </span>
            </DocMenuRadioItem>
          ))}
        </DocMenuRadioGroup>
      </DocMenuContent>
    </DocMenu>
  );
}

function LinePreview({ width, dash }: { width: number; dash?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 12" className="h-3 w-8 shrink-0 text-foreground">
      <line x1="1" y1="6" x2="31" y2="6" stroke="currentColor" strokeWidth={Math.min(width, 8)} strokeDasharray={dash} />
    </svg>
  );
}

function ArrangeButton({ disabled }: { disabled: boolean }) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.menubar.arrange");
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarIconButton aria-label={label} title={label} />}>
        <Layers className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <ArrangeItems />
      </DocMenuContent>
    </DocMenu>
  );
}

/** The object control groups for the toolbar; none while nothing is selected. */
export function useShapeFormatGroups(sel: SlidesSelectionInfo): ToolbarGroupDef[] {
  const t = useT();
  const { el, deck } = useSlidesEditor();
  if (sel.selected.length === 0) return [];
  const theme = deck.meta.theme;
  const disabled = !sel.writable;
  const els = sel.selected;
  const stroke = currentStroke(els);
  const linesOnly = sel.lines.length > 0 && sel.outlined.length === 0;
  const groups: ToolbarGroupDef[] = [];

  if (sel.texts.length > 0) {
    groups.push({
      id: "fill",
      width: ICON,
      render: () => (
        <SlidesColorPicker
          icon={PaintBucket}
          label={t("slides.format.fill")}
          value={currentFill(els)}
          theme={theme}
          disabled={disabled}
          noneLabel={t("slides.format.noFill")}
          onPick={(color) => el.patch(fillPatches(els, color))}
        />
      ),
    });
  }
  if (sel.outlined.length > 0 || sel.lines.length > 0) {
    const weight = stroke?.width ?? null;
    const weightOptions = STROKE_WEIGHTS.map((w) => ({ value: String(w), label: fmt(t("slides.format.ptValue"), { n: w }), preview: <LinePreview width={w} /> }));
    const dashOptions = DASH_STYLES.map((d) => ({ value: d, label: t(DASH_KEYS[d]), preview: <LinePreview width={2} dash={DASH_ARRAY[d]} /> }));
    groups.push({
      id: "outline",
      width: ICON * 3,
      render: () => (
        <>
          <SlidesColorPicker
            icon={PenLine}
            label={t(linesOnly ? "slides.format.lineColor" : "slides.format.border")}
            value={stroke?.color ?? null}
            theme={theme}
            disabled={disabled}
            noneLabel={linesOnly ? undefined : t("slides.format.noBorder")}
            onPick={(color) => el.patch(strokeColorPatches(els, color))}
          />
          <ChoiceMenu
            label={t(linesOnly ? "slides.format.lineWeight" : "slides.format.borderWeight")}
            icon={Minus}
            disabled={disabled}
            value={weight === null ? "" : String(weight)}
            options={weightOptions}
            onChange={(value) => el.patch(strokeWeightPatches(els, Number(value)))}
          />
          <ChoiceMenu
            label={t(linesOnly ? "slides.format.lineDash" : "slides.format.borderDash")}
            icon={SquareDashed}
            disabled={disabled}
            value={stroke?.dash ?? ""}
            options={dashOptions}
            onChange={(value) => el.patch(strokeDashPatches(els, value as DashStyle))}
          />
        </>
      ),
    });
  }
  if (sel.lines.length > 0) {
    const line = sel.lines[0].stroke;
    const endOptions = LINE_ENDS.map((end) => ({ value: end, label: t(END_KEYS[end]) }));
    groups.push({
      id: "lineEnds",
      width: ICON * 2,
      render: () => (
        <>
          <ChoiceMenu
            label={t("slides.format.arrowStart")}
            icon={ArrowLeftToLine}
            disabled={disabled}
            value={line.head ?? "none"}
            options={endOptions}
            onChange={(value) => el.patch(lineEndPatches(els, "head", value as LineEnd))}
          />
          <ChoiceMenu
            label={t("slides.format.arrowEnd")}
            icon={ArrowRightToLine}
            disabled={disabled}
            value={line.tail ?? "none"}
            options={endOptions}
            onChange={(value) => el.patch(lineEndPatches(els, "tail", value as LineEnd))}
          />
        </>
      ),
    });
  }
  if (sel.images.length > 0) {
    groups.push({
      id: "image",
      width: ICON,
      render: () => (
        <ChoiceMenu
          label={t("slides.format.mask")}
          icon={Circle}
          disabled={disabled}
          value={sel.images[0].mask}
          options={IMAGE_MASKS.map((mask) => ({ value: mask, label: t(MASK_KEYS[mask]) }))}
          onChange={(value) => el.patch(maskPatches(els, value as ImageElement["mask"]))}
        />
      ),
    });
  }
  const table = sel.table;
  if (table) {
    groups.push({
      id: "table",
      width: ICON * 2,
      render: () => (
        <>
          <SlidesColorPicker
            icon={PaintBucket}
            label={t("slides.table.cellFill")}
            value={null}
            theme={theme}
            disabled={disabled}
            noneLabel={t("slides.format.noFill")}
            onPick={(color) => el.tableCommand({ cellFill: color })}
          />
          <TableMenu table={table} disabled={disabled} />
        </>
      ),
    });
  }
  groups.push({ id: "arrange", width: ICON, render: () => <ArrangeButton disabled={disabled} /> });
  return groups;
}
