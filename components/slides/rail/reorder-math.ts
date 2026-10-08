// Where a dragged block of slides lands (slides.md §7.3): the drop index under the pointer, for the vertical rail,
// the phone's horizontal strip and the grid sorter, the move that index means, and the order a move leaves (for the
// rail's "moved to position n" announcement). Pure: use-slide-reorder.ts feeds it the item rectangles it measured
// when the drag started (in the scroller's content coordinates).

export type ReorderAxis = "vertical" | "horizontal" | "grid";

/** One item's box; any coordinate space, as long as the pointer is in the same one. */
export interface ReorderItemRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const midX = (r: ReorderItemRect) => (r.left + r.right) / 2;
const midY = (r: ReorderItemRect) => (r.top + r.bottom) / 2;

/** True when a row runs right to left (an RTL layout): its first item is to the right of its last. */
function runsRtl(row: readonly ReorderItemRect[]): boolean {
  return row.length > 1 && midX(row[0]) > midX(row[row.length - 1]);
}

/** Index in `row` of the first item the point is before along the row's reading direction; row.length if none. */
function indexInRow(row: readonly ReorderItemRect[], x: number): number {
  const rtl = runsRtl(row);
  const i = row.findIndex((r) => (rtl ? x > midX(r) : x < midX(r)));
  return i < 0 ? row.length : i;
}

/** Items (in order) split into visual rows: an item starts a new row when it sits below the row's first item. */
function rowsOf(items: readonly ReorderItemRect[]): ReorderItemRect[][] {
  const rows: ReorderItemRect[][] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && midY(item) < row[0].bottom) row.push(item);
    else rows.push([item]);
  }
  return rows;
}

/**
 * The insertion index (0..items.length) for a pointer at (x, y): the slides would go before `items[index]`, or at
 * the end for `items.length`. Items are in deck order.
 */
export function dropIndexAt(items: readonly ReorderItemRect[], x: number, y: number, axis: ReorderAxis): number {
  if (items.length === 0) return 0;
  if (axis === "vertical") {
    const i = items.findIndex((r) => y < midY(r));
    return i < 0 ? items.length : i;
  }
  if (axis === "horizontal") return indexInRow(items, x);
  const rows = rowsOf(items);
  let start = 0;
  for (const [n, row] of rows.entries()) {
    const last = n === rows.length - 1;
    // The pointer belongs to this row down to the middle of the gap under it (or anywhere below the last row).
    const next = rows[n + 1];
    const limit = next ? (row[0].bottom + next[0].top) / 2 : Infinity;
    if (y < limit || last) return start + indexInRow(row, x);
    start += row.length;
  }
  return items.length;
}

/**
 * The move that dropping `moving` at `index` of `order` means: the slide the block goes before (null = the end), or
 * null when the order would not change (a drop on the block itself or right next to it).
 */
export function dropTarget(order: readonly string[], moving: readonly string[], index: number): { before: string | null } | null {
  const set = new Set(moving);
  const block = order.filter((id) => set.has(id));
  if (block.length === 0) return null;
  const rest = order.filter((id) => !set.has(id));
  const at = Math.max(0, Math.min(order.length, Math.round(index)));
  const restBefore = order.slice(0, at).filter((id) => !set.has(id)).length;
  const result = [...rest.slice(0, restBefore), ...block, ...rest.slice(restBefore)];
  if (result.every((id, i) => id === order[i])) return null;
  return { before: rest[restBefore] ?? null };
}

/**
 * The order after moving `ids` before `before` (null = to the end), as the moveSlides op does it: the moved slides
 * are gathered into one block in deck order. The order is unchanged when nothing moves or `before` is one of them.
 */
export function orderAfterMove(order: readonly string[], ids: readonly string[], before: string | null): string[] {
  const set = new Set(ids);
  const block = order.filter((id) => set.has(id));
  if (block.length === 0 || (before !== null && set.has(before))) return [...order];
  const rest = order.filter((id) => !set.has(id));
  const found = before === null ? -1 : rest.indexOf(before);
  const at = found >= 0 ? found : rest.length;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** The slides a drag starting on `pressed` moves: the picked slides when it is one of them, else just it. */
export function draggedSlides(order: readonly string[], picked: readonly string[], pressed: string): string[] {
  if (!picked.includes(pressed)) return [pressed];
  const set = new Set(picked);
  return order.filter((id) => set.has(id));
}

/** Where the pointer is, as a fraction of the auto-scroll band it is in: -1..0 near the start, 0..1 near the end. */
export function autoScrollDirection(pos: number, start: number, end: number, band: number): number {
  if (end - start <= band * 2) return 0;
  if (pos < start + band) return -Math.min(1, (start + band - pos) / band);
  if (pos > end - band) return Math.min(1, (pos - (end - band)) / band);
  return 0;
}
