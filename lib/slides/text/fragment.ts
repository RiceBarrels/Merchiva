// Slide text ⇄ Y.XmlFragment (slides.md §6.1). Every text fragment of a deck (text and shape elements, table
// cells, speaker notes) holds content in the slide text schema, written through here so it is always sanitized.
//
// Two kinds of fragment reach these helpers:
// - attached (part of a Y.Doc): written with y-tiptap's updateYFragment, a diff that keeps unchanged Y items, so
//   a concurrent edit elsewhere in the same text survives;
// - prelim (not yet in a doc, e.g. inside a map that build.ts is assembling): Yjs warns on any read of a prelim
//   type, so the content is built in a scratch doc and cloned in. A prelim fragment must be empty.
import type { JSONContent } from "@tiptap/core";
import { prosemirrorToYXmlFragment, updateYFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { SLIDES_MAX_TEXT_CHARS, SLIDES_MAX_TEXT_DEPTH } from "@/lib/slides/constants";
import { sanitizeTextJson } from "@/lib/slides/model/validate";
import { slideTextSchema } from "@/lib/slides/text/extensions";
import { blankTextJson, firstCodePoints } from "@/lib/slides/text/plain";

export { blankTextJson, isEmptyText, textJsonToPlain } from "@/lib/slides/text/plain";

/**
 * Seeds one attribute-less `<paragraph>`, yjs only. A blank text starts with it so that two people typing into it
 * at once edit the same paragraph (the same reason as lib/docs/blank-state.ts). No-op on an attached fragment that
 * already has content; a prelim fragment is assumed empty.
 */
export function seedBlankParagraph(fragment: Y.XmlFragment): void {
  if (fragment.doc !== null && fragment.length > 0) return;
  fragment.insert(0, [new Y.XmlElement("paragraph")]);
}

/** Replaces the fragment's content with `json` (sanitized first). Inside a transaction, joins it. */
export function writeTextJson(fragment: Y.XmlFragment, json: JSONContent): void {
  const node = slideTextSchema().nodeFromJSON(sanitizeTextJson(json));
  const doc = fragment.doc;
  if (doc !== null) {
    updateYFragment(doc, fragment, node, { mapping: new Map(), isOMark: new Map() });
    return;
  }
  const scratch = new Y.Doc();
  try {
    const attached = scratch.getXmlFragment("slides:text");
    prosemirrorToYXmlFragment(node, attached);
    // y-tiptap only writes elements and text; a hook can't occur, and is skipped if it ever does.
    const children = attached.toArray().filter((child): child is Y.XmlElement | Y.XmlText => !(child instanceof Y.XmlHook));
    fragment.insert(0, children.map((child) => child.clone()));
  } finally {
    scratch.destroy();
  }
}

/** A new prelim fragment holding `json`, for a map that is not in a doc yet. */
export function prelimTextFragment(json: JSONContent): Y.XmlFragment {
  const fragment = new Y.XmlFragment();
  writeTextJson(fragment, json);
  return fragment;
}

let markRankCache: Map<string, number> | null = null;

/** Mark name → its rank in the schema (the order ProseMirror keeps marks in). */
function markRank(): Map<string, number> {
  markRankCache ??= new Map(Object.keys(slideTextSchema().marks).map((name, i) => [name, i]));
  return markRankCache;
}

function sortMarks(node: JSONContent, rank: Map<string, number>): JSONContent {
  const out: JSONContent = { ...node };
  if (node.marks && node.marks.length > 1) {
    out.marks = [...node.marks].sort((a, b) => (rank.get(a.type) ?? rank.size) - (rank.get(b.type) ?? rank.size));
  }
  if (node.content) out.content = node.content.map((child) => sortMarks(child, rank));
  return out;
}

type XmlChild = Y.XmlElement | Y.XmlText | Y.XmlHook;

/**
 * Visits every node of the fragment in document order with an explicit stack (any editor can nest a fragment
 * arbitrarily deep, so it is never walked recursively). `depth` is 1 for the fragment's own children; `visit`
 * returns false to stop.
 */
function walkFragment(fragment: Y.XmlFragment, visit: (child: XmlChild, depth: number) => boolean): void {
  const stack: Array<{ items: XmlChild[]; i: number; depth: number }> = [{ items: fragment.toArray(), i: 0, depth: 1 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.i >= top.items.length) {
      stack.pop();
      continue;
    }
    const child = top.items[top.i++];
    if (!visit(child, top.depth)) return;
    if (child instanceof Y.XmlElement) stack.push({ items: child.toArray(), i: 0, depth: top.depth + 1 });
  }
}

/** The string inserts of a text node; `embeds` counts the rest (embedded objects or Y types, which are not text). */
function textInserts(text: Y.XmlText): { strings: string[]; embeds: number } {
  const ops: unknown = text.toDelta();
  const strings: string[] = [];
  let embeds = 0;
  for (const op of Array.isArray(ops) ? ops : []) {
    const insert: unknown = typeof op === "object" && op !== null ? (op as { insert?: unknown }).insert : undefined;
    if (typeof insert === "string") strings.push(insert);
    else embeds += 1;
  }
  return { strings, embeds };
}

/**
 * True when y-tiptap's (recursive) converter can take the fragment: nested no deeper than SLIDES_MAX_TEXT_DEPTH,
 * holding only elements and text (it throws on a Y.XmlHook), with text made of strings only.
 */
function isConvertible(fragment: Y.XmlFragment): boolean {
  let ok = true;
  walkFragment(fragment, (child, depth) => {
    if (child instanceof Y.XmlElement) ok = depth <= SLIDES_MAX_TEXT_DEPTH;
    else if (child instanceof Y.XmlText) ok = textInserts(child).embeds === 0;
    else ok = false;
    return ok;
  });
  return ok;
}

/** The fragment's text as plain paragraphs, one per text node, capped at SLIDES_MAX_TEXT_CHARS. */
function plainFragmentJson(fragment: Y.XmlFragment): JSONContent {
  const content: JSONContent[] = [];
  let left = SLIDES_MAX_TEXT_CHARS;
  walkFragment(fragment, (child) => {
    if (child instanceof Y.XmlText) {
      const chars = firstCodePoints(textInserts(child).strings.join(""), left);
      left -= chars.length;
      if (chars.length > 0) content.push({ type: "paragraph", content: [{ type: "text", text: chars.join("") }] });
    }
    return left > 0;
  });
  return content.length > 0 ? { type: "doc", content } : blankTextJson();
}

/**
 * The fragment as ProseMirror JSON, in the canonical shape sanitizeTextJson produces (marks in schema order).
 * Nothing is validated or dropped: text from a newer schema still comes through for the renderer to show as text.
 * Never throws: a fragment nested deeper than SLIDES_MAX_TEXT_DEPTH or holding something other than elements and
 * text (only a hostile or broken writer makes one) is read as its plain text instead.
 * The fragment must be attached to a doc.
 */
export function fragmentToJson(fragment: Y.XmlFragment): JSONContent {
  try {
    if (!isConvertible(fragment)) return plainFragmentJson(fragment);
    const json = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent;
    // Text directly in the fragment comes back as an array of text nodes; flatten it so `content` holds nodes.
    return sortMarks({ type: "doc", content: (json.content ?? []).flat() }, markRank());
  } catch {
    return blankTextJson();
  }
}
