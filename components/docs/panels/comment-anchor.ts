/**
 * Anchoring a freshly posted comment thread (plan §B5.4 "post a new thread: row first, then the mark").
 *
 * The mark is written after `addDocumentComment` resolves, so every number captured before that await may be stale:
 * a collaborator's edit arriving in between shifts the text. The draft range in the comment-mark plugin state is
 * remapped through edits, and in a collaborative editor the selection is also captured as Yjs relative positions (the
 * way y-tiptap restores selections), which survive y-tiptap's whole-document replace transactions.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition } from "@tiptap/y-tiptap";

import { COMMENT_QUOTE_MAX, getCommentYBinding } from "@/lib/docs/comment-anchors";
import type { CommentAnchor } from "@/lib/docs/use-comment-threads";

type RelativePosition = ReturnType<typeof absolutePositionToRelativePosition>;

/** Max quote length, matching `startComment` in the editor core. */
const QUOTE_MAX = COMMENT_QUOTE_MAX;

/** The quote stored for a range: text with blocks and leaves as spaces, whitespace collapsed, max 200 characters. */
export function commentQuoteText(doc: ProseMirrorNode, range: CommentAnchor): string {
  return doc.textBetween(range.from, range.to, " ", " ").replace(/\s+/g, " ").trim().slice(0, QUOTE_MAX);
}

function validRange(doc: ProseMirrorNode, range: CommentAnchor | null | undefined): CommentAnchor | null {
  if (!range) return null;
  const { from, to } = range;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  return from >= 0 && to > from && to <= doc.content.size ? { from, to } : null;
}

const syncBinding = getCommentYBinding;

export interface TrackedCommentRange {
  /** The tracked range in `state`, or null when it can't be resolved (the text was deleted, the binding is gone). */
  resolve(state: EditorState): CommentAnchor | null;
}

/**
 * Captures `range` as Yjs relative positions. Null outside a collaborative editor (no y-sync binding) or when the
 * binding can't express the position; callers then rely on the draft range alone.
 */
export function trackCommentRange(state: EditorState, range: CommentAnchor): TrackedCommentRange | null {
  const binding = syncBinding(state);
  if (!binding || !validRange(state.doc, range)) return null;
  let from: RelativePosition;
  let to: RelativePosition;
  try {
    from = absolutePositionToRelativePosition(range.from, binding.type, binding.mapping);
    to = absolutePositionToRelativePosition(range.to, binding.type, binding.mapping);
  } catch {
    return null;
  }
  return {
    resolve(next) {
      const current = syncBinding(next) ?? binding;
      try {
        const absFrom = relativePositionToAbsolutePosition(current.doc, current.type, from, current.mapping);
        const absTo = relativePositionToAbsolutePosition(current.doc, current.type, to, current.mapping);
        return absFrom === null || absTo === null ? null : validRange(next.doc, { from: absFrom, to: absTo });
      } catch {
        return null;
      }
    },
  };
}

/**
 * The range to mark once the thread row exists, or null to leave the thread detached:
 * 1. the draft range read after the await (remapped through every edit; null once its text is gone);
 * 2. otherwise the Yjs-tracked range, only while it still covers the quoted text (relative positions can misresolve
 *    after block moves, and a wrong anchor is worse than a detached thread).
 * Never the numbers captured before the await.
 */
export function pickPostedCommentRange(
  doc: ProseMirrorNode,
  draftRange: CommentAnchor | null,
  trackedRange: CommentAnchor | null,
  quote: string,
): CommentAnchor | null {
  const draft = validRange(doc, draftRange);
  if (draft) return draft;
  const tracked = validRange(doc, trackedRange);
  return tracked && commentQuoteText(doc, tracked) === quote ? tracked : null;
}
