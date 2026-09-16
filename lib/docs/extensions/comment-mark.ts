/**
 * Comment mark + local comment UI state (docs-editor-ui spec §2.1; position anchors: lead decision L2).
 *
 * The mark (`comment`, attribute `threadId`) is document content, synced through Yjs; it has no styling of its own.
 * Members who can only comment anchor threads by position instead (`lib/docs/comment-anchors.ts`). Highlights for both
 * come from a local plugin (`docComments`) whose state is changed only by meta transactions, which y-tiptap ignores
 * because they contain no steps:
 * - `openIds` — unresolved threads (set by `useCommentThreads` via `setOpenCommentThreads`). Resolved or unknown
 *   threads get no highlight. Pass the ids ordered oldest → newest: a click on overlapping highlights activates the
 *   newest thread.
 * - `anchors` — position anchors from the thread rows (`setCommentAnchors`), resolved into `ranges`: on every change
 *   y-tiptap renders from Yjs, whenever the anchors change, and ~200 ms after local typing settles (local edits are
 *   mapped through the transaction until then). A thread's mark wins over its position anchor. `getCommentAnchor` /
 *   `getCommentPositionRanges` read them.
 * - `activeId` — the thread focused in the comments panel (`setActiveComment`).
 * - `draft` — the range of an in-progress new comment (`setCommentDraft`), remapped through every edit. In a
 *   collaborative editor it is also kept as relative positions, so it survives y-tiptap's whole-document replace of a
 *   collaborator's edit. `getCommentDraft(state)` returns it, or null once the quoted text was deleted.
 *
 * Both highlight kinds render identically (`doc-comment-hl`, `is-active`) and only as decorations, so `getHTML()`,
 * exports and print never contain them.
 *
 * Pasted, dropped and copy-dragged slices never carry comment marks, so a thread is never anchored twice. Text
 * dragged to another spot in the same editor keeps them: the original is deleted, so the anchor only moves.
 * The mark is not `clearable` (Tiptap's `unsetAllMarks` keeps it); Clear formatting is `clearDocFormatting`.
 */
import { Mark } from "@tiptap/core";
import { Fragment, type MarkType, type Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import {
  captureCommentRange,
  collectCommentMarkRanges,
  decodeCommentAnchorBytes,
  resolveCommentAnchors,
  resolveCommentRange,
  sameAnchorBytes,
  sameCommentRanges,
  type CommentRange,
  type PositionCommentAnchor,
  type RelativeCommentRange,
} from "@/lib/docs/comment-anchors";

export type { CommentRange } from "@/lib/docs/comment-anchors";

/** A thread's stored position anchor (`DocComment.anchor`) with its quote. */
export interface CommentAnchorInput {
  readonly anchor: Uint8Array;
  readonly quote: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      /** Applies the comment mark for `threadId` to the current selection. */
      setComment: (threadId: string) => ReturnType;
      /** Removes only that thread's mark ranges (other overlapping threads stay). */
      unsetComment: (threadId: string) => ReturnType;
      /** Local, meta-only: the thread highlighted as active. */
      setActiveComment: (threadId: string | null) => ReturnType;
      /** Local, meta-only: unresolved thread ids (oldest → newest). */
      setOpenCommentThreads: (ids: ReadonlySet<string>) => ReturnType;
      /** Local, meta-only: position anchors of every thread that has one (thread id → bytes + quote). */
      setCommentAnchors: (anchors: ReadonlyMap<string, CommentAnchorInput>) => ReturnType;
      /** Local, meta-only: the draft range of a new comment, or null to clear it. */
      setCommentDraft: (range: CommentRange | null) => ReturnType;
    };
  }
}

export interface CommentMarkOptions {
  /** Called when a highlighted comment is clicked (thread id) or the click lands outside any open thread (null). */
  onActivate?: (threadId: string | null) => void;
}

