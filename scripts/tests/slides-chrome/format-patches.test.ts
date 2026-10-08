// The object format controls of the Slides toolbar (components/slides/chrome/format-patches.ts): every patch they
// build is written through the real model op (updateElements) and read back, so a patch the op would ignore or
// refuse fails here, and each keeps the parts of the element it does not change.
import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import {
  autofitPatches, currentFill, currentStroke, fillPatches, lineEndPatches, maskPatches, strokeColorPatches, strokeDashPatches,
  strokeWeightPatches, vAlignPatches,
} from "@/components/slides/chrome/format-patches";
import { newImage, newLine, newShape, newTextBox } from "@/lib/slides/editor/elements";
import { buildDeckState } from "@/lib/slides/model/build";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { addElements, updateElements } from "@/lib/slides/model/ops-elements";
import { newSlideSnapshot } from "@/lib/slides/model/ops-slides";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { ElementPatchEntry, NewElement, SlideElement } from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";

const SIZE = { w: 960, h: 540 };

function deck(els: NewElement[]): { doc: Y.Doc; ids: string[] } {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, buildDeckState({
    meta: { schemaVersion: 1, size: SIZE, theme: STARTER_THEMES["simple-light"], source: null },
    masters: [],
    slides: [newSlideSnapshot("s1", sequentialKeys(1)[0], "blank", "theme", SIZE)],
  }));
  return { doc, ids: addElements(doc, "s1", els) };
}

const read = (doc: Y.Doc): SlideElement[] => [...readDeckSnapshot(doc).slides[0].elements];
const apply = (doc: Y.Doc, entries: ElementPatchEntry[]) => updateElements(doc, "s1", entries);
const byId = (doc: Y.Doc, id: string) => read(doc).find((el) => el.id === id);

describe("fill", () => {
  test("solid fill on text boxes and shapes only; a translucent fill keeps its alpha", () => {
    const shape = newShape("rect", SIZE);
    if (shape.type !== "shape") throw new Error("shape");
    const { doc, ids } = deck([{ ...shape, fill: { t: "solid", color: "#112233", alpha: 0.5 } }, newTextBox(SIZE), newLine(false, SIZE)]);
    apply(doc, fillPatches(read(doc), "theme:accent2"));
    expect(byId(doc, ids[0])).toMatchObject({ fill: { t: "solid", color: "theme:accent2", alpha: 0.5 } });
    expect(byId(doc, ids[1])).toMatchObject({ fill: { t: "solid", color: "theme:accent2" } });
    expect(fillPatches(read(doc), null).map((e) => e.id)).toEqual([ids[0], ids[1]]);
    apply(doc, fillPatches(read(doc), null));
    expect(byId(doc, ids[0])).toMatchObject({ fill: { t: "none" } });
    expect(currentFill(read(doc))).toBeNull();
  });

  test("currentFill shows the first filled element's solid colour", () => {
    const { doc } = deck([newLine(false, SIZE), newShape("ellipse", SIZE)]);
    expect(currentFill(read(doc))).toBe("theme:accent1");
  });
});

describe("outline", () => {
  test("colour: boxes and lines; null removes box outlines and never a line's stroke", () => {
    const { doc, ids } = deck([newShape("rect", SIZE), newLine(true, SIZE)]);
    apply(doc, strokeColorPatches(read(doc), "#ff0000"));
    expect(byId(doc, ids[0])).toMatchObject({ stroke: { color: "#ff0000", width: 1, dash: "solid" } });
    expect(byId(doc, ids[1])).toMatchObject({ stroke: { color: "#ff0000", width: 2, tail: "triangle" } });
    apply(doc, strokeColorPatches(read(doc), null));
    expect(byId(doc, ids[0])).toMatchObject({ stroke: null });
    expect(byId(doc, ids[1])).toMatchObject({ stroke: { color: "#ff0000" } });
  });

  test("weight and dash start from the default outline when there is none, and keep the rest", () => {
    const { doc, ids } = deck([newTextBox(SIZE), newShape("rect", SIZE)]);
    expect(currentStroke(read(doc))).toBeNull();
    apply(doc, strokeWeightPatches(read(doc), 4));
    expect(byId(doc, ids[0])).toMatchObject({ stroke: { color: "theme:text", width: 4, dash: "solid" } });
    expect(byId(doc, ids[1])).toMatchObject({ stroke: { color: "theme:accent1", width: 4, dash: "solid" } });
    apply(doc, strokeDashPatches(read(doc), "dashDot"));
    expect(byId(doc, ids[1])).toMatchObject({ stroke: { color: "theme:accent1", width: 4, dash: "dashDot" } });
  });

  test("line ends go on lines only, one end at a time", () => {
    const { doc, ids } = deck([newLine(false, SIZE), newShape("rect", SIZE)]);
    expect(lineEndPatches(read(doc), "head", "oval").map((e) => e.id)).toEqual([ids[0]]);
    apply(doc, lineEndPatches(read(doc), "head", "oval"));
    apply(doc, lineEndPatches(read(doc), "tail", "stealth"));
    expect(byId(doc, ids[0])).toMatchObject({ stroke: { head: "oval", tail: "stealth", width: 2 } });
  });
});

describe("text box and picture settings", () => {
  test("vertical alignment and autofit keep the other box settings", () => {
    const { doc, ids } = deck([newTextBox(SIZE), newLine(false, SIZE)]);
    const before = byId(doc, ids[0]);
    if (!before || before.type !== "text") throw new Error("text");
    apply(doc, vAlignPatches(read(doc), "bottom"));
    apply(doc, autofitPatches(read(doc), "grow"));
    const after = byId(doc, ids[0]);
    if (!after || after.type !== "text") throw new Error("text");
    expect(after.box).toEqual({ ...before.box, vAlign: "bottom", autofit: "grow" });
    expect(vAlignPatches(read(doc), "top").map((e) => e.id)).toEqual([ids[0]]);
  });

  test("mask on pictures only", () => {
    const { doc, ids } = deck([newImage("https://example.com/a.png", { w: 100, h: 80 }, SIZE), newShape("rect", SIZE)]);
    apply(doc, maskPatches(read(doc), "ellipse"));
    expect(byId(doc, ids[0])).toMatchObject({ mask: "ellipse" });
    expect(maskPatches(read(doc), "").map((e) => e.id)).toEqual([ids[0]]);
  });
});
