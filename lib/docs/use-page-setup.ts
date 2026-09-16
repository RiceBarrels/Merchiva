"use client";

/**
 * React binding for the document's page setup. The value lives on the Y.Doc, so every
 * collaborator sees a margin change immediately and it survives reconnects without a reducer call.
 *
 * The Y.Map is an external store, so this is `useSyncExternalStore` over a cached snapshot: `readPageSetup` builds
 * a fresh object every call, and re-using the previous one when nothing changed is what keeps the paged layout from
 * re-measuring on every unrelated edit.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type * as Y from "yjs";

import { defaultPageSetup, normalizePageSetup, samePageSetup, type DocPageSetup } from "./page-setup";
import { observePageSetup, readPageSetup, writePageSetup } from "./page-setup-store";

export interface UsePageSetupResult {
  readonly setup: DocPageSetup;
  /** Writes a whole setup (normalised on the way in). No-op without a Y.Doc. */
  readonly setSetup: (next: DocPageSetup) => void;
}

interface PageSetupStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): DocPageSetup;
}

function createStore(ydoc: Y.Doc | null, fallback: DocPageSetup): PageSetupStore {
  let snapshot = ydoc ? readPageSetup(ydoc, fallback) : fallback;
  const listeners = new Set<() => void>();
  const read = () => {
    const next = ydoc ? readPageSetup(ydoc, fallback) : fallback;
    if (samePageSetup(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      const unobserve = ydoc ? observePageSetup(ydoc, read) : null;
      return () => {
        listeners.delete(listener);
        unobserve?.();
      };
    },
    getSnapshot: () => snapshot,
  };
}

export function usePageSetup(ydoc: Y.Doc | null, locale: string): UsePageSetupResult {
  const fallback = useMemo(() => defaultPageSetup(locale), [locale]);
  const store = useMemo(() => createStore(ydoc, fallback), [ydoc, fallback]);
  const setup = useSyncExternalStore(store.subscribe, store.getSnapshot, () => fallback);

  const setSetup = useCallback(
    (next: DocPageSetup) => {
      if (ydoc) writePageSetup(ydoc, normalizePageSetup(next, fallback));
    },
    [ydoc, fallback],
  );

  return { setup, setSetup };
}
