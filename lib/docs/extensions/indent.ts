/**
 * Indent (docs-editor-ui spec §2.3): the three block indents Word has — left, right and first line — on paragraphs
 * and headings, in steps of 0.5in so Tab and the ruler agree on where a stop is. Left and right render as
 * `margin-inline-*` so they mirror in RTL; the first line renders as `text-indent` (negative = hanging).
 *
 * Steps may be fractional (the ruler drags in 1/8in = 0.25 steps); Tab / Shift-Tab still move whole stops, the way
 * Word snaps to the next one. Inside lists, indent/outdent sink/lift the list item instead.
 *
 * `parseHTML` also reads plain `margin-left` / `margin-right` / `text-indent`, so an imported `.docx` keeps its
 * indents without needing our own `data-` attributes.
 *
 * Tab / Shift-Tab indent only while the editor is editable and outside tables (TableKit moves between cells).
 * Escape (handled by the editor's document shortcuts) blurs the editor so keyboard users can Tab out.
 */
import { Extension, type Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

import { parseCssLengthIn } from "@/lib/docs/page-setup";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      /** Sets one of the three indents on the selected blocks, in 0.5in steps. */
      setBlockIndent: (which: "left" | "right" | "first", steps: number) => ReturnType;
    };
  }
}

export interface IndentOptions {
  types: string[];
  max: number;
}

/** One indent step, inches. */
export const INDENT_STEP_IN = 0.5;
/** The ruler drags in eighths of an inch. */
export const INDENT_SNAP = 0.25;

export type IndentSide = "left" | "right" | "first";

export const INDENT_ATTR: Readonly<Record<IndentSide, string>> = {
  left: "indent",
  right: "indentRight",
  first: "indentFirst",
};

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Snaps a raw step count to the ruler grid and clamps it. First-line indents may hang (negative). */
export function clampIndent(value: unknown, max: number, side: IndentSide): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const snapped = Math.round(n / INDENT_SNAP) * INDENT_SNAP;
  return round(Math.max(side === "first" ? -max : 0, Math.min(max, snapped)));
}

function parseSteps(element: HTMLElement, side: IndentSide, max: number): number {
  const raw = element.getAttribute(`data-${side === "left" ? "indent" : side === "right" ? "indent-right" : "indent-first"}`);
  if (raw !== null) return clampIndent(Number(raw), max, side);
  const css =
    side === "left"
      ? element.style.marginInlineStart || element.style.marginLeft
      : side === "right"
        ? element.style.marginInlineEnd || element.style.marginRight
        : element.style.textIndent;
  const inches = parseCssLengthIn(css);
  return inches === null ? 0 : clampIndent(inches / INDENT_STEP_IN, max, side);
}

function inList(editor: Editor): "taskItem" | "listItem" | null {
  if (editor.isActive("taskItem")) return "taskItem";
  if (editor.isActive("listItem")) return "listItem";
  return null;
}

/** Tab lands on the next whole stop, the way Word does from a dragged indent (0.3in → 0.5in). */
function nextStop(current: number, delta: 1 | -1, max: number): number {
  const next = delta > 0 ? Math.floor(current + 1e-6) + 1 : Math.ceil(current - 1e-6) - 1;
  return Math.max(0, Math.min(max, next));
}

function shiftIndent(tr: Transaction, types: readonly string[], max: number, delta: 1 | -1, apply: boolean): boolean {
  const { from, to } = tr.selection;
  let changed = false;
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!types.includes(node.type.name)) return true;
    const current = Number(node.attrs.indent) || 0;
    const next = nextStop(current, delta, max);
    if (next !== current) {
      changed = true;
      if (apply) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
    }
    return false;
  });
  return changed;
}

function setIndent(tr: Transaction, types: readonly string[], max: number, side: IndentSide, steps: number, apply: boolean): boolean {
  const { from, to } = tr.selection;
  const value = clampIndent(steps, max, side);
  const key = INDENT_ATTR[side];
  let changed = false;
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!types.includes(node.type.name)) return true;
    if ((Number(node.attrs[key]) || 0) !== value) {
      changed = true;
      if (apply) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: value });
    }
    return false;
  });
  return changed;
}

export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  // Lower than lists and tables so their Tab handling runs first.
  priority: 50,

  addOptions() {
    return { types: ["paragraph", "heading"], max: 8 };
  },

  addGlobalAttributes() {
    const max = this.options.max;
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => parseSteps(element, "left", max),
            renderHTML: (attributes) => {
              const steps = clampIndent(attributes.indent, max, "left");
              return steps > 0
                ? { "data-indent": String(steps), style: `margin-inline-start: calc(${steps} * ${INDENT_STEP_IN}in)` }
                : {};
            },
          },
          indentRight: {
            default: 0,
            parseHTML: (element) => parseSteps(element, "right", max),
            renderHTML: (attributes) => {
              const steps = clampIndent(attributes.indentRight, max, "right");
              return steps > 0
                ? { "data-indent-right": String(steps), style: `margin-inline-end: calc(${steps} * ${INDENT_STEP_IN}in)` }
                : {};
            },
          },
          indentFirst: {
            default: 0,
            parseHTML: (element) => parseSteps(element, "first", max),
            renderHTML: (attributes) => {
              const steps = clampIndent(attributes.indentFirst, max, "first");
              return steps !== 0
                ? { "data-indent-first": String(steps), style: `text-indent: calc(${steps} * ${INDENT_STEP_IN}in)` }
                : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, tr, dispatch, commands }) => {
          const list = inList(editor);
          if (list) return commands.sinkListItem(list);
          return shiftIndent(tr, this.options.types, this.options.max, 1, !!dispatch);
        },
      outdent:
        () =>
        ({ editor, tr, dispatch, commands }) => {
          const list = inList(editor);
          if (list) return commands.liftListItem(list);
          return shiftIndent(tr, this.options.types, this.options.max, -1, !!dispatch);
        },
      setBlockIndent:
        (which, steps) =>
        ({ tr, dispatch }) =>
          setIndent(tr, this.options.types, this.options.max, which, steps, !!dispatch),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (!this.editor.isEditable || this.editor.isActive("table")) return false;
        this.editor.commands.indent();
        // Consume Tab even at the maximum so focus doesn't jump out mid-edit (Esc releases focus).
        return true;
      },
      "Shift-Tab": () => {
        if (!this.editor.isEditable || this.editor.isActive("table")) return false;
        this.editor.commands.outdent();
        return true;
      },
    };
  },
});
