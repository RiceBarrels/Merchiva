"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowUpDown,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Pilcrow,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
  Type,
  Underline,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import type { AlignValue, TableCommand } from "@/components/docs/editor/use-doc-actions";
import {
  DocMenu,
  DocMenuContent,
  DocMenuItem,
  DocMenuRadioGroup,
  DocMenuRadioItem,
  DocMenuSeparator,
  DocMenuSub,
  DocMenuSubContent,
  DocMenuSubTrigger,
  DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { getBlockStyle } from "@/lib/docs/extensions/paragraph-style";
import { BLOCK_STYLE_LABEL_KEYS, BLOCK_STYLES, LINE_SPACINGS, type BlockStyle, type LineSpacing } from "@/lib/docs/fonts";
import { useDocShortcutLabels, type DocShortcutId } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { MENUBAR_TRIGGER_CLASS, useEditorFinalFocus } from "./doc-menubar";

const STYLE_SHORTCUTS: Partial<Record<BlockStyle, DocShortcutId>> = { normal: "normal", h1: "h1", h2: "h2", h3: "h3" };

export function lineSpacingLabel(value: LineSpacing, t: (key: string) => string): string {
  if (value === "1") return t("docs.format.lineSingle");
  if (value === "2") return t("docs.format.lineDouble");
  return value;
}

function useFormatState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed) return { style: "normal" as BlockStyle, align: "left" as AlignValue, spacing: "1.15", inTable: false };
      const parent = ed.state.selection.$head.parent;
      const align = (["left", "center", "right", "justify"] as const).find((a) => ed.isActive({ textAlign: a })) ?? "left";
      const spacing = typeof parent.attrs.lineSpacing === "string" ? parent.attrs.lineSpacing : "1.15";
      return { style: getBlockStyle(ed), align, spacing, inTable: ed.isActive("table") };
    },
    equalityFn: (a, b) => !!b && a.style === b.style && a.align === b.align && a.spacing === b.spacing && a.inTable === b.inTable,
  });
}

