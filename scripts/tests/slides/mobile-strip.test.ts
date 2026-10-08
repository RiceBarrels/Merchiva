// The phone strip's drag to reorder (slides.md §11): where a dragged slide lands, left-to-right and right-to-left,
// and the moveSlides() call it makes.
import { describe, expect, test } from "bun:test";

import { dropIndex, landedPosition, moveTarget } from "@/components/slides/mobile/strip-reorder";

describe("dropIndex", () => {
  const centers = [50, 150, 250, 350];

  test("counts the thumbnails before the pointer", () => {
    expect(dropIndex(centers, 10, false)).toBe(0);
    expect(dropIndex(centers, 160, false)).toBe(2);
    expect(dropIndex(centers, 999, false)).toBe(4);
  });

  test("a right-to-left strip counts from the right", () => {
    const rtl = [350, 250, 150, 50];
    expect(dropIndex(rtl, 999, true)).toBe(0);
    expect(dropIndex(rtl, 200, true)).toBe(2);
    expect(dropIndex(rtl, 10, true)).toBe(4);
  });
});

describe("moveTarget / landedPosition", () => {
  const order = ["a", "b", "c", "d"];

  test("drops that do not move the slide are nothing", () => {
    expect(moveTarget(order, "b", 1)).toBeUndefined();
    expect(moveTarget(order, "b", 2)).toBeUndefined();
    expect(moveTarget(order, "zz", 0)).toBeUndefined();
  });

  test("before the slide at the slot, or the end", () => {
    expect(moveTarget(order, "a", 3)).toBe("d");
    expect(landedPosition(order, "a", 3)).toBe(3);
    expect(moveTarget(order, "d", 1)).toBe("b");
    expect(landedPosition(order, "d", 1)).toBe(2);
    expect(moveTarget(order, "a", 4)).toBeNull();
    expect(landedPosition(order, "a", 4)).toBe(4);
    expect(moveTarget(order, "c", 99)).toBeNull();
  });
});
