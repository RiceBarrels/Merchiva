"use client";

/**
 * Every comment write of the editor (plan §B5.4 actions), shared by `CommentsPanel` and `CommentsMargin`:
 * post a new thread (the row carries the selection as a position anchor, `lib/docs/comment-anchors.ts`; members who can
 * edit then also write the mark on the range re-resolved after the round trip, see `./comment-anchor`), reply, edit,
 * resolve/reopen, delete (with confirmation) and jump to an anchor of either kind. Failures show a toast; the returned
 * promises reject so composers keep their text.
 */
import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { encodeCommentAnchor } from "@/lib/docs/comment-anchors";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import { getCommentAnchor } from "@/lib/docs/extensions/comment-mark";
import { newDocumentId } from "@/lib/docs/ids";
import type { DocAccess, DocComment } from "@/lib/docs/types";
import type { CommentDraft, CommentThreadVM } from "@/lib/docs/use-comment-threads";
import { useT } from "@/lib/i18n/context";
import {
  addDocumentComment,
  deleteDocumentComment,
  editDocumentComment,
  replyDocumentComment,
  resolveDocumentComment,
} from "@/lib/spacetimedb/actions";

import { pickPostedCommentRange, trackCommentRange } from "./comment-anchor";

export interface UseCommentActionsArgs {
  documentId: string;
  editor: Editor | null;
  access: DocAccess;
  memberId: string | null;
  activeThreadId: string | null;
  onActivateThread(threadId: string | null): void;
  onDraftDone(threadId: string | null): void;
  /** The document is in the trash: the server rejects comment deletes as well (other writes follow access.canComment). */
  trashed?: boolean;
}

export interface CommentActions {
  readonly canComment: boolean;
  canEditComment(comment: DocComment): boolean;
  canDeleteComment(comment: DocComment): boolean;
  isBusy(key: string): boolean;
  postThread(draft: CommentDraft, body: string): Promise<void>;
  reply(thread: CommentThreadVM, body: string): Promise<void>;
  edit(comment: DocComment, body: string): Promise<void>;
  setResolved(thread: CommentThreadVM, resolved: boolean): Promise<void>;
  requestDelete(thread: CommentThreadVM, comment: DocComment): void;
  /**
   * Selects the start of the thread's current anchor (mark or position, read from the editor, so it doesn't wait for the
   * debounced list anchors) and scrolls it into view. No-op while the thread is detached.
   */
  jumpTo(thread: CommentThreadVM): void;
  /** Must be rendered once by the consumer. */
  readonly deleteDialog: React.ReactNode;
}

interface DeleteTarget {
  thread: CommentThreadVM;
  comment: DocComment;
}

function usableEditor(editor: Editor | null): Editor | null {
  return editor && !editor.isDestroyed ? editor : null;
}