/** A decoded position anchor, keeping its bytes to skip no-op updates. */
interface StoredPositionAnchor extends PositionCommentAnchor {
  readonly bytes: Uint8Array;
}

interface CommentPluginState {
  readonly openIds: ReadonlySet<string>;
  readonly activeId: string | null;
  readonly draft: CommentRange | null;
  /** `draft` as relative positions (collaborative editors), re-resolved after changes rendered from Yjs. */
  readonly draftAnchor: RelativeCommentRange | null;
  readonly anchors: ReadonlyMap<string, StoredPositionAnchor>;
  /** Resolved `anchors`: valid, non-empty ranges only. */
  readonly ranges: ReadonlyMap<string, CommentRange>;
  /** Bumped when `ranges` must be re-resolved right after y-tiptap's view update (the plugin view dispatches it). */
  readonly refreshSoon: number;
  /** Bumped by local edits: re-resolve once typing settles, so every client converges on the Yjs positions. */
  readonly refreshLater: number;
  readonly decorations: DecorationSet;
}

export interface CommentMeta {
  readonly openIds?: ReadonlySet<string>;
  readonly activeId?: string | null;
  readonly draft?: CommentRange | null;
  readonly anchors?: ReadonlyMap<string, StoredPositionAnchor>;
  readonly refresh?: true;
}

export const commentPluginKey = new PluginKey<CommentPluginState>("docComments");

const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_ANCHORS: ReadonlyMap<string, StoredPositionAnchor> = new Map();
const EMPTY_RANGES: ReadonlyMap<string, CommentRange> = new Map();
/** Delay of the settle-refresh after local edits. */
export const COMMENT_RANGE_REFRESH_MS = 200;

function highlightClass(threadId: string, activeId: string | null): string {
  return threadId === activeId ? "doc-comment-hl is-active" : "doc-comment-hl";
}

function buildDecorations(
  doc: ProseMirrorNode,
  openIds: ReadonlySet<string>,
  activeId: string | null,
  draft: CommentRange | null,
  ranges: ReadonlyMap<string, CommentRange>,
): DecorationSet {
  const decorations: Decoration[] = [];
  if (openIds.size > 0) {
    const marked = new Set<string>();
    doc.descendants((node, pos) => {
      if (!node.isText) return true;
      for (const mark of node.marks) {
        if (mark.type.name !== "comment") continue;
        const threadId: unknown = mark.attrs.threadId;
        if (typeof threadId !== "string" || !openIds.has(threadId)) continue;
        marked.add(threadId);
        decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: highlightClass(threadId, activeId) }));
      }
      return false;
    });
    const size = doc.content.size;
    for (const [threadId, range] of ranges) {
      if (!openIds.has(threadId) || marked.has(threadId) || range.to > size || range.from >= range.to) continue;
      decorations.push(Decoration.inline(range.from, range.to, { class: highlightClass(threadId, activeId) }));
    }
  }
  if (draft && draft.to > draft.from && draft.to <= doc.content.size) {
    decorations.push(Decoration.inline(draft.from, draft.to, { class: "doc-comment-draft" }));
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function stripCommentMarks(fragment: Fragment, type: MarkType): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) nodes.push(node.mark(type.removeFromSet(node.marks)));
    else if (node.content.size > 0) nodes.push(node.copy(stripCommentMarks(node.content, type)));
    else nodes.push(node);
  });
  return Fragment.fromArray(nodes);
}

function mapRange(tr: Transaction, range: CommentRange): CommentRange | null {
  const from = tr.mapping.map(range.from, 1);
  const to = tr.mapping.map(range.to, -1);
  return to > from ? { from, to } : null;
}

function mapRanges(
  tr: Transaction,
  ranges: ReadonlyMap<string, CommentRange>,
  anchors: ReadonlyMap<string, StoredPositionAnchor>,
): ReadonlyMap<string, CommentRange> {
  if (ranges.size === 0) return EMPTY_RANGES;
  if (!tr.docChanged && [...ranges.keys()].every((threadId) => anchors.has(threadId))) return ranges;
  const next = new Map<string, CommentRange>();
  for (const [threadId, range] of ranges) {
    if (!anchors.has(threadId)) continue;
    const mapped = tr.docChanged ? mapRange(tr, range) : range;
    if (mapped) next.set(threadId, mapped);
  }
  return next;
}

