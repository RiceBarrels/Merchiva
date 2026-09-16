/**
 * LineSpacing (docs-editor-ui spec §2.4): block-level `lineSpacing` on paragraphs and headings, rendered as
 * `line-height`. Text-style's LineHeight is span-scoped, so it isn't used. The CSS default is 1.15.
 */
import { Extension } from "@tiptap/core";
import { LINE_SPACINGS, type LineSpacing as LineSpacingValue } from "@/lib/docs/fonts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineSpacing: {
      setLineSpacing: (value: LineSpacingValue) => ReturnType;
      unsetLineSpacing: () => ReturnType;
    };
  }
}

const TYPES = ["paragraph", "heading"] as const;

function parseLineSpacing(element: HTMLElement): LineSpacingValue | null {
  const raw = element.getAttribute("data-line-spacing") ?? element.style.lineHeight;
  if (!raw) return null;
  const normalized = String(Number(raw));
  return (LINE_SPACINGS as readonly string[]).includes(normalized) ? (normalized as LineSpacingValue) : null;
}

export const LineSpacing = Extension.create({
  name: "lineSpacing",

  addGlobalAttributes() {
    return [
      {
        types: [...TYPES],
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (element) => parseLineSpacing(element),
            renderHTML: (attributes) =>
              typeof attributes.lineSpacing === "string" && (LINE_SPACINGS as readonly string[]).includes(attributes.lineSpacing)
                ? { "data-line-spacing": attributes.lineSpacing, style: `line-height: ${attributes.lineSpacing}` }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (value) =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { lineSpacing: value })).some(Boolean),
      unsetLineSpacing:
        () =>
        ({ commands }) =>
          TYPES.map((type) => commands.resetAttributes(type, "lineSpacing")).some(Boolean),
    };
  },
});