export function useCommentActions({
  documentId,
  editor,
  access,
  memberId,
  activeThreadId,
  onActivateThread,
  onDraftDone,
  trashed = false,
}: UseCommentActionsArgs): CommentActions {
  const t = useT();
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const track = useCallback(async <T,>(key: string, task: () => Promise<T>): Promise<T> => {
    setBusy((prev) => new Set(prev).add(key));
    try {
      return await task();
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const errorText = useCallback(
    (err: unknown, fallbackKey: string) => {
      const code = docErrorCode(err);
      return code && code !== "invalid" ? t(DOC_ERROR_I18N_KEYS[code]) : t(fallbackKey);
    },
    [t],
  );

  const jumpTo = useCallback(
    (thread: CommentThreadVM) => {
      const live = usableEditor(editor);
      if (!live) return;
      const anchor = getCommentAnchor(live.state, thread.threadId);
      if (!anchor) return;
      try {
        const size = live.state.doc.content.size;
        live.chain().setTextSelection(Math.max(0, Math.min(anchor.from, size))).scrollIntoView().run();
      } catch {
        // Anchor outside the current document (remote edit in flight); ignore.
      }
    },
    [editor],
  );

  const postThread = useCallback(
    async (draft: CommentDraft, body: string) => {
      const range = draft.getRange();
      if (!range) {
        toast.error(t("docs.comments.draftLost"));
        throw new Error("Comment draft range was deleted");
      }
      const before = usableEditor(editor);
      // The position anchor is the only one a commenter can write (a mark is a document update, rejected below editor).
      // Members who can edit send it too: it keeps the thread anchored if their mark can't be applied.
      const anchor = before ? encodeCommentAnchor(before.state, range) : null;
      // Edits can land while the reducer round trip is in flight; track the range instead of keeping its numbers.
      const tracked = access.canEdit && before ? trackCommentRange(before.state, range) : null;
      const threadId = newDocumentId();
      try {
        await track("post", () =>
          addDocumentComment({ documentId, threadId, body, quotedText: draft.quote || undefined, anchor: anchor ?? undefined }),
        );
      } catch (err) {
        toast.error(errorText(err, "docs.comments.failed"));
        throw err;
      }
      // Members who can edit also write the mark: it is content, so it follows text through block restyles and moves.
      const live = usableEditor(editor);
      if (access.canEdit && live) {
        const target = pickPostedCommentRange(live.state.doc, draft.getRange(), tracked?.resolve(live.state) ?? null, draft.quote);
        if (target) {
          try {
            live.chain().setTextSelection(target).setComment(threadId).run();
          } catch {
            // The range became invalid between checks; the thread is listed as detached.
          }
        }
      }
      onDraftDone(threadId);
    },
    [access.canEdit, documentId, editor, errorText, onDraftDone, t, track],
  );

  const reply = useCallback(
    async (thread: CommentThreadVM, body: string) => {
      try {
        await track(`reply:${thread.threadId}`, () => replyDocumentComment({ documentId, threadId: thread.threadId, body }));
      } catch (err) {
        toast.error(errorText(err, "docs.comments.failed"));
        throw err;
      }
    },
    [documentId, errorText, track],
  );

  const edit = useCallback(
    async (comment: DocComment, body: string) => {
      if (body === comment.body) return;
      try {
        await track(`edit:${comment.id}`, () => editDocumentComment(documentId, comment.id, body));
      } catch (err) {
        toast.error(errorText(err, "docs.comments.actionFailed"));
        throw err;
      }
    },
    [documentId, errorText, track],
  );

  const setResolved = useCallback(
    async (thread: CommentThreadVM, resolved: boolean) => {
      try {
        await track(`resolve:${thread.threadId}`, () => resolveDocumentComment(documentId, thread.root.id, resolved));
        if (resolved && activeThreadId === thread.threadId) onActivateThread(null);
      } catch (err) {
        toast.error(errorText(err, "docs.comments.actionFailed"));
      }
    },
    [activeThreadId, documentId, errorText, onActivateThread, track],
  );

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    const isRoot = target.comment.parentId === null;
    try {
      await track(`delete:${target.comment.id}`, () => deleteDocumentComment(documentId, target.comment.id));
    } catch (err) {
      toast.error(errorText(err, "docs.comments.actionFailed"));
      return;
    }
    if (isRoot) {
      const live = usableEditor(editor);
      if (access.canEdit && live) {
        try {
          live.commands.unsetComment(target.thread.threadId);
        } catch {
          // Nothing to unmark.
        }
      }
      if (activeThreadId === target.thread.threadId) onActivateThread(null);
    }
    setDeleteTarget(null);
  };

  const deleting = deleteTarget ? busy.has(`delete:${deleteTarget.comment.id}`) : false;
  const deleteIsRoot = deleteTarget?.comment.parentId === null;

  const deleteDialog = (
    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) setDeleteTarget(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{deleteIsRoot ? t("docs.comments.deleteThread") : t("docs.comments.delete")}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteIsRoot ? t("docs.comments.deleteConfirm") : t("docs.comments.deleteCommentConfirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deleting} aria-busy={deleting || undefined} onClick={() => void confirmDelete()}>
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    canComment: access.canComment,
    canEditComment: (comment) => access.canComment && memberId !== null && comment.authorMemberId === memberId,
    canDeleteComment: (comment) => !trashed && (access.canManage || (memberId !== null && comment.authorMemberId === memberId)),
    isBusy: (key) => busy.has(key),
    postThread,
    reply,
    edit,
    setResolved,
    requestDelete: (thread, comment) => setDeleteTarget({ thread, comment }),
    jumpTo,
    deleteDialog,
  };
}
