// Bold in a box whose default is bold (lib/slides/editor/text-format.ts): on whole elements the bold default follows
// the command, and in the live editor turning bold off un-bolds only the selection (the default goes off, the rest of
// the text takes bold marks), from the toolbar and from Mod-B alike; a header-row cell's bold is structural. Also the
// locked-table guard of runTableCommand and the stage scale the zoom menus read.
import { describe, expect, test } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import type * as Y from "yjs";

import { editorTextState, elementsTextState } from "@/components/slides/chrome/text-state";
import { StageScale } from "@/components/slides/editor/slides-context";
import { newTable, newTextBox } from "@/lib/slides/editor/elements";
import { runTableCommand } from "@/lib/slides/editor/table-commands";
import { formatElementsText, formatLiveText, liveTextDefaults } from "@/lib/slides/editor/text-format";
import { tableCellLook, tableGrid } from "@/lib/slides/export/render-rules";
import { addElements, setElementText, updateElements } from "@/lib/slides/model/ops-elements";
import { setTableStyle } from "@/lib/slides/model/ops-table";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import { tableCellKey } from "@/lib/slides/model/sanitize-table";
import type { NewElement, SlideElement, TableCellSnapshot, TableElement, TextDefaults } from "@/lib/slides/model/types";
import { hasMarkEverywhere } from "@/lib/slides/text/format-json";
import { slideTextExtensions } from "@/lib/slides/text/extensions";
import { SIZE, sampleDoc } from "./helpers";

const para = (...runs: JSONContent[]): JSONContent => ({ type: "doc", content: [{ type: "paragraph", content: runs }] });
const run = (text: string, marks?: string[]): JSONContent => (marks ? { type: "text", text, marks: marks.map((type) => ({ type })) } : { type: "text", text });

function elementsOf(doc: Y.Doc): readonly SlideElement[] {
  return readDeckSnapshot(doc).slides[0].elements;
}

function pick(doc: Y.Doc, id: string): SlideElement {
  const el = elementsOf(doc).find((e) => e.id === id);
  if (!el) throw new Error(`no element ${id}`);
  return el;
}

function textBox(doc: Y.Doc, text: JSONContent, bold: boolean): string {
  const box = newTextBox(SIZE);
  if (box.type !== "text") throw new Error("type");
  const [id] = addElements(doc, "slideA", [{ ...box, text, textStyle: { ...box.textStyle, bold } } as NewElement]);
  return id;
}

function defaultsOf(el: SlideElement): TextDefaults {
  if (el.type === "text" || el.type === "shape") return el.textStyle;
  if (el.type === "table") return el.style.textStyle;
  throw new Error("no text");
}

/** A table of 2×2 cells "a".."d" whose text style is bold. */
function boldTable(doc: Y.Doc): TableElement {
  const [id] = addElements(doc, "slideA", [newTable(2, 2, SIZE)]);
  const table = pick(doc, id);
  if (table.type !== "table") throw new Error("type");
  setTableStyle(doc, "slideA", id, { textStyle: { ...table.style.textStyle, bold: true } });
  table.cells.forEach((cell, i) => setElementText(doc, "slideA", id, para(run("abcd"[i])), tableCellKey(cell.rowId, cell.colId)));
  const out = pick(doc, id);
  if (out.type !== "table") throw new Error("type");
  return out;
}

/** The cell of `table` at row `r`, column `c`. */
function cellAt(table: TableElement, r: number, c: number): TableCellSnapshot {
  const cell = table.cells.find((x) => x.rowId === table.rows[r]?.id && x.colId === table.cols[c]?.id);
  if (!cell) throw new Error(`no cell ${r},${c}`);
  return cell;
}

/**
 * An unbound headless editor holding `json` (the live editor's text), with `from..to` selected. TipTap reports an
 * editor without a mounted view as destroyed, and the formatting code skips destroyed editors; the stage's live
 * editor is always mounted, so the stand-in says it is alive (its commands work on the state without a view).
 * `onBold` stands in for the stage's Mod-B command (StageTextEditor → formatText → formatLiveText).
 */
function liveEditor(json: JSONContent, from: number, to = from, onBold?: (editor: Editor) => void): Editor {
  const editor: Editor = new Editor({
    element: null,
    extensions: slideTextExtensions(onBold ? { onBold: () => (onBold(editor), true) } : {}),
    content: json,
  });
  Object.defineProperty(editor, "isDestroyed", { configurable: true, get: () => false });
  editor.commands.setTextSelection({ from, to });
  return editor;
}

