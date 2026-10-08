// Where a slide dragged in the phone thumbnail strip lands (slides.md §11). Pure: the strip measures its
// thumbnails, and these turn a pointer position into a drop slot and a moveSlides() call.

/**
 * The insertion slot (0..n) for a pointer at `p` along the strip's axis. `centers[i]` is the middle of thumbnail i
 * (deck order) along that axis; `reversed` when deck order runs against the axis (a right-to-left horizontal strip).
 */
export function dropIndex(centers: readonly number[], p: number, reversed: boolean): number {
  let slot = 0;
  for (const center of centers) if (reversed ? center > p : center < p) slot += 1;
  return slot;
}

/**
 * The `before` argument of moveSlides() for dropping `id` into `slot` of `order` (null = the end); undefined when
 * the drop would not move it.
 */
export function moveTarget(order: readonly string[], id: string, slot: number): string | null | undefined {
  const from = order.indexOf(id);
  if (from < 0) return undefined;
  const at = Math.min(order.length, Math.max(0, Math.floor(slot)));
  if (at === from || at === from + 1) return undefined;
  return at >= order.length ? null : order[at];
}

/** The 1-based position the slide ends up at after a drop into `slot` (for the "moved" announcement). */
export function landedPosition(order: readonly string[], id: string, slot: number): number {
  const from = order.indexOf(id);
  const at = Math.min(order.length, Math.max(0, Math.floor(slot)));
  return at > from ? at : at + 1;
}
