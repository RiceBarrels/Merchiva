// SlideParagraphAttrs (slides.md §6.1, §6.3): paragraph-level `dir`, `spaceBefore`, `spaceAfter` (pt) and
// `lineHeight` (multiple). Every default is null, so a blank paragraph carries no attributes and one seeded
// `<paragraph>` equals y-tiptap's own seed (F11). A null `dir` renders `dir="auto"`, so Arabic lays out RTL
// without stored state; the toolbar's text-direction toggle writes "ltr"/"rtl" explicitly.
import { Extension } from "@tiptap/core";

export type ParagraphDir = "ltr" | "rtl";

export const PARAGRAPH_SPACE_MAX = 400;
export const LINE_HEIGHT_MIN = 0.5;
export const LINE_HEIGHT_MAX = 5;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    slideParagraphAttrs: {
      /** "ltr" / "rtl", or null for automatic direction. */
      setParagraphDir: (dir: ParagraphDir | null) => ReturnType;
      /** A line-height multiple, or null for the element default. */
      setParagraphLineHeight: (value: number | null) => ReturnType;
    };
  }
}

export function paragraphDir(value: unknown): ParagraphDir | null {
  return value === "ltr" || value === "rtl" ? value : null;
}

/** Space before/after in pt, or null. */
export function paragraphSpace(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > PARAGRAPH_SPACE_MAX) return null;
  return Math.round(n * 10) / 10;
}

/** Line-height multiple, or null. */
export function paragraphLineHeight(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < LINE_HEIGHT_MIN || n > LINE_HEIGHT_MAX) return null;
  return Math.round(n * 100) / 100;
}

export const SlideParagraphAttrs = Extension.create({
  name: "slideParagraphAttrs",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => paragraphDir(element.getAttribute("dir")),
            renderHTML: (attributes) => ({ dir: paragraphDir(attributes.dir) ?? "auto" }),
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) => paragraphSpace(element.style.marginTop),
            renderHTML: (attributes) => {
              const pt = paragraphSpace(attributes.spaceBefore);
              return pt === null ? {} : { style: `margin-top: ${pt}px` };
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => paragraphSpace(element.style.marginBottom),
            renderHTML: (attributes) => {
              const pt = paragraphSpace(attributes.spaceAfter);
              return pt === null ? {} : { style: `margin-bottom: ${pt}px` };
            },
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => paragraphLineHeight(element.style.lineHeight),
            renderHTML: (attributes) => {
              const value = paragraphLineHeight(attributes.lineHeight);
              return value === null ? {} : { style: `line-height: ${value}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphDir:
        (dir) =>
        ({ commands }) =>
          commands.updateAttributes("paragraph", { dir: paragraphDir(dir) }),
      setParagraphLineHeight:
        (value) =>
        ({ commands }) =>
          commands.updateAttributes("paragraph", { lineHeight: paragraphLineHeight(value) }),
    };
  },
});
