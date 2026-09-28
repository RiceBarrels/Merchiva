// Insert factories, table commands and whole-element text formatting (lib/slides/editor/{elements,insert-media,
// table-commands,text-format}.ts): every new element survives the validator unchanged in its essentials, lands
// where asked, and the commands write through the model ops.
import { describe, expect, test } from "bun:test";

import {
  fitImageBox, flipPatches, newImage, newLine, newShape, newTable, newTextBox, placeBox,
} from "@/lib/slides/editor/elements";
import { pasteOffset, plainTextElement, plainTextJson } from "@/lib/slides/editor/insert-media";
import { runTableCommand } from "@/lib/slides/editor/table-commands";
import { formatDefaults, formatElementsText, formatTextJson, stepFontSize } from "@/lib/slides/editor/text-format";
import { SHAPE_PRESETS } from "@/lib/slides/geometry/presets";
import { DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import { addElements } from "@/lib/slides/model/ops-elements";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { NewElement, SlideElement, TableElement } from "@/lib/slides/model/types";
import { sanitizeElement } from "@/lib/slides/model/validate";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { SIZE, sampleDoc } from "./helpers";

function clean(el: NewElement): SlideElement {
  const out = sanitizeElement({ ...el, id: "e1", z: "a0" });
  if (!out) throw new Error("element did not survive the validator");
  return out;
}

describe("factories", () => {
  test("a text box is centred, or placed at a point and kept on the slide", () => {
    const centred = clean(newTextBox(SIZE));
    if (centred.type !== "text") throw new Error("type");
    expect(centred.x + centred.w / 2).toBeCloseTo(SIZE.w / 2);
    expect(placeBox({ w: 100, h: 50 }, SIZE, { x: 950, y: -20 })).toEqual({ x: 860, y: 0 });
    expect(textJsonToPlain(centred.text)).toBe("");
  });

  test("every preset makes a valid shape; round presets are square", () => {
    for (const preset of SHAPE_PRESETS) {
      const shape = clean(newShape(preset, SIZE));
      if (shape.type !== "shape") throw new Error("type");
      expect(shape.geom).toEqual({ kind: "preset", preset });
    }
    const circle = clean(newShape("ellipse", SIZE));
    if (circle.type !== "shape") throw new Error("type");
    expect(circle.w).toBe(circle.h);
  });

  test("a line / arrow is horizontal across the middle", () => {
    const arrow = clean(newLine(true, SIZE));
    if (arrow.type !== "line") throw new Error("type");
    expect(arrow.y1).toBe(arrow.y2);
    expect(arrow.stroke.tail).toBe("triangle");
    const plain = clean(newLine(false, SIZE));
    if (plain.type !== "line") throw new Error("type");
    expect(plain.stroke.tail ?? "none").toBe("none");
  });

  test("a picture keeps its proportions and fits in 60% of the slide", () => {
    expect(fitImageBox({ w: 4000, h: 2000 }, SIZE)).toEqual({ w: 576, h: 288 });
    expect(fitImageBox({ w: 100, h: 50 }, SIZE)).toEqual({ w: 100, h: 50 });
    const pic = clean(newImage("https://cdn.example.com/a.png", { w: 100, h: 50 }, SIZE, { x: 200, y: 100 }));
    if (pic.type !== "image") throw new Error("type");
    expect([pic.x + pic.w / 2, pic.y + pic.h / 2]).toEqual([200, 100]);
  });

  test("a table has every cell, its caps, and fits the slide width", () => {
    const table = clean(newTable(3, 50, SIZE));
    if (table.type !== "table") throw new Error("type");
    expect(table.rows.length).toBe(3);
    expect(table.cols.length).toBe(40);
    expect(table.cells.length).toBe(120);
    expect(table.w).toBeLessThanOrEqual(SIZE.w);
  });

  test("pasted plain text becomes one paragraph per line", () => {
    expect(plainTextJson("a\r\n\nb")).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "b" }] }] });
    const box = clean(plainTextElement("one\ntwo\nthree", SIZE));
    if (box.type !== "text") throw new Error("type");
    expect(textJsonToPlain(box.text)).toBe("one\ntwo\nthree");
  });

  test("a paste next to its own original is offset by one duplicate step; elsewhere it keeps its place", () => {
    const shape = clean(newShape("rect", SIZE));
    if (shape.type !== "shape") throw new Error("type");
    expect(pasteOffset([shape], [shape])).toEqual({ x: shape.x + 12, y: shape.y + 12 });
    expect(pasteOffset([], [shape])).toBeNull();
    expect(pasteOffset([{ ...shape, x: shape.x + 50 }], [shape])).toBeNull();
    expect(pasteOffset([shape], [])).toBeNull();
  });

  test("flips mirror pictures and shapes, swap a line's ends, skip locked elements and tables", () => {
    const shape = clean(newShape("rightArrow", SIZE));
    const line = { ...clean(newLine(false, SIZE)), id: "l1" };
    const table = { ...clean(newTable(1, 1, SIZE)), id: "t1" };
    const locked = { ...shape, id: "s2", locked: true };
    expect(flipPatches([shape, line, table, locked], "h")).toEqual([
      { id: "e1", patch: { flipH: true } },
      { id: "l1", patch: line.type === "line" ? { x1: line.x2, x2: line.x1 } : {} },
    ]);
  });
});