function FormatMenuItems() {
  const t = useT();
  const label = useDocShortcutLabels();
  const { editor, editable, actions } = useDocEditor();
  const state = useFormatState(editor) ?? { style: "normal" as BlockStyle, align: "left" as AlignValue, spacing: "1.15", inTable: false };
  const disabled = !editable;
  const table = (command: TableCommand) => () => actions.tableCommand(command);

  return (
    <>
      <DocMenuSub>
        <DocMenuSubTrigger icon={Type} disabled={disabled}>
          {t("docs.format.text")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem icon={Bold} shortcut={label("bold")} onClick={() => actions.toggleMark("bold")}>
            {t("docs.format.bold")}
          </DocMenuItem>
          <DocMenuItem icon={Italic} shortcut={label("italic")} onClick={() => actions.toggleMark("italic")}>
            {t("docs.format.italic")}
          </DocMenuItem>
          <DocMenuItem icon={Underline} shortcut={label("underline")} onClick={() => actions.toggleMark("underline")}>
            {t("docs.format.underline")}
          </DocMenuItem>
          <DocMenuItem icon={Strikethrough} shortcut={label("strike")} onClick={() => actions.toggleMark("strike")}>
            {t("docs.format.strike")}
          </DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem icon={Superscript} shortcut={label("superscript")} onClick={() => actions.toggleMark("superscript")}>
            {t("docs.format.superscript")}
          </DocMenuItem>
          <DocMenuItem icon={Subscript} shortcut={label("subscript")} onClick={() => actions.toggleMark("subscript")}>
            {t("docs.format.subscript")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>

      <DocMenuSub>
        <DocMenuSubTrigger icon={Pilcrow} disabled={disabled}>
          {t("docs.format.paragraphStyles")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuRadioGroup value={state.style} onValueChange={(value: BlockStyle) => actions.setBlockStyle(value)}>
            {BLOCK_STYLES.map((style) => {
              const shortcut = STYLE_SHORTCUTS[style];
              return (
                <DocMenuRadioItem key={style} value={style} shortcut={shortcut ? label(shortcut) : undefined}>
                  {t(BLOCK_STYLE_LABEL_KEYS[style])}
                </DocMenuRadioItem>
              );
            })}
          </DocMenuRadioGroup>
        </DocMenuSubContent>
      </DocMenuSub>

      <DocMenuSub>
        <DocMenuSubTrigger icon={AlignLeft} disabled={disabled}>
          {t("docs.format.alignIndent")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuRadioGroup value={state.align} onValueChange={(value: AlignValue) => actions.setAlign(value)}>
            <DocMenuRadioItem value="left" shortcut={label("alignLeft")}>
              <AlignLeft className="me-2 inline size-4 text-muted-foreground" aria-hidden />
              {t("docs.format.alignLeft")}
            </DocMenuRadioItem>
            <DocMenuRadioItem value="center" shortcut={label("alignCenter")}>
              <AlignCenter className="me-2 inline size-4 text-muted-foreground" aria-hidden />
              {t("docs.format.alignCenter")}
            </DocMenuRadioItem>
            <DocMenuRadioItem value="right">
              <AlignRight className="me-2 inline size-4 text-muted-foreground" aria-hidden />
              {t("docs.format.alignRight")}
            </DocMenuRadioItem>
            <DocMenuRadioItem value="justify" shortcut={label("alignJustify")}>
              <AlignJustify className="me-2 inline size-4 text-muted-foreground" aria-hidden />
              {t("docs.format.alignJustify")}
            </DocMenuRadioItem>
          </DocMenuRadioGroup>
          <DocMenuSeparator />
          <DocMenuItem icon={IndentIncrease} onClick={actions.indent}>
            {t("docs.format.indentMore")}
          </DocMenuItem>
          <DocMenuItem icon={IndentDecrease} onClick={actions.outdent}>
            {t("docs.format.indentLess")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>

      <DocMenuSub>
        <DocMenuSubTrigger icon={ArrowUpDown} disabled={disabled}>
          {t("docs.format.lineSpacing")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuRadioGroup value={state.spacing} onValueChange={(value: LineSpacing) => actions.setLineSpacing(value)}>
            {LINE_SPACINGS.map((value) => (
              <DocMenuRadioItem key={value} value={value}>
                {lineSpacingLabel(value, t)}
              </DocMenuRadioItem>
            ))}
          </DocMenuRadioGroup>
        </DocMenuSubContent>
      </DocMenuSub>

      <DocMenuSub>
        <DocMenuSubTrigger icon={List} disabled={disabled}>
          {t("docs.format.lists")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem icon={List} shortcut={label("bulletList")} onClick={() => actions.toggleList("bullet")}>
            {t("docs.format.bulletList")}
          </DocMenuItem>
          <DocMenuItem icon={ListOrdered} shortcut={label("orderedList")} onClick={() => actions.toggleList("ordered")}>
            {t("docs.format.numberedList")}
          </DocMenuItem>
          <DocMenuItem icon={ListChecks} shortcut={label("taskList")} onClick={() => actions.toggleList("task")}>
            {t("docs.insert.checklist")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>

      <DocMenuSub>
        <DocMenuSubTrigger icon={TableIcon} disabled={disabled || !state.inTable}>
          {t("docs.format.table")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem onClick={table("addRowBefore")}>{t("docs.table.rowAbove")}</DocMenuItem>
          <DocMenuItem onClick={table("addRowAfter")}>{t("docs.table.rowBelow")}</DocMenuItem>
          <DocMenuItem onClick={table("addColumnBefore")}>{t("docs.table.colLeft")}</DocMenuItem>
          <DocMenuItem onClick={table("addColumnAfter")}>{t("docs.table.colRight")}</DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem onClick={table("deleteRow")}>{t("docs.table.deleteRow")}</DocMenuItem>
          <DocMenuItem onClick={table("deleteColumn")}>{t("docs.table.deleteCol")}</DocMenuItem>
          <DocMenuItem destructive onClick={table("deleteTable")}>
            {t("docs.table.deleteTable")}
          </DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem onClick={table("toggleHeaderRow")}>{t("docs.table.headerRow")}</DocMenuItem>
          <DocMenuItem onClick={table("mergeCells")}>{t("docs.table.merge")}</DocMenuItem>
          <DocMenuItem onClick={table("splitCell")}>{t("docs.table.split")}</DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>

      <DocMenuSeparator />
      <DocMenuItem icon={RemoveFormatting} shortcut={label("clear")} disabled={disabled} onClick={actions.clearFormatting}>
        {t("docs.format.clear")}
      </DocMenuItem>
    </>
  );
}

export function FormatMenu() {
  const t = useT();
  const finalFocus = useEditorFinalFocus();
  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("docs.menubar.format")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <FormatMenuItems />
      </DocMenuContent>
    </DocMenu>
  );
}
