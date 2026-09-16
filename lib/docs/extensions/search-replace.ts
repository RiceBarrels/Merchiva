/**
 * SearchAndReplace (docs-editor-ui spec §2.6), driven by `FindReplaceBar`.
 *
 * - Matching joins each textblock's text nodes into one string (so matches can span marks) with an
 *   offset → position map; inline non-text nodes break matches.
 * - Results and the current index live in `editor.storage.searchAndReplace`. Decorations: `doc-search-match`,
 *   and `doc-search-current` on the current result.
 * - Local edits re-run the search at most every 100 ms (a timer dispatches a meta-only refresh; meanwhile the
 *   previous decorations are mapped through the edit). Meta-only transactions are ignored by y-tiptap.
 * - Remote and undo changes arrive from y-tiptap as one whole-document replace that mapping can't follow: the search
 *   re-runs at once and the selected match (y-tiptap restores the selection) stays current.
 * - `replaceCurrent` makes the first match after the inserted text current; `replaceAll` replaces every occurrence
 *   (not only the capped, highlighted results) in one transaction (one undo step); replacements keep the marks of the
 *   first replaced character.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

export interface SearchResult {
  readonly from: number;
  readonly to: number;
}

export interface SearchAndReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  results: SearchResult[];
  /** Index into `results` of the current match (0 when there are none). */
  index: number;
  /** Number of replacements made by the last `replaceAll` / `replaceCurrent`. */
  lastReplaced: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      setSearchCaseSensitive: (caseSensitive: boolean) => ReturnType;
      nextSearchResult: () => ReturnType;
      previousSearchResult: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
    };
  }
  interface Storage {
    searchAndReplace: SearchAndReplaceStorage;
  }
}

export const searchPluginKey = new PluginKey<DecorationSet>("docSearchAndReplace");

/** Cap to keep decoration sets small on pathological searches (e.g. a single letter in a long doc). */
const MAX_RESULTS = 2000;
const REFRESH_DELAY_MS = 100;

type SearchMeta = { refresh: true; advanceFrom?: number } | { rebuild: true };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches of `term`, at most `limit` (the highlight cap by default; `replaceAll` passes Infinity). */
export function findSearchResults(doc: ProseMirrorNode, term: string, caseSensitive: boolean, limit = MAX_RESULTS): SearchResult[] {
  if (!term) return [];
  const pattern = new RegExp(escapeRegExp(term), caseSensitive ? "gu" : "giu");
  const results: SearchResult[] = [];
  doc.descendants((node, pos) => {
    if (results.length >= limit) return false;
    if (!node.isTextblock) return true;
    let text = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) positions.push(start + i);
        text += child.text;
      } else {
        // Object replacement character: never part of a match.
        positions.push(start);
        text += "￼";
      }
    });
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null && results.length < limit) {
      if (match[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      const from = positions[match.index];
      const to = positions[match.index + match[0].length - 1] + 1;
      results.push({ from, to });
    }
    return false;
  });
  return results;
}

function buildDecorations(doc: ProseMirrorNode, results: readonly SearchResult[], index: number): DecorationSet {
  if (results.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    results.map((r, i) => Decoration.inline(r.from, r.to, { class: i === index ? "doc-search-match doc-search-current" : "doc-search-match" })),
  );
}

function withMeta(tr: Transaction, meta: SearchMeta): Transaction {
  return tr.setMeta(searchPluginKey, meta).setMeta("addToHistory", false);
}