describe("table commands", () => {
  function withTable() {
    const doc = sampleDoc();
    const [id] = addElements(doc, "slideA", [newTable(2, 2, SIZE)]);
    const read = () => readDeckSnapshot(doc).slides[0].elements.find((e) => e.id === id) as TableElement | undefined;
    return { doc, id, read };
  }

  test("rows and columns go next to the edited cell; without one, at the edge", () => {
    const { doc, read } = withTable();
    const t0 = read()!;
    const cell = `${t0.rows[0].id}:${t0.cols[1].id}`;
    runTableCommand(doc, "slideA", t0, "insertRowBelow", cell);
    const t1 = read()!;
    expect(t1.rows.length).toBe(3);
    expect(t1.rows[0].id).toBe(t0.rows[0].id);
    expect(t1.rows[2].id).toBe(t0.rows[1].id);
    runTableCommand(doc, "slideA", t1, "insertColumnRight");
    expect(read()!.cols.length).toBe(3);
    expect(read()!.cols[0].id).toBe(t0.cols[0].id);
  });

  test("deletes need a cell; the last row takes the table with it; styles toggle", () => {
    const { doc, read } = withTable();
    const t0 = read()!;
    runTableCommand(doc, "slideA", t0, "deleteRow");
    expect(read()!.rows.length).toBe(2);
    runTableCommand(doc, "slideA", t0, "toggleBanded");
    expect(read()!.style.banded).toBe(!t0.style.banded);
    runTableCommand(doc, "slideA", read()!, { cellFill: "#ff0000" });
    expect(read()!.cells.every((c) => c.fill === "#ff0000")).toBe(true);
    runTableCommand(doc, "slideA", read()!, "deleteRow", `${t0.rows[0].id}:${t0.cols[0].id}`);
    runTableCommand(doc, "slideA", read()!, "deleteRow", `${t0.rows[1].id}:${t0.cols[0].id}`);
    expect(read()).toBeUndefined();
  });
});

describe("text format on whole elements", () => {
  const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] };

  test("commands rewrite every run or paragraph", () => {
    expect(formatTextJson(json, { kind: "mark", mark: "bold" }, 18).content?.[0].content?.[0].marks).toEqual([{ type: "bold" }]);
    expect(formatTextJson(json, { kind: "align", align: "center" }, 18).content?.[0].attrs).toEqual({ textAlign: "center" });
    expect(formatTextJson(json, { kind: "sizeStep", dir: 1 }, 18).content?.[0].content?.[0].marks).toEqual([{ type: "textStyle", attrs: { fontSize: 20 } }]);
    expect(formatTextJson(json, { kind: "link", href: "javascript:alert(1)" }, 18).content?.[0].content?.[0].marks).toBeUndefined();
    expect(formatTextJson(json, { kind: "list", list: "bullet" }, 18).content?.[0].type).toBe("bulletList");
  });

  test("an empty text takes the look as its defaults", () => {
    expect(formatDefaults(DEFAULT_TEXT_DEFAULTS, { kind: "size", pt: 30 })?.size).toBe(30);
    expect(formatDefaults(DEFAULT_TEXT_DEFAULTS, { kind: "mark", mark: "bold" })?.bold).toBe(true);
    expect(formatDefaults(DEFAULT_TEXT_DEFAULTS, { kind: "mark", mark: "italic" })).toBeNull();
    expect(formatDefaults(DEFAULT_TEXT_DEFAULTS, { kind: "color", color: "theme:accent2" })?.color).toBe("theme:accent2");
  });

  test("selected elements are formatted in one transaction: text, empty-text defaults, every table cell", () => {
    const doc = sampleDoc();
    const [boxId, emptyId, tableId] = addElements(doc, "slideA", [
      { ...newTextBox(SIZE), text: json } as NewElement,
      newTextBox(SIZE),
      newTable(1, 2, SIZE),
    ]);
    const els = () => readDeckSnapshot(doc).slides[0].elements;
    const pick = (id: string) => els().find((e) => e.id === id)!;
    let transactions = 0;
    doc.on("afterTransaction", () => transactions++);
    formatElementsText(doc, "slideA", [pick(boxId), pick(emptyId), pick(tableId)], { kind: "size", pt: 30 });
    expect(transactions).toBe(1);
    const box = pick(boxId);
    const empty = pick(emptyId);
    const table = pick(tableId);
    if (box.type !== "text" || empty.type !== "text" || table.type !== "table") throw new Error("types");
    expect(box.text.content?.[0].content?.[0].marks?.[0]).toMatchObject({ type: "textStyle", attrs: { fontSize: 30 } });
    expect(empty.textStyle.size).toBe(30);
    expect(table.cells.length).toBe(2);
  });

  test("size steps walk the size list and stop at its ends", () => {
    expect(stepFontSize(18, 1)).toBe(20);
    expect(stepFontSize(19, -1)).toBe(18);
    expect(stepFontSize(96, 1)).toBe(96);
    expect(stepFontSize(8, -1)).toBe(8);
  });
});
