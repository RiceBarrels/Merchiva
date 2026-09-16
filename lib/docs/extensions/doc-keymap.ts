/**
 * Editor-focus shortcuts (docs-editor-ui spec §2.8). Document-level shortcuts (Find, Open, Print, Word count,
 * Esc) live in `components/docs/editor/doc-shortcuts.tsx`.
 *
 * Also owns `clearDocFormatting` (Format ▸ Clear formatting, toolbar, Mod-\): removes text formatting and block
 * styles but keeps comment anchors and links, which are content rather than formatting. Tiptap's `unsetAllMarks`
 * would detach every comment thread in the selection.
 *
 * Never binds shell-reserved keys (plan §B7.4): Mod+T/W/L/R, Mod+1..9, Ctrl+Tab, Mod+Shift+T/D/A/H/B/R.
 */
import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docKeymap: {
      /** Clear formatting: every mark except comment anchors and links, then `clearNodes`. */
      clearDocFormatting: () => ReturnType;
    };
  }
}

/** Marks that Clear formatting keeps. */
export const PRESERVED_ON_CLEAR_FORMATTING: ReadonlySet<string> = new Set(["comment", "link"]);

export interface DocKeymapOptions {
  /** Mod-K: open the link editor for the selection. */
  onOpenLinkEditor: (() => void) | null;
  /** Mod-Alt-M: start a comment on the selection. */
  onAddComment: (() => void) | null;
  /** Mod-S: tell the user changes save automatically. */
  onSaveHint: (() => void) | null;
}

export const DocKeymap = Extension.create<DocKeymapOptions>({
  name: "docKeymap",

  priority: 105,

  addOptions() {
    return { onOpenLinkEditor: null, onAddComment: null, onSaveHint: null };
  },

  addCommands() {
    return {
      clearDocFormatting:
        () =>
        ({ tr, state, dispatch, commands }) => {
          if (dispatch && !tr.selection.empty) {
            const types = Object.values(state.schema.marks).filter((type) => !PRESERVED_ON_CLEAR_FORMATTING.has(type.name));
            for (const range of tr.selection.ranges) {
              for (const type of types) tr.removeMark(range.$from.pos, range.$to.pos, type);
            }
          }
          return commands.clearNodes();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        if (!this.editor.isEditable || !this.options.onOpenLinkEditor) return false;
        this.options.onOpenLinkEditor();
        return true;
      },
      "Mod-Alt-m": () => {
        if (!this.options.onAddComment) return false;
        this.options.onAddComment();
        return true;
      },
      "Mod-\\": () => {
        if (!this.editor.isEditable) return false;
        return this.editor.chain().focus().clearDocFormatting().run();
      },
      "Mod-s": () => {
        this.options.onSaveHint?.();
        return true;
      },
    };
  },
});
