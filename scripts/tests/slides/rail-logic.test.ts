// The slide rail and grid sorter's pure logic (slides.md §7.3): drop positions and targets, the order a move leaves
// (checked against the real moveSlides op), rail selection and command keys, and a layout change as one undo step.
import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { autoScrollDirection, draggedSlides, dropIndexAt, dropTarget, orderAfterMove, type ReorderItemRect } from "@/components/slides/rail/reorder-math";
import { slideMove } from "@/components/slides/menubar/slide-order";
import { pickSlides, steppedSlide, isSinglePick } from "@/components/slides/rail/rail-selection";
import { isRailCommandKey } from "@/components/slides/rail/use-slide-focus";
import { applyLayoutChange, planLayoutChange } from "@/components/slides/panels/apply-layout";
import { buildDeckState } from "@/lib/slides/model/build";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { moveSlides, newSlideSnapshot } from "@/lib/slides/model/ops-slides";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import { createSlidesUndoManager } from "@/lib/slides/model/undo";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import type { SlideSnapshot } from "@/lib/slides/model/types";

const col = (ids: string[], h = 100, gap = 10): ReorderItemRect[] => ids.map((id, i) => ({ id, left: 0, right: 150, top: i * (h + gap), bottom: i * (h + gap) + h }));
const row = (ids: string[], rtl = false): ReorderItemRect[] => ids.map((id, i) => {
  const left = rtl ? 1000 - (i + 1) * 110 : i * 110;
  return { id, left, right: left + 100, top: 0, bottom: 60 };
});

describe("dropIndexAt", () => {
  const items = col(["a", "b", "c", "d"]);
  test("vertical: before the first item whose middle is below the pointer", () => {
    expect(dropIndexAt(items, 10, 10, "vertical")).toBe(0);
    expect(dropIndexAt(items, 10, 60, "vertical")).toBe(1);
    expect(dropIndexAt(items, 10, 170, "vertical")).toBe(2);
    expect(dropIndexAt(items, 10, 999, "vertical")).toBe(4);
    expect(dropIndexAt([], 0, 0, "vertical")).toBe(0);
  });
  test("horizontal LTR and RTL", () => {
    expect(dropIndexAt(row(["a", "b", "c"]), 5, 10, "horizontal")).toBe(0);
    expect(dropIndexAt(row(["a", "b", "c"]), 170, 10, "horizontal")).toBe(2);
    expect(dropIndexAt(row(["a", "b", "c"]), 900, 10, "horizontal")).toBe(3);
    // RTL: a is rightmost
    expect(dropIndexAt(row(["a", "b", "c"], true), 995, 10, "horizontal")).toBe(0);
    expect(dropIndexAt(row(["a", "b", "c"], true), 800, 10, "horizontal")).toBe(2);
    expect(dropIndexAt(row(["a", "b", "c"], true), 10, 10, "horizontal")).toBe(3);
  });
  test("grid: row by pointer height, then position in the row", () => {
    const grid: ReorderItemRect[] = ["a", "b", "c", "d", "e"].map((id, i) => {
      const r = Math.floor(i / 3), c = i % 3;
      return { id, left: c * 110, right: c * 110 + 100, top: r * 80, bottom: r * 80 + 60 };
    });
    expect(dropIndexAt(grid, 5, 30, "grid")).toBe(0);
    expect(dropIndexAt(grid, 180, 30, "grid")).toBe(2);
    expect(dropIndexAt(grid, 400, 30, "grid")).toBe(3);
    expect(dropIndexAt(grid, 5, 100, "grid")).toBe(3);
    expect(dropIndexAt(grid, 400, 500, "grid")).toBe(5);
    expect(dropIndexAt(grid, 60, 69, "grid")).toBe(1); // upper half of the gap under row 1
    expect(dropIndexAt(grid, 60, 71, "grid")).toBe(4); // lower half: row 2
  });
});

describe("dropTarget", () => {
  const order = ["a", "b", "c", "d"];
  test("moves before the slide at the index, skipping the moving ones", () => {
    expect(dropTarget(order, ["a"], 3)).toEqual({ before: "d" });
    expect(dropTarget(order, ["a"], 4)).toEqual({ before: null });
    expect(dropTarget(order, ["c", "d"], 0)).toEqual({ before: "a" });
    expect(dropTarget(order, ["b", "d"], 0)).toEqual({ before: "a" });
  });
  test("no-op drops are null", () => {
    expect(dropTarget(order, ["a"], 0)).toBeNull();
    expect(dropTarget(order, ["a"], 1)).toBeNull();
    expect(dropTarget(order, ["b", "c"], 1)).toBeNull();
    expect(dropTarget(order, ["b", "c"], 3)).toBeNull();
    expect(dropTarget(order, [], 2)).toBeNull();
    expect(dropTarget(order, ["zz"], 2)).toBeNull();
  });
  test("a scattered pick gathers into one block", () => {
    // a,c dropped between b and c: they gather after b, before d
    expect(dropTarget(order, ["a", "c"], 2)).toEqual({ before: "d" });
  });
});