/**
 * Presses Mod-B the way ProseMirror dispatches a keydown: each plugin's handler in the editor's plugin order until
 * one takes it (the unmounted editor's state holds no plugins, so the extension manager's list stands in).
 */
function pressModB(editor: Editor): boolean {
  const mac = typeof navigator !== "undefined" && /Mac|iP(hone|[oa]d)/.test(navigator.platform ?? "");
  const event = { key: "b", keyCode: 66, metaKey: mac, ctrlKey: !mac, altKey: false, shiftKey: false } as unknown as KeyboardEvent;
  return editor.extensionManager.plugins.some((plugin) => plugin.props.handleKeyDown?.call(plugin, editor.view, event) === true);
}

const reader = (editor: Editor) => ({ isActive: (name: string) => editor.isActive(name), attrs: (type: "textStyle" | "highlight" | "link" | "paragraph") => editor.getAttributes(type) });

describe("bold on whole elements", () => {
  test("a text box whose default is bold, turned off, reads back as not bold", () => {
    const doc = sampleDoc();
    const id = textBox(doc, para(run("Hello "), run("world", ["bold"])), true);
    expect(elementsTextState([pick(doc, id)])?.bold).toBe(true);
    formatElementsText(doc, "slideA", [pick(doc, id)], { kind: "mark", mark: "bold", on: false });
    const el = pick(doc, id);
    expect(elementsTextState([el])?.bold).toBe(false);
    expect(defaultsOf(el).bold).toBe(false);
    expect(JSON.stringify(el.type === "text" ? el.text : null)).not.toContain('"bold"');
  });

  test("turning bold on sets the default and marks every run, in one transaction", () => {
    const doc = sampleDoc();
    const id = textBox(doc, para(run("Hi")), false);
    let transactions = 0;
    doc.on("afterTransaction", () => transactions++);
    formatElementsText(doc, "slideA", [pick(doc, id)], { kind: "mark", mark: "bold", on: true });
    expect(transactions).toBe(1);
    const el = pick(doc, id);
    expect(defaultsOf(el).bold).toBe(true);
    expect(el.type === "text" && hasMarkEverywhere(el.text, "bold")).toBe(true);
    expect(elementsTextState([el])?.bold).toBe(true);
  });

  test("a toggle without `on` follows the whole selection: on unless everything already shows bold", () => {
    const doc = sampleDoc();
    const a = textBox(doc, para(run("A")), true);
    const b = textBox(doc, para(run("B")), false);
    formatElementsText(doc, "slideA", [pick(doc, a), pick(doc, b)], { kind: "mark", mark: "bold" });
    expect([pick(doc, a), pick(doc, b)].map((el) => defaultsOf(el).bold)).toEqual([true, true]);
    formatElementsText(doc, "slideA", [pick(doc, a), pick(doc, b)], { kind: "mark", mark: "bold" });
    expect([pick(doc, a), pick(doc, b)].map((el) => defaultsOf(el).bold)).toEqual([false, false]);
    expect(elementsTextState([pick(doc, a), pick(doc, b)])?.bold).toBe(false);
  });

  test("a table's bold style follows the command, and its cells lose their bold marks", () => {
    const doc = sampleDoc();
    const table = boldTable(doc);
    setElementText(doc, "slideA", table.id, para(run("a", ["bold"])), tableCellKey(table.cells[0].rowId, table.cells[0].colId));
    formatElementsText(doc, "slideA", [pick(doc, table.id)], { kind: "mark", mark: "bold", on: false });
    const after = pick(doc, table.id);
    expect(defaultsOf(after).bold).toBe(false);
    expect(after.type === "table" && after.cells.some((cell) => hasMarkEverywhere(cell.text, "bold"))).toBe(false);
    expect(elementsTextState([after])?.bold).toBe(false);
  });

  test("other marks leave the defaults of a non-empty text alone", () => {
    const doc = sampleDoc();
    const id = textBox(doc, para(run("Hi")), true);
    formatElementsText(doc, "slideA", [pick(doc, id)], { kind: "mark", mark: "italic", on: true });
    expect(defaultsOf(pick(doc, id)).bold).toBe(true);
  });
});

