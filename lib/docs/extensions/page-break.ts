/**
 * PageBreak (docs-editor-ui spec §2.2): an explicit break drawn as the gap between two sheets. Print CSS turns it
 * into `break-after: page`; DOCX export maps it to a `PageBreak` run.
 *
 * `renderHTML` (used by getHTML, clipboard and exports) carries no label; the on-screen label comes from a small
 * node view so the stored HTML stays locale-neutral.
 */
import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Inserts a page break followed by an empty paragraph. */
      setPageBreak: () => ReturnType;
    };
  }
}

export interface PageBreakOptions {
  /** Localized micro label shown on the band (`docs.pageBreak.label`). */
  label: string;
}

export const PageBreak = Node.create<PageBreakOptions>({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  // Above HardBreak, which also binds Mod-Enter.
  priority: 110,

  addOptions() {
    return { label: "Page break" };
  },

  parseHTML() {
    return [{ tag: "div[data-page-break]" }, { tag: "hr.doc-page-break", priority: 100 }];
  },

  renderHTML() {
    return ["div", { "data-page-break": "", class: "doc-page-break" }];
  },

  renderText() {
    return "\n\n";
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.className = "doc-page-break";
      dom.setAttribute("data-page-break", "");
      dom.setAttribute("data-label", this.options.label);
      dom.setAttribute("role", "separator");
      dom.setAttribute("aria-label", this.options.label);
      dom.contentEditable = "false";
      return { dom };
    };
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name }, { type: "paragraph" }])
            .run(),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => (this.editor.isEditable ? this.editor.commands.setPageBreak() : false),
    };
  },
});