/** Decodes row anchors for the plugin; undecodable anchors are skipped (their threads stay detached). */
export function decodePositionAnchors(
  input: ReadonlyMap<string, CommentAnchorInput>,
  previous: ReadonlyMap<string, StoredPositionAnchor> = EMPTY_ANCHORS,
): ReadonlyMap<string, StoredPositionAnchor> {
  const next = new Map<string, StoredPositionAnchor>();
  for (const [threadId, { anchor, quote }] of input) {
    const prior = previous.get(threadId);
    if (prior && prior.quote === quote && sameAnchorBytes(prior.bytes, anchor)) {
      next.set(threadId, prior);
      continue;
    }
    const range = decodeCommentAnchorBytes(anchor);
    if (range) next.set(threadId, { range, quote, bytes: anchor });
  }
  return next;
}

function sameAnchors(a: ReadonlyMap<string, StoredPositionAnchor>, b: ReadonlyMap<string, StoredPositionAnchor>): boolean {
  if (a.size !== b.size) return false;
  for (const [threadId, anchor] of a) if (b.get(threadId) !== anchor) return false;
  return true;
}

/** The draft range remapped through edits since it was set, or null. */
export function getCommentDraft(state: EditorState): CommentRange | null {
  return commentPluginKey.getState(state)?.draft ?? null;
}

/** The locally active thread id, or null. */
export function getActiveCommentId(state: EditorState): string | null {
  return commentPluginKey.getState(state)?.activeId ?? null;
}

/** Resolved position anchors (valid ranges only). The map keeps its identity while nothing changed. */
export function getCommentPositionRanges(state: EditorState): ReadonlyMap<string, CommentRange> {
  return commentPluginKey.getState(state)?.ranges ?? EMPTY_RANGES;
}

/** A thread's current anchor, of either kind (the mark wins), or null when it is detached. */
export function getCommentAnchor(state: EditorState, threadId: string): CommentRange | null {
  return collectCommentMarkRanges(state.doc, threadId).get(threadId) ?? getCommentPositionRanges(state).get(threadId) ?? null;
}

/**
 * Whether a drop moves a slice dragged inside the same view (ProseMirror's default `dragMoves`: the copy modifier is
 * Alt on macOS and Ctrl elsewhere). External drops have no `view.dragging`.
 */
export function dropMovesWithinView(dragging: unknown, event: Pick<DragEvent, "altKey" | "ctrlKey">, isMac: boolean): boolean {
  return dragging != null && !(isMac ? event.altKey : event.ctrlKey);
}

function platformIsMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
}

