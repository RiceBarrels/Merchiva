"use client";

/**
 * Comment threads view model (docs-editor-ui spec §4.10, adapted to the WP-4 data layer).
 *
 * Usage (editor core): call `useCommentThreads(doc.id, editor, { trackAnchors })` ONCE in `DocEditor`.
 * - Always subscribed, because the hook keeps `editor.commands.setOpenCommentThreads(openIds)` and
 *   `setCommentAnchors(position anchors)` in sync, and those drive the highlight decorations even while no panel is
 *   open. The header uses `openCount` for its badge.
 * - Pass `trackAnchors: true` only while the comments panel or margin is visible. Anchors of both kinds (mark ranges
 *   in `editor.state.doc`, resolved position anchors from the comment-mark plugin; the mark wins) are recomputed
 *   debounced 150 ms after document changes, and right away when only position anchors moved. With
 *   `trackAnchors: false` every `anchor` is null.
 * - Pass the returned state to `CommentsPanel` / `CommentsMargin` (`threads` prop).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import { collectCommentMarkRanges, mergeCommentAnchors } from "@/lib/docs/comment-anchors";
import { getCommentPositionRanges, type CommentAnchorInput } from "@/lib/docs/extensions/comment-mark";
import type { DocComment, DocCommentThread } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useDocumentComments } from "@/lib/spacetimedb/hooks/useDocs";

export type CommentsFilter = "open" | "resolved" | "all";

export interface CommentAnchor {
  readonly from: number;
  readonly to: number;
}

export interface CommentThreadVM {
  /** Equals the comment mark's `threadId` attribute. */
  readonly threadId: string;
  readonly root: DocComment;
  /** Oldest first. */
  readonly replies: readonly DocComment[];
  readonly resolved: boolean;
  readonly authorName: string;
  readonly resolvedByName: string | null;
  /** `root.quotedText ?? ""`; shown for detached threads. */
  readonly quote: string;
  /**
   * Min `from` / max `to` of the thread's mark ranges, else its resolved position anchor; null when detached or when
   * anchors aren't tracked.
   */
  readonly anchor: CommentAnchor | null;
  /** Latest activity (root, reply or edit) — tie-breaker when several threads share a position. */
  readonly lastActivityAt: Date;
}

export interface CommentThreadsState {
  /** Ordered by anchor position; detached threads (null anchor) last, newest first. */
  readonly threads: readonly CommentThreadVM[];
  /** Unresolved threads, attached or not. */
  readonly openCount: number;
  readonly ready: boolean;
}

/**
 * An in-progress new comment. The editor core creates it on "Add comment" (selection button, Insert ▸ Comment,
 * Mod+Alt+M) together with the comment-mark plugin's draft decoration.
 */
export interface CommentDraft {
  /** Selected text when the draft started, max 200 characters. Stored as `quotedText`. */
  readonly quote: string;
  /**
   * The draft range remapped through edits made while composing (read from the comment-mark plugin state).
   * Null when the quoted text was deleted; the composer then asks the user to select text again.
   */
  getRange(): CommentAnchor | null;
}

export interface UseCommentThreadsOptions {
  /** Compute anchors (only while a comments panel or the margin is visible). Default false. */
  readonly trackAnchors?: boolean;
}

/** Debounce for anchor recomputation after document changes. */
const ANCHOR_DEBOUNCE_MS = 150;

const EMPTY_STATE: CommentThreadsState = { threads: [], openCount: 0, ready: false };

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function filterCommentThreads(
  threads: readonly CommentThreadVM[],
  filter: CommentsFilter,
): readonly CommentThreadVM[] {
  if (filter === "all") return threads;
  const wantResolved = filter === "resolved";
  return threads.filter((thread) => thread.resolved === wantResolved);
}

/** Mark anchors only: min `from` / max `to` per `threadId` across every text node carrying a `comment` mark. */
export function collectCommentAnchors(doc: ProseMirrorNode): Map<string, CommentAnchor> {
  return collectCommentMarkRanges(doc);
}

/** Position anchors of the threads that have one, for `setCommentAnchors` (resolved threads included: the panel lists them). */
export function collectPositionAnchorInputs(threads: readonly DocCommentThread[]): Map<string, CommentAnchorInput> {
  const inputs = new Map<string, CommentAnchorInput>();
  for (const thread of threads) {
    const anchor = thread.root.anchor;
    if (anchor && anchor.byteLength > 0) inputs.set(thread.threadId, { anchor, quote: thread.root.quotedText ?? "" });
  }
  return inputs;
}

