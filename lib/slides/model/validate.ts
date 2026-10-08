// The single choke point for untrusted slide content (slides.md §4.2): clipboard, import, remote rows, version
// state. Every writer (build, ops, paste, the import mapper, apply-snapshot) passes its elements through
// sanitizeElement and its text through sanitizeTextJson, so nothing schema-invalid is ever written and y-tiptap
// can never delete content we wrote (F8).
//
// sanitizeTextJson returns the CANONICAL text JSON: the exact shape fragmentToJson reads back after a write
// (node attrs only when non-null, `content` only when non-empty, marks with their full attrs in schema order).
// That makes build → read round trips deep-equal.
import type { JSONContent } from "@tiptap/core";
import type { Mark, Node as PMNode, Schema } from "@tiptap/pm/model";

import {
  SLIDES_COORD_LIMIT, SLIDES_ID_RE, SLIDES_MAX_TEXT_CHARS, SLIDES_MAX_TEXT_DEPTH, SLIDES_MAX_TEXT_NODES,
} from "@/lib/slides/constants";
import { DEFAULT_STROKE } from "@/lib/slides/model/defaults";
import { isOrderKey } from "@/lib/slides/model/fractional-index";
import {
  asRecord, bool, oneOf, sanitizeChart, sanitizeFill, sanitizeFontRef, sanitizeGeom, sanitizeShadow, sanitizeStroke,
  sanitizeTextBox, sanitizeTextDefaults,
} from "@/lib/slides/model/sanitize-parts";
import { clampCoord, clampNumber, cleanLabel, normalizeRotation, safeColor, safeHref, safeImageSrc } from "@/lib/slides/model/safe-values";
import { sanitizeTable } from "@/lib/slides/model/sanitize-table";
import type { PlaceholderRole, SlideElement } from "@/lib/slides/model/types";
import { slideTextSchema } from "@/lib/slides/text/extensions";
import { paragraphDir, paragraphLineHeight, paragraphSpace } from "@/lib/slides/text/paragraph-attrs";
import { blankTextJson, firstCodePoints, textJsonToPlain } from "@/lib/slides/text/plain";
import { slideFontSizePt } from "@/lib/slides/text/slide-font-size";

export { clampCoord, safeColor, safeFontCss, safeHref, safeImageSrc } from "@/lib/slides/model/safe-values";

const ROLES: readonly PlaceholderRole[] = ["", "title", "subtitle", "body"];
const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
const LIST_TYPES = ["1", "a", "A", "i", "I"] as const;
const MAX_LIST_DEPTH = 8;
const PLAIN_MARKS = new Set(["bold", "italic", "strike", "underline", "subscript", "superscript"]);
const SCRIPT_RIVAL: Readonly<Record<string, string>> = { subscript: "superscript", superscript: "subscript" };

/**
 * What is left for one text: code points, and nodes. Every node looked at (and every paragraph made to hold loose
 * inline content) costs one node, so empty paragraphs, hard breaks and shared subtrees can grow neither the result
 * nor the work without bound.
 */
type Budget = { chars: number; nodes: number };
type Json = Record<string, unknown>;

/** `value` when it is one of `allowed`, else null. */
function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Text

function cleanMarks(raw: unknown, schema: Schema): Mark[] {
  if (!Array.isArray(raw)) return [];
  let set: readonly Mark[] = [];
  for (const entry of raw) {
    const m = asRecord(entry);
    const type = m && typeof m.type === "string" ? schema.marks[m.type] : undefined;
    if (!m || !type) continue;
    const attrs = asRecord(m.attrs) ?? {};
    let mark: Mark | null = null;
    if (PLAIN_MARKS.has(type.name)) mark = type.create();
    else if (type.name === "link") {
      const href = typeof attrs.href === "string" ? safeHref(attrs.href) : "";
      if (href !== "") mark = type.create({ href });
    } else if (type.name === "textStyle") {
      const clean = { color: safeColor(attrs.color), fontFamily: sanitizeFontRef(attrs.fontFamily), fontSize: slideFontSizePt(attrs.fontSize) };
      if (clean.color !== null || clean.fontFamily !== null || clean.fontSize !== null) mark = type.create(clean);
    } else if (type.name === "highlight") mark = type.create({ color: safeColor(attrs.color) });
    if (!mark) continue;
    // Subscript and superscript exclude each other (the editor's toggle commands behave the same way).
    const rival = SCRIPT_RIVAL[type.name];
    if (rival) set = set.filter((m) => m.type.name !== rival);
    set = mark.addToSet(set);
  }
  return [...set];
}

