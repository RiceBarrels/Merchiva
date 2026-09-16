// Find & replace extension: replaceCurrent continues after its own replacement, replaceAll isn't limited by the
// highlight cap, and a y-tiptap change-origin transaction (a collaborator's edit or an undo, applied as one
// whole-document replace) keeps the selected match current.
//
// A headless Tiptap editor (`element: null`) registers no ProseMirror plugins, so the search plugin runs on an
// EditorState built from the extension manager, and commands are the raw command creators applied to that state.

import { describe, expect, test } from "bun:test";
import { Editor, type CommandProps, type JSONContent } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { buildDocExtensions } from "@/lib/docs/editor-extensions";
import { findSearchResults, searchPluginKey } from "@/lib/docs/extensions/search-replace";

type RawCommand = (...args: unknown[]) => (props: CommandProps) => boolean;

const doc = (...paragraphs: string[]): JSONContent => ({
  type: "doc",
  content: paragraphs.map((value) => ({ type: "paragraph", content: [{ type: "text", text: value }] })),
});

function harness(content: JSONContent) {
  const editor = new Editor({
    element: null,
    editable: true,
    extensions: buildDocExtensions({ mode: "preview", canEdit: true, coarsePointer: false }),
    content,
  });
  const plugins = editor.extensionManager.plugins.filter((plugin) => plugin.spec.key === searchPluginKey);
  expect(plugins.length).toBe(1);
  let state = EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins });
  const raw = editor.extensionManager.commands as unknown as Record<string, RawCommand>;
  const storage = editor.storage.searchAndReplace;

  return {
    storage,
    get state() {
      return state;
    },
    run(name: string, ...args: unknown[]): boolean {
      const tr = state.tr;
      const props = { editor: { isEditable: true }, tr, state, dispatch: () => undefined } as unknown as CommandProps;
      const ok = raw[name](...args)(props);
      state = state.apply(tr);
      return ok;
    },
    dispatch(tr: Transaction): void {
      state = state.apply(tr);
    },
    /** y-tiptap's remote / undo path: replace the whole document, restore a selection, mark it as change origin. */
    remoteReplace(paragraphs: string[], selection?: { from: number; to: number }): void {
      const next = state.schema.nodeFromJSON(doc(...paragraphs));
      const tr = state.tr.replace(0, state.doc.content.size, new Slice(next.content, 0, 0));
      if (selection) tr.setSelection(TextSelection.create(tr.doc, selection.from, selection.to));
      tr.setMeta(ySyncPluginKey, { isChangeOrigin: true });
      state = state.apply(tr);
    },
    destroy(): void {
      editor.destroy();
    },
  };
}

describe("search and replace", () => {
  test("replaceCurrent moves past a replacement that still matches the term", () => {
    const h = harness(doc("cash cash cash"));
    h.run("setSearchTerm", "cash");
    h.run("setReplaceTerm", "cashier");
    expect(h.storage.results.length).toBe(3);
    expect(h.storage.index).toBe(0);

    expect(h.run("replaceCurrent")).toBe(true);
    // "cashier cash cash": the inserted "cashier" matches too (result 0); the current match is the next "cash".
    expect(h.storage.results.length).toBe(3);
    expect(h.storage.index).toBe(1);
    expect(h.storage.results[1].from).toBeGreaterThanOrEqual(1 + "cashier".length);

    h.run("replaceCurrent");
    expect(h.storage.index).toBe(2);
    h.run("replaceCurrent");
    // Nothing after the last replacement: wraps to the first match.
    expect(h.storage.index).toBe(0);
    expect(h.state.doc.textContent).toBe("cashier cashier cashier");
    h.destroy();
  });

  test("replaceAll replaces every occurrence, not only the capped highlighted results", () => {
    const h = harness(doc("x".repeat(2500)));
    h.run("setSearchTerm", "x");
    h.run("setReplaceTerm", "y");
    expect(h.storage.results.length).toBe(2000);
    expect(findSearchResults(h.state.doc, "x", false, Number.POSITIVE_INFINITY).length).toBe(2500);

    expect(h.run("replaceAll")).toBe(true);
    expect(h.storage.lastReplaced).toBe(2500);
    expect(h.state.doc.textContent).toBe("y".repeat(2500));
    expect(h.storage.results.length).toBe(0);
    h.destroy();
  });

  test("a change-origin (remote) transaction keeps the selected match current", () => {
    const h = harness(doc("cash one", "cash two", "cash three"));
    h.run("setSearchTerm", "cash");
    h.run("nextSearchResult");
    h.run("nextSearchResult");
    expect(h.storage.index).toBe(2);
    const third = h.storage.results[2];
    expect(h.state.selection.from).toBe(third.from);

    // A collaborator typed "X" at the start of the first paragraph; y-tiptap restores the local selection.
    h.remoteReplace(["Xcash one", "cash two", "cash three"], { from: third.from + 1, to: third.to + 1 });

    expect(h.storage.results.length).toBe(3);
    expect(h.storage.index).toBe(2);
    expect(h.storage.results[2]).toEqual({ from: third.from + 1, to: third.to + 1 });
    h.destroy();
  });

  test("a change-origin transaction without a selected match clamps the index", () => {
    const h = harness(doc("cash one", "cash two", "cash three"));
    h.run("setSearchTerm", "cash");
    h.run("nextSearchResult");
    h.run("nextSearchResult");
    expect(h.storage.index).toBe(2);

    h.remoteReplace(["cash one"]);

    expect(h.storage.results.length).toBe(1);
    expect(h.storage.index).toBe(0);
    h.destroy();
  });

  test("local edits without change origin still map results instead of re-searching", () => {
    const h = harness(doc("cash one", "cash two"));
    h.run("setSearchTerm", "cash");
    const before = h.storage.results.map((r) => ({ ...r }));
    h.dispatch(h.state.tr.insertText("X", 1));
    expect(h.storage.results).toEqual(before.map((r) => ({ from: r.from + 1, to: r.to + 1 })));
  });
});
