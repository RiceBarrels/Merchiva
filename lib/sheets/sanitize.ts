// Neutralizes unsafe URLs in spreadsheet data before Univer sees it (sheets.md §4.3.1, §12.1). Op batches
// and snapshots are written by clients, so any editor could plant a `javascript:` link or an image that
// makes every viewer fetch a third-party URL. Every op (captured or received) passes sanitizeOpParams and
// every workbook passes sanitizeWorkbookData before adapter.load (initial load, reload, parked rebind,
// version preview, import).
//
// Rules, applied to every object reachable from the input (iteratively; depth ≤ 64):
// - image: an object with `source` and an `imageSourceType` (or a `drawingType`) whose source is not an
//   allowed upload-host URL or a small data:image URL gets `source = ""` (drawings, backgrounds, cell
//   rich-text drawings);
// - drawing data (the SHEET_DRAWING_PLUGIN resource and `sheet.mutation.set-drawing-apply`): every own
//   `source` is also judged on its value alone, whatever type sits beside it. The json1 `op` is walked by
//   path: an `i` written at a `source` key is judged the same way (Univer's own update ops replace just that
//   field), and a pick, drop or embedded edit at `source` / `imageSourceType` refuses the op (bad_shape);
// - doc-model images the renderer loads whatever their type (a text-fill `picture`, a document
//   `background`, a bullet `image`): an own `source` judged on its value alone;
// - rich-text link: `{ rangeType: 0, properties: { url } }` with an unsafe url gets `url = ""`;
// - the hyperlink-model payloads of the three hyperlink mutations, and every `payload` inside a
//   SHEET_HYPER_LINK_PLUGIN resource, get the same link rule;
// - resources (`wb.resources`, and any other `resources` array holding a named item): an item that is not
//   `{ name: string, data: string }` is dropped (Univer loads by name and skips it, so it would only hide
//   the list from these rules), the protection resources are removed (their UI is hidden and would lock a
//   sheet), a resource whose JSON does not parse is dropped, the others are walked and re-stringified only
//   when something changed.
// Unsafe values are replaced, never deleted, so the shape Univer expects is kept. Pure: no Univer runtime.

import type { IWorkbookData } from "@univerjs/presets";
import { SheetCodecError } from "./codec";
import { isAllowedImageUrl } from "./image-hosts";
import { CUSTOM_RANGE_HYPERLINK, IMAGE_SOURCE_TYPE, PROTECTION_RESOURCES, RESOURCE } from "./univer-constants";

export interface SanitizeReport {
  /** Links neutralized. */
  links: number;
  /** Image sources neutralized. */
  images: number;
  /**
   * Names of the resources removed (protection) or dropped (unparsable JSON, or not `{ name, data }`: its
   * string name, else "").
   */
  resources: string[];
}

export const SANITIZE_MAX_DEPTH = 64;
/**
 * Most objects that hold another object or array (branch objects) one call may visit. Objects holding only
 * primitives — nearly every cell — are still checked but not counted: their cost is bounded by their own
 * keys, and counting them would refuse a workbook within the import cell cap (2,000,000 cells).
 */
export const SANITIZE_MAX_NODES = 2_000_000;
/** Largest decoded data:image an image may embed. */
export const SHEET_IMAGE_DATA_MAX_BYTES = 2 * 1024 * 1024;

const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|gif|webp);base64,/;
const BASE64_BODY_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const INTERNAL_LINK_RE = /^#(?:gid|rangeid)=/;
const SAFE_LINK_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"]);

const DRAWING_APPLY_MUTATION = "sheet.mutation.set-drawing-apply";
/** Keys under which Univer's doc model holds an image as `{ source }` (text fill, document background, bullet). */
const DOC_IMAGE_HOLDERS: readonly string[] = ["picture", "background", "image"];
/** Drawing fields a json1 op may only insert at or remove: a move or an embedded edit there is refused. */
const DRAWING_IMAGE_FIELDS: ReadonlySet<string> = new Set(["source", "imageSourceType"]);
/** json1 component fields that move a value (pick / drop) or edit it in place (embedded type, string, number). */
const JSON1_MOVE_OR_EDIT: readonly string[] = ["p", "d", "e", "es", "ena"];

