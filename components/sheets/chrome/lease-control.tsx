"use client";

// The single-writer state and its one next step (sheets.md §5.5): who is editing, and Edit / Ask to edit / Edit
// here / Start editing / Cancel request / Stop editing. The view only picks the button; the server decides
// (acquireSheetLease), so a stale view at worst shows a button that answers "queued". The compact control (phone and
// device panels) shows the button only: MobileSheetHeader puts the sentence ("{name} is editing") under the title.

import { useState } from "react";
import { toast } from "sonner";

import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import type { SheetActions } from "@/components/sheets/editor/use-sheet-actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import type { SheetLeaseView } from "@/lib/sheets/lease";
import { cn } from "@/lib/utils";

type Translate = (key: string) => string;

interface LeaseAction {
  label: string;
  run(): Promise<void>;
  variant: "default" | "outline";
  disabled?: boolean;
}

export interface LeasePresentation {
  /** Short state chip (Editing / View only). */
  badge: { text: string; tone: "success" | "neutral" } | null;
  /** One sentence about someone else (who edits, who asked). */
  note: string | null;
  action: LeaseAction | null;
}

/** What the lease view shows; exported for the phone header. */
export function leasePresentation(view: SheetLeaseView, t: Translate, actions: SheetActions, compact: boolean): LeasePresentation {
  const act = (label: string, run: () => Promise<void>, variant: LeaseAction["variant"] = "default", disabled = false): LeaseAction => ({ label, run, variant, disabled });
  const edit = async () => {
    await actions.requestEdit();
  };
  switch (view.kind) {
    case "loading":
      return { badge: null, note: null, action: null };
    case "cannot_edit":
      return { badge: { text: t("sheets.lease.viewOnly"), tone: "neutral" }, note: null, action: null };
    case "mine":
      return {
        badge: compact ? null : { text: t("sheets.lease.editing"), tone: "success" },
        note: null,
        action: act(compact ? t("sheets.lease.done") : t("sheets.lease.stopEditing"), actions.stopEditing, "outline"),
      };
    case "free":
      if (view.reservedForName) {
        return { badge: null, note: fmt(t("sheets.lease.alreadyAsked"), { name: view.reservedForName }), action: act(t("sheets.lease.edit"), edit, "default", true) };
      }
      return { badge: null, note: null, action: act(view.reservedForMe ? t("sheets.lease.startEditing") : t("sheets.lease.edit"), edit) };
    case "other": {
      const name = view.holderName;
      if (view.samePerson) return { badge: null, note: t("sheets.lease.editingElsewhere"), action: act(t("sheets.lease.editHere"), edit) };
      if (view.state !== "held") return { badge: null, note: fmt(t("sheets.lease.holderAway"), { name }), action: act(t("sheets.lease.startEditing"), edit) };
      if (view.myRequest !== "none") return { badge: null, note: fmt(t("sheets.lease.waitingFor"), { name }), action: act(t("sheets.lease.cancelRequest"), actions.cancelRequest, "outline") };
      if (view.otherRequestName) {
        return { badge: null, note: fmt(t("sheets.lease.alreadyAsked"), { name: view.otherRequestName }), action: act(t("sheets.lease.askToEdit"), edit, "outline", true) };
      }
      // "{name} was asked" only when the server recorded this session's request (not a grant, a refusal or a failure).
      const ask = async () => {
        const after = await actions.requestEdit();
        if (after?.kind === "other" && after.myRequest !== "none") toast(fmt(t("sheets.lease.asked"), { name: after.holderName }));
      };
      return { badge: null, note: fmt(t("sheets.lease.editingBy"), { name }), action: act(t("sheets.lease.askToEdit"), ask, "outline") };
    }
  }
}

export function LeaseControl({ compact = false, className }: { compact?: boolean; className?: string }) {
  const t = useT();
  const { facade, actions } = useSheetEditor();
  const [busy, setBusy] = useState(false);
  const { badge, note, action } = leasePresentation(facade.lease, t, actions, compact);
  if (!badge && !note && !action) return null;

  const run = (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    work().finally(() => setBusy(false));
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {badge && (
        <StatusBadge tone={badge.tone} dot={badge.tone === "success"}>
          {badge.text}
        </StatusBadge>
      )}
      {note && !compact && (
        <span className="min-w-0 max-w-[32ch] truncate text-xs text-muted-foreground" title={note}>
          {note}
        </span>
      )}
      {action && (
        <Button
          type="button"
          size={compact ? "xs" : "sm"}
          variant={action.variant}
          disabled={busy || action.disabled}
          aria-busy={busy || undefined}
          onClick={() => run(action.run)}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
