// SlideTextSync (slides.md §4.5, §6.1): binds one slide text fragment to the editor with y-tiptap's sync plugin
// and nothing else. Slides deliberately does not use the Collaboration extension: that always installs
// yUndoPlugin, and the deck keeps ONE UndoManager for text and objects (text edits reach it because y-tiptap
// transacts with ySyncPluginKey). Mod-Z / Shift-Mod-Z / Mod-Y call that manager through onUndo / onRedo.
//
// Mod-B goes to the host's bold command (onBold) when there is one, ahead of StarterKit's toggleBold (this keymap
// runs first: same priority, later in the extension list). An element whose default is bold renders unmarked text
// bold, which toggleBold cannot see, so the shortcut must take the toolbar's path (text-format.ts formatLiveText).
//
// With `fragment: null` (the headless slideTextSchema() case) the extension adds no plugins at all.
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ySyncPlugin, ySyncPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";

export interface SlideTextSyncOptions {
  fragment: Y.XmlFragment | null;
  onUndo?(): void;
  onRedo?(): void;
  onEscape?(): void;
  /** Mod-B: true when the host ran its bold command; false (or absent) leaves the key to the stock toggleBold. */
  onBold?(): boolean;
}

const contentGuardKey = new PluginKey("slideTextContentGuard");

export const SlideTextSync = Extension.create<SlideTextSyncOptions>({
  name: "slideTextSync",

  addOptions() {
    return { fragment: null, onUndo: undefined, onRedo: undefined, onEscape: undefined, onBold: undefined };
  },

  addProseMirrorPlugins() {
    const fragment = this.options.fragment;
    if (!fragment) return [];
    const editor = this.editor;
    let disabled = false;
    // Rejects a Yjs-origin transaction whose document the schema cannot hold (same idea as the Collaboration
    // extension's content check), so a remote change from a newer schema never reaches the view half-parsed.
    const contentGuard = new Plugin({
      key: contentGuardKey,
      filterTransaction: (transaction) => {
        if (!transaction.getMeta(ySyncPluginKey)) return true;
        if (disabled) return false;
        if (!transaction.docChanged) return true;
        try {
          transaction.doc.check();
          return true;
        } catch (error) {
          disabled = true;
          editor.emit("contentError", {
            editor,
            error: error instanceof Error ? error : new Error(String(error)),
            // The editor unmounts on contentError (it falls back to the read-only renderer); nothing to tear down.
            disableCollaboration: () => undefined,
          });
          return false;
        }
      },
    });
    return [ySyncPlugin(fragment) as Plugin, contentGuard];
  },

  addKeyboardShortcuts() {
    // Always handled while bound: there is no local history, and the browser's native undo would edit the DOM
    // behind ProseMirror's back.
    const bound = () => this.options.fragment !== null;
    return {
      "Mod-z": () => {
        if (!bound()) return false;
        this.options.onUndo?.();
        return true;
      },
      "Shift-Mod-z": () => {
        if (!bound()) return false;
        this.options.onRedo?.();
        return true;
      },
      "Mod-y": () => {
        if (!bound()) return false;
        this.options.onRedo?.();
        return true;
      },
      Escape: () => {
        if (!this.options.onEscape) return false;
        this.options.onEscape();
        return true;
      },
      // Both spellings, as StarterKit's Bold binds them (Mod-B is Caps Lock or Shift).
      "Mod-b": () => this.options.onBold?.() ?? false,
      "Mod-B": () => this.options.onBold?.() ?? false,
    };
  },
});
