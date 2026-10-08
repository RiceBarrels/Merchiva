"use client";

// Frames of the elements a gesture is moving (slides.md §5.3). While a drag, resize or rotate runs, the selection
// layer writes one Frame per target here on every pointer event, and ElementView renders from the frame instead of
// the model: React stays the only writer of `style`, and a remote update to a dragged element cannot fight the
// gesture. The gesture's end commits the frames with updateElements (one undo step) and clears them.
//
// The store is an instance provided through GestureFramesContext by the editing stage, not a module singleton: the
// browser shell keeps several tabs alive in one page, and the same deck open in two tabs must not share a drag.
// The stage owns it: `const [frames] = useState(() => new GestureFrameStore())`, and
// `<GestureFramesContext.Provider value={frames}>` wraps BOTH its SlideView and the SelectionLayer / line handles,
// which write through useGestureFrameStore(). Without a provider (thumbnails, presenter, export) useElementFrame is
// always null, and a writer outside the provider has no store to write to.
import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import { elementBounds } from "@/lib/slides/geometry/arrange";
import type { Pt, SlideElement } from "@/lib/slides/model/types";

export interface Frame {
  x: Pt;
  y: Pt;
  w: Pt;
  h: Pt;
  rot: number;
  /**
   * Lines only, during an endpoint drag: the new endpoints (they win over x/y). Without it a line's frame is its
   * moved endpoint bounding box: x/y are the new top-left of `elementBounds(line)`, and the line is shifted by the
   * difference.
   */
  line?: { x1: Pt; y1: Pt; x2: Pt; y2: Pt };
}

/** The frame a gesture starts from: the element's box, or a line's endpoint bounding box. */
export function elementFrame(el: SlideElement): Frame {
  if (el.type === "line") {
    const b = elementBounds(el);
    return { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot };
}

type Listener = () => void;

export class GestureFrameStore {
  private frames = new Map<string, Frame>();
  private readonly listeners = new Map<string, Set<Listener>>();

  get(id: string): Frame | null {
    return this.frames.get(id) ?? null;
  }

  /** True while any frame is set (a gesture is running). */
  get active(): boolean {
    return this.frames.size > 0;
  }

  /** Replaces all frames (gesture start or step); null or an empty map ends the gesture. */
  set(frames: ReadonlyMap<string, Frame> | null): void {
    const previous = this.frames;
    this.frames = new Map(frames ?? []);
    const touched = new Set<string>([...previous.keys(), ...this.frames.keys()]);
    for (const id of touched) {
      if (previous.get(id) !== this.frames.get(id)) this.notify(id);
    }
  }

  /** Sets or clears one element's frame. */
  update(id: string, frame: Frame | null): void {
    if (frame) this.frames.set(id, frame);
    else if (!this.frames.delete(id)) return;
    this.notify(id);
  }

  clear(): void {
    this.set(null);
  }

  subscribe(id: string, listener: Listener): () => void {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(id);
      current?.delete(listener);
      if (current && current.size === 0) this.listeners.delete(id);
    };
  }

  private notify(id: string): void {
    for (const listener of [...(this.listeners.get(id) ?? [])]) listener();
  }
}

export const GestureFramesContext = createContext<GestureFrameStore | null>(null);

/** The enclosing stage's store, for the gesture writers (selection layer, line handles); null outside a stage. */
export function useGestureFrameStore(): GestureFrameStore | null {
  return useContext(GestureFramesContext);
}

/** The live gesture frame of an element, or null (no gesture, no provider, or an empty id). */
export function useElementFrame(id: string): Frame | null {
  const store = useContext(GestureFramesContext);
  const subscribe = useCallback(
    (listener: Listener) => (store && id ? store.subscribe(id, listener) : () => {}),
    [store, id],
  );
  const read = useCallback(() => (store && id ? store.get(id) : null), [store, id]);
  // The same read on the server: without a provider it is null there too, and a provided store stays authoritative.
  return useSyncExternalStore(subscribe, read, read);
}
