"use client";

/**
 * Comment threads list (docs-editor-ui spec §4.10). Used as the desktop side panel (`variant="list"`, inside
 * `SidePanelFrame`) and as the mobile Comments page (`variant="page"`, inside a DynamicUIElement). The aligned
 * desktop margin is `CommentsMargin`, which takes the same `CommentsViewProps`.
 *
 * Data flow: the editor core calls `useCommentThreads` once and passes the state in `threads`. UI state (filter,
 * active thread, draft) lives in the editor core and comes in through props. This component owns every comment
 * write and its error toast, through `useCommentActions`:
 * - **New thread** (`draft` set): composer at the top. Submit runs `addDocumentComment({ documentId, threadId: newId,
 *   body, quotedText: draft.quote, anchor })`, where `anchor` is the draft range as Yjs relative positions. Only after it
 *   succeeds, and only when `access.canEdit`, it also applies the mark:
 *   `editor.chain().setTextSelection(draft.getRange()).setComment(threadId).run()`. Then `onDraftDone(threadId)`.
 *   Cancel runs `onDraftDone(null)`. On failure the draft stays.
 *   Commenter-only users (`canComment && !canEdit`) can't write the mark, because it is a document update that
 *   the server rejects below editor. Their thread is anchored by its position anchor instead, highlighted the same way
 *   by the comment-mark plugin; it is listed as detached once its text is gone.
 * - **Reply** `replyDocumentComment`; **resolve/reopen** `resolveDocumentComment(documentId, rootId, resolved)`;
 *   **edit** `editDocumentComment` (author only); **delete** `deleteDocumentComment` (author or `canManage`). Deleting
 *   the root deletes the thread, followed by `editor.commands.unsetComment(threadId)` when `access.canEdit`.
 * - **Activate**: clicking a card selects the anchor (`editor.chain().setTextSelection(anchor.from).scrollIntoView().run()`)
 *   and calls `onActivateThread(threadId)`. The mobile page closes itself from that callback.
 * - **Deep link** (`&comment=`): when the panel mounts with `activeThreadId` set, it switches the filter to show that
 *   thread if needed, scrolls its card into view and jumps to its anchor once.
 *
 * Layout: `SegmentedControl size="sm" fullWidth` (Open / Resolved / All) → `onFilterChange`, then
 * `filterCommentThreads(threads.threads, filter)` with detached threads under a "Detached" section. Viewers without
 * `canComment` see threads read-only with `docs.comments.cannotComment`. Loading: `Loader2`. Empty: `EmptyState compact`.
 */
