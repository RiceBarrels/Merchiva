// A small live deck for the editor tests: two slides built through the model's own builders, plus a DeckStore
// that publishes synchronously enough for tests (flush() waits for its microtask).
import * as Y from "yjs";

import { SLIDES_SCHEMA_VERSION } from "@/lib/slides/constants";
import { DeckStore, type DeckState } from "@/lib/slides/model/deck-store";
import { buildDeckState } from "@/lib/slides/model/build";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { newSlideSnapshot } from "@/lib/slides/model/ops-slides";
import type { DeckSnapshot } from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";

export const SIZE = { w: 960, h: 540 };

export function sampleDeckSnapshot(): DeckSnapshot {
  const [a, b] = sequentialKeys(2);
  return {
    meta: { schemaVersion: SLIDES_SCHEMA_VERSION, size: { ...SIZE }, theme: STARTER_THEMES["simple-light"], source: null },
    masters: [],
    slides: [newSlideSnapshot("slideA", a, "titleBody", "theme", SIZE), newSlideSnapshot("slideB", b, "title", "theme", SIZE)],
  };
}

const STATE = buildDeckState(sampleDeckSnapshot());

/** A fresh doc holding the sample deck (every call starts from the same Yjs items). */
export function sampleDoc(): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, STATE);
  return doc;
}

export function flush(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
}

export async function deckStateOf(doc: Y.Doc): Promise<{ store: DeckStore; state: () => DeckState }> {
  const store = new DeckStore(doc);
  await flush();
  return { store, state: () => store.getSnapshot() };
}