/** Takes one node from the budget; false once it is spent (the rest of the text is dropped). */
function spend(budget: Budget): boolean {
  if (budget.nodes <= 0) return false;
  budget.nodes -= 1;
  return true;
}

/** Up to budget.chars code points of `text`, taken from the budget. */
function takeChars(text: string, budget: Budget): string {
  const chars = firstCodePoints(text, budget.chars);
  budget.chars -= chars.length;
  return chars.join("");
}

/**
 * The text inside `nodes`, collected with an explicit stack instead of recursion: for content nested deeper than
 * SLIDES_MAX_TEXT_DEPTH, which keeps its text but loses its structure and marks.
 */
function flatText(nodes: unknown, budget: Budget): string {
  const parts: string[] = [];
  const stack: Array<{ list: unknown[]; i: number }> = Array.isArray(nodes) ? [{ list: nodes, i: 0 }] : [];
  while (stack.length > 0 && budget.chars > 0) {
    const top = stack[stack.length - 1];
    if (top.i >= top.list.length) {
      stack.pop();
      continue;
    }
    const node = asRecord(top.list[top.i++]);
    if (!node) continue;
    if (!spend(budget)) break;
    if (typeof node.text === "string") parts.push(takeChars(node.text, budget));
    else if (Array.isArray(node.content)) stack.push({ list: node.content, i: 0 });
  }
  return parts.join("");
}