function time(date: Date | null | undefined): number {
  return date ? date.getTime() : 0;
}

function lastActivity(thread: DocCommentThread): Date {
  let latest = Math.max(time(thread.root.createdAt), time(thread.root.editedAt), time(thread.root.resolvedAt));
  for (const reply of thread.replies) latest = Math.max(latest, time(reply.createdAt), time(reply.editedAt));
  return new Date(latest);
}

export interface BuildThreadViewModelsInput {
  readonly threads: readonly DocCommentThread[];
  /** Thread id → anchor, or null when anchors aren't tracked. */
  readonly anchors: ReadonlyMap<string, CommentAnchor> | null;
  /** Member id → display name. */
  readonly memberName: (memberId: string) => string | null;
  /** Shown for authors who are no longer members. */
  readonly unknownName: string;
}

/**
 * Joins threads with author names and anchors, ordered by anchor position (ties: most recent activity first),
 * with detached threads last, newest first.
 */
export function buildThreadViewModels(input: BuildThreadViewModelsInput): CommentThreadVM[] {
  const models = input.threads.map((thread): CommentThreadVM => {
    const resolved = thread.root.status === "resolved";
    const resolvedBy = resolved && thread.root.resolvedByMemberId ? input.memberName(thread.root.resolvedByMemberId) : null;
    return {
      threadId: thread.threadId,
      root: thread.root,
      replies: thread.replies,
      resolved,
      authorName: input.memberName(thread.root.authorMemberId) ?? input.unknownName,
      resolvedByName: resolved ? (resolvedBy ?? (thread.root.resolvedByMemberId ? input.unknownName : null)) : null,
      quote: thread.root.quotedText ?? "",
      anchor: input.anchors?.get(thread.threadId) ?? null,
      lastActivityAt: lastActivity(thread),
    };
  });
  models.sort((a, b) => {
    if (a.anchor && b.anchor) {
      if (a.anchor.from !== b.anchor.from) return a.anchor.from - b.anchor.from;
      return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
    }
    if (a.anchor) return -1;
    if (b.anchor) return 1;
    return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
  });
  return models;
}

// ── Anchor store (one per editor) ────────────────────────────────────────────

interface AnchorStore {
  doc: ProseMirrorNode | null;
  /** The comment-mark plugin's resolved position anchors `anchors` was built from (identity-compared). */
  ranges: ReadonlyMap<string, CommentAnchor> | null;
  anchors: ReadonlyMap<string, CommentAnchor>;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  /** The document the pending timer was armed for; other transactions (carets, selection) don't re-arm it. */
  timerDoc: ProseMirrorNode | null;
  detach: (() => void) | null;
}

const anchorStores = new WeakMap<Editor, AnchorStore>();

function currentState(editor: Editor): EditorState | null {
  if (editor.isDestroyed) return null;
  try {
    return editor.state;
  } catch {
    return null;
  }
}

function recompute(store: AnchorStore, editor: Editor): boolean {
  const state = currentState(editor);
  if (!state) return false;
  const ranges = getCommentPositionRanges(state);
  if (state.doc === store.doc && ranges === store.ranges) return false;
  store.doc = state.doc;
  store.ranges = ranges;
  store.anchors = mergeCommentAnchors(collectCommentMarkRanges(state.doc), ranges);
  return true;
}

function getAnchorStore(editor: Editor): AnchorStore {
  let store = anchorStores.get(editor);
  if (!store) {
    store = { doc: null, ranges: null, anchors: new Map(), listeners: new Set(), timer: null, timerDoc: null, detach: null };
    anchorStores.set(editor, store);
  }
  return store;
}

