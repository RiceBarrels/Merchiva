// Pagination arithmetic: blocks in flow coordinates → page gaps and page rectangles.

import { describe, expect, test } from "bun:test";

import { paginate, type PageBlockInput, type PaginateOptions } from "@/lib/docs/pagination/measure";

// Letter at 96dpi with 1in margins: 1056px tall, 864px of text column.
const LETTER: PaginateOptions = { pageHeight: 1056, marginTop: 96, marginBottom: 96, gap: 24 };
const CONTENT = 864;

/** Blocks of `height` stacked from 0 with no spacing. */
function stack(heights: readonly number[], flags: Partial<PageBlockInput>[] = []): PageBlockInput[] {
  const out: PageBlockInput[] = [];
  let top = 0;
  let pos = 0;
  heights.forEach((height, index) => {
    out.push({ pos, endPos: pos + 2, top, height, isPageBreak: false, splittable: true, ...flags[index] });
    top += height;
    pos += 2;
  });
  return out;
}

describe("paginate", () => {
  test("content shorter than one page stays on one page", () => {
    const layout = paginate(stack([100, 200, 120]), LETTER);
    expect(layout.gaps).toEqual([]);
    expect(layout.pages).toEqual([{ top: 0, height: 1056 }]);
    expect(layout.totalHeight).toBe(1056);
  });

  test("an empty document is still one page", () => {
    const layout = paginate([], LETTER);
    expect(layout.pages).toHaveLength(1);
    expect(layout.totalHeight).toBe(1056);
  });

  test("a block that would cross the bottom moves to the next page", () => {
    // 800 fits; the next 200 would end at 1000 > 864.
    const layout = paginate(stack([800, 200]), { ...LETTER, splitAt: undefined });
    expect(layout.gaps).toHaveLength(1);
    expect(layout.gaps[0].pos).toBe(2);
    expect(layout.gaps[0].inline).toBe(false);
    // Fills the 64px left on page 1, then bottom margin + gap + top margin.
    expect(layout.gaps[0].height).toBe(CONTENT - 800 + 96 + 24 + 96);
    expect(layout.pages).toEqual([
      { top: 0, height: 1056 },
      { top: 1080, height: 1056 },
    ]);
  });

  test("gaps put page N's content exactly at page N's text top", () => {
    const blocks = stack([300, 300, 300, 300, 300]);
    const layout = paginate(blocks, { ...LETTER, splitAt: undefined });
    // Paged offset of a block = marginTop + flow top + gaps before it.
    let gapIndex = 0;
    let carried = 0;
    for (const block of blocks) {
      while (gapIndex < layout.gaps.length && layout.gaps[gapIndex].pos <= block.pos) {
        carried += layout.gaps[gapIndex].height;
        gapIndex++;
      }
      const paged = LETTER.marginTop + block.top + carried;
      const page = layout.pages.findIndex((rect) => paged >= rect.top && paged < rect.top + rect.height);
      expect(page).toBeGreaterThanOrEqual(0);
      // Never inside a margin.
      expect(paged - layout.pages[page].top).toBeGreaterThanOrEqual(LETTER.marginTop);
      expect(paged + block.height - layout.pages[page].top).toBeLessThanOrEqual(layout.pages[page].height - LETTER.marginBottom + 0.75);
    }
  });

  test("a text block is cut between lines when a splitter is supplied", () => {
    const blocks = stack([400, 800]);
    const layout = paginate(blocks, {
      ...LETTER,
      // Pretend the line boundary nearest the limit is 20px above it.
      splitAt: (index, limit) => (index === 1 ? { pos: blocks[index].pos + 1, top: limit - 20 } : null),
    });
    expect(layout.gaps[0].inline).toBe(true);
    expect(layout.gaps[0].pos).toBe(3);
    expect(layout.gaps[0].height).toBe(20 + 96 + 24 + 96);
  });

  test("an explicit page break ends the page even when there is room", () => {
    const blocks = stack([100, 0, 100], [{}, { isPageBreak: true, splittable: false }, {}]);
    const layout = paginate(blocks, LETTER);
    expect(layout.gaps).toHaveLength(1);
    expect(layout.gaps[0].pos).toBe(4);
    expect(layout.gaps[0].height).toBe(CONTENT - 100 + 96 + 24 + 96);
  });

  test("a block taller than the text column grows its own page instead of spilling", () => {
    const blocks = stack([2000, 100], [{ splittable: false }, { splittable: false }]);
    const layout = paginate(blocks, LETTER);
    expect(layout.pages[0]).toEqual({ top: 0, height: 96 + 2000 + 96 });
    expect(layout.pages[1].top).toBe(96 + 2000 + 96 + 24);
    expect(layout.pages[1].height).toBe(1056);
    expect(layout.gaps[0].height).toBe(96 + 96 + 24);
  });

  test("a giant unsplittable block at the top of page 2 keeps page 1 intact", () => {
    const blocks = stack([500, 1800], [{ splittable: false }, { splittable: false }]);
    const layout = paginate(blocks, LETTER);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0].height).toBe(1056);
    expect(layout.pages[1].height).toBe(96 + 1800 + 96);
  });

  test("zero-height blocks cannot spin the loop", () => {
    const layout = paginate(stack([0, 0, 0, 0, 0]), LETTER);
    expect(layout.pages).toHaveLength(1);
  });

  test("a splitter that reports no progress falls back to moving the block", () => {
    const blocks = stack([400, 800]);
    const layout = paginate(blocks, { ...LETTER, splitAt: () => ({ pos: 3, top: 0 }) });
    expect(layout.gaps).toHaveLength(1);
    expect(layout.gaps[0].inline).toBe(false);
    expect(layout.gaps[0].pos).toBe(2);
  });
});
