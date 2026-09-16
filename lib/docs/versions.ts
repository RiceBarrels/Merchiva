/**
 * Version history helpers (docs-editor-ui spec §5, plan D44).
 *
 * Data comes from `useDocumentVersions(documentId, true)` (lib/spacetimedb/hooks/useDocs.ts). The version's
 * Yjs state is on the row (`DocVersion.state`), so no separate loader reducer exists. Versions are
 * created through the live provider, `provider.saveVersion(kind, name)`. Rename and delete use
 * `renameDocumentVersion(documentId, versionId, name)` / `deleteDocumentVersion(documentId, versionId)`.
 *
 * `yjs` and `@tiptap/y-tiptap` are loaded with `await import(...)` inside `loadVersionJson`; this file
 * keeps only type imports, so panels can import the constants cheaply.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import type { DocVersion, DocVersionKind } from "@/lib/docs/types";

/** Mirrors the server's `DOC_VERSION_NAME_MAX`. */
export const VERSION_NAME_MAX = 80;

/** Number of decoded version documents kept in memory (LRU). */
export const VERSION_JSON_CACHE_SIZE = 5;

/** Minimal provider surface this module needs; `SpacetimeYjsProvider` satisfies it structurally. */
export interface VersionSaver {
  saveVersion(kind: DocVersionKind, name?: string): Promise<void>;
}

/** Same field the live editor binds (`Collaboration.configure({ field: "default" })`). */
const YJS_FIELD = "default";

// Version state is immutable per id, so the cache never needs invalidation.
const jsonCache = new Map<string, JSONContent>();

function cacheGet(id: string): JSONContent | undefined {
  const hit = jsonCache.get(id);
  if (hit) {
    // Refresh recency.
    jsonCache.delete(id);
    jsonCache.set(id, hit);
  }
  return hit;
}

function cacheSet(id: string, json: JSONContent): void {
  jsonCache.delete(id);
  jsonCache.set(id, json);
  while (jsonCache.size > VERSION_JSON_CACHE_SIZE) {
    const oldest = jsonCache.keys().next().value;
    if (oldest === undefined) break;
    jsonCache.delete(oldest);
  }
}

/** A `doc` node always needs at least one block (`block+`); an empty fragment decodes to `content: []`. */
function normalizeDocJson(raw: Record<string, unknown>): JSONContent {
  const content = Array.isArray(raw.content) ? (raw.content as JSONContent[]) : [];
  return { ...raw, type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

/**
 * Decodes a version's Yjs state into ProseMirror JSON (`yDocToProsemirrorJSON(ydoc, "default")`).
 * Results are cached by `version.id` (LRU of `VERSION_JSON_CACHE_SIZE`). Rejects if the state can't be decoded.
 */
export async function loadVersionJson(version: Pick<DocVersion, "id" | "state">): Promise<JSONContent> {
  const cached = cacheGet(version.id);
  if (cached) return cached;

  let json: JSONContent;
  if (!version.state || version.state.byteLength === 0) {
    json = normalizeDocJson({});
  } else {
    const [Y, { yDocToProsemirrorJSON }] = await Promise.all([import("yjs"), import("@tiptap/y-tiptap")]);
    const ydoc = new Y.Doc();
    try {
      Y.applyUpdate(ydoc, version.state);
      json = normalizeDocJson(yDocToProsemirrorJSON(ydoc, YJS_FIELD));
    } finally {
      ydoc.destroy();
    }
  }
  cacheSet(version.id, json);
  return json;
}

export interface RestoreDocumentVersionArgs {
  /** The live editor, bound to the session's Y.Doc through Collaboration. */
  editor: Editor;
  provider: VersionSaver;
  version: Pick<DocVersion, "id" | "state">;
  /** Name of the safety snapshot taken first, e.g. `fmt(t("docs.versions.beforeRestore"), { time })`. */
  safetyName: string;
}

/**
 * Restores a version as a new, undoable edit:
 * 1. `loadVersionJson(version)` (decoded first, so a corrupt version never creates a pointless safety snapshot).
 * 2. `provider.saveVersion("restore", safetyName)` saves the current state.
 * 3. `editor.commands.setContent(json, { emitUpdate: true })`. y-tiptap diffs the fragment, so collaborators
 *    receive a normal update and the restorer can undo it.
 *
 * The caller closes the preview and shows `docs.versions.restored`. Rejects on failure; content is unchanged if
 * step 1 or 2 fails.
 */
export async function restoreDocumentVersion(args: RestoreDocumentVersionArgs): Promise<void> {
  const { editor, provider, version } = args;
  const json = await loadVersionJson(version);
  const safetyName = args.safetyName.replace(/\s+/g, " ").trim().slice(0, VERSION_NAME_MAX);
  await provider.saveVersion("restore", safetyName || undefined);
  if (editor.isDestroyed) throw new Error("The editor closed before the version could be restored");
  const applied = editor.commands.setContent(json, { emitUpdate: true });
  if (!applied) throw new Error("The version content could not be applied");
}