describe("bold in the live editor", () => {
  test("bold off in a bold-default box: only the selection loses bold, the default goes off", () => {
    const doc = sampleDoc();
    const text = para(run("Hello world"));
    const id = textBox(doc, text, true);
    const editor = liveEditor(text, 1, 6);
    expect(editorTextState(reader(editor), defaultsOf(pick(doc, id))).bold).toBe(true);
    formatLiveText(doc, "slideA", editor, pick(doc, id), undefined, { kind: "mark", mark: "bold", on: false });
    expect(editor.getJSON().content?.[0].content).toEqual([run("Hello"), run(" world", ["bold"])]);
    expect(defaultsOf(pick(doc, id)).bold).toBe(false);
    expect(editorTextState(reader(editor), defaultsOf(pick(doc, id))).bold).toBe(false);
    editor.destroy();
  });

  test("a toggle without `on` in a bold-default box turns bold off too; a collapsed caret types plain", () => {
    const doc = sampleDoc();
    const text = para(run("Hello"));
    const id = textBox(doc, text, true);
    const editor = liveEditor(text, 3);
    formatLiveText(doc, "slideA", editor, pick(doc, id), undefined, { kind: "mark", mark: "bold" });
    expect(defaultsOf(pick(doc, id)).bold).toBe(false);
    expect(editor.getJSON().content?.[0].content).toEqual([run("Hello", ["bold"])]);
    editor.view.dispatch(editor.state.tr.insertText("X"));
    expect(editor.getJSON().content?.[0].content).toEqual([run("He", ["bold"]), run("X"), run("llo", ["bold"])]);
    editor.destroy();
  });

  test("in a body cell of a bold table: the table style goes off and the other cells take bold marks", () => {
    const doc = sampleDoc();
    const table = boldTable(doc);
    const editing = cellAt(table, 1, 0);
    const key = tableCellKey(editing.rowId, editing.colId);
    const editor = liveEditor(editing.text, 1, 2);
    formatLiveText(doc, "slideA", editor, table, key, { kind: "mark", mark: "bold", on: false });
    const after = pick(doc, table.id);
    if (after.type !== "table") throw new Error("type");
    expect(after.style.textStyle.bold).toBe(false);
    const byKey = new Map(after.cells.map((cell) => [tableCellKey(cell.rowId, cell.colId), cell.text]));
    // The edited cell's text is the live editor's to write: the deck copy is left as it was.
    expect(byKey.get(key)).toEqual(editing.text);
    for (const [other, text] of byKey) if (other !== key) expect(hasMarkEverywhere(text, "bold")).toBe(true);
    expect(editor.getJSON().content?.[0].content).toEqual([run("c")]);
    editor.destroy();
  });

  test("in a header-row cell, which renders bold whatever it holds, bold changes only the selection's marks", () => {
    const doc = sampleDoc();
    const table = boldTable(doc);
    expect(table.style.headerRow).toBe(true);
    const header = cellAt(table, 0, 1);
    const key = tableCellKey(header.rowId, header.colId);
    const editor = liveEditor(para(run("b", ["bold"])), 1, 2);
    const shown = () => {
      const defaults = liveTextDefaults(pick(doc, table.id), key);
      if (!defaults) throw new Error("no defaults");
      return editorTextState(reader(editor), defaults).bold;
    };
    expect(shown()).toBe(true);
    let transactions = 0;
    doc.on("afterTransaction", () => transactions++);
    formatLiveText(doc, "slideA", editor, table, key, { kind: "mark", mark: "bold" });
    // No deck write: the table style and the other cells are left alone.
    expect(transactions).toBe(0);
    expect(defaultsOf(pick(doc, table.id)).bold).toBe(true);
    expect(editor.getJSON().content?.[0].content).toEqual([run("b")]);
    // It still renders bold, and the controls still say so.
    expect(shown()).toBe(true);
    editor.destroy();
  });

  test("the live defaults show the bold each cell renders (tableCellLook), with and without a header row", () => {
    const doc = sampleDoc();
    const [id] = addElements(doc, "slideA", [newTable(3, 2, SIZE)]);
    for (const headerRow of [true, false]) {
      setTableStyle(doc, "slideA", id, { headerRow });
      const table = pick(doc, id);
      if (table.type !== "table") throw new Error("type");
      expect(table.style.textStyle.bold).toBe(false);
      const cells = tableGrid(table).rows.flat();
      expect(cells.some((gc) => tableCellLook(table, gc).bold)).toBe(headerRow);
      for (const gc of cells) expect(liveTextDefaults(table, gc.key)?.bold).toBe(tableCellLook(table, gc).bold);
    }
  });

  test("where the default is not bold it is a mark change only, with no deck write", () => {
    const doc = sampleDoc();
    const text = para(run("Hello"));
    const id = textBox(doc, text, false);
    const editor = liveEditor(text, 1, 3);
    let transactions = 0;
    doc.on("afterTransaction", () => transactions++);
    formatLiveText(doc, "slideA", editor, pick(doc, id), undefined, { kind: "mark", mark: "bold", on: true });
    expect(transactions).toBe(0);
    expect(editor.getJSON().content?.[0].content).toEqual([run("He", ["bold"]), run("llo")]);
    editor.destroy();
  });
});