function cleanInline(nodes: unknown, schema: Schema, budget: Budget, depth: number, out: Json[] = []): Json[] {
  if (!Array.isArray(nodes)) return out;
  for (const raw of nodes) {
    const node = asRecord(raw);
    if (!node) continue;
    if (!spend(budget)) break;
    if (typeof node.text === "string" && (node.type === "text" || !Array.isArray(node.content))) {
      const text = takeChars(node.text, budget);
      if (text === "") continue;
      const marks = cleanMarks(node.marks, schema);
      out.push(marks.length > 0 ? { type: "text", text, marks: marks.map((m) => m.toJSON()) } : { type: "text", text });
    } else if (node.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (depth < SLIDES_MAX_TEXT_DEPTH) {
      cleanInline(node.content, schema, budget, depth + 1, out); // unknown inline or misplaced block: keep its text
    } else {
      const text = flatText(node.content, budget);
      if (text !== "") out.push({ type: "text", text });
    }
  }
  return out;
}

function cleanParagraph(node: Json, schema: Schema, budget: Budget, depth: number): Json {
  const attrs = asRecord(node.attrs) ?? {};
  const clean: Json = {
    textAlign: pick(attrs.textAlign, TEXT_ALIGNS),
    dir: paragraphDir(attrs.dir),
    spaceBefore: paragraphSpace(attrs.spaceBefore),
    spaceAfter: paragraphSpace(attrs.spaceAfter),
    lineHeight: paragraphLineHeight(attrs.lineHeight),
  };
  const content = cleanInline(node.content, schema, budget, depth + 1);
  return { type: "paragraph", attrs: clean, ...(content.length > 0 ? { content } : {}) };
}

/**
 * `depth` counts nesting of any kind (lists and unwrapped unknown nodes). Lists stop nesting at MAX_LIST_DEPTH;
 * past SLIDES_MAX_TEXT_DEPTH an unknown node becomes one paragraph of its text, collected without recursion.
 */
function cleanBlocks(nodes: unknown, schema: Schema, budget: Budget, depth: number): Json[] {
  if (!Array.isArray(nodes)) return [];
  const out: Json[] = [];
  let pendingInline: unknown[] = [];
  const flushInline = () => {
    if (pendingInline.length > 0 && spend(budget)) out.push(cleanParagraph({ content: pendingInline }, schema, budget, depth));
    pendingInline = [];
  };
  for (const raw of nodes) {
    if (budget.nodes <= 0) break;
    const node = asRecord(raw);
    if (!node) continue;
    const type = node.type;
    if (type === "text" || type === "hardBreak" || (typeof node.text === "string" && !Array.isArray(node.content))) {
      pendingInline.push(node); // paid for when cleanInline looks at it
      continue;
    }
    flushInline();
    if (!spend(budget)) break;
    if (type === "paragraph") out.push(cleanParagraph(node, schema, budget, depth));
    else if ((type === "bulletList" || type === "orderedList") && depth < MAX_LIST_DEPTH) {
      const items: Json[] = [];
      for (const item of Array.isArray(node.content) ? node.content : []) {
        if (!spend(budget)) break;
        const blocks = cleanBlocks(asRecord(item)?.content, schema, budget, depth + 1);
        if (blocks.length === 0 || blocks[0].type !== "paragraph") blocks.unshift({ type: "paragraph" });
        items.push({ type: "listItem", content: blocks });
      }
      if (items.length === 0) continue;
      const attrs = asRecord(node.attrs) ?? {};
      if (type === "bulletList") out.push({ type, content: items });
      else {
        const start = Math.round(clampNumber(attrs.start, 1, 9999, 1));
        out.push({ type, attrs: { start, type: pick(attrs.type, LIST_TYPES) }, content: items });
      }
    } else if (depth + 1 >= SLIDES_MAX_TEXT_DEPTH) {
      // Nested too deep to walk recursively: its text as one paragraph.
      const text = flatText(node.content, budget);
      out.push(text === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text }] });
    } else {
      // listItem out of place, a too-deep list, or a node from a newer schema: keep what is inside.
      const children = Array.isArray(node.content) ? node.content : [];
      const hasBlocks = children.some((c) => {
        const child = asRecord(c);
        return child !== null && child.type !== "text" && child.type !== "hardBreak" && typeof child.text !== "string";
      });
      if (hasBlocks) for (const block of cleanBlocks(children, schema, budget, depth + 1)) out.push(block);
      else if (children.length > 0) out.push(cleanParagraph({ content: children }, schema, budget, depth));
    }
  }
  flushInline();
  return out;
}

/** Canonical JSON of a node: attrs only when non-null, content only when non-empty, marks with full attrs. */
export function canonicalNodeJson(node: PMNode): JSONContent {
  if (node.isText) {
    const text: JSONContent = { type: "text", text: node.text ?? "" };
    if (node.marks.length > 0) text.marks = node.marks.map((m) => ({ type: m.type.name, attrs: { ...m.attrs } }));
    return text;
  }
  const out: JSONContent = { type: node.type.name };
  const attrs = Object.fromEntries(Object.entries(node.attrs).filter(([, v]) => v !== null && v !== undefined));
  if (Object.keys(attrs).length > 0) out.attrs = attrs;
  if (node.childCount > 0) {
    const content: JSONContent[] = [];
    node.forEach((child) => content.push(canonicalNodeJson(child)));
    out.content = content;
  }
  return out;
}

/** The cleaned doc as plain paragraphs (its nesting is already bounded, so the recursive plain view is safe). */
function plainFallback(doc: JSONContent): JSONContent {
  const lines = textJsonToPlain(doc).slice(0, SLIDES_MAX_TEXT_CHARS).split("\n");
  return { type: "doc", content: lines.map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })) };
}

/**
 * Untrusted text JSON → canonical, schema-valid slide text: unknown nodes are unwrapped to their text, unknown
 * marks and attributes dropped, unsafe links removed, text capped at SLIDES_MAX_TEXT_CHARS and SLIDES_MAX_TEXT_NODES,
 * nesting past SLIDES_MAX_TEXT_DEPTH flattened to its text, and the result checked with
 * `schema.nodeFromJSON(...).check()`. Never throws; garbage becomes one empty paragraph.
 */