/** Plugin state transition (exported for tests; the plugin uses it as `state.apply`). */
export function applyCommentPluginState(tr: Transaction, value: CommentPluginState, newState: EditorState): CommentPluginState {
  const meta = tr.getMeta(commentPluginKey) as CommentMeta | undefined;
  if (!meta && !tr.docChanged) return value;
  const sync = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: unknown } | undefined;
  // y-tiptap rendered a change from Yjs (a collaborator, undo/redo, the first render) as a whole-document replace, which
  // collapses every mapped position. Its mapping is already updated, so relative positions resolve.
  const fromYjs = tr.docChanged && sync?.isChangeOrigin === true;

  let draft = value.draft;
  let draftAnchor = value.draftAnchor;
  if (meta && "draft" in meta) {
    draft = meta.draft ?? null;
    draftAnchor = draft ? captureCommentRange(newState, draft) : null;
  } else if (draft && tr.docChanged) {
    draft = fromYjs && draftAnchor ? resolveCommentRange(newState, draftAnchor, null) : mapRange(tr, draft);
  }
  if (!draft) draftAnchor = null;

  const anchors = meta?.anchors ?? value.anchors;
  let ranges = value.ranges;
  let refreshSoon = value.refreshSoon;
  let refreshLater = value.refreshLater;
  if (anchors.size === 0) {
    ranges = EMPTY_RANGES;
  } else if (fromYjs || meta?.anchors || meta?.refresh) {
    const resolved = resolveCommentAnchors(newState, anchors);
    if (resolved) {
      ranges = sameCommentRanges(resolved, value.ranges) ? value.ranges : resolved;
    } else {
      ranges = mapRanges(tr, value.ranges, anchors);
      // A failed refresh doesn't retry: the next change rendered from Yjs (the first render included) resolves them.
      if (!meta?.refresh) refreshSoon += 1;
    }
  } else if (tr.docChanged) {
    ranges = mapRanges(tr, value.ranges, anchors);
    refreshLater += 1;
  }

  const openIds = meta?.openIds ?? value.openIds;
  const activeId = meta && "activeId" in meta ? (meta.activeId ?? null) : value.activeId;
  if (
    !tr.docChanged &&
    openIds === value.openIds &&
    activeId === value.activeId &&
    draft === value.draft &&
    anchors === value.anchors &&
    ranges === value.ranges &&
    refreshSoon === value.refreshSoon
  ) {
    return value;
  }
  return {
    openIds,
    activeId,
    draft,
    draftAnchor,
    anchors,
    ranges,
    refreshSoon,
    refreshLater,
    decorations: buildDecorations(newState.doc, openIds, activeId, draft, ranges),
  };
}

export function initialCommentPluginState(): CommentPluginState {
  return {
    openIds: EMPTY_IDS,
    activeId: null,
    draft: null,
    draftAnchor: null,
    anchors: EMPTY_ANCHORS,
    ranges: EMPTY_RANGES,
    refreshSoon: 0,
    refreshLater: 0,
    decorations: DecorationSet.empty,
  };
}

/** Threads whose highlight covers `pos`, oldest → newest per `openIds`. */
export function commentThreadsAt(state: EditorState, pos: number, markName = "comment"): string[] {
  const pluginState = commentPluginKey.getState(state);
  if (!pluginState) return [];
  const $pos = state.doc.resolve(pos);
  const marks = [...$pos.marks(), ...($pos.nodeAfter?.marks ?? [])];
  const hits = new Set<string>();
  for (const mark of marks) {
    const threadId: unknown = mark.attrs.threadId;
    if (mark.type.name === markName && typeof threadId === "string" && pluginState.openIds.has(threadId)) hits.add(threadId);
  }
  for (const [threadId, range] of pluginState.ranges) {
    if (pluginState.openIds.has(threadId) && range.from <= pos && pos < range.to) hits.add(threadId);
  }
  return [...pluginState.openIds].filter((id) => hits.has(id));
}

