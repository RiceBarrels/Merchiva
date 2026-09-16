/**
 * Built-in extensions re-declared without shortcuts that collide with the browser shell's reserved keys
 * (plan §B7.4 — the shell listens in the capture phase, so these would never reach the editor in Tauri and would
 * block browser shortcuts on the web):
 * - Blockquote `Mod-Shift-b` (toggleBookmarksBar). `@tiptap/extension-blockquote` is only a transitive dependency,
 *   so this is a local node with the identical schema (`content: "block+"`, `group: "block"`, `defining`) and the
 *   same commands and `> ` input rule, minus the shortcut.
 * - Highlight `Mod-Shift-h` (home)
 * - TextAlign `Mod-Shift-r` (hardReload) — left/center/justify keep Mod-Shift-L/E/J
 */
import { mergeAttributes, Node, wrappingInputRule } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";

export const DocBlockquote = Node.create({
  name: "blockquote",
  content: "block+",
  group: "block",
  defining: true,

  parseHTML() {
    return [{ tag: "blockquote" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setBlockquote:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleBlockquote:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetBlockquote:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addInputRules() {
    return [wrappingInputRule({ find: /^\s*>\s$/, type: this.type })];
  },
});

export const DocHighlight = Highlight.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

export const DocTextAlign = TextAlign.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});
