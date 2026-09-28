"use client";

// Format menu (slides.md §6.2, §7.2): text marks and size, paragraph settings, text direction, the text box's
// vertical alignment and autofit, table commands, clear formatting and the format panel. Text commands go through
// el.formatText() (the typed-in text's selection, or all text of the selected elements); box settings are patches.
import { Baseline, RemoveFormatting, Table2, Type } from "lucide-react";

import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import {
  DocMenu, DocMenuCheckboxItem, DocMenuContent, DocMenuItem, DocMenuRadioGroup, DocMenuRadioItem, DocMenuSeparator, DocMenuSub,
  DocMenuSubContent, DocMenuSubTrigger, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus, useSlidesSelection, useSlidesShortcutLabels, type SlidesShortcutId } from "@/components/slides/chrome/chrome-hooks";
import { autofitPatches, vAlignPatches } from "@/components/slides/chrome/format-patches";
import { AlignItems, LineSpacingItems } from "@/components/slides/chrome/paragraph-controls";
import { TableItems } from "@/components/slides/chrome/table-controls";
import { TEXT_MARKS } from "@/components/slides/chrome/text-state";
import { useTextFormatState } from "@/components/slides/chrome/use-text-format";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import type { TextFormatCommand } from "@/lib/slides/editor/text-format";
import type { TextBox, VAlign } from "@/lib/slides/model/types";

const MARK_KEYS: Readonly<Record<(typeof TEXT_MARKS)[number], string>> = {
  bold: "slides.format.bold",
  italic: "slides.format.italic",
  underline: "slides.format.underline",
  strike: "slides.format.strike",
  superscript: "slides.format.superscript",
  subscript: "slides.format.subscript",
};
const V_ALIGNS: ReadonlyArray<{ value: VAlign; key: string }> = [
  { value: "top", key: "slides.format.top" },
  { value: "middle", key: "slides.format.middle" },
  { value: "bottom", key: "slides.format.bottom" },
];

export function FormatMenu() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { el, ui, dispatch } = useSlidesEditor();
  const sel = useSlidesSelection();
  const state = useTextFormatState(sel);
  const noText = !sel.writable || state === null;
  const boxes = sel.writable ? sel.texts : [];
  const box = boxes[0]?.box ?? null;
  const run = (cmd: TextFormatCommand) => el.formatText(cmd);

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("slides.menubar.format")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <DocMenuSub>
          <DocMenuSubTrigger icon={Type} disabled={noText}>
            {t("docs.format.text")}
          </DocMenuSubTrigger>
          <DocMenuSubContent className="min-w-56">
            {TEXT_MARKS.map((mark) => (
              <DocMenuCheckboxItem closeOnClick
                key={mark}
                checked={state?.[mark] ?? false}
                shortcut={label(mark as SlidesShortcutId)}
                onCheckedChange={(checked) => run({ kind: "mark", mark, on: checked })}
              >
                {t(MARK_KEYS[mark])}
              </DocMenuCheckboxItem>
            ))}
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSub>
          <DocMenuSubTrigger icon={Baseline} disabled={noText}>
            {t("slides.format.fontSize")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuItem onClick={() => run({ kind: "sizeStep", dir: 1 })}>{t("docs.toolbar.fontSizeUp")}</DocMenuItem>
            <DocMenuItem onClick={() => run({ kind: "sizeStep", dir: -1 })}>{t("docs.toolbar.fontSizeDown")}</DocMenuItem>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSub>
          <DocMenuSubTrigger inset disabled={noText}>
            {t("slides.format.align")}
          </DocMenuSubTrigger>
          <DocMenuSubContent className="min-w-48">
            <AlignItems value={state?.align ?? null} onChange={(align) => run({ kind: "align", align })} />
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSub>
          <DocMenuSubTrigger inset disabled={noText}>
            {t("slides.format.lineSpacing")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <LineSpacingItems value={state?.lineHeight ?? null} onChange={(value) => run({ kind: "lineHeight", value })} />
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuCheckboxItem closeOnClick
          checked={state?.list === "bullet"}
          disabled={noText}
          shortcut={label("bulletList")}
          onCheckedChange={() => run({ kind: "list", list: "bullet" })}
        >
          {t("slides.format.bulletList")}
        </DocMenuCheckboxItem>
        <DocMenuCheckboxItem closeOnClick
          checked={state?.list === "ordered"}
          disabled={noText}
          shortcut={label("orderedList")}
          onCheckedChange={() => run({ kind: "list", list: "ordered" })}
        >
          {t("slides.format.numberedList")}
        </DocMenuCheckboxItem>
        <DocMenuSub>
          <DocMenuSubTrigger inset disabled={noText}>
            {t("slides.format.textDirection")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            {/* Automatic clears the paragraph's direction, so it follows its text again (dir="auto"). */}
            <DocMenuRadioGroup
              value={state?.dir ?? "auto"}
              onValueChange={(value: "auto" | "ltr" | "rtl") => run({ kind: "dir", dir: value === "auto" ? null : value })}
            >
              <DocMenuRadioItem closeOnClick value="auto">{t("slides.format.dirAuto")}</DocMenuRadioItem>
              <DocMenuRadioItem closeOnClick value="ltr">{t("slides.format.ltr")}</DocMenuRadioItem>
              <DocMenuRadioItem closeOnClick value="rtl">{t("slides.format.rtl")}</DocMenuRadioItem>
            </DocMenuRadioGroup>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSeparator />
        <DocMenuSub>
          <DocMenuSubTrigger inset disabled={box === null}>
            {t("slides.format.verticalAlign")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuRadioGroup value={box?.vAlign ?? ""} onValueChange={(value: VAlign) => el.patch(vAlignPatches(boxes, value))}>
              {V_ALIGNS.map((option) => (
                <DocMenuRadioItem closeOnClick key={option.value} value={option.value}>
                  {t(option.key)}
                </DocMenuRadioItem>
              ))}
            </DocMenuRadioGroup>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSub>
          <DocMenuSubTrigger inset disabled={box === null}>
            {t("slides.format.autofit")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuRadioGroup value={box?.autofit ?? ""} onValueChange={(value: TextBox["autofit"]) => el.patch(autofitPatches(boxes, value))}>
              <DocMenuRadioItem closeOnClick value="none">{t("slides.format.autofitNone")}</DocMenuRadioItem>
              <DocMenuRadioItem closeOnClick value="grow">{t("slides.format.autofitGrow")}</DocMenuRadioItem>
            </DocMenuRadioGroup>
          </DocMenuSubContent>
        </DocMenuSub>
        {sel.table && (
          <DocMenuSub>
            <DocMenuSubTrigger icon={Table2}>{t("slides.insert.table")}</DocMenuSubTrigger>
            <DocMenuSubContent className="min-w-56">
              <TableItems table={sel.table} disabled={!sel.writable} />
            </DocMenuSubContent>
          </DocMenuSub>
        )}
        <DocMenuSeparator />
        <DocMenuItem icon={RemoveFormatting} disabled={noText} onClick={() => run({ kind: "clear" })}>
          {t("slides.format.clearFormatting")}
        </DocMenuItem>
        <DocMenuCheckboxItem closeOnClick checked={ui.rightPanel === "format"} onCheckedChange={() => dispatch({ type: "openPanel", panel: "format" })}>
          {t("slides.panel.format")}
        </DocMenuCheckboxItem>
      </DocMenuContent>
    </DocMenu>
  );
}
