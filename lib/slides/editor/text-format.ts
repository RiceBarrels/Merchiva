// Text formatting commands (slides.md §6.2): the toolbar, the Format menu and the phone format bar send one
// TextFormatCommand. While a text box is being typed in, it runs on the live editor (editor.chain()); otherwise it
// rewrites the whole text of every selected text box, shape or table (format-json.ts), and for an empty text it also
// changes the element's defaults, so what the person types next has the chosen look.
//
// Bold is the one mark an element default also carries (TextDefaults.bold renders the whole box bold), so turning
// bold off must also turn that default off: on a whole element the default follows the command, and in the live
// editor the default goes off while the text outside the selection takes bold marks, so only the selection changes.
// A header-row table cell renders bold whatever it holds (render-rules.ts tableCellLook): there bold only changes marks.
import type { Editor, JSONContent } from "@tiptap/core";
import type * as Y from "yjs";

import { SLIDES_FONT_SIZES } from "@/lib/slides/editor/elements";
import { isTextCapable } from "@/lib/slides/editor/elements";
import { DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import { setElementText, updateElements } from "@/lib/slides/model/ops-elements";
import { transactSlides } from "@/lib/slides/model/ops-slides";
import { setTableStyle } from "@/lib/slides/model/ops-table";
import { safeHref } from "@/lib/slides/model/safe-values";
import { tableCellKey } from "@/lib/slides/model/sanitize-table";
import type { ColorValue, FontRef, SlideElement, TextDefaults } from "@/lib/slides/model/types";
import {
  applyMarkToAll, clearFormattingAll, hasMarkEverywhere, setAlignAll, setFontSizeAll, setParagraphAttrAll, stepFontSizeAll,
  toggleListAll,
} from "@/lib/slides/text/format-json";
import { isEmptyText } from "@/lib/slides/text/plain";
import { slideFontSizePt } from "@/lib/slides/text/slide-font-size";

export type TextMark = "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript";

export type TextFormatCommand =
  | { kind: "mark"; mark: TextMark; on?: boolean }
  | { kind: "color"; color: ColorValue | null }
  | { kind: "highlight"; color: ColorValue | null }
  | { kind: "font"; font: FontRef | null }
  | { kind: "size"; pt: number }
  | { kind: "sizeStep"; dir: 1 | -1 }
  | { kind: "align"; align: TextDefaults["align"] }
  | { kind: "list"; list: "bullet" | "ordered" | "none" }
  | { kind: "lineHeight"; value: number | null }
  | { kind: "dir"; dir: "ltr" | "rtl" | null }
  | { kind: "link"; href: string | null }
  | { kind: "clear" };

const OTHER_SCRIPT: Partial<Record<TextMark, TextMark>> = { subscript: "superscript", superscript: "subscript" };

/** The next size up or down from `size` in SLIDES_FONT_SIZES (clamped to the ends). */
export function stepFontSize(size: number, dir: 1 | -1): number {
  const steps = SLIDES_FONT_SIZES;
  if (dir > 0) return steps.find((s) => s > size) ?? steps[steps.length - 1];
  return [...steps].reverse().find((s) => s < size) ?? steps[0];
}

/** `json` with the command applied to all of it; `baseSize` is the element's default size (for sizeStep). */
export function formatTextJson(json: JSONContent, cmd: TextFormatCommand, baseSize: number): JSONContent {
  switch (cmd.kind) {
    case "mark":
      return applyMarkToAll(json, cmd.mark, undefined, cmd.on);
    case "color":
      return applyMarkToAll(json, "textStyle", { color: cmd.color });
    case "highlight":
      return applyMarkToAll(json, "highlight", cmd.color ? { color: cmd.color } : null);
    case "font":
      return applyMarkToAll(json, "textStyle", { fontFamily: cmd.font });
    case "size":
      return setFontSizeAll(json, slideFontSizePt(cmd.pt));
    case "sizeStep":
      return stepFontSizeAll(json, cmd.dir, baseSize, SLIDES_FONT_SIZES);
    case "align":
      return setAlignAll(json, cmd.align);
    case "list":
      return toggleListAll(json, cmd.list);
    case "lineHeight":
      return setParagraphAttrAll(json, "lineHeight", cmd.value);
    case "dir":
      return setParagraphAttrAll(json, "dir", cmd.dir);
    case "link": {
      const href = cmd.href ? safeHref(cmd.href) : "";
      return applyMarkToAll(json, "link", href ? { href } : null);
    }
    case "clear":
      return clearFormattingAll(json);
  }
}

/** The element defaults an empty text takes from the command (null when the command has no default to set). */
export function formatDefaults(defaults: TextDefaults, cmd: TextFormatCommand): TextDefaults | null {
  switch (cmd.kind) {
    case "mark":
      return cmd.mark === "bold" ? { ...defaults, bold: cmd.on ?? !defaults.bold } : null;
    case "color":
      return cmd.color ? { ...defaults, color: cmd.color } : null;
    case "font":
      return cmd.font ? { ...defaults, font: cmd.font } : null;
    case "size": {
      const pt = slideFontSizePt(cmd.pt);
      return pt === null ? null : { ...defaults, size: pt };
    }
    case "sizeStep":
      return { ...defaults, size: stepFontSize(defaults.size, cmd.dir) };
    case "align":
      return { ...defaults, align: cmd.align };
    case "lineHeight":
      return cmd.value === null ? null : { ...defaults, lineHeight: cmd.value };
    default:
      return null;
  }
}

/** The text defaults an element's text renders with (a table's for its cells); null for types without text. */
function textDefaultsOf(el: SlideElement): TextDefaults | null {
  if (isTextCapable(el)) return el.textStyle;
  return el.type === "table" ? el.style.textStyle : null;
}

/** True when `cellKey` is a cell of the table's header row, whose text renders bold whatever it holds. */
function isHeaderCell(el: SlideElement, cellKey: string | undefined): boolean {
  if (el.type !== "table" || cellKey === undefined || !el.style.headerRow) return false;
  const first = el.rows[0];
  return first !== undefined && el.cols.some((col) => tableCellKey(first.id, col.id) === cellKey);
}

/**
 * The defaults the live text of `el` (a table: of its cell `cellKey`) renders with, as the text controls read them:
 * a header-row cell shows bold. Null for types without text.
 */
export function liveTextDefaults(el: SlideElement, cellKey: string | undefined): TextDefaults | null {
  const defaults = textDefaultsOf(el);
  return defaults && isHeaderCell(el, cellKey) ? { ...defaults, bold: true } : defaults;
}

/** True when all the text of every element shows bold: through its default, or a bold mark on every run. */
function allTextBold(elements: readonly SlideElement[]): boolean {
  const texts = elements.flatMap((el): { json: JSONContent; bold: boolean }[] => {
    if (isTextCapable(el)) return [{ json: el.text, bold: el.textStyle.bold }];
    if (el.type !== "table") return [];
    return el.cells.filter((cell) => !cell.covered).map((cell) => ({ json: cell.text, bold: el.style.textStyle.bold }));
  });
  return texts.length > 0 && texts.every((text) => text.bold || hasMarkEverywhere(text.json, "bold"));
}

/** The defaults after a bold command (whatever the text holds); null when the command is not bold or changes nothing. */
function boldDefaults(defaults: TextDefaults, cmd: TextFormatCommand): TextDefaults | null {
  if (cmd.kind !== "mark" || cmd.mark !== "bold" || cmd.on === undefined || cmd.on === defaults.bold) return null;
  return { ...defaults, bold: cmd.on };
}

/**
 * Applies the command to the whole text of each element, in one transaction: text boxes and shapes (an empty one
 * also takes the look as its defaults) and every cell of a table; other types are skipped. Bold sets the element's
 * (the table's) bold default as well, whatever the text holds, and a bold toggle turns bold off when all of the text
 * already shows bold.
 */
export function formatElementsText(doc: Y.Doc, slideId: string, elements: readonly SlideElement[], cmd: TextFormatCommand): void {
  const command: TextFormatCommand =
    cmd.kind === "mark" && cmd.mark === "bold" && cmd.on === undefined ? { ...cmd, on: !allTextBold(elements) } : cmd;
  const bold = command.kind === "mark" && command.mark === "bold";
  transactSlides(doc, () => {
    for (const el of elements) {
      if (isTextCapable(el)) {
        setElementText(doc, slideId, el.id, formatTextJson(el.text, command, el.textStyle.size));
        const defaults = bold ? boldDefaults(el.textStyle, command) : isEmptyText(el.text) ? formatDefaults(el.textStyle, command) : null;
        if (defaults) updateElements(doc, slideId, [{ id: el.id, patch: { textStyle: defaults } }]);
      } else if (el.type === "table") {
        for (const cell of el.cells) {
          if (!cell.covered) setElementText(doc, slideId, el.id, formatTextJson(cell.text, command, el.style.textStyle.size), tableCellKey(cell.rowId, cell.colId));
        }
        const textStyle = boldDefaults(el.style.textStyle, command);
        if (textStyle) setTableStyle(doc, slideId, el.id, { textStyle });
      }
    }
  });
}

/**
 * Runs the command on the live editor of `el` (a table: of its cell `cellKey`), at the editor's selection. Bold off
 * where the element's default is bold cannot be a mark change alone: the text outside the selection takes bold marks
 * in the editor, then the default goes off (a table's other cells take bold marks too). These are two Yjs
 * transactions; the caller fences them into one undo step. A bold toggle without `on` turns bold off wherever the
 * text shows bold (liveTextDefaults), as the toolbar does; in a header-row cell, whose bold no command can turn off,
 * it changes the selection's marks only.
 */
export function formatLiveText(doc: Y.Doc, slideId: string, editor: Editor, el: SlideElement, cellKey: string | undefined, cmd: TextFormatCommand): void {
  if (editor.isDestroyed) return;
  const defaults = textDefaultsOf(el);
  const size = defaults?.size ?? DEFAULT_TEXT_DEFAULTS.size;
  const boldType = editor.schema.marks.bold;
  if (cmd.kind === "mark" && cmd.mark === "bold" && isHeaderCell(el, cellKey)) {
    applyTextFormat(editor, { ...cmd, on: cmd.on ?? false }, size);
    return;
  }
  const unbold = cmd.kind === "mark" && cmd.mark === "bold" && defaults?.bold === true && cmd.on !== true && boldType !== undefined;
  if (!defaults || !unbold) {
    applyTextFormat(editor, cmd, size);
    return;
  }
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.addMark(0, tr.doc.content.size, boldType.create());
      return true;
    })
    .unsetMark("bold")
    .run();
  const off: TextDefaults = { ...defaults, bold: false };
  transactSlides(doc, () => {
    if (el.type !== "table") {
      updateElements(doc, slideId, [{ id: el.id, patch: { textStyle: off } }]);
      return;
    }
    setTableStyle(doc, slideId, el.id, { textStyle: off });
    for (const cell of el.cells) {
      const key = tableCellKey(cell.rowId, cell.colId);
      if (!cell.covered && key !== cellKey) setElementText(doc, slideId, el.id, applyMarkToAll(cell.text, "bold", undefined, true), key);
    }
  });
}

