/**
 * Comment anchors: where a thread sits in the document (lead decision L2).
 *
 * Two kinds, treated the same everywhere a thread is shown:
 * - **Mark anchors.** The `comment` mark, written by members who can edit. It is document content and moves with the text.
 * - **Position anchors.** Members who can only comment can't write marks: a mark is a document update, and the server
 *   rejects those below the editor role. Their thread row carries `anchor` instead: Yjs relative positions in the
 *   "default" XmlFragment. Editors send one too, as a fallback; a thread's mark always wins over its position anchor.
 *
 * Bytes: `[COMMENT_ANCHOR_FORMAT, count, (varuint length, Y.encodeRelativePosition bytes) × count]`. The positions are
 * start and end of the range, then (count 4) the top-level blocks holding them. The server checks only this envelope
 * and the size cap (`cleanCommentAnchor` in spacetimedb/src/index.ts).
 *
 * Resolution depends only on the document, so it is the same on every client. Relative positions never follow
 * "undone deletions", because that Yjs history is local to the client that undid. The start sticks to the first quoted
 * character and the end to the last, so typing at either edge stays outside, like the non-inclusive mark.
 *
 * A position anchor is detached:
 * - **When its text was deleted.** Both ends collapse onto the hole. It re-attaches if the same text comes back right
 *   there, which is what an undo does.
 * - **When its block was replaced and the quote can't be found again.** y-prosemirror recreates a block's Yjs element
 *   (and Yjs garbage-collects the old text) when a paragraph becomes a heading or is wrapped in a list. The block
 *   positions find the replacement: the live block inserted directly against the deleted one. The quote is then
 *   searched inside it and re-attached when it occurs exactly once there. A block deleted outright, or moved elsewhere,
 *   has no such replacement, so the thread stays detached instead of guessing.
 *
 * Positions come from y-tiptap's binding mapping, which describes the ProseMirror document only once y-tiptap has
 * written it to Yjs. Remote changes are rendered before dispatch. Local edits are written in y-tiptap's plugin view
 * update, after plugin state was applied. `commentBindingMatches` tells which case applies.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

export interface CommentRange {
  readonly from: number;
  readonly to: number;
}

/** First byte of an encoded anchor. */
export const COMMENT_ANCHOR_FORMAT = 1;
/** Mirrors DOC_COMMENT_ANCHOR_MAX_BYTES in spacetimedb/src/index.ts. Real anchors are 20–60 bytes. */
export const COMMENT_ANCHOR_MAX_BYTES = 1_024;
/** Stored quotes are cut to this length (`startComment`); a cut quote can't be matched. */
export const COMMENT_QUOTE_MAX = 200;

export interface RelativeCommentRange {
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
  /** Top-level blocks holding `start` / `end` (both or neither). */
  readonly startBlock: Y.RelativePosition | null;
  readonly endBlock: Y.RelativePosition | null;
}

/** A thread's position anchor, decoded, with the quote used to re-find replaced blocks. */
export interface PositionCommentAnchor {
  readonly range: RelativeCommentRange;
  /** `quotedText` of the thread root ("" when none). */
  readonly quote: string;
}

type ProsemirrorMapping = Parameters<typeof relativePositionToAbsolutePosition>[3];

export interface CommentYBinding {
  readonly doc: Y.Doc;
  readonly type: Y.XmlFragment;
  readonly mapping: ProsemirrorMapping;
}

// ── Bytes ────────────────────────────────────────────────────────────────────

function writeVarUint(out: number[], value: number): void {
  let rest = value;
  while (rest > 0x7f) {
    out.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
}

function readVarUint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let value = 0;
  let factor = 1;
  for (let i = offset; i < bytes.length && i < offset + 3; i++) {
    const byte = bytes[i];
    value += (byte & 0x7f) * factor;
    if (byte < 0x80) return { value, next: i + 1 };
    factor *= 0x80;
  }
  return null;
}

