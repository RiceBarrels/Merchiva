// Slide ▸ Move slide up / down (slides.md §7.2): the same move as Mod+↑/↓ in the rail. The picked slides move as a
// block one step past their outer neighbour. Pure; the menu passes the result to el.moveSlides(ids, before).

export interface SlideMove {
  ids: string[];
  /** The slide the block goes before; null = to the end. */
  before: string | null;
}

/** The slides a slide command acts on: the rail's picks, else the current slide. */
export function pickedSlides(slideSelection: readonly string[], currentSlideId: string | null): string[] {
  return slideSelection.length > 0 ? [...slideSelection] : currentSlideId ? [currentSlideId] : [];
}

/** The move one step up (-1) or down (1), or null when the block is already at that end (or nothing is picked). */
export function slideMove(order: readonly string[], picked: readonly string[], dir: 1 | -1): SlideMove | null {
  const set = new Set(picked);
  const positions = order.flatMap((id, i) => (set.has(id) ? [i] : []));
  if (positions.length === 0) return null;
  const ids = positions.map((i) => order[i]);
  if (dir < 0) {
    const first = positions[0];
    return first > 0 ? { ids, before: order[first - 1] } : null;
  }
  const last = positions[positions.length - 1];
  return last < order.length - 1 ? { ids, before: order[last + 2] ?? null } : null;
}