/** Runs the command on the live editor (at its selection). `baseSize` is the element's default size. */
export function applyTextFormat(editor: Editor, cmd: TextFormatCommand, baseSize: number): void {
  if (editor.isDestroyed) return;
  const chain = editor.chain().focus();
  switch (cmd.kind) {
    case "mark": {
      const on = cmd.on ?? !editor.isActive(cmd.mark);
      const other = OTHER_SCRIPT[cmd.mark];
      if (on && other) chain.unsetMark(other);
      if (on) chain.setMark(cmd.mark);
      else chain.unsetMark(cmd.mark);
      break;
    }
    case "color":
      if (cmd.color) chain.setColor(cmd.color);
      else chain.unsetColor();
      break;
    case "highlight":
      if (cmd.color) chain.setHighlight({ color: cmd.color });
      else chain.unsetHighlight();
      break;
    case "font":
      if (cmd.font) chain.setFontFamily(cmd.font);
      else chain.unsetFontFamily();
      break;
    case "size":
      chain.setSlideFontSize(cmd.pt);
      break;
    case "sizeStep": {
      const current = slideFontSizePt(editor.getAttributes("textStyle").fontSize) ?? baseSize;
      chain.setSlideFontSize(stepFontSize(current, cmd.dir));
      break;
    }
    case "align":
      chain.setTextAlign(cmd.align);
      break;
    case "list":
      if (cmd.list === "bullet") chain.toggleBulletList();
      else if (cmd.list === "ordered") chain.toggleOrderedList();
      else if (editor.isActive("bulletList")) chain.toggleBulletList();
      else if (editor.isActive("orderedList")) chain.toggleOrderedList();
      break;
    case "lineHeight":
      chain.setParagraphLineHeight(cmd.value);
      break;
    case "dir":
      chain.setParagraphDir(cmd.dir);
      break;
    case "link": {
      const href = cmd.href ? safeHref(cmd.href) : "";
      if (href) chain.extendMarkRange("link").setLink({ href });
      else chain.extendMarkRange("link").unsetLink();
      break;
    }
    case "clear":
      chain.unsetAllMarks().resetAttributes("paragraph", ["textAlign", "lineHeight", "spaceBefore", "spaceAfter"]);
      break;
  }
  chain.run();
}