/** Null when the positions don't fit `COMMENT_ANCHOR_MAX_BYTES`. */
export function encodeCommentAnchorBytes(range: RelativeCommentRange): Uint8Array | null {
  const positions = [range.start, range.end];
  if (range.startBlock && range.endBlock) positions.push(range.startBlock, range.endBlock);
  const out: number[] = [COMMENT_ANCHOR_FORMAT, positions.length];
  for (const position of positions) {
    const bytes = Y.encodeRelativePosition(position);
    writeVarUint(out, bytes.length);
    for (const byte of bytes) out.push(byte);
    if (out.length > COMMENT_ANCHOR_MAX_BYTES) return null;
  }
  return Uint8Array.from(out);
}

/** Null for missing, oversized, unknown-format or malformed bytes. */
export function decodeCommentAnchorBytes(bytes: Uint8Array | null | undefined): RelativeCommentRange | null {
  if (!bytes || bytes.length < 2 || bytes.length > COMMENT_ANCHOR_MAX_BYTES || bytes[0] !== COMMENT_ANCHOR_FORMAT) return null;
  const count = bytes[1];
  if (count !== 2 && count !== 4) return null;
  const positions: Y.RelativePosition[] = [];
  let offset = 2;
  try {
    for (let i = 0; i < count; i++) {
      const length = readVarUint(bytes, offset);
      if (!length || length.value < 2 || length.next + length.value > bytes.length) return null;
      const position = Y.decodeRelativePosition(bytes.subarray(length.next, length.next + length.value));
      if (position.item === null && position.type === null && position.tname === null) return null;
      positions.push(position);
      offset = length.next + length.value;
    }
  } catch {
    return null;
  }
  if (offset !== bytes.length) return null;
  return { start: positions[0], end: positions[1], startBlock: positions[2] ?? null, endBlock: positions[3] ?? null };
}

/** Byte-wise equality (anchors are immutable once a thread exists; rows are re-created on every update). */
export function sameAnchorBytes(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── Mark anchors ─────────────────────────────────────────────────────────────

/** Min `from` / max `to` per `threadId` across every text node carrying a `comment` mark. */
export function collectCommentMarkRanges(doc: ProseMirrorNode, onlyThreadId?: string): Map<string, CommentRange> {
  const ranges = new Map<string, { from: number; to: number }>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== "comment") continue;
      const threadId: unknown = mark.attrs.threadId;
      if (typeof threadId !== "string" || !threadId || (onlyThreadId !== undefined && threadId !== onlyThreadId)) continue;
      const to = pos + node.nodeSize;
      const existing = ranges.get(threadId);
      if (existing) {
        existing.from = Math.min(existing.from, pos);
        existing.to = Math.max(existing.to, to);
      } else {
        ranges.set(threadId, { from: pos, to });
      }
    }
    return false;
  });
  return ranges;
}

/** Mark anchors, plus position anchors for threads without a mark. */
export function mergeCommentAnchors(
  markRanges: ReadonlyMap<string, CommentRange>,
  positionRanges: ReadonlyMap<string, CommentRange>,
): Map<string, CommentRange> {
  const merged = new Map(markRanges);
  for (const [threadId, range] of positionRanges) if (!merged.has(threadId)) merged.set(threadId, range);
  return merged;
}

// ── Binding ──────────────────────────────────────────────────────────────────

/** y-tiptap's binding of a collaborative editor, or null (preview, schema-only or not yet bound). */
export function getCommentYBinding(state: EditorState): CommentYBinding | null {
  let sync: unknown;
  try {
    sync = ySyncPluginKey.getState(state);
  } catch {
    return null;
  }
  const binding = sync && typeof sync === "object" ? (sync as { binding?: Partial<CommentYBinding> | null }).binding : null;
  return binding && binding.doc && binding.type && binding.mapping ? (binding as CommentYBinding) : null;
}

function nodeSizeOf(mapped: ProseMirrorNode | readonly ProseMirrorNode[] | undefined): number {
  if (!mapped) return -1;
  if (Array.isArray(mapped)) return mapped.reduce((sum: number, node: ProseMirrorNode) => sum + node.nodeSize, 0);
  return (mapped as ProseMirrorNode).nodeSize;
}