describe("orderAfterMove", () => {
  const order = ["a", "b", "c", "d"];
  test("a scattered pick gathers into one block before the target (the rail's announced position)", () => {
    // Pick B and D (current D), Mod+Up: the block goes before A.
    const step = slideMove(order, ["b", "d"], -1);
    expect(step).toEqual({ ids: ["b", "d"], before: "a" });
    const next = orderAfterMove(order, step!.ids, step!.before);
    expect(next).toEqual(["b", "d", "a", "c"]);
    expect(next.indexOf("d") + 1).toBe(2);
  });
  test("to the end, a contiguous block, and no-ops", () => {
    expect(orderAfterMove(order, ["a"], null)).toEqual(["b", "c", "d", "a"]);
    expect(orderAfterMove(order, ["b", "c"], "a")).toEqual(["b", "c", "a", "d"]);
    expect(orderAfterMove(order, ["b"], "b")).toEqual(order);
    expect(orderAfterMove(order, [], "a")).toEqual(order);
    expect(orderAfterMove(order, ["a"], "zz")).toEqual(["b", "c", "d", "a"]);
  });
  test("agrees with the moveSlides op on a real deck", () => {
    const SIZE = { w: 960, h: 540 };
    const keys = sequentialKeys(5);
    const ids = ["s1", "s2", "s3", "s4", "s5"];
    const cases: Array<[string[], string | null]> = [[["s2", "s4"], "s1"], [["s1", "s3"], "s5"], [["s1", "s5"], null], [["s3"], "s2"], [["s2", "s5"], "s4"]];
    for (const [moving, before] of cases) {
      const doc = new Y.Doc();
      const slides = ids.map((id, i) => newSlideSnapshot(id, keys[i], "blank", "theme", SIZE));
      Y.applyUpdate(doc, buildDeckState({ meta: { schemaVersion: 1, size: SIZE, theme: STARTER_THEMES["simple-light"], source: null }, masters: [], slides }));
      moveSlides(doc, moving, before);
      expect(readDeckSnapshot(doc).slides.map((s) => s.id)).toEqual(orderAfterMove(ids, moving, before));
    }
  });
});

describe("draggedSlides / autoScroll", () => {
  test("the picked block in deck order, or just the pressed slide", () => {
    expect(draggedSlides(["a", "b", "c"], ["c", "a"], "a")).toEqual(["a", "c"]);
    expect(draggedSlides(["a", "b", "c"], ["c", "a"], "b")).toEqual(["b"]);
  });
  test("auto-scroll bands", () => {
    expect(autoScrollDirection(5, 0, 500, 40)).toBeLessThan(0);
    expect(autoScrollDirection(250, 0, 500, 40)).toBe(0);
    expect(autoScrollDirection(499, 0, 500, 40)).toBeGreaterThan(0);
    expect(autoScrollDirection(10, 0, 60, 40)).toBe(0);
  });
});

describe("pickSlides", () => {
  const order = ["a", "b", "c", "d", "e"];
  test("replace, range from the anchor, toggle", () => {
    expect(pickSlides({ order, picked: ["a"], current: "a", anchor: "a" }, "c", "replace")).toEqual({ slideIds: ["c"], current: "c", anchor: "c" });
    expect(pickSlides({ order, picked: ["b"], current: "b", anchor: "b" }, "d", "range")).toEqual({ slideIds: ["b", "c", "d"], current: "d", anchor: "b" });
    expect(pickSlides({ order, picked: ["d"], current: "d", anchor: "d" }, "b", "range")).toEqual({ slideIds: ["b", "c", "d"], current: "b", anchor: "d" });
    expect(pickSlides({ order, picked: ["b", "c"], current: "c", anchor: "b" }, "e", "toggle")).toEqual({ slideIds: ["b", "c", "e"], current: "e", anchor: "e" });
    expect(pickSlides({ order, picked: ["b", "c", "e"], current: "e", anchor: "e" }, "e", "toggle")).toEqual({ slideIds: ["b", "c"], current: "c", anchor: "c" });
    expect(pickSlides({ order, picked: ["b", "c", "e"], current: "b", anchor: "b" }, "c", "toggle")).toEqual({ slideIds: ["b", "e"], current: "b", anchor: "b" });
    // the last picked slide can't be toggled off
    expect(pickSlides({ order, picked: ["b"], current: "b", anchor: "b" }, "b", "toggle")).toEqual({ slideIds: ["b"], current: "b", anchor: "b" });
    // a stale anchor falls back to the current slide
    expect(pickSlides({ order, picked: ["c"], current: "c", anchor: "gone" }, "a", "range").slideIds).toEqual(["a", "b", "c"]);
  });
  test("steppedSlide clamps and isSinglePick", () => {
    expect(steppedSlide(order, "a", -1)).toBe("a");
    expect(steppedSlide(order, "a", 3)).toBe("d");
    expect(steppedSlide(order, "e", 1)).toBe("e");
    expect(steppedSlide(order, null, 1)).toBe("a");
    expect(steppedSlide([], "a", 1)).toBeNull();
    expect(isSinglePick({ slideIds: ["a"], current: "a", anchor: "a" })).toBe(true);
    expect(isSinglePick({ slideIds: ["a", "b"], current: "a", anchor: "a" })).toBe(false);
  });
  test("rail command keys", () => {
    const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods });
    expect(isRailCommandKey(k("Delete"), true)).toBe(true);
    expect(isRailCommandKey(k("d", { metaKey: true }), true)).toBe(true);
    expect(isRailCommandKey(k("d", { ctrlKey: true }), true)).toBe(false);
    expect(isRailCommandKey(k("D", { ctrlKey: true }), false)).toBe(true);
    expect(isRailCommandKey(k("ArrowUp", { ctrlKey: true }), false)).toBe(true);
    expect(isRailCommandKey(k("ArrowUp"), false)).toBe(false);
    expect(isRailCommandKey(k("Delete", { altKey: true }), false)).toBe(false);
  });
});