/** http:, https: and mailto: URLs, and in-workbook links (`#gid=…` sheet/range, `#rangeid=…` defined name). */
export function isSafeSheetLink(url: string): boolean {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (value.startsWith("#")) return INTERNAL_LINK_RE.test(value);
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function base64Bytes(body: string): number {
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

/** URL → allowed upload host; BASE64 → a png/jpeg/gif/webp data URL of at most 2 MiB; UUID or anything else → false. */
export function isAllowedImageSource(src: { source: unknown; imageSourceType: unknown }): boolean {
  if (typeof src.source !== "string") return false;
  if (src.imageSourceType === IMAGE_SOURCE_TYPE.URL) return isAllowedImageUrl(src.source);
  if (src.imageSourceType !== IMAGE_SOURCE_TYPE.BASE64) return false;
  const match = DATA_IMAGE_RE.exec(src.source);
  if (!match) return false;
  const body = src.source.slice(match[0].length);
  return BASE64_BODY_RE.test(body) && base64Bytes(body) <= SHEET_IMAGE_DATA_MAX_BYTES;
}

/**
 * An image source judged on its value alone: "", an allowed upload-host URL or a small data:image. For
 * sources whose type cannot be trusted (a json1 op can change `imageSourceType` separately) or is ignored
 * by the renderer. Univer turns every type into an image URL in the end, and each of these is safe as any.
 */
function isAllowedSourceValue(value: unknown): boolean {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  return isAllowedImageUrl(value) || isAllowedImageSource({ source: value, imageSourceType: IMAGE_SOURCE_TYPE.BASE64 });
}

// ── Walker ───────────────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

interface WalkState {
  report: SanitizeReport;
  nodes: number;
}

interface WalkOptions {
  /** Every `payload` is a hyperlink URL (SHEET_HYPER_LINK_PLUGIN data). */
  hyperlinkPayloads?: boolean;
  /** Drawing data: every own `source` is an image source, judged on its value alone. */
  drawingSources?: boolean;
  /** The root is a workbook: its `resources` is a resource list whatever its items look like. */
  workbookRoot?: boolean;
}

function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isRecord(value: unknown): value is JsonRecord {
  return isObjectLike(value) && !Array.isArray(value);
}

/** `holder[key] = ""` when it holds anything but "" or a safe link. */
function neutralizeLink(holder: JsonRecord, key: string, state: WalkState): boolean {
  if (!Object.hasOwn(holder, key)) return false;
  const value = holder[key];
  if (value === "" || (typeof value === "string" && isSafeSheetLink(value))) return false;
  holder[key] = "";
  state.report.links++;
  return true;
}

/** `holder.source = ""` when it has one that fails isAllowedSourceValue. */
function neutralizeSourceValue(holder: JsonRecord, state: WalkState): boolean {
  if (!Object.hasOwn(holder, "source") || isAllowedSourceValue(holder.source)) return false;
  holder.source = "";
  state.report.images++;
  return true;
}

function sanitizeNode(node: JsonRecord, state: WalkState, options: WalkOptions): boolean {
  let changed = false;
  if (Object.hasOwn(node, "source") && (Object.hasOwn(node, "imageSourceType") || Object.hasOwn(node, "drawingType"))) {
    const source = node.source;
    if (source !== "" && !(typeof source === "string" && isAllowedImageSource({ source, imageSourceType: node.imageSourceType }))) {
      node.source = "";
      state.report.images++;
      changed = true;
    }
  }
  if (options.drawingSources && neutralizeSourceValue(node, state)) changed = true;
  for (const key of DOC_IMAGE_HOLDERS) {
    const holder = Object.hasOwn(node, key) ? node[key] : undefined;
    if (isRecord(holder) && neutralizeSourceValue(holder, state)) changed = true;
  }
  if (node.rangeType === CUSTOM_RANGE_HYPERLINK && isRecord(node.properties)) {
    if (neutralizeLink(node.properties, "url", state)) changed = true;
  }
  if (options.hyperlinkPayloads && neutralizeLink(node, "payload", state)) changed = true;
  return changed;
}

function isResourceEntry(value: unknown): value is { name: string; data: string } & JsonRecord {
  return isRecord(value) && typeof value.name === "string" && typeof value.data === "string";
}

/** A nested `resources` array Univer would read as IResources: at least one item carries a string `name`. */
function isResourceList(value: unknown[]): boolean {
  return value.some((item) => isRecord(item) && typeof item.name === "string");
}

function sanitizeResources(list: unknown[], state: WalkState, depth: number): boolean {
  const kept: unknown[] = [];
  let changed = false;
  for (const entry of list) {
    if (!isResourceEntry(entry) || PROTECTION_RESOURCES.includes(entry.name)) {
      state.report.resources.push(isRecord(entry) && typeof entry.name === "string" ? entry.name : "");
      continue;
    }
    if (entry.data !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.data);
      } catch {
        state.report.resources.push(entry.name);
        continue;
      }
      const options: WalkOptions = {
        hyperlinkPayloads: entry.name === RESOURCE.HYPER_LINK,
        drawingSources: entry.name === RESOURCE.DRAWING,
      };
      if (walk(parsed, state, options, depth)) {
        entry.data = JSON.stringify(parsed);
        changed = true;
      }
    }
    kept.push(entry);
  }
  if (kept.length === list.length) return changed;
  list.length = 0;
  for (const entry of kept) list.push(entry);
  return true;
}

function tooComplex(message: string): SheetCodecError {
  return new SheetCodecError("bad_shape", message);
}

/**
 * Walks `root` in place. True when anything changed. `baseDepth` continues the depth count into the JSON
 * of a resource, so data nested through resources is bounded by the same cap.
 */
