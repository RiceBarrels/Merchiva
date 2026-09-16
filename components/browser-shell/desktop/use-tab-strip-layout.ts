"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { CHROME, type ChromeGeometry } from "./chrome-geometry";

/*
 * Chrome-style tab widths (desktop spec §3.2): tabs share the free width up to the standard
 * width, shrink to the minimum, then the tablist scrolls. Closing a tab with the pointer
 * freezes the width so the next close glyph lands under the cursor; the freeze ends when
 * the pointer leaves the strip, the window resizes or blurs, or a tab is added.
 */

export interface TabStripLayout {
  unpinnedWidth: number;
  overflow: boolean;
}

export function computeTabStripLayout(
  available: number,
  pinnedCount: number,
  unpinnedCount: number,
  frozenWidth: number | null,
  geometry: ChromeGeometry = CHROME,
): TabStripLayout {
  const forUnpinned = Math.max(0, available - pinnedCount * geometry.TAB_PINNED_W);
  if (unpinnedCount === 0) {
    return { unpinnedWidth: geometry.TAB_STANDARD_W, overflow: pinnedCount * geometry.TAB_PINNED_W > available };
  }
  if (frozenWidth !== null) {
    return { unpinnedWidth: frozenWidth, overflow: frozenWidth * unpinnedCount > forUnpinned };
  }
  const ideal = Math.floor(forUnpinned / unpinnedCount);
  return {
    unpinnedWidth: Math.min(geometry.TAB_STANDARD_W, Math.max(geometry.TAB_MIN_W, ideal)),
    overflow: ideal < geometry.TAB_MIN_W,
  };
}

export type CloseMode = "always" | "hover" | "never";

/** What a tab of `width` shows. Coarse pointers always show the close glyph when it fits (lead decision Q4). */
export function tabContentMode(
  width: number,
  active: boolean,
  coarse: boolean = false,
): { icon: boolean; title: boolean; close: CloseMode } {
  if (coarse) {
    if (width >= 96) return { icon: true, title: true, close: "always" };
    return active ? { icon: false, title: false, close: "always" } : { icon: true, title: false, close: "never" };
  }
  if (width >= 120) return { icon: true, title: true, close: "always" };
  if (width >= 72) return { icon: true, title: true, close: active ? "always" : "hover" };
  return active ? { icon: false, title: false, close: "always" } : { icon: true, title: false, close: "never" };
}

function initialStripWidth(): number {
  return typeof window === "undefined" ? 1280 : window.innerWidth;
}

interface FrozenWidth {
  readonly width: number;
  /** Tab count when the freeze started; any tab added beyond it releases the freeze. */
  readonly tabCount: number;
}

export function useTabStripLayout(
  stripRef: RefObject<HTMLElement | null>,
  opts: {
    pinnedCount: number;
    unpinnedCount: number;
    leadInset: number;
    trailingWidth: number;
    native: boolean;
    geometry: ChromeGeometry;
  },
): TabStripLayout & { freezeAt(width: number, tabCount: number): void; unfreeze(): void } {
  const [stripWidth, setStripWidth] = useState(initialStripWidth);
  const [frozen, setFrozen] = useState<FrozenWidth | null>(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setStripWidth(el.clientWidth);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    schedule();
    return () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [stripRef]);

  useEffect(() => {
    const release = () => setFrozen(null);
    window.addEventListener("resize", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("resize", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  const { geometry, leadInset, trailingWidth, native, pinnedCount, unpinnedCount } = opts;
  const minDragGap = native ? geometry.MIN_DRAG_GAP_NATIVE : geometry.MIN_DRAG_GAP_WEB;
  // Strip width minus insets, the new-tab and tab-search buttons, the new-tab gap and the drag gap.
  const available = stripWidth - leadInset - trailingWidth - geometry.STRIP_BUTTON * 2 - 8 - minDragGap;
  const totalCount = pinnedCount + unpinnedCount;
  const frozenWidth = frozen && totalCount <= frozen.tabCount ? frozen.width : null;
  const layout = computeTabStripLayout(available, pinnedCount, unpinnedCount, frozenWidth, geometry);

  const freezeAt = useCallback((width: number, tabCount: number) => setFrozen({ width, tabCount }), []);
  const unfreeze = useCallback(() => setFrozen(null), []);

  return { ...layout, freezeAt, unfreeze };
}
