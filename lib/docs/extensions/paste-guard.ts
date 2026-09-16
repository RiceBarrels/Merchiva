/**
 * Paste guard (plan §B6 wiring rules): rejects pastes whose HTML or text exceeds ~512 KB so one paste can't produce
 * a Yjs update above the reducer's size limit.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface PasteGuardOptions {
  maxChars: number;
  onReject: (() => void) | null;
}

export const PASTE_MAX_CHARS = 512 * 1024;

export const PasteGuard = Extension.create<PasteGuardOptions>({
  name: "pasteGuard",

  // Before every other paste handler (image uploads, lists).
  priority: 1000,

  addOptions() {
    return { maxChars: PASTE_MAX_CHARS, onReject: null };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("docPasteGuard"),
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data) return false;
            const html = data.getData("text/html");
            const text = data.getData("text/plain");
            if (html.length <= options.maxChars && text.length <= options.maxChars) return false;
            event.preventDefault();
            options.onReject?.();
            return true;
          },
        },
      }),
    ];
  },
});
