"use client";

// Text controls of the Slides toolbar (slides.md §6.2, §7.3), shown while a text box, shape or table is selected or
// being typed in: font, size, bold / italic / underline, text and highlight colour, alignment, line spacing, lists,
// link and clear formatting. Every control sends one TextFormatCommand through el.formatText(), which formats the
// selection of the live editor while typing and the whole text of the selected elements otherwise. The buttons
// don't take focus on mouse down, so the text selection and the caret stay where they were.
import { Baseline, Bold, Highlighter, Italic, List, ListOrdered, RemoveFormatting, Underline } from "lucide-react";

import { FontSizeControl } from "@/components/docs/toolbar/font-size-control";
import { ToolbarButton } from "@/components/docs/toolbar/toolbar-button";
import { useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { SlidesColorPicker } from "@/components/slides/chrome/color-picker";
import { FontMenu } from "@/components/slides/chrome/font-controls";
import { LinkControl } from "@/components/slides/chrome/link-control";
import { AlignMenu, LineSpacingMenu } from "@/components/slides/chrome/paragraph-controls";
import type { SlidesSelectionInfo } from "@/components/slides/chrome/selection-info";
import type { ToolbarGroupDef } from "@/components/slides/chrome/toolbar-parts";
import { markToggle } from "@/components/slides/chrome/text-state";
import { useTextFormatState } from "@/components/slides/chrome/use-text-format";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import type { TextFormatCommand } from "@/lib/slides/editor/text-format";
import { useT } from "@/lib/i18n/context";

const ICON = 30;

/** The text control groups for the toolbar; none when nothing text-capable is selected. */
export function useTextFormatGroups(sel: SlidesSelectionInfo): ToolbarGroupDef[] {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const { el, deck } = useSlidesEditor();
  const state = useTextFormatState(sel);
  if (!sel.hasText || state === null) return [];
  const disabled = !sel.writable;
  const run = (cmd: TextFormatCommand) => el.formatText(cmd);
  const theme = deck.meta.theme;

  return [
    { id: "font", width: 118, render: () => <FontMenu value={state.font} theme={theme} disabled={disabled} onChange={(font) => run({ kind: "font", font })} /> },
    {
      id: "size",
      width: 96,
      render: () => (
        <FontSizeControl value={state.size} disabled={disabled} onChange={(pt) => run({ kind: "size", pt })} onStep={(dir) => run({ kind: "sizeStep", dir })} />
      ),
    },
    {
      id: "marks",
      width: ICON * 5,
      render: () => (
        <>
          <ToolbarButton icon={Bold} label={t("slides.format.bold")} shortcut={label("bold")} active={state.bold} disabled={disabled} onClick={() => run(markToggle(state, "bold"))} />
          <ToolbarButton icon={Italic} label={t("slides.format.italic")} shortcut={label("italic")} active={state.italic} disabled={disabled} onClick={() => run(markToggle(state, "italic"))} />
          <ToolbarButton
            icon={Underline}
            label={t("slides.format.underline")}
            shortcut={label("underline")}
            active={state.underline}
            disabled={disabled}
            onClick={() => run(markToggle(state, "underline"))}
          />
          <SlidesColorPicker
            icon={Baseline}
            label={t("slides.format.textColor")}
            value={state.color}
            theme={theme}
            disabled={disabled}
            noneLabel={t("docs.toolbar.fontDefault")}
            onPick={(color) => run({ kind: "color", color })}
          />
          <SlidesColorPicker
            icon={Highlighter}
            label={t("slides.format.highlight")}
            value={state.highlight}
            theme={theme}
            disabled={disabled}
            noneLabel={t("docs.toolbar.noColor")}
            onPick={(color) => run({ kind: "highlight", color })}
          />
        </>
      ),
    },
    {
      id: "paragraph",
      width: ICON * 4,
      render: () => (
        <>
          <AlignMenu value={state.align} disabled={disabled} onChange={(align) => run({ kind: "align", align })} />
          <LineSpacingMenu value={state.lineHeight} disabled={disabled} onChange={(value) => run({ kind: "lineHeight", value })} />
          <ToolbarButton
            icon={List}
            label={t("slides.format.bulletList")}
            shortcut={label("bulletList")}
            active={state.list === "bullet"}
            disabled={disabled}
            onClick={() => run({ kind: "list", list: "bullet" })}
          />
          <ToolbarButton
            icon={ListOrdered}
            label={t("slides.format.numberedList")}
            shortcut={label("orderedList")}
            active={state.list === "ordered"}
            disabled={disabled}
            onClick={() => run({ kind: "list", list: "ordered" })}
          />
        </>
      ),
    },
    {
      id: "textExtras",
      width: ICON * 2,
      render: () => (
        <>
          <LinkControl href={state.link} disabled={disabled} onChange={(href) => run({ kind: "link", href })} />
          <ToolbarButton icon={RemoveFormatting} label={t("slides.format.clearFormatting")} disabled={disabled} onClick={() => run({ kind: "clear" })} />
        </>
      ),
    },
  ];
}
