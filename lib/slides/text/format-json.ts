// Formatting applied to whole text elements (slides.md §6.2): when elements are selected but none is being edited,
// the toolbar and the phone format bar rewrite each selected element's text JSON with these and commit it through
// setElementText (which sanitizes). Pure JSON in, JSON out; nothing here touches Yjs or an editor.
import type { JSONContent } from "@tiptap/core";

export type SimpleMark = "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript";
export type AttrMark = "textStyle" | "highlight" | "link";
export type ListKind = "bullet" | "ordered" | "none";
export type ParagraphAttr = "textAlign" | "dir" | "lineHeight" | "spaceBefore" | "spaceAfter";

type Marks = NonNullable<JSONContent["marks"]>;

const EXCLUSIVE: Partial<Record<SimpleMark, SimpleMark>> = { subscript: "superscript", superscript: "subscript" };

function mapTextNodes(node: JSONContent, fn: (text: JSONContent) => JSONContent): JSONContent {
  if (node.type === "text") return fn(node);
  if (!node.content) return node;
  return { ...node, content: node.content.map((child) => mapTextNodes(child, fn)) };
}

function mapParagraphs(node: JSONContent, fn: (paragraph: JSONContent) => JSONContent): JSONContent {
  if (node.type === "paragraph") return fn(node);
  if (!node.content) return node;
  return { ...node, content: node.content.map((child) => mapParagraphs(child, fn)) };
}

function textNodes(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  if (node.type === "text" && typeof node.text === "string" && node.text.length > 0) out.push(node);
  for (const child of node.content ?? []) textNodes(child, out);
  return out;
}

function withMarks(text: JSONContent, marks: Marks): JSONContent {
  const out: JSONContent = { ...text };
  delete out.marks;
  return marks.length > 0 ? { ...out, marks } : out;
}

/** True when every non-empty text node carries `mark` (false for text with no characters). */
export function hasMarkEverywhere(json: JSONContent, mark: SimpleMark | AttrMark): boolean {
  const nodes = textNodes(json);
  return nodes.length > 0 && nodes.every((node) => (node.marks ?? []).some((m) => m.type === mark));
}

/**
 * Adds or removes `mark` on every text node.
 * - Simple marks toggle by default: added unless every text node already has it (subscript and superscript
 *   exclude each other).
 * - `textStyle` merges `attrs` into the existing mark (a null value clears that attribute; the mark goes when
 *   all are null). `highlight` / `link` replace their attrs; `attrs: null` removes the mark.
 */
export function applyMarkToAll(
  json: JSONContent,
  mark: SimpleMark | AttrMark,
  attrs?: Record<string, unknown> | null,
  on?: boolean,
): JSONContent {
  if (mark === "textStyle" || mark === "highlight" || mark === "link") {
    return mapTextNodes(json, (text) => {
      const others = (text.marks ?? []).filter((m) => m.type !== mark);
      if (attrs === null || attrs === undefined || on === false) return withMarks(text, others);
      const current = (text.marks ?? []).find((m) => m.type === mark)?.attrs ?? {};
      const merged = mark === "textStyle" ? { ...current, ...attrs } : { ...attrs };
      const keep = Object.values(merged).some((v) => v !== null && v !== undefined);
      return withMarks(text, keep ? [...others, { type: mark, attrs: merged }] : others);
    });
  }
  const add = on ?? !hasMarkEverywhere(json, mark);
  const excluded = EXCLUSIVE[mark];
  return mapTextNodes(json, (text) => {
    const others = (text.marks ?? []).filter((m) => m.type !== mark && (!add || m.type !== excluded));
    return withMarks(text, add ? [...others, { type: mark }] : others);
  });
}

/** Sets one paragraph attribute on every paragraph (null clears it). */
export function setParagraphAttrAll(json: JSONContent, attr: ParagraphAttr, value: string | number | null): JSONContent {
  return mapParagraphs(json, (paragraph) => ({ ...paragraph, attrs: { ...(paragraph.attrs ?? {}), [attr]: value } }));
}

export function setAlignAll(json: JSONContent, align: "left" | "center" | "right" | "justify" | null): JSONContent {
  return setParagraphAttrAll(json, "textAlign", align);
}

/** Sets the font size (pt) on every text node; null clears it back to the element default. */
export function setFontSizeAll(json: JSONContent, pt: number | null): JSONContent {
  return applyMarkToAll(json, "textStyle", { fontSize: pt });
}

/** Steps every run's size to the next size in `steps` (runs without a size start from `baseSize`). */
export function stepFontSizeAll(json: JSONContent, dir: 1 | -1, baseSize: number, steps: readonly number[]): JSONContent {
  return mapTextNodes(json, (text) => {
    const style = (text.marks ?? []).find((m) => m.type === "textStyle");
    const size = typeof style?.attrs?.fontSize === "number" ? style.attrs.fontSize : baseSize;
    const next = dir > 0 ? steps.find((s) => s > size) ?? steps[steps.length - 1] : [...steps].reverse().find((s) => s < size) ?? steps[0];
    const others = (text.marks ?? []).filter((m) => m.type !== "textStyle");
    return withMarks(text, [...others, { type: "textStyle", attrs: { ...(style?.attrs ?? {}), fontSize: next } }]);
  });
}

/** Removes every mark and every paragraph attribute except the text direction. */
export function clearFormattingAll(json: JSONContent): JSONContent {
  const bare = mapTextNodes(json, (text) => withMarks(text, []));
  return mapParagraphs(bare, (paragraph) => {
    const dir = paragraph.attrs?.dir;
    const out: JSONContent = { ...paragraph };
    delete out.attrs;
    return dir === "ltr" || dir === "rtl" ? { ...out, attrs: { dir } } : out;
  });
}

/** Every paragraph of the text, lists flattened, in reading order. */
function flatParagraphs(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  if (node.type === "paragraph") out.push(node);
  else for (const child of node.content ?? []) flatParagraphs(child, out);
  return out;
}

/**
 * Turns every paragraph into a bullet or numbered list, or back into plain paragraphs. Asking for the kind every
 * block already has removes the list (toggle).
 */
export function toggleListAll(json: JSONContent, list: ListKind): JSONContent {
  const blocks = json.content ?? [];
  const type = list === "bullet" ? "bulletList" : list === "ordered" ? "orderedList" : null;
  const already = type !== null && blocks.length > 0 && blocks.every((block) => block.type === type);
  const paragraphs = flatParagraphs(json);
  const content = paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }];
  if (type === null || already) return { type: "doc", content };
  return { type: "doc", content: [{ type, content: content.map((paragraph) => ({ type: "listItem", content: [paragraph] })) }] };
}