export const CommentMark = Mark.create<CommentMarkOptions>({
  name: "comment",
  inclusive: false,
  // Overlapping threads are allowed; y-tiptap hashes overlapping marks by attrs.
  excludes: "",
  spanning: true,
  // An anchor is content, not formatting.
  clearable: false,

  addOptions() {
    return { onActivate: undefined };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-thread"),
        renderHTML: (attributes) => (attributes.threadId ? { "data-comment-thread": attributes.threadId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-thread]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setComment:
        (threadId) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),
      unsetComment:
        (threadId) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.marks[this.name];
          if (!type) return false;
          let found = false;
          state.doc.descendants((node, pos) => {
            if (!node.isText) return true;
            for (const mark of node.marks) {
              if (mark.type === type && mark.attrs.threadId === threadId) {
                found = true;
                if (dispatch) tr.removeMark(pos, pos + node.nodeSize, mark);
              }
            }
            return false;
          });
          return found;
        },
      setActiveComment:
        (threadId) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(commentPluginKey, { activeId: threadId } satisfies CommentMeta).setMeta("addToHistory", false);
          return true;
        },
      setOpenCommentThreads:
        (ids) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(commentPluginKey, { openIds: new Set(ids) } satisfies CommentMeta).setMeta("addToHistory", false);
          return true;
        },
      setCommentAnchors:
        (input) =>
        ({ tr, state, dispatch }) => {
          const previous = commentPluginKey.getState(state)?.anchors ?? EMPTY_ANCHORS;
          const anchors = decodePositionAnchors(input, previous);
          if (dispatch && !sameAnchors(anchors, previous)) {
            tr.setMeta(commentPluginKey, { anchors } satisfies CommentMeta).setMeta("addToHistory", false);
          }
          return true;
        },
      setCommentDraft:
        (range) =>
        ({ tr, dispatch }) => {
          const draft = range && range.to > range.from ? { from: range.from, to: range.to } : null;
          if (dispatch) tr.setMeta(commentPluginKey, { draft } satisfies CommentMeta).setMeta("addToHistory", false);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;
    const getOnActivate = () => this.options.onActivate;
    // Set by the DOM drop handler, which runs just before ProseMirror transforms the dragged slice.
    let dropMoves = false;
    return [
      new Plugin<CommentPluginState>({
        key: commentPluginKey,
        state: {
          init: () => initialCommentPluginState(),
          apply: (tr, value, _oldState, newState) => applyCommentPluginState(tr, value, newState),
        },
        // Re-resolves position anchors once y-tiptap (an earlier plugin: Collaboration has a higher priority) has written
        // the current document to Yjs in its own view update.
        view: (view) => {
          const initial = commentPluginKey.getState(view.state);
          let seenSoon = initial?.refreshSoon ?? 0;
          let seenLater = initial?.refreshLater ?? 0;
          let queued = false;
          let timer: ReturnType<typeof setTimeout> | null = null;
          const refresh = (target: EditorView) => {
            if (target.isDestroyed) return;
            target.dispatch(target.state.tr.setMeta(commentPluginKey, { refresh: true } satisfies CommentMeta).setMeta("addToHistory", false));
          };
          return {
            update: (target) => {
              const pluginState = commentPluginKey.getState(target.state);
              if (!pluginState) return;
              if (pluginState.refreshSoon !== seenSoon) {
                seenSoon = pluginState.refreshSoon;
                if (!queued) {
                  queued = true;
                  queueMicrotask(() => {
                    queued = false;
                    refresh(target);
                  });
                }
              }
              if (pluginState.refreshLater !== seenLater) {
                seenLater = pluginState.refreshLater;
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                  timer = null;
                  refresh(target);
                }, COMMENT_RANGE_REFRESH_MS);
              }
            },
            destroy: () => {
              if (timer) clearTimeout(timer);
              timer = null;
            },
          };
        },
        props: {
          decorations: (state) => commentPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
          handleClick: (view, pos) => {
            const onActivate = getOnActivate();
            const pluginState = commentPluginKey.getState(view.state);
            if (!onActivate || !pluginState) return false;
            const hits = commentThreadsAt(view.state, pos, markName);
            const chosen = hits.length > 0 ? hits[hits.length - 1] : null;
            if (chosen) onActivate(chosen);
            else if (pluginState.activeId) onActivate(null);
            return false;
          },
          handleDOMEvents: {
            drop: (view, event) => {
              dropMoves = dropMovesWithinView(view.dragging, event, platformIsMac());
              return false;
            },
          },
          transformPasted: (slice, view) => {
            // `view.dragging` is cleared once the drop is handled, so a stale flag never reaches a later paste.
            const moving = dropMoves && view.dragging != null;
            dropMoves = false;
            if (moving) return slice;
            const type = view.state.schema.marks[markName];
            if (!type) return slice;
            return new Slice(stripCommentMarks(slice.content, type), slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});
