"use client";

/**
 * Google-Docs-style comment cards aligned to their anchors, beside the page sheet (docs-editor-ui spec §4.10
 * "CommentsMargin"). The editor core renders it inside the canvas row, after the `PageSheet`, only in aligned mode
 * (`wide && commentsFilter === "open"`). It scrolls with the page.
 *
 * Props: every `CommentsViewProps` field (same write ownership as `CommentsPanel`, including the draft composer
 * card placed at the draft's top), plus:
 * - `sheetRef` — the `.doc-page` element; its size changes (content growth, zoom) trigger a new layout.
 * - `zoom` — effective zoom of the sheet (CSS `zoom`); layout recomputes when it changes.
 * - `filter` / `onFilterChange` — the sticky Open / Resolved / All control (the only way to reach resolved threads on a
 *   wide window); a resolved thread that becomes active switches the filter to Resolved.
 *
 * Placement: open anchored threads (and the draft) sit at `coordsAtPos(anchor.from).top` relative to this container —
 * both are viewport coordinates, so the sheet's CSS zoom is already applied. Overlaps are resolved by
 * `layoutMarginItems` (the active thread pins to its anchor). Open threads whose text was deleted stack below.
 * Heights come from a ResizeObserver; layout runs at most once per animation frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { filterCommentThreads, type CommentAnchor, type CommentThreadVM, type CommentsFilter } from "@/lib/docs/use-comment-threads";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

import type { CommentsViewProps } from "./comments-panel";
import { CommentThreadCard, DraftCommentCard } from "./comment-thread";
import { layoutMarginItems, marginLayoutEnd, MARGIN_CARD_GAP, samePositions, type MarginItem } from "./margin-layout";
import { useMemberNameResolver, useMinuteClock } from "./panel-hooks";
import { useCommentActions } from "./use-comment-actions";

export interface CommentsMarginProps extends CommentsViewProps {
  sheetRef: React.RefObject<HTMLElement | null>;
  zoom: number;
  /** The editor's comments filter; the margin itself only lists open threads (aligned mode means `"open"`). */
  filter?: CommentsFilter;
  /**
   * With it, the margin shows a sticky Open / Resolved / All control. Picking Resolved or All leaves aligned mode, so the
   * editor core shows `CommentsPanel` instead. A resolved thread that becomes active (a `?comment=` link) switches to
   * Resolved the same way, since its card can't appear here.
   */
  onFilterChange?(filter: CommentsFilter): void;
}

const DRAFT_KEY = "__draft__";
const DETACHED_GAP = 24;

function anchorTop(editor: Editor, pos: number): number | null {
  if (editor.isDestroyed) return null;
  try {
    const size = editor.state.doc.content.size;
    return editor.view.coordsAtPos(Math.max(0, Math.min(pos, size))).top;
  } catch {
    return null;
  }
}

function cardHeight(container: HTMLElement, key: string): number {
  const card = container.querySelector<HTMLElement>(`[data-card-key="${key}"]`);
  return card ? card.offsetHeight : 0;
}

