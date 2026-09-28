"use client";

// Confirmation before a move changes who can see something (drive-ui §7.6): a drop onto Store or
// My files, and the "Move to Store" / "Move to My files" shortcuts. Into Store, everyone in the
// store will see the items; out of it, they go back to their owner's My files. The count includes
// everything inside the moved folders, documents counted apart.

import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogActions } from "@/components/ui/dialog-actions";
import type { MovePlan } from "@/components/drive/model/move";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export interface SpaceChangeDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The move to confirm (kept by the caller after closing); a plan that changes no space shows the Store copy. */
  plan: MovePlan | null;
  /** Moves. Resolve to close the dialog; reject to keep it open (the caller shows the error). */
  onConfirm(): Promise<void>;
}

/** Warning, confirm label and title of a space change. */
export function spaceChangeCopy(changesSpace: MovePlan["changesSpace"]): { titleKey: string; warningKey: string; confirmKey: string } {
  return changesSpace === "toMy"
    ? { titleKey: "drive.dialogs.spaceChangeTitleToMy", warningKey: "drive.dialogs.toMyWarning", confirmKey: "drive.dialogs.moveAndUnshare" }
    : { titleKey: "drive.dialogs.spaceChangeTitleToStore", warningKey: "drive.dialogs.toStoreWarning", confirmKey: "drive.dialogs.moveAndShare" };
}

export function SpaceChangeDialog({ open, onOpenChange, plan, onConfirm }: SpaceChangeDialogProps) {
  const t = useT();
  const [moving, setMoving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const attemptRef = useRef(0);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMoving(false);
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptRef.current += 1;
    onOpenChange(next);
  };

  const confirm = async () => {
    if (moving) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setMoving(true);
    try {
      await onConfirm();
      if (attempt === attemptRef.current) onOpenChange(false);
    } catch {
      // Stay open for a retry or a cancel; onConfirm reports the error.
    } finally {
      if (attempt === attemptRef.current) setMoving(false);
    }
  };

  const copy = spaceChangeCopy(plan?.changesSpace ?? null);
  const affected = plan?.affected ?? { items: 0, documents: 0 };

  return (
    <AlertDialog open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy.titleKey)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(copy.warningKey)}{" "}
            <span className="tabular-nums">
              {fmt(t("drive.dialogs.spaceChangeCount"), { items: affected.items, documents: affected.documents })}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DialogActions
          onCancel={() => handleOpenChange(false)}
          onConfirm={() => {
            void confirm();
          }}
          saving={moving}
          cancelLabel={t("common.cancel")}
          confirmLabel={t(copy.confirmKey)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
