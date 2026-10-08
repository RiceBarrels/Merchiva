// SVG path data: every command form parses to absolute M/L/C/Q/Z, arcs become cubics, scale/print round-trips,
// and malformed or over-long data is rejected.
import { describe, expect, test } from "bun:test";

import { SLIDES_MAX_PATH_CHARS } from "@/lib/slides/constants";
import { parsePath, scalePath, toSvgD, type PathCommand } from "@/lib/slides/geometry/svg-path";

function endPoints(cmds: readonly PathCommand[]): Array<[number, number]> {
  return cmds.flatMap((c) => (c.c === "Z" ? [] : [[c.x, c.y] as [number, number]]));
}

describe("parsePath", () => {
  test("absolute commands, H/V as lines, Z", () => {
    expect(parsePath("M10 20 L30 40 H50 V60 Z")).toEqual([
      { c: "M", x: 10, y: 20 }, { c: "L", x: 30, y: 40 }, { c: "L", x: 50, y: 40 }, { c: "L", x: 50, y: 60 }, { c: "Z" },
    ]);
  });

  test("relative commands, implicit line-tos after M, and Z returning to the subpath start", () => {
    expect(parsePath("m10 20 l5 5 h5 v-5 z l1 1")).toEqual([
      { c: "M", x: 10, y: 20 }, { c: "L", x: 15, y: 25 }, { c: "L", x: 20, y: 25 }, { c: "L", x: 20, y: 20 }, { c: "Z" }, { c: "L", x: 11, y: 21 },
    ]);
    expect(parsePath("M0,0 10,10 20-5")).toEqual([{ c: "M", x: 0, y: 0 }, { c: "L", x: 10, y: 10 }, { c: "L", x: 20, y: -5 }]);
    expect(parsePath("M.5.5l1e1-2E0")).toEqual([{ c: "M", x: 0.5, y: 0.5 }, { c: "L", x: 10.5, y: -1.5 }]);
  });

  test("S and T reflect the previous control point", () => {
    expect(parsePath("M0 0 C10 0 20 10 30 10 S50 20 60 20")).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "C", x1: 10, y1: 0, x2: 20, y2: 10, x: 30, y: 10 },
      { c: "C", x1: 40, y1: 10, x2: 50, y2: 20, x: 60, y: 20 },
    ]);
    expect(parsePath("M0 0 Q10 10 20 0 T40 0")).toEqual([
      { c: "M", x: 0, y: 0 }, { c: "Q", x1: 10, y1: 10, x: 20, y: 0 }, { c: "Q", x1: 30, y1: -10, x: 40, y: 0 },
    ]);
    // S without a preceding C uses the current point as the first control point.
    expect(parsePath("M0 0 L5 5 s5 5 10 0")?.[2]).toEqual({ c: "C", x1: 5, y1: 5, x2: 10, y2: 10, x: 15, y: 5 });
  });

  test("arcs become cubic Béziers that pass through the arc", () => {
    const cmds = parsePath("M0 50 A50 50 0 0 1 100 50");
    expect(cmds).not.toBeNull();
    const curves = (cmds ?? []).filter((c) => c.c === "C");
    expect(curves).toHaveLength(2);
    const [top, end] = endPoints(curves);
    expect(top[0]).toBeCloseTo(50, 6);
    expect(top[1]).toBeCloseTo(0, 6);
    expect(end).toEqual([100, 50]);
    // A relative arc ends at its relative end point; a zero radius is a straight line.
    expect(parsePath("M0 0 a10 10 0 1 0 20 0")?.at(-1)).toMatchObject({ c: "C", x: 20, y: 0 });
    expect(parsePath("M0 0 A0 10 0 0 1 20 0")).toEqual([{ c: "M", x: 0, y: 0 }, { c: "L", x: 20, y: 0 }]);
  });

  test("rejects malformed, non-finite and over-long data", () => {
    for (const bad of [
      "", "L10 10", "10 10", "M0 0 L10", "M0 0 X1 1", "M0 0 L1e400 0", "M0 0 L1 1 Z 5 5", "M0 0; L1 1", "M0 0 L1 1 url(x)",
      `M0 0 ${"L1 1 ".repeat(SLIDES_MAX_PATH_CHARS / 5)}`,
    ]) {
      expect(parsePath(bad)).toBeNull();
    }
  });

  test("nothing is skipped: stray tokens, misplaced commas and non-SVG whitespace are rejected", () => {
    for (const bad of [
      "M0 0 L10 10 e L20 0 Z", "M0 0 . L1 1", "M0 0 +- L1 1", "M0 0 L1e 1", "M,0 0", "M0,,0 L1 1", "M0 0 L1 1 Z,",
      "M0 0 L1 1",
    ]) {
      expect(parsePath(bad)).toBeNull();
    }
    expect(parsePath(" M 1,2 L 3 , 4\nz ")).toEqual([{ c: "M", x: 1, y: 2 }, { c: "L", x: 3, y: 4 }, { c: "Z" }]);
  });
});

describe("scalePath / toSvgD", () => {
  test("scales every coordinate and prints absolute commands", () => {
    const cmds = parsePath("M0 0 L10 20 Q5 5 10 10 C1 2 3 4 5 6 Z");
    expect(toSvgD(scalePath(cmds ?? [], 2, 0.5))).toBe("M0 0 L20 10 Q10 2.5 20 5 C2 1 6 2 10 3 Z");
  });

  test("print → parse round-trips, with at most 3 decimals and no -0", () => {
    const cmds: PathCommand[] = [
      { c: "M", x: 1.23456, y: -0.0001 }, { c: "C", x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }, { c: "Q", x1: -1.5, y1: 2, x: 3, y: 4 }, { c: "Z" },
    ];
    const d = toSvgD(cmds);
    expect(d).toBe("M1.235 0 C1 2 3 4 5 6 Q-1.5 2 3 4 Z");
    expect(toSvgD(parsePath(d) ?? [])).toBe(d);
  });
});
