// SlideFontSize (slides.md §6.1): a `fontSize` attribute on the textStyle mark, stored as a NUMBER of points and
// rendered as `font-size: {n}px`. Inside the stage one CSS px is one pt (§5.1), so text and geometry scale together;
// the stock FontSize extension renders its stored string verbatim, which would be CSS pt.
import { Extension } from "@tiptap/core";

export const SLIDE_FONT_SIZE_MIN = 1;
export const SLIDE_FONT_SIZE_MAX = 400;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    slideFontSize: {
      /** Sets the size in pt on the selection. */
      setSlideFontSize: (pt: number) => ReturnType;
      unsetSlideFontSize: () => ReturnType;
    };
  }
}

/** A size in pt within the allowed range (one decimal), or null. Accepts numbers and "18", "18px", "18pt". */
export function slideFontSizePt(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const match = /^\s*(\d+(?:\.\d+)?)\s*(px|pt)?\s*$/i.exec(value);
    if (!match) return null;
    n = Number(match[1]);
  } else return null;
  if (!Number.isFinite(n) || n < SLIDE_FONT_SIZE_MIN || n > SLIDE_FONT_SIZE_MAX) return null;
  return Math.round(n * 10) / 10;
}

export const SlideFontSize = Extension.create<{ types: string[] }>({
  name: "slideFontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            // Stage px are pt, so px and pt both read back as the same number.
            parseHTML: (element) => slideFontSizePt(element.style.fontSize),
            renderHTML: (attributes) => {
              const pt = slideFontSizePt(attributes.fontSize);
              return pt === null ? {} : { style: `font-size: ${pt}px` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setSlideFontSize:
        (pt) =>
        ({ chain }) => {
          const size = slideFontSizePt(pt);
          return size === null ? false : chain().setMark("textStyle", { fontSize: size }).run();
        },
      unsetSlideFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