/**
 * Whether the binding's Yjs content and mapping describe `doc`, so positions convert correctly: same top-level block
 * count and sizes. False between a local edit and y-tiptap's view update, and before the first render.
 */
export function commentBindingMatches(binding: CommentYBinding, doc: ProseMirrorNode): boolean {
  const children = binding.type.toArray();
  if (children.length !== doc.childCount) return false;
  for (let i = 0; i < children.length; i++) {
    if (nodeSizeOf(binding.mapping.get(children[i])) !== doc.child(i).nodeSize) return false;
  }
  return true;
}

function validRange(doc: ProseMirrorNode, from: number, to: number): CommentRange | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  return from >= 0 && to > from && to <= doc.content.size ? { from, to } : null;
}

// ── Capture ──────────────────────────────────────────────────────────────────

/** Re-expresses a text position so it follows the character after it (y-tiptap's positions follow the one before). */
function stickToFollowingCharacter(doc: Y.Doc, rel: Y.RelativePosition): Y.RelativePosition {
  const abs = Y.createAbsolutePositionFromRelativePosition(rel, doc, false);
  if (abs && abs.type instanceof Y.XmlText && abs.index < abs.type.length) {
    return Y.createRelativePositionFromTypeIndex(abs.type, abs.index, 0);
  }
  return rel;
}

/** Index of the top-level block holding `pos` (`end`: a position between blocks belongs to the block before it). */
function topLevelIndex(doc: ProseMirrorNode, pos: number, end: boolean): number {
  const $pos = doc.resolve(pos);
  const index = $pos.depth === 0 && end ? $pos.index(0) - 1 : $pos.index(0);
  return Math.max(0, Math.min(index, doc.childCount - 1));
}

/**
 * `range` of `state` as relative positions. Null outside a collaborative editor, while the binding doesn't describe the
 * document yet, or for an empty or out-of-bounds range.
 */
export function captureCommentRange(state: EditorState, range: CommentRange | null | undefined): RelativeCommentRange | null {
  const binding = getCommentYBinding(state);
  if (!binding || !range || !validRange(state.doc, range.from, range.to) || !commentBindingMatches(binding, state.doc)) return null;
  try {
    const start = absolutePositionToRelativePosition(range.from, binding.type, binding.mapping) as Y.RelativePosition;
    const end = absolutePositionToRelativePosition(range.to, binding.type, binding.mapping) as Y.RelativePosition;
    if (!(start instanceof Y.RelativePosition) || !(end instanceof Y.RelativePosition)) return null;
    // Top-level Yjs children map 1:1 to top-level ProseMirror blocks while the binding matches.
    const startBlock = Y.createRelativePositionFromTypeIndex(binding.type, topLevelIndex(state.doc, range.from, false), 0);
    const endBlock = Y.createRelativePositionFromTypeIndex(binding.type, topLevelIndex(state.doc, range.to, true), 0);
    const blocks = startBlock.item !== null && endBlock.item !== null;
    return {
      start: stickToFollowingCharacter(binding.doc, start),
      end,
      startBlock: blocks ? startBlock : null,
      endBlock: blocks ? endBlock : null,
    };
  } catch {
    return null;
  }
}

/** The bytes to send as `anchor` for a new thread on `range`, or null when it can't be expressed. */
export function encodeCommentAnchor(state: EditorState, range: CommentRange | null | undefined): Uint8Array | null {
  const relative = captureCommentRange(state, range);
  return relative ? encodeCommentAnchorBytes(relative) : null;
}

// ── Resolution ───────────────────────────────────────────────────────────────

/** Any Yjs type (the fragment or a type inside it), as Yjs' own position helpers take it. */
type YType = Parameters<typeof Y.createRelativePositionFromTypeIndex>[0];

