// Slides version history (slides.md §4.9). A version row carries the whole Y state of the deck at that moment
// (`DocVersion.state`), so previewing decodes it into its own Y.Doc and restoring diff-applies it to the live doc
// (applyDeckSnapshot): an ordinary, undoable edit that collaborators receive like any other. The Docs panel,
// rename and delete are reused as they are (lib/docs/versions.ts).
import * as Y from "yjs";

import type { DocVersion } from "@/lib/docs/types";
import { VERSION_NAME_MAX, type VersionSaver } from "@/lib/docs/versions";
import { SLIDES_SCHEMA_VERSION } from "@/lib/slides/constants";
import { applyDeckSnapshot } from "@/lib/slides/model/apply-snapshot";
import { readDeckSnapshot } from "@/lib/slides/model/read";

/** Decoded version docs kept in memory (LRU). */
export const SLIDES_VERSION_DOC_CACHE_SIZE = 3;

// Version state is immutable per id, so a cached doc never goes stale. Evicted docs are only dropped, not
// destroyed: a preview may still be showing one.
const docCache = new Map<string, Y.Doc>();

/**
 * The version's deck as a Y.Doc (empty for an empty state), from a small LRU cache. The doc is shared: read it
 * only (a preview wraps it in `new DeckStore(doc, { readOnly: true })`). Rejects when the state can't be decoded.
 */
export async function loadVersionDoc(version: Pick<DocVersion, "id" | "state">): Promise<Y.Doc> {
  const hit = docCache.get(version.id);
  if (hit) {
    docCache.delete(version.id);
    docCache.set(version.id, hit);
    return hit;
  }
  const doc = new Y.Doc();
  if (version.state && version.state.byteLength > 0) {
    try {
      Y.applyUpdate(doc, version.state);
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }
  docCache.set(version.id, doc);
  while (docCache.size > SLIDES_VERSION_DOC_CACHE_SIZE) {
    const oldest = docCache.keys().next().value;
    if (oldest === undefined) break;
    docCache.delete(oldest);
  }
  return doc;
}

export interface RestoreSlidesVersionArgs {
  /** The live session doc. */
  ydoc: Y.Doc;
  provider: VersionSaver;
  version: Pick<DocVersion, "id" | "state">;
  /** Name of the safety snapshot taken first, e.g. `fmt(t("docs.versions.beforeRestore"), { time })`. */
  safetyName: string;
}

/**
 * Restores a version as a new, undoable edit:
 * 1. decode it (a corrupt, empty or too-new version rejects here, before anything is written);
 * 2. `provider.saveVersion("restore", safetyName)` saves the current state (as lib/docs/versions.ts does);
 * 3. `applyDeckSnapshot` diff-applies the version to the live doc in one transaction (one undo step).
 */
export async function restoreSlidesVersion(args: RestoreSlidesVersionArgs): Promise<void> {
  const target = readDeckSnapshot(await loadVersionDoc(args.version));
  if (target.meta.schemaVersion > SLIDES_SCHEMA_VERSION) throw new Error("[slides.version] The version was made with a newer version");
  if (target.slides.length === 0) throw new Error("[slides.version] The version holds no slides");
  const safetyName = args.safetyName.replace(/\s+/g, " ").trim().slice(0, VERSION_NAME_MAX);
  await args.provider.saveVersion("restore", safetyName || undefined);
  if (args.ydoc.isDestroyed) throw new Error("The presentation closed before the version could be restored");
  applyDeckSnapshot(args.ydoc, target);
}
