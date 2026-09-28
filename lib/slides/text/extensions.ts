// The one text schema of Slides (slides.md §6.1): text boxes, shape text, table cells and speaker notes all use
// it, and so do the headless paths (build, validate, import, export, version restore). Changing a node or mark
// here means bumping SLIDES_SCHEMA_VERSION: y-tiptap deletes content an older schema cannot represent (F8).
//
// Deviations from the stock extensions, all schema-neutral:
// - Color / FontFamily / Highlight render `theme:*` values as CSS custom properties (./theme-css.ts), so theme
//   colours and fonts follow the deck theme inside the live editor too.
// - TextAlign and Highlight drop the shortcuts the browser shell reserves (Mod-Shift-R, Mod-Shift-H), as Docs does
//   (lib/docs/extensions/base-overrides.ts).
// - Mod-B runs the host's bold command first (`onBold`, see ./slide-text-sync.ts); the Bold mark itself is stock.
import { getSchema, type Extensions } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Color, FontFamily, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import type { Schema } from "@tiptap/pm/model";
import { StarterKit } from "@tiptap/starter-kit";
import type * as Y from "yjs";

import { DocTextAlign } from "@/lib/docs/extensions/base-overrides";
import { safeColor, safeFontCss, safeHref } from "@/lib/slides/model/safe-values";
import { SlideParagraphAttrs } from "@/lib/slides/text/paragraph-attrs";
import { SlideFontSize } from "@/lib/slides/text/slide-font-size";
import { SlideTextSync } from "@/lib/slides/text/slide-text-sync";
import { colorCss, colorFromCss, fontCss, fontFromCss } from "@/lib/slides/text/theme-css";

export interface SlideTextExtensionOptions {
  /** Prompt shown in an empty placeholder element ("Click to add title"); only placeholders pass one. */
  placeholder?: string;
  /** The fragment the editor binds; null or absent for headless use. */
  fragment?: Y.XmlFragment | null;
  onUndo?(): void;
  onRedo?(): void;
  onEscape?(): void;
  /** Mod-B: the toolbar's bold command; true when it ran (false or absent: the stock toggleBold). */
  onBold?(): boolean;
}

/** Stored colour of a mark attribute (hex or theme ref), or null. */
function markColor(value: unknown): string | null {
  return typeof value === "string" ? safeColor(colorFromCss(value)) : null;
}

/** Stored font of a mark attribute (theme ref or a safe stack), or null. */
function markFont(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const font = fontFromCss(value);
  return font === "theme:heading" || font === "theme:body" ? font : safeFontCss(font);
}

const SlideColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => markColor(element.style.color),
            renderHTML: (attributes) => {
              const color = markColor(attributes.color);
              return color === null ? {} : { style: `color: ${colorCss(color)}` };
            },
          },
        },
      },
    ];
  },
});

const SlideFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => markFont(element.style.fontFamily),
            renderHTML: (attributes) => {
              const font = markFont(attributes.fontFamily);
              return font === null ? {} : { style: `font-family: ${fontCss(font)}` };
            },
          },
        },
      },
    ];
  },
});

const SlideHighlight = Highlight.extend({
  addKeyboardShortcuts() {
    return {};
  },
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => markColor(element.getAttribute("data-color") ?? element.style.backgroundColor),
        renderHTML: (attributes) => {
          const color = markColor(attributes.color);
          return color === null ? {} : { "data-color": color, style: `background-color: ${colorCss(color)}; color: inherit` };
        },
      },
    };
  },
});

export function slideTextExtensions(opts: SlideTextExtensionOptions = {}): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      undoRedo: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["mailto"],
        isAllowedUri: (url) => safeHref(url) !== "",
      },
    }),
    TextStyle,
    SlideColor,
    SlideFontFamily,
    SlideFontSize,
    SlideHighlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    DocTextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right", "justify"] }),
    SlideParagraphAttrs,
    SlideTextSync.configure({
      fragment: opts.fragment ?? null,
      onUndo: opts.onUndo,
      onRedo: opts.onRedo,
      onEscape: opts.onEscape,
      onBold: opts.onBold,
    }),
  ];
  if (opts.placeholder !== undefined) {
    extensions.push(
      Placeholder.configure({
        placeholder: opts.placeholder,
        // The editor is pre-mounted read-only while its element is selected (§6.2): keep the prompt visible.
        showOnlyWhenEditable: false,
        includeChildren: true,
      }),
    );
  }
  return extensions;
}

let cachedSchema: Schema | null = null;

/** The ProseMirror schema of slide text, built once headlessly. */
export function slideTextSchema(): Schema {
  cachedSchema ??= getSchema(slideTextExtensions());
  return cachedSchema;
}
