import { useEffect, useLayoutEffect, useRef } from "react";
import { SCROLL } from "./geometry";

/** The only scroll-root marker (plan D14); set by TabPageOutlet and PageTransition. */
const SCROLL_ROOT_SELECTOR = "[data-tab-scroll-root]";
/** Opt-out for canvases, carousels and reverse chat lists. */
const SCROLL_IGNORE_SELECTOR = "[data-shell-scroll-ignore]";

export interface ScrollMinimizeOptions {
  /** `!docked && autoMinimize && openDialogs === 0 && !hidden`. */
  enabled: boolean;
  /** `performance.now()` timestamp before which scroll movement is ignored. */
  suppressUntil: { current: number };
  onDown(): void;
  onUp(): void;
  onEdge(): void;
  /** A nested scroller moved while the page's own scroll root can't scroll (spec §9 detection). */
  onInnerScrollerDetected(): void;
}

/**
 * Scroll-to-minimize (mobile-safari spec §8). One passive capture-phase `scroll` listener on
 * `#mobile-content` sees every descendant scroller; work is coalesced into one animation frame
 * and per-element positions live in a WeakMap, so nothing re-renders per scroll event. Scroll
 * position restore itself belongs to core (plan A2 row 15).
 */
export function useScrollMinimize(root: HTMLElement | null, options: ScrollMinimizeOptions): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const enabled = options.enabled;

  useEffect(() => {
    if (!root || !enabled) return;
    const lastTop = new WeakMap<Element, number>();
    let accumulated = 0;
    let lastDirection = 0;
    let frame = 0;
    let pending: HTMLElement | null = null;

    const pageScrollRoot = (): HTMLElement | null => {
      const roots = root.querySelectorAll<HTMLElement>(SCROLL_ROOT_SELECTOR);
      return roots.length > 0 ? roots[roots.length - 1] : null;
    };

    const process = () => {
      frame = 0;
      const el = pending;
      pending = null;
      if (!el || !el.isConnected) return;
      const range = el.scrollHeight - el.clientHeight;
      if (range < SCROLL.minRange) return;
      const top = Math.min(Math.max(el.scrollTop, 0), range); // neutralizes iOS rubber-banding
      const previous = lastTop.get(el);
      lastTop.set(el, top);
      if (previous === undefined) return;
      const dy = top - previous;
      if (dy === 0) return; // horizontal scroll
      const callbacks = latest.current;
      if (performance.now() < callbacks.suppressUntil.current) {
        accumulated = 0;
        return;
      }

      const isPageRoot = el.hasAttribute("data-tab-scroll-root");
      if (!isPageRoot) {
        const primary = pageScrollRoot();
        if (primary && primary.scrollHeight - primary.clientHeight <= 1) callbacks.onInnerScrollerDetected();
      }

      const direction = dy > 0 ? 1 : -1;
      if (direction !== lastDirection) {
        accumulated = 0;
        lastDirection = direction;
      }
      accumulated += dy;

      if (top <= SCROLL.edgeTop) {
        callbacks.onEdge();
        accumulated = 0;
      } else if (isPageRoot && top >= range - SCROLL.edgeBottom) {
        // Safari expands at the page end; the --shell-scroll-pad spacer keeps the last row visible.
        callbacks.onEdge();
        accumulated = 0;
      } else if (accumulated > SCROLL.downAccumulate && top > SCROLL.downMinTop) {
        callbacks.onDown();
        accumulated = 0;
      } else if (accumulated < -SCROLL.upAccumulate) {
        callbacks.onUp();
        accumulated = 0;
      }
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(SCROLL_IGNORE_SELECTOR)) return;
      pending = target;
      if (!frame) frame = window.requestAnimationFrame(process);
    };

    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root, enabled]);
}