/** ProseMirror position of `index` inside Yjs `type` (a live type in the bound fragment). */
function pmPosition(binding: CommentYBinding, type: YType, index: number): number | null {
  try {
    // Left-associated at a live index: resolves to exactly `index`. At index 0 it has no item, which also keeps
    // y-tiptap's "misresolved to the document start" guard from rejecting the first character of the document.
    const rel = Y.createRelativePositionFromTypeIndex(type, index, -1);
    return relativePositionToAbsolutePosition(binding.doc, binding.type, rel, binding.mapping);
  } catch {
    return null;
  }
}

/** Document position of a text endpoint, or null when its Yjs content (or a container of it) is gone. */
function resolveEndpoint(binding: CommentYBinding, rel: Y.RelativePosition): number | null {
  let abs: Y.AbsolutePosition | null;
  try {
    abs = Y.createAbsolutePositionFromRelativePosition(rel, binding.doc, false);
  } catch {
    return null;
  }
  if (!abs) return null;
  for (let type: Y.AbstractType<unknown> = abs.type; type !== binding.type; ) {
    const item: Y.Item | null = type._item;
    if (!item || item.deleted || !(item.parent instanceof Y.AbstractType)) return null;
    type = item.parent;
  }
  return pmPosition(binding, abs.type, abs.index);
}

function containsId(item: Y.Item, id: Y.ID): boolean {
  return item.id.client === id.client && item.id.clock <= id.clock && id.clock < item.id.clock + item.length;
}

/**
 * The document range of the top-level block `rel` points at. For a deleted block: the live block inserted directly
 * against it (its right origin lies in the deleted run), which is how y-prosemirror replaces a block; otherwise null.
 */
function blockRegion(binding: CommentYBinding, doc: ProseMirrorNode, rel: Y.RelativePosition): CommentRange | null {
  const id = rel.item;
  if (!id) return null;
  let block: Y.Item | null = null;
  for (let item = binding.type._start; item !== null; item = item.right) {
    if (containsId(item, id)) {
      block = item;
      break;
    }
  }
  if (!block) return null;
  if (block.deleted) {
    let replacement: Y.Item | null = null;
    for (let left = block.left; left !== null; left = left.left) {
      if (left.deleted) continue;
      const origin = left.rightOrigin;
      if (origin) {
        for (let between = left.right; between !== null; between = between.right) {
          if (containsId(between, origin)) {
            replacement = left;
            break;
          }
          if (between === block || !between.deleted) break;
        }
      }
      break;
    }
    if (!replacement) return null;
    block = replacement;
  }
  let index = 0;
  for (let left = block.left; left !== null; left = left.left) {
    if (!left.deleted && left.countable) index += left.length;
  }
  const pos = pmPosition(binding, binding.type, index);
  const node = pos === null ? null : doc.nodeAt(pos);
  return pos !== null && node ? { from: pos, to: pos + node.nodeSize } : null;
}

interface IndexedText {
  readonly text: string;
  /** Document position of each character's start / end. */
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

/**
 * Text of `[from, to]` normalised like the stored quote (`commentQuoteText`): blocks and leaves become a space,
 * whitespace runs collapse to one space. Every character keeps its document position.
 */
function indexedText(doc: ProseMirrorNode, from: number, to: number): IndexedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  const push = (char: string, start: number, end: number) => {
    const isSpace = /\s/.test(char);
    if (isSpace && (text.length === 0 || text.endsWith(" "))) return;
    text += isSpace ? " " : char;
    starts.push(start);
    ends.push(end);
  };
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      const value = node.text ?? "";
      const begin = Math.max(from, pos) - pos;
      const finish = Math.min(to, pos + value.length) - pos;
      for (let i = begin; i < finish; i++) push(value[i], pos + i, pos + i + 1);
      return false;
    }
    if (node.isTextblock || (node.isBlock && node.isLeaf)) push(" ", pos, pos);
    else if (node.isLeaf) push(" ", pos, pos + node.nodeSize);
    return true;
  });
  return { text, starts, ends };
}