export function CommentsMargin({
  sheetRef,
  zoom,
  documentId,
  editor,
  access,
  memberId,
  threads,
  activeThreadId,
  onActivateThread,
  draft,
  onDraftDone,
  filter = "open",
  onFilterChange,
  trashed = false,
}: CommentsMarginProps): React.JSX.Element {
  const t = useT();
  const nameOf = useMemberNameResolver();
  const now = useMinuteClock();
  const actions = useCommentActions({ documentId, editor, access, memberId, activeThreadId, onActivateThread, onDraftDone, trashed });
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<ReadonlyMap<string, number>>(() => new Map());

  const openThreads = useMemo(() => threads.threads.filter((thread) => !thread.resolved), [threads.threads]);
  const anchored = useMemo(() => openThreads.filter((thread) => thread.anchor !== null), [openThreads]);
  const unanchored = useMemo(() => openThreads.filter((thread) => thread.anchor === null), [openThreads]);
  const showDraft = draft !== null && access.canComment;

  const layout = useCallback(() => {
    const container = containerRef.current;
    if (!container || !editor || editor.isDestroyed) return;
    const base = container.getBoundingClientRect().top;
    // Cards start below the filter control at the top of the margin.
    const minTop = headerRef.current ? headerRef.current.offsetHeight : 0;
    const items: MarginItem[] = [];
    for (const thread of anchored) {
      const top = anchorTop(editor, (thread.anchor as CommentAnchor).from);
      if (top === null) continue;
      items.push({ id: thread.threadId, top: Math.max(minTop, top - base), height: cardHeight(container, thread.threadId) });
    }
    if (showDraft && draft) {
      const range = draft.getRange();
      const top = range ? anchorTop(editor, range.from) : null;
      items.push({ id: DRAFT_KEY, top: top === null ? minTop : Math.max(minTop, top - base), height: cardHeight(container, DRAFT_KEY) });
    }
    const next = layoutMarginItems(items, showDraft ? DRAFT_KEY : activeThreadId);
    let y = items.length > 0 ? marginLayoutEnd(items, next) + DETACHED_GAP : minTop;
    for (const thread of unanchored) {
      next.set(thread.threadId, Math.round(y));
      y += cardHeight(container, thread.threadId) + MARGIN_CARD_GAP;
    }
    setPositions((prev) => (samePositions(prev, next) ? prev : next));
  }, [activeThreadId, anchored, draft, editor, showDraft, unanchored]);

  const layoutRef = useRef(layout);
  const frameRef = useRef(0);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      layoutRef.current();
    });
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  // Inputs that move cards: anchors, zoom, the active thread, the draft.
  useEffect(() => {
    schedule();
  }, [schedule, layout, zoom]);

  // Document edits move anchors before the debounced anchor recomputation lands.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.on("update", schedule);
    return () => {
      editor.off("update", schedule);
    };
  }, [editor, schedule]);

  // Size changes: container, page sheet (content growth), every card, the window.
  const observerRef = useRef<ResizeObserver | null>(null);
  const observedRef = useRef<WeakSet<Element>>(new WeakSet());
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(schedule);
    observerRef.current = observer;
    observedRef.current = new WeakSet();
    if (containerRef.current) observer.observe(containerRef.current);
    const sheet = sheetRef.current;
    if (sheet) observer.observe(sheet);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      observerRef.current = null;
      window.removeEventListener("resize", schedule);
    };
  }, [schedule, sheetRef]);

  useEffect(() => {
    const observer = observerRef.current;
    const container = containerRef.current;
    if (!observer || !container) return;
    for (const card of Array.from(container.querySelectorAll("[data-card-key]"))) {
      if (observedRef.current.has(card)) continue;
      observedRef.current.add(card);
      observer.observe(card);
    }
  });

  // A thread that becomes active while resolved (`?comment=` link at open or later) has no card here: hand over to the
  // panel's Resolved list. Only activation changes count, so resolving the active thread doesn't switch lists.
  const seenActiveRef = useRef<string | null>(null);
  const revealRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeThreadId !== seenActiveRef.current) {
      seenActiveRef.current = activeThreadId;
      revealRef.current = activeThreadId;
    }
    const threadId = revealRef.current;
    if (!threadId || !threads.ready) return;
    revealRef.current = null;
    const thread = threads.threads.find((item) => item.threadId === threadId);
    if (thread?.resolved && onFilterChange) onFilterChange("resolved");
  }, [activeThreadId, threads.ready, threads.threads, onFilterChange]);

  const changeFilter = (next: CommentsFilter) => {
    if (!onFilterChange || next === filter) return;
    // Don't carry an active thread into a list that hides it (the panel would switch straight back to show it).
    const active = activeThreadId ? threads.threads.find((thread) => thread.threadId === activeThreadId) : undefined;
    if (active && filterCommentThreads([active], next).length === 0) onActivateThread(null);
    onFilterChange(next);
  };

  const place = (key: string): React.CSSProperties => {
    const y = positions.get(key);
    return y === undefined ? { visibility: "hidden" } : { transform: `translateY(${y}px)` };
  };

  const renderThread = (thread: CommentThreadVM, isDetached: boolean) => (
    <div
      key={thread.threadId}
      data-card-key={thread.threadId}
      className={cn("absolute inset-x-0 top-0 transition-transform duration-150 ease-out motion-reduce:transition-none", thread.threadId === activeThreadId && "z-10")}
      style={place(thread.threadId)}
    >
      <CommentThreadCard
        thread={thread}
        active={thread.threadId === activeThreadId}
        detached={isDetached}
        density="margin"
        actions={actions}
        nameOf={nameOf}
        now={now}
        onActivate={() => {
          actions.jumpTo(thread);
          onActivateThread(thread.threadId);
        }}
      />
    </div>
  );

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t("docs.comments.title")}
      data-comments-margin=""
      data-zoom={zoom}
      className="relative w-[280px] shrink-0"
    >
      {onFilterChange && (
        <div ref={headerRef} className="sticky top-0 z-30 bg-muted pb-2">
          <SegmentedControl
            size="sm"
            fullWidth
            aria-label={t("docs.comments.title")}
            value={filter}
            onChange={changeFilter}
            options={[
              { value: "open", label: t("docs.comments.filterOpen"), count: threads.ready ? threads.openCount : undefined },
              { value: "resolved", label: t("docs.comments.filterResolved"), count: threads.ready ? threads.threads.length - threads.openCount : undefined },
              { value: "all", label: t("docs.comments.filterAll") },
            ]}
          />
        </div>
      )}
      {showDraft && draft && (
        <div
          data-card-key={DRAFT_KEY}
          className="absolute inset-x-0 top-0 z-20 transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={place(DRAFT_KEY)}
        >
          <DraftCommentCard draft={draft} actions={actions} density="margin" onCancel={() => onDraftDone(null)} />
        </div>
      )}
      {anchored.map((thread) => renderThread(thread, false))}
      {unanchored.map((thread) => renderThread(thread, true))}
      {actions.deleteDialog}
    </div>
  );
}