describe("Mod-B in the live editor", () => {
  test("in a box made bold from the toolbar, Mod-B un-bolds only the selection and turns the default off", () => {
    const doc = sampleDoc();
    const id = textBox(doc, para(run("Hello world")), false);
    formatElementsText(doc, "slideA", [pick(doc, id)], { kind: "mark", mark: "bold", on: true });
    const boxed = pick(doc, id);
    expect(defaultsOf(boxed).bold).toBe(true);
    if (boxed.type !== "text") throw new Error("type");
    // The stage's command: the toolbar's bold without `on`, on the live editor (use-element-actions formatText).
    const editor = liveEditor(boxed.text, 1, 6, (ed) => formatLiveText(doc, "slideA", ed, pick(doc, id), undefined, { kind: "mark", mark: "bold" }));
    expect(pressModB(editor)).toBe(true);
    expect(editor.getJSON().content?.[0].content).toEqual([run("Hello"), run(" world", ["bold"])]);
    expect(defaultsOf(pick(doc, id)).bold).toBe(false);
    expect(editorTextState(reader(editor), defaultsOf(pick(doc, id))).bold).toBe(false);
    editor.destroy();
  });

  test("in a table cell after whole-table Bold on, Mod-B un-bolds only the selection", () => {
    const doc = sampleDoc();
    const [id] = addElements(doc, "slideA", [newTable(2, 2, SIZE)]);
    const plain = pick(doc, id);
    if (plain.type !== "table") throw new Error("type");
    const editing = cellAt(plain, 1, 1);
    const key = tableCellKey(editing.rowId, editing.colId);
    setElementText(doc, "slideA", id, para(run("Hello world")), key);
    formatElementsText(doc, "slideA", [pick(doc, id)], { kind: "mark", mark: "bold", on: true });
    const table = pick(doc, id);
    if (table.type !== "table") throw new Error("type");
    expect(table.style.textStyle.bold).toBe(true);
    const text = table.cells.find((cell) => tableCellKey(cell.rowId, cell.colId) === key)?.text;
    if (!text) throw new Error("no cell text");
    const editor = liveEditor(text, 1, 6, (ed) => formatLiveText(doc, "slideA", ed, pick(doc, id), key, { kind: "mark", mark: "bold" }));
    expect(pressModB(editor)).toBe(true);
    expect(editor.getJSON().content?.[0].content).toEqual([run("Hello"), run(" world", ["bold"])]);
    expect(defaultsOf(pick(doc, id)).bold).toBe(false);
    editor.destroy();
  });

  test("without a host command, Mod-B is the stock bold toggle", () => {
    const editor = liveEditor(para(run("Hello")), 1, 3);
    expect(pressModB(editor)).toBe(true);
    expect(editor.getJSON().content?.[0].content).toEqual([run("He", ["bold"]), run("llo")]);
    editor.destroy();
  });
});

describe("locked tables", () => {
  test("deleteTable leaves a locked table; unlocked, it goes", () => {
    const doc = sampleDoc();
    const [id] = addElements(doc, "slideA", [newTable(2, 2, SIZE)]);
    updateElements(doc, "slideA", [{ id, patch: { locked: true } }]);
    const locked = pick(doc, id);
    if (locked.type !== "table") throw new Error("type");
    runTableCommand(doc, "slideA", locked, "deleteTable");
    expect(elementsOf(doc).some((e) => e.id === id)).toBe(true);
    updateElements(doc, "slideA", [{ id, patch: { locked: false } }]);
    const unlocked = pick(doc, id);
    if (unlocked.type !== "table") throw new Error("type");
    runTableCommand(doc, "slideA", unlocked, "deleteTable");
    expect(elementsOf(doc).some((e) => e.id === id)).toBe(false);
  });
});

describe("StageScale", () => {
  test("the registered stage's scale, null without one or when it is not a usable number", () => {
    const scale = new StageScale();
    expect(scale.get()).toBeNull();
    let shown: number | null = 0.62;
    const unregister = scale.register(() => shown);
    expect(scale.get()).toBe(0.62);
    shown = null;
    expect(scale.get()).toBeNull();
    shown = Number.NaN;
    expect(scale.get()).toBeNull();
    // A later stage takes over; the first one's cleanup then leaves it registered.
    scale.register(() => 1.5);
    unregister();
    expect(scale.get()).toBe(1.5);
  });
});
