// The 25 preset shapes: each yields parseable path data at any size (0 and extreme aspect ratios included), each
// is a pptxgenjs SHAPE_NAME (read from the installed d.ts, so export can write native presets), and each text
// area stays inside its box.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isShapePreset, presetPath, presetTextInset, SHAPE_PRESETS } from "@/lib/slides/geometry/presets";
import { parsePath } from "@/lib/slides/geometry/svg-path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SIZES: Array<[number, number]> = [[0, 0], [0, 100], [100, 0], [1, 1], [100, 50], [960, 540], [1, 1000], [1000, 1], [0.5, 20_000]];

function pptxShapeNames(): Set<string> {
  const dts = readFileSync(join(ROOT, "node_modules/pptxgenjs/types/index.d.ts"), "utf8");
  const start = dts.indexOf("export type SHAPE_NAME =");
  expect(start).toBeGreaterThan(-1);
  const body = dts.slice(start, dts.indexOf("\n\n", start));
  return new Set([...body.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]));
}

describe("preset shapes", () => {
  test("25 distinct presets, every one a pptxgenjs SHAPE_NAME", () => {
    expect(SHAPE_PRESETS).toHaveLength(25);
    expect(new Set(SHAPE_PRESETS).size).toBe(25);
    const names = pptxShapeNames();
    expect(names.size).toBeGreaterThan(150);
    expect(SHAPE_PRESETS.filter((p) => !names.has(p))).toEqual([]);
    expect(isShapePreset("star5")).toBe(true);
    expect(isShapePreset("custGeom")).toBe(false);
  });

  test("every preset parses at every size, with finite numbers only", () => {
    for (const preset of SHAPE_PRESETS) {
      for (const [w, h] of SIZES) {
        const d = presetPath(preset, w, h);
        expect(d).not.toMatch(/NaN|Infinity|e[-+]/);
        const cmds = parsePath(d);
        if (cmds === null) throw new Error(`${preset} at ${w}x${h} does not parse: ${d}`);
        expect(cmds[0].c).toBe("M");
      }
    }
  });

  test("hostile sizes (negative, NaN) draw an empty box instead of breaking", () => {
    for (const preset of SHAPE_PRESETS) {
      expect(parsePath(presetPath(preset, -10, Number.NaN))).not.toBeNull();
    }
  });

  test("polygon presets stay inside their box", () => {
    const inside = ["rect", "triangle", "rtTriangle", "diamond", "parallelogram", "trapezoid", "pentagon", "hexagon", "octagon",
      "star4", "star5", "rightArrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "chevron", "homePlate", "plus"] as const;
    for (const preset of inside) {
      for (const [w, h] of [[100, 50], [30, 300]] as const) {
        const cmds = parsePath(presetPath(preset, w, h)) ?? [];
        for (const c of cmds) {
          if (c.c === "Z") continue;
          expect(c.x).toBeGreaterThanOrEqual(-1e-9);
          expect(c.x).toBeLessThanOrEqual(w + 1e-9);
          expect(c.y).toBeGreaterThanOrEqual(-1e-9);
          expect(c.y).toBeLessThanOrEqual(h + 1e-9);
        }
      }
    }
  });

  test("the callout tail points below the box, and the donut is two rings", () => {
    const tail = parsePath(presetPath("wedgeRectCallout", 100, 80)) ?? [];
    expect(Math.max(...tail.flatMap((c) => (c.c === "Z" ? [] : [c.y])))).toBeCloseTo(90, 6);
    expect((parsePath(presetPath("donut", 100, 100)) ?? []).filter((c) => c.c === "M")).toHaveLength(2);
  });

  test("text insets leave a non-negative text area inside the box", () => {
    for (const preset of SHAPE_PRESETS) {
      for (const [w, h] of SIZES) {
        const [l, t, r, b] = presetTextInset(preset, w, h);
        for (const n of [l, t, r, b]) {
          expect(Number.isFinite(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
        }
        expect(l + r).toBeLessThanOrEqual(w + 0.02);
        expect(t + b).toBeLessThanOrEqual(h + 0.02);
      }
    }
    expect(presetTextInset("rect", 100, 50)).toEqual([0, 0, 0, 0]);
    expect(presetTextInset("ellipse", 100, 100)).toEqual([14.65, 14.65, 14.65, 14.65]);
  });
});
