"use client";

/**
 * One comment thread card (docs-editor-ui spec §4.10 "CommentThread") and the new-comment draft card.
 * Used by the side panel (`density="panel"`), the mobile page (`"page"`) and the aligned margin (`"margin"`, where
 * inactive cards collapse to the root comment).
 */
import { useState } from "react";
import { Check, MoreVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime, formatRelativeTime } from "@/lib/docs/format";
import type { DocComment } from "@/lib/docs/types";
import type { CommentDraft, CommentThreadVM } from "@/lib/docs/use-comment-threads";
import { useI18n, useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

import { CommentComposer } from "./comment-composer";
import type { CommentActions } from "./use-comment-actions";

export type CommentCardDensity = "panel" | "margin" | "page";

const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [role='menuitem'], [data-no-activate]";

interface CommentItemProps {
  thread: CommentThreadVM;
  comment: DocComment;
  name: string;
  isRoot: boolean;
  density: CommentCardDensity;
  actions: CommentActions;
  now: number;
  editing: boolean;
  onStartEdit(): void;
  onStopEdit(): void;
}

function CommentItem({ thread, comment, name, isRoot, density, actions, now, editing, onStartEdit, onStopEdit }: CommentItemProps) {
  const { t, locale } = useI18n();
  const canEdit = actions.canEditComment(comment);
  const canDelete = actions.canDeleteComment(comment);
  const created = comment.createdAt;
  const resolveBusy = actions.isBusy(`resolve:${thread.threadId}`);

  return (
    <div className="flex items-start gap-2">
      <Avatar name={name} size={density === "page" ? "sm" : "xs"} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="truncate font-medium text-foreground">{name}</span>
          <time
            dateTime={created.toISOString()}
            title={formatDateTime(created, locale)}
            className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
          >
            {formatRelativeTime(created, locale, Math.max(now, created.getTime()))}
          </time>
          {comment.editedAt && <span className="shrink-0 text-[11px] text-muted-foreground">({t("docs.comments.edited")})</span>}
        </div>
        {editing ? (
          <CommentComposer
            className="mt-1.5"
            autoFocus
            initialValue={comment.body}
            placeholder={isRoot ? t("docs.comments.placeholder") : t("docs.comments.replyPlaceholder")}
            submitLabel={t("common.save")}
            onSubmit={async (body) => {
              await actions.edit(comment, body);
              onStopEdit();
            }}
            onCancel={onStopEdit}
          />
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">{comment.body}</p>
        )}
      </div>
      {isRoot && actions.canComment && !editing && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={thread.resolved ? t("docs.comments.reopen") : t("docs.comments.resolve")}
          title={thread.resolved ? t("docs.comments.reopen") : t("docs.comments.resolve")}
          disabled={resolveBusy}
          onClick={() => void actions.setResolved(thread, !thread.resolved)}
        >
          {thread.resolved ? <RotateCcw className="h-3.5 w-3.5 rtl:-scale-x-100" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
      )}
      {(canEdit || canDelete) && !editing && (
        <DocMenu>
          <DocMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-xs" aria-label={t("docs.comments.actions")} />}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DocMenuTrigger>
          <DocMenuContent align="end">
            {canEdit && (
              <DocMenuItem icon={Pencil} onClick={onStartEdit}>
                {t("docs.comments.edit")}
              </DocMenuItem>
            )}
            {canDelete && (
              <DocMenuItem icon={Trash2} destructive onClick={() => actions.requestDelete(thread, comment)}>
                {isRoot ? t("docs.comments.deleteThread") : t("docs.comments.delete")}
              </DocMenuItem>
            )}
          </DocMenuContent>
        </DocMenu>
      )}
    </div>
  );
}

export interface CommentThreadCardProps {
  thread: CommentThreadVM;
  active: boolean;
  /** Listed in the detached section: shows the stored quote and a hint. */
  detached: boolean;
  density: CommentCardDensity;
  actions: CommentActions;
  nameOf(memberId: string): string;
  now: number;
  onActivate(): void;
  className?: string;
}

export function CommentThreadCard({
  thread,
  active,
  detached,
  density,
  actions,
  nameOf,
  now,
  onActivate,
  className,
}: CommentThreadCardProps): React.JSX.Element {
  const t = useT();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const replies = thread.replies;
  const collapsed = density === "margin" && !active;
  let shown: readonly DocComment[] = replies;
  let hidden = 0;
  if (collapsed) {
    shown = [];
    hidden = replies.length;
  } else if (!active && !expanded && replies.length > 1) {
    shown = replies.slice(-1);
    hidden = replies.length - 1;
  }

  const hiddenLabel = collapsed
    ? hidden === 1
      ? t("docs.comments.replyOne")
      : fmt(t("docs.comments.replies"), { n: hidden })
    : hidden === 1
      ? t("docs.comments.moreReplyOne")
      : fmt(t("docs.comments.moreReplies"), { n: hidden });

  const itemProps = (comment: DocComment, isRoot: boolean): CommentItemProps => ({
    thread,
    comment,
    isRoot,
    name: isRoot ? thread.authorName : nameOf(comment.authorMemberId),
    density,
    actions,
    now,
    editing: editingId === comment.id,
    onStartEdit: () => {
      setEditingId(comment.id);
      if (!active) onActivate();
    },
    onStopEdit: () => setEditingId(null),
  });

  return (
    <article
      data-thread-id={thread.threadId}
      data-active={active || undefined}
      tabIndex={0}
      aria-label={fmt(t("docs.comments.threadLabel"), { name: thread.authorName })}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-lg border bg-card text-card-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        density === "page" ? "p-3 text-[13px]" : "p-2.5 text-[12.5px]",
        active ? "border-foreground/40" : "cursor-pointer border-border hover:border-foreground/25",
        className,
      )}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
        onActivate();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      {thread.resolved && (
        <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
          <StatusBadge tone="success" size="xs">
            {t("docs.comments.resolvedBadge")}
          </StatusBadge>
          {thread.resolvedByName && (
            <span className="truncate text-[11px] text-muted-foreground">
              {fmt(t("docs.comments.resolvedBy"), { name: thread.resolvedByName })}
            </span>
          )}
        </div>
      )}
      {detached && (
        <div className="mb-2 space-y-1">
          {thread.quote && (
            <blockquote className="line-clamp-3 border-s-2 border-border ps-2 italic text-muted-foreground">{thread.quote}</blockquote>
          )}
          <p className="text-[11px] text-muted-foreground">{t("docs.comments.detached")}</p>
        </div>
      )}
      <CommentItem {...itemProps(thread.root, true)} />
      {hidden > 0 && (
        <button
          type="button"
          className="mt-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
          onClick={() => (collapsed ? onActivate() : setExpanded(true))}
        >
          {hiddenLabel}
        </button>
      )}
      {shown.length > 0 && (
        <ul className="mt-2 space-y-2 border-s border-border ps-2.5">
          {shown.map((reply) => (
            <li key={reply.id}>
              <CommentItem {...itemProps(reply, false)} />
            </li>
          ))}
        </ul>
      )}
      {active && actions.canComment && editingId === null && (
        <CommentComposer
          className="mt-2"
          compact
          placeholder={t("docs.comments.replyPlaceholder")}
          submitLabel={t("docs.comments.reply")}
          onSubmit={(body) => actions.reply(thread, body)}
        />
      )}
    </article>
  );
}

export interface DraftCommentCardProps {
  draft: CommentDraft;
  actions: CommentActions;
  onCancel(): void;
  density: CommentCardDensity;
  className?: string;
}

/** The composer for a new thread, with the quoted selection. */
export function DraftCommentCard({ draft, actions, onCancel, density, className }: DraftCommentCardProps): React.JSX.Element {
  const t = useT();
  return (
    <article
      aria-label={t("docs.comments.add")}
      className={cn(
        "rounded-lg border border-foreground/40 bg-card text-card-foreground",
        density === "page" ? "p-3 text-[13px]" : "p-2.5 text-[12.5px]",
        className,
      )}
    >
      {draft.quote && (
        <blockquote className="mb-2 line-clamp-2 border-s-2 border-border ps-2 italic text-muted-foreground">{draft.quote}</blockquote>
      )}
      <CommentComposer
        autoFocus
        placeholder={t("docs.comments.placeholder")}
        submitLabel={t("docs.comments.post")}
        onSubmit={(body) => actions.postThread(draft, body)}
        onCancel={onCancel}
      />
    </article>
  );
}
