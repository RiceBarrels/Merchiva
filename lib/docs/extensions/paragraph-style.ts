/**
 * ParagraphStyle (docs-editor-ui spec §2.4): global `docStyle: "title" | "subtitle" | null` on paragraphs, plus the
 * `setBlockStyle` command that maps the toolbar's style picker onto paragraphs and headings 1–3.
 */
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { BlockStyle } from "@/lib/docs/fonts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphStyle: {
      /** Normal text, Title, Subtitle or Heading 1–3 for the selected blocks. */
      setBlockStyle: (style: BlockStyle) => ReturnType;
    };
  }
}

function parseDocStyle(element: HTMLElement): "title" | "subtitle" | null {
  const attr = element.getAttribute("data-doc-style");
  if (attr === "title" || attr === "subtitle") return attr;
  if (element.classList.contains("doc-title")) return "title";
  if (element.classList.contains("doc-subtitle")) return "subtitle";
  return null;
}

export const ParagraphStyle = Extension.create({
  name: "paragraphStyle",

  // Above Paragraph (Mod-Alt-0 must also clear docStyle).
  priority: 110,

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          docStyle: {
            default: null,
            parseHTML: (element) => parseDocStyle(element),
            renderHTML: (attributes) =>
              attributes.docStyle === "title" || attributes.docStyle === "subtitle"
                ? { "data-doc-style": attributes.docStyle }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockStyle:
        (style) =>
        ({ tr, dispatch, chain }) => {
          const heading = style === "h1" || style === "h2" || style === "h3";
          const typeName = heading ? "heading" : "paragraph";
          const attrs: Record<string, unknown> = heading
            ? { level: style === "h1" ? 1 : style === "h2" ? 2 : 3 }
            : { docStyle: style === "title" || style === "subtitle" ? style : null };
          const type = tr.doc.type.schema.nodes[typeName];
          if (!type) return false;

          // Textblocks touched by the selection: do any need a different node type?
          let convert = false;
          const sameType: Array<{ pos: number; node: ProseMirrorNode }> = [];
          for (const range of tr.selection.ranges) {
            tr.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
              if (!node.isTextblock) return true;
              if (node.type === type) sameType.push({ pos, node });
              else convert = true;
              return false;
            });
          }

          if (convert) return chain().setNode(typeName, attrs).updateAttributes(typeName, attrs).run();

          // Every block already has the target type, so only attributes change. `setNode` would find nothing to
          // convert and fall back to `clearNodes`, lifting list items and quotes out of their wrapper.
          if (sameType.length === 0) return false;
          if (dispatch) {
            for (const { pos, node } of sameType) {
              if (Object.entries(attrs).every(([key, value]) => node.attrs[key] === value)) continue;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
            }
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": () => this.editor.commands.setBlockStyle("normal"),
    };
  },
});

/** Block style at the selection head (for the toolbar and the mobile format sheet). */
export function getBlockStyle(editor: Editor): BlockStyle {
  const parent = editor.state.selection.$head.parent;
  if (parent.type.name === "heading") {
    const level = Number(parent.attrs.level);
    return level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  }
  if (parent.type.name === "paragraph") {
    if (parent.attrs.docStyle === "title") return "title";
    if (parent.attrs.docStyle === "subtitle") return "subtitle";
  }
  return "normal";
}