function walk(root: unknown, state: WalkState, options: WalkOptions, baseDepth = 0): boolean {
  if (!isObjectLike(root)) return false;
  let changed = false;
  const stack: Array<[object, number]> = [[root, baseDepth]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop() as [object, number];
    let branch = false;
    if (Array.isArray(node)) {
      for (const child of node) {
        if (!isObjectLike(child)) continue;
        if (depth + 1 > SANITIZE_MAX_DEPTH) throw tooComplex("Spreadsheet data is nested too deeply");
        branch = true;
        stack.push([child, depth + 1]);
      }
    } else {
      const record = node as JsonRecord;
      if (sanitizeNode(record, state, options)) changed = true;
      for (const key of Object.keys(record)) {
        const child = record[key];
        if (!isObjectLike(child)) continue;
        branch = true;
        if (key === "resources" && Array.isArray(child) && ((options.workbookRoot && node === root) || isResourceList(child))) {
          if (sanitizeResources(child, state, depth + 1)) changed = true;
          continue;
        }
        if (depth + 1 > SANITIZE_MAX_DEPTH) throw tooComplex("Spreadsheet data is nested too deeply");
        stack.push([child, depth + 1]);
      }
    }
    if (branch && ++state.nodes > SANITIZE_MAX_NODES) throw tooComplex("Spreadsheet data is too complex");
  }
  return changed;
}

// ── Drawing json1 ops ────────────────────────────────────────────────────────────────────────────

function sanitizeDrawingComponent(component: JsonRecord, key: string, state: WalkState): void {
  if (DRAWING_IMAGE_FIELDS.has(key) && JSON1_MOVE_OR_EDIT.some((field) => Object.hasOwn(component, field))) {
    throw new SheetCodecError("bad_shape", `A drawing edit moves or edits its ${key}`);
  }
  if (key === "source" && Object.hasOwn(component, "i") && !isAllowedSourceValue(component.i)) {
    component.i = "";
    state.report.images++;
  }
}

/**
 * The path rules of a `set-drawing-apply` json1 op. In ot-json1 a descent is a list of keys and
 * components (a component applies at the key before it; keys may follow it) and then child descents, each
 * continuing the path. Only the key a component sits at matters here.
 */
function sanitizeDrawingOp(op: unknown, state: WalkState): void {
  if (!Array.isArray(op)) return;
  const stack: Array<[unknown[], unknown, number]> = [[op, undefined, 0]];
  let descents = 0;
  while (stack.length > 0) {
    const [descent, parentKey, depth] = stack.pop() as [unknown[], unknown, number];
    if (++descents > SANITIZE_MAX_NODES) throw tooComplex("Spreadsheet data is too complex");
    let key = parentKey;
    for (const item of descent) {
      if (typeof item === "string" || typeof item === "number") {
        key = item;
      } else if (Array.isArray(item)) {
        if (depth + 1 > SANITIZE_MAX_DEPTH) throw tooComplex("Spreadsheet data is nested too deeply");
        stack.push([item, key, depth + 1]);
      } else if (isRecord(item) && typeof key === "string") {
        sanitizeDrawingComponent(item, key, state);
      }
    }
  }
}

// ── Entry points ─────────────────────────────────────────────────────────────────────────────────

function newState(report: SanitizeReport | undefined): WalkState {
  return { report: report ?? { links: 0, images: 0, resources: [] }, nodes: 0 };
}

/** The hyperlink-model URL each hyperlink mutation carries outside rich text (a Map: ids are untrusted). */
const HYPERLINK_PARAM_PATHS: ReadonlyMap<string, readonly string[]> = new Map([
  ["sheets.mutation.add-hyper-link", ["link", "payload"]],
  ["sheets.mutation.update-hyper-link", ["payload", "payload"]],
  ["sheets.mutation.update-rich-hyper-link", ["url"]],
]);

/**
 * Sanitizes one mutation's params in place. Throws SheetCodecError("bad_shape") past the depth/node caps,
 * and for a drawing op that moves or edits a drawing's `source` / `imageSourceType` in place: the op is
 * refused, never applied.
 */
export function sanitizeOpParams(mutationId: string, params: Record<string, unknown>, report?: SanitizeReport): void {
  const state = newState(report);
  const path = HYPERLINK_PARAM_PATHS.get(mutationId);
  if (path) {
    let holder: unknown = params;
    for (const key of path.slice(0, -1)) holder = isRecord(holder) ? holder[key] : undefined;
    if (isRecord(holder)) neutralizeLink(holder, path[path.length - 1], state);
  }
  const drawing = mutationId === DRAWING_APPLY_MUTATION;
  walk(params, state, { drawingSources: drawing });
  if (drawing) sanitizeDrawingOp(params.op, state);
}

/** Sanitizes a whole workbook in place and returns it. Throws SheetCodecError("bad_shape") past the caps. */
export function sanitizeWorkbookData(wb: IWorkbookData, report?: SanitizeReport): IWorkbookData {
  walk(wb, newState(report), { workbookRoot: true });
  return wb;
}
