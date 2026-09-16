"use client";

import { useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogActions } from "@/components/ui/dialog-actions";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export interface DeleteForeverDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Document title as stored (may be `""`; shown as "Untitled document"). */
  title: string;
  /**
   * Permanently delete the document. Resolve to close the dialog.
   * Reject to keep it open — the caller reports the error.
   */
  onConfirm(): Promise<void>;
}

export function DeleteForeverDialog({ open, onOpenChange, title, onConfirm }: DeleteForeverDialogProps): React.JSX.Element {
  const t = useT();
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped on every confirm and every close, so a slow delete can't close a dialog
  // that was dismissed and reopened in the meantime.
  const attemptRef = useRef(0);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDeleting(false);
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptRef.current += 1;
    onOpenChange(next);
  };

  const confirm = async () => {
    if (deleting) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setDeleting(true);
    try {
      await onConfirm();
      if (attempt === attemptRef.current) onOpenChange(false);
    } catch {
      // Stay open so the user can retry or cancel; `onConfirm` owns error reporting.
    } finally {
      if (attempt === attemptRef.current) setDeleting(false);
    }
  };

  const displayTitle = title.trim() || t("docs.untitled");

  return (
    <AlertDialog open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("docs.deleteForever.title")}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {fmt(t("docs.deleteForever.description"), { title: displayTitle })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DialogActions
          onCancel={() => handleOpenChange(false)}
          onConfirm={() => {
            void confirm();
          }}
          destructive
          saving={deleting}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("docs.menu.deleteForever")}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
