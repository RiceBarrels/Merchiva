// Picking slides in the rail and the grid sorter (slides.md §7.3): a click shows one slide, Shift picks the range
// from the anchor, Mod adds or removes one; the arrow keys move the current slide (Shift extends the range). Pure:
// the rail turns a pick into a selectSlide / selectSlides action.

export type RailPickMode = "replace" | "range" | "toggle";

export interface RailPick {
  /** The picked slides in deck order (always holds `current`). */
  slideIds: string[];
  current: string;
  /** The slide the next Shift pick extends from. */
  anchor: string;
}

export interface RailPickState {
  order: readonly string[];
  picked: readonly string[];
  current: string | null;
  anchor: string | null;
}

function inOrder(order: readonly string[], ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return order.filter((id) => set.has(id));
}

/** The picks after choosing `id` with `mode`. */
export function pickSlides(state: RailPickState, id: string, mode: RailPickMode): RailPick {
  const { order, picked, current } = state;
  if (mode === "range") {
    const anchor = state.anchor !== null && order.includes(state.anchor) ? state.anchor : (current ?? id);
    const a = order.indexOf(anchor);
    const b = order.indexOf(id);
    if (a < 0 || b < 0) return { slideIds: [id], current: id, anchor: id };
    return { slideIds: order.slice(Math.min(a, b), Math.max(a, b) + 1), current: id, anchor };
  }
  if (mode === "toggle") {
    const base = picked.length > 0 ? picked : current ? [current] : [];
    if (base.includes(id) && base.length > 1) {
      const rest = inOrder(order, base.filter((x) => x !== id));
      const next = current !== null && current !== id && rest.includes(current) ? current : rest[rest.length - 1];
      return { slideIds: rest, current: next, anchor: next };
    }
    return { slideIds: inOrder(order, [...base, id]), current: id, anchor: id };
  }
  return { slideIds: [id], current: id, anchor: id };
}

/** The slide `step` places away from the current one (clamped to the ends); null for an empty deck. */
export function steppedSlide(order: readonly string[], current: string | null, step: number): string | null {
  if (order.length === 0) return null;
  const at = current === null ? -1 : order.indexOf(current);
  if (at < 0) return order[step < 0 ? order.length - 1 : 0];
  return order[Math.max(0, Math.min(order.length - 1, at + step))];
}

/** Whether a pick is the plain "show this one slide" case (selectSlide rather than selectSlides). */
export function isSinglePick(pick: RailPick): boolean {
  return pick.slideIds.length === 1 && pick.slideIds[0] === pick.current;
}
