/**
 * PageField: the `PAGE` / `NUMPAGES` fields Word puts in headers and footers, as an inline atom.
 *
 * It renders a literal `#`, which is what the box being edited shows; every other page substitutes the real number
 * into the serialized HTML (`substitutePageFields`), so one header can number a whole document.
 */
import { mergeAttributes, Node } from "@tiptap/core";

import { PAGE_FIELD_ATTR, isPageFieldKind, type PageFieldKind } from "@/lib/docs/header-footer";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageField: {
      insertPageField: (kind: PageFieldKind) => ReturnType;
    };
  }
}

export const PageField = Node.create({
  name: "pageField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: {
        default: "page" as PageFieldKind,
        parseHTML: (element) => {
          const raw = element.getAttribute(PAGE_FIELD_ATTR);
          return isPageFieldKind(raw) ? raw : "page";
        },
        renderHTML: (attributes) => ({ [PAGE_FIELD_ATTR]: isPageFieldKind(attributes.kind) ? attributes.kind : "page" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${PAGE_FIELD_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "doc-page-field" }), "#"];
  },

  renderText() {
    return "#";
  },

  addCommands() {
    return {
      insertPageField:
        (kind) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { kind } }),
    };
  },
});