describe("layout change", () => {
  const SIZE = { w: 960, h: 540 };
  const para = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const slideWith = (layout: "title" | "twoColumn", texts: Record<string, string>): SlideSnapshot => {
    const s = newSlideSnapshot("s1", sequentialKeys(1)[0], layout, "theme", SIZE);
    let bodies = 0;
    return { ...s, elements: s.elements.map((el) => {
      if (el.type !== "text") return el;
      const key = el.placeholder === "body" ? `body${bodies++}` : el.placeholder;
      return texts[key] ? { ...el, text: para(texts[key]) } : el;
    }) };
  };
  test("title -> titleBody: title moves, empty subtitle goes, a body is added", () => {
    const s = slideWith("title", { title: "Hello" });
    const plan = planLayoutChange(s, "titleBody", SIZE);
    expect(plan.patches).toHaveLength(1);
    expect(plan.patches[0].patch).toMatchObject({ x: 60, y: 36, w: 840, h: 72 });
    expect(plan.removals).toHaveLength(1);
    expect(plan.additions.map((a) => a.type === "text" && a.placeholder)).toEqual(["body"]);
  });
  test("a placeholder with text that has no slot stays", () => {
    const s = slideWith("title", { title: "Hello", subtitle: "Keep me" });
    const plan = planLayoutChange(s, "titleOnly", SIZE);
    expect(plan.removals).toHaveLength(0);
    expect(plan.additions).toHaveLength(0);
  });
  test("two columns -> blank keeps both filled bodies, removes the empty title", () => {
    const s = slideWith("twoColumn", { body0: "L", body1: "R" });
    const plan = planLayoutChange(s, "blank", SIZE);
    expect(plan.patches).toHaveLength(0);
    expect(plan.removals).toHaveLength(1);
  });
  test("locked placeholders are left alone", () => {
    const base = slideWith("title", {});
    const s = { ...base, elements: base.elements.map((el) => ({ ...el, locked: true })) };
    const plan = planLayoutChange(s, "titleBody", SIZE);
    expect(plan.patches).toHaveLength(0);
    expect(plan.removals).toHaveLength(0);
    expect(plan.additions).toHaveLength(2);
  });
  test("applyLayoutChange writes one transaction (one undo step) and keeps the text", () => {
    const doc = new Y.Doc();
    const s = slideWith("title", { title: "Hello" });
    Y.applyUpdate(doc, buildDeckState({ meta: { schemaVersion: 1, size: SIZE, theme: STARTER_THEMES["simple-light"], source: null }, masters: [], slides: [s] }));
    const { undo, dispose } = createSlidesUndoManager(doc, () => ({ slideId: "s1", elementIds: [] }), () => undefined);
    let updates = 0;
    doc.on("update", () => { updates++; });
    applyLayoutChange(doc, readDeckSnapshot(doc).slides[0], "titleBody", SIZE);
    expect(updates).toBe(1);
    const after = readDeckSnapshot(doc).slides[0];
    expect(after.layout).toBe("titleBody");
    expect(after.elements.map((e) => e.type === "text" && e.placeholder).sort()).toEqual(["body", "title"]);
    expect(JSON.stringify(after.elements.find((e) => e.type === "text" && e.placeholder === "title"))).toContain("Hello");
    undo.undo();
    const back = readDeckSnapshot(doc).slides[0];
    expect(back.layout).toBe("title");
    expect(back.elements.map((e) => e.type === "text" && e.placeholder).sort()).toEqual(["subtitle", "title"]);
    dispose();
  });
});
