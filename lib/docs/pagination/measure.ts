/**
 * Pagination arithmetic. Pure and DOM-free, so it is unit-tested under Bun; the plugin
 * in lib/docs/extensions/pagination.ts supplies the measurements and turns the result into decorations.
 *
 * Two coordinate spaces:
 * - *flow* — where a block sits in the editor's content if no page gaps existed (what the plugin measures after
 *   subtracting the gaps it inserted last pass, so the input is stable across passes).
 * - *paged* — where it ends up on screen. The difference is the running sum of the gaps, which is exactly what
 *   `paginate` computes.
 *
 * A page is `max(paper height, margins + what it holds)`: a block taller than the text column (a full-bleed image,
 * a long table) makes its page grow instead of spilling over the next sheet.
 */

export interface PageBlockInput {
  /** ProseMirror position immediately before the block. */
  readonly pos: number;
  /** ProseMirror position immediately after the block. */
  readonly endPos: number;
  /** Top edge in flow coordinates, px. */
  readonly top: number;
  /** Height in flow coordinates, px. */
  readonly height: number;
  /** An explicit page-break node: whatever follows starts a new page. */
  readonly isPageBreak: boolean;
  /** A plain text block, which may be cut between two of its lines. */
  readonly splittable: boolean;
}

/** A line boundary inside block `blockIndex` at or above `limit`, found by the plugin from DOM line boxes. */
export interface PageSplit {
  readonly pos: number;
  /** Top edge of the first line that moves to the next page, flow coordinates. */
  readonly top: number;
}

export interface PaginateOptions {
  /** Full paper height, px (margins included). */
  readonly pageHeight: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Visible space between two sheets, px. */
  readonly gap: number;
  readonly splitAt?: (blockIndex: number, limit: number) => PageSplit | null;
}

export interface PageGap {
  /** ProseMirror position the spacer widget is anchored at. */
  readonly pos: number;
  readonly height: number;
  /** True when the anchor is inside a text block (a mid-paragraph line break). */
  readonly inline: boolean;
}

export interface PageRect {
  /** Top edge in paged coordinates, px. */
  readonly top: number;
  readonly height: number;
}

export interface PaginationLayout {
  readonly gaps: readonly PageGap[];
  readonly pages: readonly PageRect[];
  /** Height of the whole stack, px. */
  readonly totalHeight: number;
}

/** Sub-pixel slack: browsers report fractional heights, and a 0.4px overflow is not a new page. */
const EPS = 0.75;

export function contentHeightOf(o: PaginateOptions): number {
  return Math.max(1, o.pageHeight - o.marginTop - o.marginBottom);
}

export function paginate(blocks: readonly PageBlockInput[], o: PaginateOptions): PaginationLayout {
  const contentHeight = contentHeightOf(o);
  const cuts: { pos: number; top: number; inline: boolean }[] = [];
  let pageTop = 0;

  // Every iteration either advances `i` or raises `pageTop`, but the guard keeps a pathological measurement
  // (zero-height blocks, a split that reports the same line twice) from spinning.
  const maxSteps = blocks.length * 4 + 64;
  let steps = 0;
  let i = 0;

  const cutBefore = (pos: number, top: number, inline: boolean): boolean => {
    if (top <= pageTop + EPS) return false;
    cuts.push({ pos, top, inline });
    pageTop = top;
    return true;
  };

  while (i < blocks.length && steps++ < maxSteps) {
    const block = blocks[i];
    const limit = pageTop + contentHeight;
    const bottom = block.top + block.height;

    if (bottom <= limit + EPS) {
      // Fits. An explicit break ends the page here.
      if (block.isPageBreak) {
        const next = blocks[i + 1];
        cutBefore(next ? next.pos : block.endPos, next ? next.top : bottom, false);
      }
      i++;
      continue;
    }

    if (block.top > pageTop + EPS) {
      // Starts on this page but runs past the bottom: cut inside it if it is text, else move it down whole.
      const split = block.splittable && o.splitAt ? o.splitAt(i, limit) : null;
      if (split && split.top > block.top + EPS && cutBefore(split.pos, split.top, true)) continue;
      if (cutBefore(block.pos, block.top, false)) continue;
    } else {
      // Already at the top of the page and still too tall.
      const split = block.splittable && o.splitAt ? o.splitAt(i, limit) : null;
      if (split && cutBefore(split.pos, split.top, true)) continue;
    }

    // Unsplittable and taller than the text column: this page grows around it, the next block starts a new one.
    i++;
  }

  const last = blocks[blocks.length - 1];
  const contentBottom = last ? Math.max(0, last.top + last.height) : 0;
  const boundaries = [0, ...cuts.map((cut) => cut.top), Math.max(contentBottom, cuts[cuts.length - 1]?.top ?? 0)];

  const pages: PageRect[] = [];
  const gaps: PageGap[] = [];
  let offset = 0;
  for (let page = 0; page < boundaries.length - 1; page++) {
    const used = Math.max(0, boundaries[page + 1] - boundaries[page]);
    const height = Math.max(o.pageHeight, o.marginTop + used + o.marginBottom);
    pages.push({ top: offset, height });
    offset += height + o.gap;
    const cut = cuts[page];
    if (cut) gaps.push({ pos: cut.pos, height: height + o.gap - used, inline: cut.inline });
  }
  if (pages.length === 0) pages.push({ top: 0, height: o.pageHeight });

  const tail = pages[pages.length - 1];
  return { gaps, pages, totalHeight: tail.top + tail.height };
}
