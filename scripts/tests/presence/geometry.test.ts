import { describe, expect, test } from "bun:test";
import { PRESENCE_COLORS as DOCS_PRESENCE_COLORS, colorForMember as docsColorForMember } from "@/lib/docs/colors";
import { PRESENCE_COLORS, colorForMember } from "@/lib/presence/colors";
import { clamp01, clampToBox, fractionIn, isTransformActive, pinInside, pointIn } from "@/lib/presence/geometry";

const BOX = { left: 100, top: 50, width: 200, height: 100 };

describe("fractions", () => {
  test("are measured from the inline-start edge, so LTR and RTL point at the same part", () => {
    expect(fractionIn(BOX, 150, 75, false)).toEqual({ x: 0.25, y: 0.25 });
    expect(fractionIn(BOX, 250, 75, true)).toEqual({ x: 0.25, y: 0.25 });
    expect(pointIn(BOX, 0.25, 0.25, false)).toEqual({ x: 150, y: 75 });
    expect(pointIn(BOX, 0.25, 0.25, true)).toEqual({ x: 250, y: 75 });
  });

  test("round-trip, clamp outside points, and use the centre of an empty box", () => {
    for (const rtl of [false, true]) {
      const f = fractionIn(BOX, 180, 130, rtl);
      const p = pointIn(BOX, f.x, f.y, rtl);
      expect(p.x).toBeCloseTo(180);
      expect(p.y).toBeCloseTo(130);
    }
    expect(fractionIn(BOX, 0, 500, false)).toEqual({ x: 0, y: 1 });
    expect(fractionIn({ left: 10, top: 10, width: 0, height: 0 }, 10, 10, false)).toEqual({ x: 0.5, y: 0.5 });
    expect(clamp01(Number.NaN)).toBe(0.5);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  test("clampToBox keeps a cursor inside the page and says when its target is off screen", () => {
    expect(clampToBox({ x: 150, y: 75 }, BOX, 4)).toEqual({ x: 150, y: 75, clamped: false });
    expect(clampToBox({ x: 150, y: 900 }, BOX, 4)).toEqual({ x: 150, y: 146, clamped: true });
    expect(clampToBox({ x: -20, y: 10 }, BOX, 0)).toEqual({ x: 100, y: 50, clamped: true });
  });
});

describe("pinInside", () => {
  // A 224 px tall inner list near the top of a 1000 × 800 page region.
  const REGION = { left: 0, top: 0, width: 1000, height: 800 };
  const LIST = { left: 40, top: 100, width: 300, height: 224 };

  test("a target inside every box is drawn where it is, not dimmed", () => {
    expect(pinInside({ x: 120, y: 200 }, [LIST, REGION], 4)).toEqual({ x: 120, y: 200, outside: false });
    // Inside, but within the margin of an edge: moved in a little, still visible.
    expect(pinInside({ x: 40, y: 324 }, [LIST, REGION], 4)).toEqual({ x: 44, y: 320, outside: false });
  });

  test("a row scrolled out of the inner list pins to the list's edge and dims, though the region shows it", () => {
    // 12th row of the colleague's scrolled list: below the viewer's list bottom (324) but inside the region.
    expect(pinInside({ x: 120, y: 574 }, [REGION], 4)).toEqual({ x: 120, y: 574, outside: false });
    expect(pinInside({ x: 120, y: 574 }, [LIST, REGION], 4)).toEqual({ x: 120, y: 320, outside: true });
    // Scrolled sideways out of an overflow-x table.
    expect(pinInside({ x: 900, y: 150 }, [LIST, REGION], 4)).toEqual({ x: 336, y: 150, outside: true });
  });

  test("nested boxes pin into their intersection; a list scrolled out of the region still ends inside it", () => {
    const inner = { left: 60, top: 280, width: 200, height: 100 }; // overlaps LIST's bottom only
    expect(pinInside({ x: 100, y: 370 }, [inner, LIST, REGION], 0)).toEqual({ x: 100, y: 324, outside: true });
    const above = { left: 40, top: -400, width: 300, height: 224 };
    const pinned = pinInside({ x: 120, y: -300 }, [above, REGION], 4);
    expect(pinned).toEqual({ x: 120, y: 4, outside: true });
  });
});

describe("isTransformActive", () => {
  test("identity and cleared transforms leave cursors visible", () => {
    expect(isTransformActive("")).toBe(false);
    expect(isTransformActive("none")).toBe(false);
    expect(isTransformActive("translateX(0px) scale(1)")).toBe(false);
  });

  test("a DynamicUIElement push, or anything unreadable, hides them", () => {
    expect(isTransformActive("translateX(-120px) scale(0.94)")).toBe(true);
    expect(isTransformActive("translateX(0px) scale(0.9)")).toBe(true);
    expect(isTransformActive("translateX(10%)")).toBe(true);
    expect(isTransformActive("rotate(2deg)")).toBe(true);
  });
});

describe("presence colours", () => {
  test("are stable per member, gray without one, and shared with the Docs editor", () => {
    expect(colorForMember("member-1")).toBe(colorForMember("member-1"));
    expect(PRESENCE_COLORS).toContain(colorForMember("member-1"));
    expect(colorForMember(null)).toBe("#57534e");
    expect(colorForMember("")).toBe("#57534e");
    expect(DOCS_PRESENCE_COLORS).toBe(PRESENCE_COLORS);
    expect(docsColorForMember).toBe(colorForMember);
  });

  test("spread members over the palette", () => {
    const used = new Set(Array.from({ length: 64 }, (_, i) => colorForMember(`member-${i}`)));
    expect(used.size).toBeGreaterThanOrEqual(6);
  });
});
