/**
 * Word lists are flat; HTML lists are not.
 *
 * A .docx has no `<ul>` element. Every list paragraph is a sibling of every other paragraph, tagged with a `w:numId`
 * (which list it belongs to) and a `w:ilvl` (how deep). Turning that back into nested `<ul>` / `<ol>` markup — with
 * the nested list *inside* the previous `<li>`, which is the only shape ProseMirror's list schema accepts — is this
 * module's whole job.
 *
 * A run of consecutive list paragraphs is collected by `paragraph.ts` and handed over in one go, so the state
 * machine is a pure function: entries in, HTML out, and the Bun tests can exercise every transition.
 */
import { attributes } from "./emit";
import type { ListFormat } from "./numbering";

export interface ListEntry {
  readonly kind: ListFormat;
  /** `w:ilvl`, 0-based. */
  readonly level: number;
  /** `w:numId` — a change at the same level starts a new list rather than continuing the old one. */
  readonly numId: number;
  /** `w:start` of the level; 1 (the default) is left off the `<ol>`. */
  readonly start: number;
  /** Task entries only. */
  readonly checked: boolean;
  /** The item's block content, already rendered and escaped. */
  readonly html: string;
}

interface OpenList {
  readonly level: number;
  readonly kind: ListFormat;
  readonly numId: number;
  readonly tag: "ul" | "ol";
}

function openTag(entry: ListEntry): { tag: "ul" | "ol"; html: string } {
  if (entry.kind === "task") {
    return { tag: "ul", html: '<ul data-type="taskList">' };
  }
  if (entry.kind === "bullet") return { tag: "ul", html: "<ul>" };
  const start = Number.isInteger(entry.start) && entry.start !== 1 ? String(entry.start) : null;
  return { tag: "ol", html: `<ol${attributes({ start })}>` };
}

function openItem(entry: ListEntry): string {
  if (entry.kind === "task") {
    return `<li${attributes({ "data-type": "taskItem", "data-checked": entry.checked ? "true" : "false" })}>`;
  }
  return "<li>";
}

/**
 * Consecutive list paragraphs → nested list markup.
 *
 * Rules, in the order they are applied to each entry:
 * - a shallower entry closes every list deeper than it, each closing its own `<li>` on the way out;
 * - a sibling entry (same level, same list) closes the open `<li>` and opens the next;
 * - a same-level entry from a different `w:numId`, or of a different kind, closes that list and starts a new one;
 * - a deeper entry opens a nested list inside the `<li>` that is still open.
 */
export function buildListHtml(entries: readonly ListEntry[]): string {
  if (entries.length === 0) return "";
  const stack: OpenList[] = [];
  let out = "";

  const closeTop = () => {
    const top = stack.pop();
    if (top) out += `</li></${top.tag}>`;
  };

  for (const entry of entries) {
    const level = Math.max(0, Math.trunc(entry.level));
    while (stack.length > 0 && stack[stack.length - 1].level > level) closeTop();

    const top = stack.length > 0 ? stack[stack.length - 1] : null;
    if (top && top.level === level) {
      if (top.kind === entry.kind && top.numId === entry.numId) {
        out += `</li>${openItem(entry)}`;
        out += entry.html;
        continue;
      }
      // Same depth, different list: close this one and open a sibling in the same place.
      closeTop();
    }

    const { tag, html } = openTag(entry);
    stack.push({ level, kind: entry.kind, numId: entry.numId, tag });
    out += html + openItem(entry) + entry.html;
  }

  while (stack.length > 0) closeTop();
  return out;
}