export function sanitizeTextJson(json: unknown): JSONContent {
  try {
    const schema = slideTextSchema();
    const root = asRecord(json);
    if (!root) return blankTextJson();
    const budget: Budget = { chars: SLIDES_MAX_TEXT_CHARS, nodes: SLIDES_MAX_TEXT_NODES };
    const blocks = cleanBlocks(root.type === "doc" ? root.content : [root], schema, budget, 0);
    const doc: JSONContent = { type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] };
    try {
      const node = schema.nodeFromJSON(doc);
      node.check();
      return canonicalNodeJson(node);
    } catch {
      return plainFallback(doc);
    }
  } catch {
    return blankTextJson();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Elements

type TextSanitizer = (json: unknown) => JSONContent;

function boxFields(r: Json) {
  return {
    x: clampCoord(r.x, 0),
    y: clampCoord(r.y, 0),
    w: clampNumber(r.w, 0, SLIDES_COORD_LIMIT, 0),
    h: clampNumber(r.h, 0, SLIDES_COORD_LIMIT, 0),
    rot: normalizeRotation(r.rot),
  };
}

function crop(raw: unknown): { l: number; t: number; r: number; b: number } {
  const c = asRecord(raw) ?? {};
  const side = (v: unknown) => clampNumber(v, 0, 0.99, 0);
  const out = { l: side(c.l), t: side(c.t), r: side(c.r), b: side(c.b) };
  return out.l + out.r < 1 && out.t + out.b < 1 ? out : { l: 0, t: 0, r: 0, b: 0 };
}

/**
 * sanitizeElement with the text handled by `text` (readers pass a non-destructive canonicalizer so content from a
 * newer schema still renders as text; writers pass sanitizeTextJson).
 */
export function sanitizeElementWith(raw: unknown, text: TextSanitizer): SlideElement | null {
  const r = asRecord(raw);
  if (!r || typeof r.id !== "string" || !SLIDES_ID_RE.test(r.id)) return null;
  const base = {
    id: r.id,
    z: isOrderKey(r.z) ? r.z : "",
    locked: bool(r.locked),
    name: cleanLabel(r.name, 200),
    link: typeof r.link === "string" ? safeHref(r.link) : "",
    placeholder: oneOf(r.placeholder, ROLES, ""),
  };
  switch (r.type) {
    case "text":
    case "shape":
      return {
        ...base,
        ...boxFields(r),
        type: r.type,
        geom: sanitizeGeom(r.geom),
        fill: sanitizeFill(r.fill) ?? { t: "none" },
        stroke: sanitizeStroke(r.stroke),
        shadow: sanitizeShadow(r.shadow),
        box: sanitizeTextBox(r.box),
        textStyle: sanitizeTextDefaults(r.textStyle),
        flipH: bool(r.flipH),
        flipV: bool(r.flipV),
        text: text(r.text),
      };
    case "line":
      return {
        ...base,
        type: "line",
        x1: clampCoord(r.x1, 0),
        y1: clampCoord(r.y1, 0),
        x2: clampCoord(r.x2, 0),
        y2: clampCoord(r.y2, 0),
        stroke: sanitizeStroke(r.stroke) ?? { ...DEFAULT_STROKE },
      };
    case "image":
      return {
        ...base,
        ...boxFields(r),
        type: "image",
        src: typeof r.src === "string" ? safeImageSrc(r.src) : "",
        crop: crop(r.crop),
        mask: oneOf(r.mask, ["", "ellipse", "roundRect"] as const, ""),
        alt: cleanLabel(r.alt, 1000),
        stroke: sanitizeStroke(r.stroke),
        flipH: bool(r.flipH),
        flipV: bool(r.flipV),
      };
    case "table": {
      const table = sanitizeTable(r, text);
      return table && { ...base, ...boxFields(r), type: "table", ...table };
    }
    case "chart":
      return { ...base, ...boxFields(r), type: "chart", chart: sanitizeChart(r.chart) };
    default:
      return null;
  }
}

/** Full structural validation of an untrusted element; null when it is not one (bad id or unknown type). */
export function sanitizeElement(raw: unknown): SlideElement | null {
  return sanitizeElementWith(raw, sanitizeTextJson);
}