/** Occurrences of `quote` in `[from, to]` as document ranges. */
function findQuote(doc: ProseMirrorNode, from: number, to: number, quote: string): CommentRange[] {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(doc.content.size, Math.max(from, to));
  if (hi <= lo) return [];
  const indexed = indexedText(doc, lo, hi);
  const found: CommentRange[] = [];
  for (let i = indexed.text.indexOf(quote); i >= 0; i = indexed.text.indexOf(quote, i + 1)) {
    const range = validRange(doc, indexed.starts[i], indexed.ends[i + quote.length - 1]);
    if (range) found.push(range);
  }
  return found;
}

function recoverableQuote(quote: string | null | undefined): string | null {
  const trimmed = quote?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length < COMMENT_QUOTE_MAX ? trimmed : null;
}

/**
 * Resolves a position anchor against the binding's current document (see the header for the rules). `quote` enables
 * re-attaching; pass null to get only the plain relative-position result.
 */
export function resolveCommentRangeWithBinding(
  binding: CommentYBinding,
  doc: ProseMirrorNode,
  range: RelativeCommentRange,
  quote: string | null,
): CommentRange | null {
  const start = resolveEndpoint(binding, range.start);
  const end = resolveEndpoint(binding, range.end);
  const text = recoverableQuote(quote);

  if (start !== null && end !== null) {
    if (end > start) return validRange(doc, start, end);
    if (!text) return null;
    // Collapsed onto the hole of the deleted text: the same text back right at that spot (an undo) re-attaches.
    const $hole = doc.resolve(Math.max(0, Math.min(start, doc.content.size)));
    const from = $hole.parent.isTextblock ? $hole.start() : start - ($hole.nodeBefore?.nodeSize ?? 0);
    const to = $hole.parent.isTextblock ? $hole.end() : start + ($hole.nodeAfter?.nodeSize ?? 0);
    const touching = findQuote(doc, from, to, text).filter((r) => r.from === start || r.to === start);
    return touching.length === 1 ? touching[0] : null;
  }

  // Text inside a replaced block: search the replacement block(s).
  if (!text || !range.startBlock || !range.endBlock) return null;
  const first = blockRegion(binding, doc, range.startBlock);
  const last = blockRegion(binding, doc, range.endBlock);
  if (!first || !last) return null;
  const matches = findQuote(doc, Math.min(first.from, last.from), Math.max(first.to, last.to), text);
  return matches.length === 1 ? matches[0] : null;
}

/** `resolveCommentRangeWithBinding` for an editor state; null when there is no binding or it doesn't match the document. */
export function resolveCommentRange(state: EditorState, range: RelativeCommentRange, quote: string | null): CommentRange | null {
  const binding = getCommentYBinding(state);
  if (!binding || !commentBindingMatches(binding, state.doc)) return null;
  try {
    return resolveCommentRangeWithBinding(binding, state.doc, range, quote);
  } catch {
    return null;
  }
}

/**
 * Every position anchor resolved against `state`: valid, non-empty ranges only (missing entries are detached). Null
 * when positions can't be computed right now (no binding, or the binding doesn't describe the document yet).
 */
export function resolveCommentAnchors(
  state: EditorState,
  anchors: ReadonlyMap<string, PositionCommentAnchor>,
): Map<string, CommentRange> | null {
  const binding = getCommentYBinding(state);
  if (!binding || !commentBindingMatches(binding, state.doc)) return null;
  const ranges = new Map<string, CommentRange>();
  for (const [threadId, anchor] of anchors) {
    try {
      const range = resolveCommentRangeWithBinding(binding, state.doc, anchor.range, anchor.quote);
      if (range) ranges.set(threadId, range);
    } catch {
      // Detached.
    }
  }
  return ranges;
}

export function sameCommentRanges(a: ReadonlyMap<string, CommentRange>, b: ReadonlyMap<string, CommentRange>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [threadId, range] of a) {
    const other = b.get(threadId);
    if (!other || other.from !== range.from || other.to !== range.to) return false;
  }
  return true;
}
