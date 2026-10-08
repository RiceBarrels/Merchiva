// Presenter navigation (slides.md §9): a slideshow runs over the slides that are shown, in deck order; skipped
// ("hidden") slides are left out. Pure, so the show logic is tested without a DOM.
import type { DeckState } from "@/lib/slides/model/deck-store";

export interface PresenterNav {
  /** The shown slides, in deck order (hidden slides removed). */
  order: readonly string[];
  index: number;
}

/** The slides a show runs over: every slide that is not skipped, in deck order. */
export function presenterOrder(state: Pick<DeckState, "slideIds" | "slides">): string[] {
  return state.slideIds.filter((id) => {
    const slide = state.slides.get(id);
    return slide !== undefined && !slide.hidden;
  });
}

/**
 * Where a show that starts at `slideId` begins: that slide when it is shown; for a skipped slide the nearest shown
 * slide after it in `all` (the whole deck order), else the nearest one before it; 0 when nothing matches.
 */
export function startIndex(order: readonly string[], slideId: string | null, all: readonly string[] = order): number {
  if (order.length === 0 || slideId === null) return 0;
  const direct = order.indexOf(slideId);
  if (direct >= 0) return direct;
  const at = all.indexOf(slideId);
  if (at < 0) return 0;
  const shown = new Set(order);
  for (let i = at + 1; i < all.length; i++) if (shown.has(all[i])) return order.indexOf(all[i]);
  for (let i = at - 1; i >= 0; i--) if (shown.has(all[i])) return order.indexOf(all[i]);
  return 0;
}

/** One slide on or back. Past the last slide is "end"; back from the first stays on it (the same object). */
export function step(nav: PresenterNav, delta: 1 | -1): PresenterNav | "end" {
  if (delta > 0) return nav.index + 1 >= nav.order.length ? "end" : { order: nav.order, index: nav.index + 1 };
  return nav.index <= 0 ? nav : { order: nav.order, index: nav.index - 1 };
}

/** The shown slide `n` (1-based, as the presenter types it), clamped to the show. */
export function jumpTo(nav: PresenterNav, n: number): PresenterNav {
  if (nav.order.length === 0 || !Number.isFinite(n)) return nav;
  const index = Math.min(nav.order.length - 1, Math.max(0, Math.floor(n) - 1));
  return index === nav.index ? nav : { order: nav.order, index };
}

/** The slide the show is on; null for an empty show. */
export function navSlideId(nav: PresenterNav): string | null {
  return nav.order[nav.index] ?? null;
}

/**
 * The same show after the deck changed under it (a collaborator edits while someone presents): it stays on the
 * slide it was on; a slide that is now skipped gives way to the nearest shown one, a deleted slide to the one now
 * at its position.
 */
export function reconcileNav(nav: PresenterNav, order: readonly string[], all: readonly string[]): PresenterNav {
  const current = navSlideId(nav);
  let index: number;
  if (current !== null && order.includes(current)) index = order.indexOf(current);
  else if (current !== null && all.includes(current)) index = startIndex(order, current, all);
  else index = Math.min(nav.index, Math.max(0, order.length - 1));
  if (index === nav.index && order.length === nav.order.length && order.every((id, i) => id === nav.order[i])) return nav;
  return { order, index };
}