function subscribeAnchors(editor: Editor, onChange: () => void): () => void {
  const store = getAnchorStore(editor);
  store.listeners.add(onChange);
  if (!store.detach) {
    const notify = () => {
      for (const listener of [...store.listeners]) listener();
    };
    const onTransaction = () => {
      const state = currentState(editor);
      if (!state) return;
      if (state.doc !== store.doc) {
        // Document edits: debounce the walk over the marks.
        if (store.timer && store.timerDoc === state.doc) return;
        if (store.timer) clearTimeout(store.timer);
        store.timerDoc = state.doc;
        store.timer = setTimeout(() => {
          store.timer = null;
          store.timerDoc = null;
          if (recompute(store, editor)) notify();
        }, ANCHOR_DEBOUNCE_MS);
      } else if (!store.timer && getCommentPositionRanges(state) !== store.ranges) {
        // Only position anchors moved (new thread rows, a settle refresh): apply now.
        if (recompute(store, editor)) notify();
      }
    };
    editor.on("transaction", onTransaction);
    store.detach = () => {
      editor.off("transaction", onTransaction);
      if (store.timer) clearTimeout(store.timer);
      store.timer = null;
      store.timerDoc = null;
    };
    // The document may have changed while nobody was listening.
    if (recompute(store, editor)) queueMicrotask(notify);
  }
  return () => {
    store.listeners.delete(onChange);
    if (store.listeners.size === 0 && store.detach) {
      store.detach();
      store.detach = null;
    }
  };
}

function readAnchors(editor: Editor): ReadonlyMap<string, CommentAnchor> {
  const store = getAnchorStore(editor);
  // Unsubscribed (first read): compute synchronously so an opening panel never flashes every thread as detached.
  // Subscribed: the transaction handler keeps it fresh.
  if (!store.detach || store.doc === null) recompute(store, editor);
  return store.anchors;
}

const noopSubscribe = () => () => {};
const readNull = (): null => null;

function useCommentAnchors(editor: Editor | null, enabled: boolean): ReadonlyMap<string, CommentAnchor> | null {
  const active = enabled && editor !== null && !editor.isDestroyed ? editor : null;
  const subscribe = useCallback(
    (onChange: () => void) => (active ? subscribeAnchors(active, onChange) : () => {}),
    [active],
  );
  const getSnapshot = useCallback(() => (active ? readAnchors(active) : null), [active]);
  return useSyncExternalStore(active ? subscribe : noopSubscribe, active ? getSnapshot : readNull, readNull);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCommentThreads(
  documentId: string | null,
  editor: Editor | null,
  options?: UseCommentThreadsOptions,
): CommentThreadsState {
  const t = useT();
  const { threads: rawThreads, isReady } = useDocumentComments(documentId);
  const [members] = useOrgMembers();
  const anchors = useCommentAnchors(editor, options?.trackAnchors === true);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      const name = member.displayName?.trim() || member.email?.trim() || "";
      if (name) map.set(member.id.toString(), name);
    }
    return map;
  }, [members]);

  const unknownName = t("docs.comments.unknownAuthor");

  const threads = useMemo(
    () =>
      buildThreadViewModels({
        threads: rawThreads,
        anchors,
        memberName: (memberId) => names.get(memberId) ?? null,
        unknownName,
      }),
    [rawThreads, anchors, names, unknownName],
  );

  // Oldest → newest, as the comment-mark plugin expects (a click on overlapping marks activates the newest).
  const openKey = useMemo(
    () =>
      rawThreads
        .filter((thread) => thread.root.status !== "resolved")
        .map((thread) => thread.threadId)
        .join(","),
    [rawThreads],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const ids = new Set(openKey ? openKey.split(",") : []);
    const apply = () => {
      if (editor.isDestroyed) return;
      try {
        editor.commands.setOpenCommentThreads(ids);
      } catch {
        // The view isn't mounted yet; the "create" listener below retries.
      }
    };
    apply();
    editor.on("create", apply);
    return () => {
      editor.off("create", apply);
    };
  }, [editor, openKey]);

  // Position anchors (commenters' threads, editors' fallback). The command skips unchanged anchors, so a new reply or an
  // edit elsewhere in the table costs one no-op transaction.
  const anchorInputs = useMemo(() => collectPositionAnchorInputs(rawThreads), [rawThreads]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const apply = () => {
      if (editor.isDestroyed) return;
      try {
        editor.commands.setCommentAnchors(anchorInputs);
      } catch {
        // The view isn't mounted yet; the "create" listener below retries.
      }
    };
    apply();
    editor.on("create", apply);
    return () => {
      editor.off("create", apply);
    };
  }, [editor, anchorInputs]);

  const openCount = useMemo(() => threads.reduce((count, thread) => count + (thread.resolved ? 0 : 1), 0), [threads]);

  return useMemo(
    () => (documentId === null ? EMPTY_STATE : { threads, openCount, ready: isReady }),
    [documentId, threads, openCount, isReady],
  );
}
