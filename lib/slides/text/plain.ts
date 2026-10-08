// Plain-text views of slide text JSON (serializer, notes export, excerpts, emptiness checks). Pure: no schema, no
// Yjs, so unknown nodes from a newer client still contribute their text. Re-exported by ./fragment.ts.
// These views recurse, so they take text from a reader or sanitizeTextJson (nesting bounded by
// SLIDES_MAX_TEXT_DEPTH), never raw untrusted JSON.
import type { JSONContent } from "@tiptap/core";

/** The canonical empty text: one paragraph with no attributes (what a blank fragment is seeded with). */
export function blankTextJson(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * The first `max` code points of `text`, so a cap never splits a surrogate pair. A code point is at most two UTF-16
 * units, so only the first 2 × max units are split: a huge string costs no more than one at the cap.
 */
export function firstCodePoints(text: string, max: number): string[] {
  if (max <= 0) return [];
  return Array.from(text.length > max * 2 ? text.slice(0, max * 2) : text).slice(0, max);
}

function inlineText(node: JSONContent): string {
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function blockLines(node: JSONContent, out: string[]): void {
  switch (node.type) {
    case "paragraph":
      out.push(inlineText(node));
      return;
    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      const startAttr = node.attrs?.start;
      let n = typeof startAttr === "number" && Number.isFinite(startAttr) ? Math.floor(startAttr) : 1;
      for (const item of node.content ?? []) {
        const lines: string[] = [];
        for (const child of item.content ?? []) blockLines(child, lines);
        const marker = ordered ? `${n}. ` : "• ";
        n += 1;
        lines.forEach((line, i) => out.push(i === 0 ? `${marker}${line}` : `  ${line}`));
        if (lines.length === 0) out.push(marker.trimEnd());
      }
      return;
    }
    default:
      // doc, listItem and anything unknown: its blocks, or its inline text when it holds no blocks.
      if ((node.content ?? []).some((child) => child.type !== "text" && child.type !== "hardBreak")) {
        for (const child of node.content ?? []) blockLines(child, out);
      } else if (node.content?.length || typeof node.text === "string") {
        out.push(inlineText(node));
      }
  }
}

/** Paragraphs joined by "\n"; bullet items prefixed "• ", numbered items "1. ", "2. ", … */
export function textJsonToPlain(json: JSONContent | null | undefined): string {
  if (!json || typeof json !== "object") return "";
  const out: string[] = [];
  if (json.type === "doc") for (const child of json.content ?? []) blockLines(child, out);
  else blockLines(json, out);
  return out.join("\n");
}

/** True when the text holds no characters and no line breaks (placeholders show their prompt then). */
export function isEmptyText(json: JSONContent | null | undefined): boolean {
  if (!json || typeof json !== "object") return true;
  if (json.type === "text") return typeof json.text !== "string" || json.text.length === 0;
  if (json.type === "hardBreak") return false;
  return (json.content ?? []).every((child) => isEmptyText(child));
}