export const SearchAndReplace = Extension.create<Record<string, never>, SearchAndReplaceStorage>({
  name: "searchAndReplace",

  addStorage() {
    return { searchTerm: "", replaceTerm: "", caseSensitive: false, results: [], index: 0, lastReplaced: 0 };
  },

  addCommands() {
    const storage = () => this.storage;
    return {
      setSearchTerm:
        (term) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            storage().searchTerm = term;
            withMeta(tr, { refresh: true });
          }
          return true;
        },
      setReplaceTerm:
        (term) =>
        () => {
          storage().replaceTerm = term;
          return true;
        },
      setSearchCaseSensitive:
        (caseSensitive) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            storage().caseSensitive = caseSensitive;
            withMeta(tr, { refresh: true });
          }
          return true;
        },
      nextSearchResult:
        () =>
        ({ tr, dispatch }) => {
          const s = storage();
          if (s.results.length === 0) return false;
          if (dispatch) {
            s.index = (s.index + 1) % s.results.length;
            const r = s.results[s.index];
            withMeta(tr.setSelection(TextSelection.create(tr.doc, r.from, r.to)).scrollIntoView(), { rebuild: true });
          }
          return true;
        },
      previousSearchResult:
        () =>
        ({ tr, dispatch }) => {
          const s = storage();
          if (s.results.length === 0) return false;
          if (dispatch) {
            s.index = (s.index - 1 + s.results.length) % s.results.length;
            const r = s.results[s.index];
            withMeta(tr.setSelection(TextSelection.create(tr.doc, r.from, r.to)).scrollIntoView(), { rebuild: true });
          }
          return true;
        },
      replaceCurrent:
        () =>
        ({ editor, tr, dispatch }) => {
          const s = storage();
          const r = s.results[s.index];
          if (!editor.isEditable || !r) return false;
          if (dispatch) {
            tr.insertText(s.replaceTerm, r.from, r.to);
            s.lastReplaced = 1;
            withMeta(tr, { refresh: true, advanceFrom: r.from + s.replaceTerm.length });
          }
          return true;
        },
      replaceAll:
        () =>
        ({ editor, tr, dispatch }) => {
          const s = storage();
          if (!editor.isEditable || s.results.length === 0) return false;
          if (dispatch) {
            const every = findSearchResults(tr.doc, s.searchTerm, s.caseSensitive, Number.POSITIVE_INFINITY);
            for (let i = every.length - 1; i >= 0; i--) {
              const r = every[i];
              tr.insertText(s.replaceTerm, r.from, r.to);
            }
            s.lastReplaced = every.length;
            withMeta(tr, { refresh: true });
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<DecorationSet>({
        key: searchPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorations, _oldState, newState) => {
            const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;
            if (meta && "refresh" in meta) {
              storage.results = findSearchResults(newState.doc, storage.searchTerm, storage.caseSensitive);
              const advanceFrom = meta.advanceFrom;
              if (storage.results.length === 0) storage.index = 0;
              else if (advanceFrom !== undefined) {
                // replaceCurrent: continue with the first match after the inserted text (wrapping), never the replacement.
                const after = storage.results.findIndex((r) => r.from >= advanceFrom);
                storage.index = after === -1 ? 0 : after;
              } else if (storage.index >= storage.results.length) storage.index = storage.results.length - 1;
              return buildDecorations(newState.doc, storage.results, storage.index);
            }
            if (meta && "rebuild" in meta) return buildDecorations(newState.doc, storage.results, storage.index);
            const sync = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: unknown } | undefined;
            if (tr.docChanged && sync?.isChangeOrigin === true && storage.searchTerm) {
              // A collaborator's edit or an undo: re-run now and keep the match the user has selected.
              const previous = storage.index;
              storage.results = findSearchResults(newState.doc, storage.searchTerm, storage.caseSensitive);
              const { from, to } = newState.selection;
              const selected = storage.results.findIndex((r) => r.from === from && r.to === to);
              storage.index = selected >= 0 ? selected : Math.max(0, Math.min(previous, storage.results.length - 1));
              return buildDecorations(newState.doc, storage.results, storage.index);
            }
            if (tr.docChanged && storage.results.length > 0) {
              storage.results = storage.results
                .map((r) => ({ from: tr.mapping.map(r.from, 1), to: tr.mapping.map(r.to, -1) }))
                .filter((r) => r.to > r.from);
              if (storage.index >= storage.results.length) storage.index = Math.max(0, storage.results.length - 1);
              return decorations.map(tr.mapping, tr.doc);
            }
            return decorations;
          },
        },
        props: {
          decorations: (state) => searchPluginKey.getState(state) ?? DecorationSet.empty,
        },
        view: () => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          return {
            update: (view, prevState) => {
              if (!storage.searchTerm || view.state.doc.eq(prevState.doc)) return;
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                timer = null;
                if (view.isDestroyed) return;
                view.dispatch(withMeta(view.state.tr, { refresh: true }));
              }, REFRESH_DELAY_MS);
            },
            destroy: () => {
              if (timer) clearTimeout(timer);
              timer = null;
            },
          };
        },
      }),
    ];
  },
});
