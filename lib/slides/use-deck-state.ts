"use client";

// React binding of a DeckStore (slides.md §4.4): the store publishes a new DeckState at most once per microtask and
// keeps unchanged slides, elements and masters as the same objects, so components can memoize on them.
import { useSyncExternalStore } from "react";

import type { DeckState, DeckStore } from "@/lib/slides/model/deck-store";

export function useDeckState(store: DeckStore): DeckState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
