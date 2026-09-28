// Arrange helpers: rotated bounds, align to selection or slide, distribute, nudge and quarter turns. Locked
// elements never move.
import { describe, expect, test } from "bun:test";

import { alignPatches, distributePatches, elementBounds, nudgePatches, rotatePatch, unionBounds } from "@/lib/slides/geometry/arrange";
import type { SlideElement } from "@/lib/slides/model/types";
import { canonical } from "./helpers/fixtures";

const rect = (id: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): SlideElement =>
  canonical({ id, type: "shape", x, y, w, h, geom: { kind: "preset", preset: "rect" }, ...extra });
const line = (id: string, x1: number, y1: number, x2: number, y2: number): SlideElement => canonical({ id, type: "line", x1, y1, x2, y2 });

describe("bounds", () => {
  test("rotation grows the box around its centre; lines use their endpoints", () => {
    expect(elementBounds(rect("a", 0, 0, 100, 50))).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    const turned = elementBounds(rect("a", 0, 0, 100, 50, { rot: 90 }));
    expect(turned.x).toBeCloseTo(25, 6);
    expect(turned.y).toBeCloseTo(-25, 6);
    expect(turned.w).toBeCloseTo(50, 6);
    expect(turned.h).toBeCloseTo(100, 6);
    expect(elementBounds(line("l", 50, 10, 10, 40))).toEqual({ x: 10, y: 10, w: 40, h: 30 });
    expect(unionBounds([rect("a", 0, 0, 10, 10), line("l", 20, 20, 30, 5)])).toEqual({ x: 0, y: 0, w: 30, h: 20 });
    expect(unionBounds([])).toBeNull();
  });
});

describe("align / distribute / nudge", () => {
  const els = [rect("a", 10, 10, 20, 20), rect("b", 50, 40, 40, 10), line("l", 100, 0, 120, 30)];

  test("align left/right/center to the selection moves boxes and lines", () => {
    expect(alignPatches(els, "left", "selection", { w: 960, h: 540 })).toEqual([
      { id: "b", patch: { x: 10, y: 40 } },
      { id: "l", patch: { x1: 10, y1: 0, x2: 30, y2: 30 } },
    ]);
    expect(alignPatches(els, "right", "selection", { w: 960, h: 540 }).map((p) => p.id)).toEqual(["a", "b"]);
    expect(alignPatches(els, "middle", "slide", { w: 960, h: 540 })[0]).toEqual({ id: "a", patch: { x: 10, y: 260 } });
  });

  test("locked elements never move", () => {
    const locked = [rect("a", 10, 10, 20, 20, { locked: true }), rect("b", 50, 40, 40, 10)];
    expect(alignPatches(locked, "left", "slide", { w: 960, h: 540 })).toEqual([{ id: "b", patch: { x: 0, y: 40 } }]);
    expect(nudgePatches(locked, 1, 0)).toEqual([{ id: "b", patch: { x: 51, y: 40 } }]);
  });

  test("distribute keeps the ends and equalizes the gaps", () => {
    const row = [rect("a", 0, 0, 10, 10), rect("c", 100, 0, 10, 10), rect("b", 20, 0, 30, 10)];
    expect(distributePatches(row, "h")).toEqual([{ id: "b", patch: { x: 40, y: 0 } }]);
    expect(distributePatches(row.slice(0, 2), "h")).toEqual([]);
  });

  test("nudge clamps to the coordinate limit", () => {
    expect(nudgePatches([rect("a", 19_999, 0, 10, 10)], 10, 0)).toEqual([{ id: "a", patch: { x: 20_000, y: 0 } }]);
  });
});

describe("rotatePatch", () => {
  test("boxes turn by ±90°, lines turn their endpoints around the midpoint", () => {
    expect(rotatePatch(rect("a", 0, 0, 10, 10, { rot: 300 }), 90)).toEqual({ id: "a", patch: { rot: 30 } });
    expect(rotatePatch(rect("a", 0, 0, 10, 10), -90)).toEqual({ id: "a", patch: { rot: 270 } });
    expect(rotatePatch(line("l", 0, 0, 20, 0), 90)).toEqual({ id: "l", patch: { x1: 10, y1: -10, x2: 10, y2: 10 } });
    expect(rotatePatch(line("l", 0, 0, 20, 0), -90)).toEqual({ id: "l", patch: { x1: 10, y1: 10, x2: 10, y2: -10 } });
  });
});
