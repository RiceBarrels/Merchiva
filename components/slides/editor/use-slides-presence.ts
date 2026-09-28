"use client";

// Slides presence (slides.md §4.7): publishes this viewer's slide, selection and text target into the provider's
// awareness, and reads everyone else's, batched to one update per animation frame. The provider mirrors awareness
// into document_presence (throttled) and keeps our extra field, so peers see it as we wrote it; theirs is
// untrusted and goes through readPeerSlides' validator.
//
// A parked session clears the local awareness (the provider's idle presence), and reactivation writes a fresh
// state with only `user`; the change listener notices that our field is missing and announces it again.
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Awareness } from "y-protocols/awareness";

import type { SpacetimeYjsProvider } from "@/lib/docs/spacetime-provider";
import { Latest } from "@/lib/slides/editor/latest";
import { NO_SLIDES_PEERS, groupPeers, samePeerLists, type SlidesPeersState } from "@/lib/slides/editor/peers";
import { readPeerSlides, setLocalSlidesAwareness, type SlidesAwareness } from "@/lib/slides/presence";

export type { SlidesPeersState } from "@/lib/slides/editor/peers";

class PeersWatcher {
  private state: SlidesPeersState;

  constructor(
    private readonly awareness: Awareness,
    private readonly getLocal: () => SlidesAwareness,
  ) {
    this.state = groupPeers(readPeerSlides(awareness, awareness.clientID));
  }

  /** Re-reads the peers; true when they changed. */
  private read(): boolean {
    const list = readPeerSlides(this.awareness, this.awareness.clientID);
    if (samePeerLists(list, this.state.list)) return false;
    this.state = list.length === 0 ? NO_SLIDES_PEERS : groupPeers(list);
    return true;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    let frame = 0;
    const onChange = () => {
      setLocalSlidesAwareness(this.awareness, this.getLocal());
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (this.read()) listener();
      });
    };
    this.awareness.on("change", onChange);
    if (this.read()) listener();
    return () => {
      this.awareness.off("change", onChange);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  };

  readonly getSnapshot = (): SlidesPeersState => this.state;
}

const serverPeers = (): SlidesPeersState => NO_SLIDES_PEERS;

/** Writes `local` into the provider's awareness and returns the other peers, grouped by slide and by element. */
export function useSlidesPresence(provider: SpacetimeYjsProvider, local: SlidesAwareness): SlidesPeersState {
  const awareness = provider.awareness;
  const [latest] = useState(() => new Latest(local));
  useLayoutEffect(() => {
    latest.set(local);
  });

  const localKey = `${local.slideId ?? ""}|${local.edit ?? ""}|${local.sel.join(",")}`;
  useEffect(() => {
    setLocalSlidesAwareness(awareness, latest.get());
  }, [awareness, localKey, latest]);

  const watcher = useMemo(() => new PeersWatcher(awareness, () => latest.get()), [awareness, latest]);
  return useSyncExternalStore(watcher.subscribe, watcher.getSnapshot, serverPeers);
}
