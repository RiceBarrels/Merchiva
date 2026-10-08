"use client";

// Paragraph menus of the Slides toolbar (slides.md §7.3): alignment and line spacing. The choices are shared with
// Format ▸ Align and Format ▸ Line spacing (the *Items components).
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowUpDown } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { DocMenu, DocMenuContent, DocMenuRadioGroup, DocMenuRadioItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus, useSlidesShortcutLabels, type SlidesShortcutId } from "@/components/slides/chrome/chrome-hooks";
import { useT } from "@/lib/i18n/context";
import type { TextDefaults } from "@/lib/slides/model/types";

type Align = TextDefaults["align"];

export const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify } as const;

const ALIGNS: ReadonlyArray<{ value: Align; key: string; shortcut?: SlidesShortcutId }> = [
  { value: "left", key: "slides.format.alignLeft", shortcut: "alignLeft" },
  { value: "center", key: "slides.format.alignCenter", shortcut: "alignCenter" },
  { value: "right", key: "slides.format.alignRight" },
  { value: "justify", key: "slides.format.alignJustify", shortcut: "alignJustify" },
];

/** Line-height multiples offered (1 = single, 2 = double). */
export const LINE_SPACINGS: readonly number[] = [1, 1.15, 1.5, 2];

export function lineSpacingLabel(value: number, t: (key: string) => string): string {
  if (value === 1) return t("docs.format.lineSingle");
  if (value === 2) return t("docs.format.lineDouble");
  return String(value);
}

export function AlignItems({ value, onChange }: { value: Align | null; onChange(align: Align): void }) {
  const t = useT();
  const label = useSlidesShortcutLabels();
  return (
    <DocMenuRadioGroup value={value ?? ""} onValueChange={(next: Align) => onChange(next)}>
      {ALIGNS.map((option) => {
        const Icon = ALIGN_ICONS[option.value];
        return (
          <DocMenuRadioItem closeOnClick key={option.value} value={option.value} label={t(option.key)} shortcut={option.shortcut ? label(option.shortcut) : undefined}>
            <Icon aria-hidden className="me-2 inline size-4 text-muted-foreground" />
            {t(option.key)}
          </DocMenuRadioItem>
        );
      })}
    </DocMenuRadioGroup>
  );
}

export function LineSpacingItems({ value, onChange }: { value: number | null; onChange(value: number): void }) {
  const t = useT();
  const current = value === null ? "" : String(LINE_SPACINGS.find((s) => Math.abs(s - value) < 0.005) ?? "");
  return (
    <DocMenuRadioGroup value={current} onValueChange={(next: string) => onChange(Number(next))}>
      {LINE_SPACINGS.map((spacing) => (
        <DocMenuRadioItem closeOnClick key={spacing} value={String(spacing)} label={lineSpacingLabel(spacing, t)}>
          <span className={spacing === 1 || spacing === 2 ? undefined : "font-mono tabular-nums"}>{lineSpacingLabel(spacing, t)}</span>
        </DocMenuRadioItem>
      ))}
    </DocMenuRadioGroup>
  );
}

export function AlignMenu({ value, disabled, onChange }: { value: Align; disabled?: boolean; onChange(align: Align): void }) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const Icon = ALIGN_ICONS[value];
  const label = t("slides.format.align");
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarIconButton aria-label={label} title={label} />}>
        <Icon className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <AlignItems value={value} onChange={onChange} />
      </DocMenuContent>
    </DocMenu>
  );
}

export function LineSpacingMenu({ value, disabled, onChange }: { value: number | null; disabled?: boolean; onChange(value: number): void }) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.format.lineSpacing");
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarIconButton aria-label={label} title={label} />}>
        <ArrowUpDown className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <LineSpacingItems value={value} onChange={onChange} />
      </DocMenuContent>
    </DocMenu>
  );
}
