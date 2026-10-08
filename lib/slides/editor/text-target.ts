// The live text of one element or table cell (slides.md §6.2): the Y.XmlFragment the slide text editor binds to.
// Read-only: a missing element, a wrong type or a missing cell is null, never created (only write ops create cells,
// R6), so pre-mounting an editor never writes.
import * as Y from "yjs";

import { SLIDES_ID_RE } from "@/lib/slides/constants";
import { deckMaps } from "@/lib/slides/model/read";
import { parseTableCellKey } from "@/lib/slides/model/sanitize-table";

/** The editor target key: the element id, or `${tableId}/${cellKey}` for a table cell (the awareness `edit` form). */
export function textTargetKey(elementId: string, cellKey?: string): string {
  return cellKey ? `${elementId}/${cellKey}` : elementId;
}

/** `map[key]` when both are Y.Maps (the key was validated by the caller). */
function childMap(map: unknown, key: string): Y.Map<unknown> | null {
  if (!(map instanceof Y.Map)) return null;
  const value: unknown = map.get(key);
  return value instanceof Y.Map ? value : null;
}

/** The text fragment of a text / shape element, or of the cell `cellKey` ("rowId:colId") of a table; else null. */
export function elementTextFragment(doc: Y.Doc, slideId: string, elementId: string, cellKey?: string): Y.XmlFragment | null {
  if (!SLIDES_ID_RE.test(slideId) || !SLIDES_ID_RE.test(elementId)) return null;
  const slide = childMap(deckMaps(doc).slides, slideId);
  const el = slide ? childMap(slide.get("elements"), elementId) : null;
  if (!el) return null;
  let owner: Y.Map<unknown> | null = el;
  const type: unknown = el.get("type");
  if (cellKey !== undefined) {
    if (type !== "table" || !parseTableCellKey(cellKey)) return null;
    owner = childMap(el.get("cells"), cellKey);
  } else if (type !== "text" && type !== "shape") {
    return null;
  }
  const text: unknown = owner?.get("text");
  return text instanceof Y.XmlFragment ? text : null;
}
