"use client";

// One row of the Forms list: icon by kind, title, a meta line (mono for counts and dates), trailing badge.

import { ClipboardCheck, ClipboardList, FileWarning, MessageSquareHeart, type LucideIcon } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { FormKind } from "@/lib/forms/types";

const KIND_ICON: Record<FormKind, LucideIcon> = {
  form: ClipboardList,
  checklist: ClipboardCheck,
  report: FileWarning,
  survey: MessageSquareHeart,
};

export function FormRow({
  kind,
  title,
  description,
  meta,
  badge,
  badgeTone = "neutral",
  onOpen,
}: {
  kind: FormKind;
  title: string;
  description?: string;
  /** Mono meta line (counts, dates), already joined. */
  meta: string;
  badge?: string;
  badgeTone?: StatusTone;
  onOpen: () => void;
}) {
  const Icon = KIND_ICON[kind] ?? ClipboardList;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 px-3 py-3 text-start transition-colors hover:bg-muted/40"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {description && <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{description}</span>}
        <span className="mt-1 block font-mono text-[10.5px] tabular-nums text-muted-foreground">{meta}</span>
      </span>
      {badge && (
        <StatusBadge tone={badgeTone} className="mt-0.5 shrink-0">
          {badge}
        </StatusBadge>
      )}
    </button>
  );
}
