/**
 * Google-Docs-style placement of comment cards beside the page (docs-editor-ui spec §4.10 "CommentsMargin").
 * Pure, so it is unit-tested under Bun.
 *
 * - Items are sorted by their anchor `top` (ties keep input order).
 * - Forward pass: `y = max(top, previousY + previousHeight + gap)`.
 * - With an active item, it is pinned to its own `top`; items after it flow forward from there, and items before it
 *   are pushed upward so they end `gap` above the next card.
 */

export interface MarginItem {
  readonly id: string;
  /** Anchor offset from the top of the margin container, in px. */
  readonly top: number;
  /** Measured card height, in px (0 before the first measurement). */
  readonly height: number;
}

export const MARGIN_CARD_GAP = 8;

export function layoutMarginItems(
  items: readonly MarginItem[],
  activeId: string | null,
  gap: number = MARGIN_CARD_GAP,
): Map<string, number> {
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.top - b.item.top || a.index - b.index)
    .map(({ item }) => item);

  const ys: number[] = new Array(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const floor = i === 0 ? Number.NEGATIVE_INFINITY : ys[i - 1] + sorted[i - 1].height + gap;
    ys[i] = Math.max(sorted[i].top, floor);
  }

  const activeIndex = activeId === null ? -1 : sorted.findIndex((item) => item.id === activeId);
  if (activeIndex >= 0) {
    ys[activeIndex] = sorted[activeIndex].top;
    for (let i = activeIndex + 1; i < sorted.length; i++) {
      ys[i] = Math.max(sorted[i].top, ys[i - 1] + sorted[i - 1].height + gap);
    }
    for (let i = activeIndex - 1; i >= 0; i--) {
      ys[i] = Math.min(ys[i], ys[i + 1] - sorted[i].height - gap);
    }
  }

  const out = new Map<string, number>();
  sorted.forEach((item, i) => out.set(item.id, Math.round(ys[i])));
  return out;
}

/** Bottom edge of the placed items (for stacking unanchored cards below them). */
export function marginLayoutEnd(items: readonly MarginItem[], positions: ReadonlyMap<string, number>): number {
  let end = 0;
  for (const item of items) {
    const y = positions.get(item.id);
    if (y !== undefined) end = Math.max(end, y + item.height);
  }
  return end;
}

export function samePositions(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}