import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { Loader2, MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { DocAccess } from "@/lib/docs/types";
import {
  filterCommentThreads,
  type CommentDraft,
  type CommentThreadsState,
  type CommentThreadVM,
  type CommentsFilter,
} from "@/lib/docs/use-comment-threads";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

import { CommentThreadCard, DraftCommentCard } from "./comment-thread";
import { useMemberNameResolver, useMinuteClock } from "./panel-hooks";
import { useCommentActions } from "./use-comment-actions";

/** Props shared by `CommentsPanel` and `CommentsMargin`. */
export interface CommentsViewProps {
  documentId: string;
  /** Live editor; null while loading. */
  editor: Editor | null;
  access: DocAccess;
  /** Current member id (author checks); null while resolving. */
  memberId: string | null;
  threads: CommentThreadsState;
  activeThreadId: string | null;
  /** Also mirrors the active thread into the comment-mark plugin (`setActiveComment`) in the editor core. */
  onActivateThread(threadId: string | null): void;
  draft: CommentDraft | null;
  /** `threadId` after a successful post, `null` on cancel. The editor core clears the draft decoration and activates the thread. */
  onDraftDone(threadId: string | null): void;
  /** The document is in the trash (the trashed banner explains why nothing can be changed). */
  trashed?: boolean;
}

export interface CommentsPanelProps extends CommentsViewProps {
  variant: "list" | "page";
  filter: CommentsFilter;
  onFilterChange(filter: CommentsFilter): void;
}

function escapeAttr(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

export function CommentsPanel({
  variant,
  filter,
  onFilterChange,
  documentId,
  editor,
  access,
  memberId,
  threads,
  activeThreadId,
  onActivateThread,
  draft,
  onDraftDone,
  trashed = false,
}: CommentsPanelProps): React.JSX.Element {
  const t = useT();
  const nameOf = useMemberNameResolver();
  const now = useMinuteClock();
  const listRef = useRef<HTMLDivElement>(null);
  const actions = useCommentActions({ documentId, editor, access, memberId, activeThreadId, onActivateThread, onDraftDone, trashed });

  const all = threads.threads;
  const visible = useMemo(() => filterCommentThreads(all, filter), [all, filter]);
  const attached = visible.filter((thread) => thread.anchor !== null);
  const detached = visible.filter((thread) => thread.anchor === null);
  const resolvedCount = all.length - threads.openCount;
  const density = variant === "page" ? "page" : "panel";
  const showDraft = draft !== null && access.canComment;

  // Deep link: the thread the panel was opened for (captured once at mount).
  const pendingFocusRef = useRef<string | null>(activeThreadId);
  const { jumpTo } = actions;
  useEffect(() => {
    const threadId = pendingFocusRef.current;
    if (!threadId || !threads.ready) return;
    const thread = all.find((item) => item.threadId === threadId);
    if (!thread) {
      pendingFocusRef.current = null;
      return;
    }
    if (!filterCommentThreads([thread], filter).length) {
      onFilterChange(thread.resolved ? "resolved" : "open");
      return;
    }
    if (thread.anchor && !editor) return;
    pendingFocusRef.current = null;
    jumpTo(thread);
  }, [all, threads.ready, filter, onFilterChange, editor, jumpTo]);

  // A thread activated after mount (a new `?comment=` link, a highlight click) that the filter hides: show its list.
  // The editor core moves the selection for links; clicks already happened at the anchor.
  const seenActiveRef = useRef(activeThreadId);
  const revealRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeThreadId !== seenActiveRef.current) {
      seenActiveRef.current = activeThreadId;
      revealRef.current = activeThreadId;
    }
    const threadId = revealRef.current;
    if (!threadId || !threads.ready) return;
    revealRef.current = null;
    const thread = all.find((item) => item.threadId === threadId);
    if (thread && filterCommentThreads([thread], filter).length === 0) onFilterChange(thread.resolved ? "resolved" : "open");
  }, [activeThreadId, all, threads.ready, filter, onFilterChange]);

  const changeFilter = (next: CommentsFilter) => {
    if (next === filter) return;
    // Don't keep an active thread the new list hides: the reveal logic (here or in the margin) would switch back.
    const active = activeThreadId ? all.find((thread) => thread.threadId === activeThreadId) : undefined;
    if (active && filterCommentThreads([active], next).length === 0) onActivateThread(null);
    onFilterChange(next);
  };

  // Keep the active card visible (highlight clicks in the editor, deep links).
  useEffect(() => {
    if (!activeThreadId) return;
    const card = listRef.current?.querySelector<HTMLElement>(`[data-thread-id="${escapeAttr(activeThreadId)}"]`);
    card?.scrollIntoView({ block: "nearest" });
  }, [activeThreadId, visible]);

  const activate = (thread: CommentThreadVM) => {
    actions.jumpTo(thread);
    onActivateThread(thread.threadId);
  };

  const renderCard = (thread: CommentThreadVM, isDetached: boolean) => (
    <CommentThreadCard
      key={thread.threadId}
      thread={thread}
      active={thread.threadId === activeThreadId}
      detached={isDetached}
      density={density}
      actions={actions}
      nameOf={nameOf}
      now={now}
      onActivate={() => activate(thread)}
    />
  );

  const emptyTitle =
    all.length === 0
      ? t("docs.comments.emptyTitle")
      : filter === "resolved"
        ? t("docs.comments.emptyResolvedTitle")
        : t("docs.comments.emptyOpenTitle");

  return (
    <section
      aria-label={t("docs.comments.title")}
      data-variant={variant}
      className={cn("flex min-h-0 flex-col", variant === "page" ? "gap-3" : "gap-2 p-3")}
    >
      <SegmentedControl
        size="sm"
        fullWidth
        aria-label={t("docs.comments.title")}
        value={filter}
        onChange={changeFilter}
        options={[
          { value: "open", label: t("docs.comments.filterOpen"), count: threads.ready ? threads.openCount : undefined },
          { value: "resolved", label: t("docs.comments.filterResolved"), count: threads.ready ? resolvedCount : undefined },
          { value: "all", label: t("docs.comments.filterAll") },
        ]}
      />

      {!access.canComment && !trashed && <p className="text-[12px] text-muted-foreground">{t("docs.comments.cannotComment")}</p>}

      {showDraft && draft && (
        <DraftCommentCard draft={draft} actions={actions} density={density} onCancel={() => onDraftDone(null)} />
      )}

      {!threads.ready ? (
        <div className="flex justify-center p-6" role="status" aria-label={t("common.loading")}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        !showDraft && (
          <EmptyState
            compact
            icon={MessageSquare}
            title={emptyTitle}
            description={all.length === 0 ? t("docs.comments.emptyDescription") : undefined}
          />
        )
      ) : (
        <div ref={listRef} className={cn("flex flex-col", variant === "page" ? "gap-3" : "gap-2")}>
          {attached.map((thread) => renderCard(thread, false))}
          {detached.length > 0 && (
            <>
              <Eyebrow as="h4" className={cn("px-0.5", attached.length > 0 && "mt-2")}>
                {t("docs.comments.detachedSection")}
              </Eyebrow>
              {detached.map((thread) => renderCard(thread, true))}
            </>
          )}
        </div>
      )}
      {actions.deleteDialog}
    </section>
  );
}
