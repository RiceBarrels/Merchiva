"use client";

// "Delete forever" of trashed Drive entries (drive-ui §7.6): one entry is named,
// several are counted, and a note says a folder takes everything inside it along.

import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogActions } from "@/components/ui/dialog-actions";
import { entryDisplayName } from "@/components/drive/list/entry-card";
import type { DriveEntry } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export interface DriveDeleteForeverDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** What is deleted (kept by the caller after closing, so the text stays while the dialog animates out). */
  entries: readonly DriveEntry[];
  /** Deletes. Resolve to close the dialog; reject to keep it open (the caller shows the error). */
  onConfirm(): Promise<void>;
}

export function DriveDeleteForeverDialog({ open, onOpenChange, entries, onConfirm }: DriveDeleteForeverDialogProps) {
  const t = useT();
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
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
      // Stay open for a retry or a cancel; onConfirm reports the error.
    } finally {
      if (attempt === attemptRef.current) setDeleting(false);
    }
  };

  const description =
    entries.length === 1
      ? fmt(t("drive.dialogs.deleteForeverOne"), { name: entryDisplayName(entries[0], t) })
      : fmt(t("drive.dialogs.deleteForeverMany"), { count: entries.length });
  const withFolder = entries.some((entry) => entry.type === "folder");

  return (
    <AlertDialog open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("drive.dialogs.deleteForeverTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {description}
            {withFolder && (
              <>
                {" "}
                {t("drive.dialogs.deleteForeverFolderNote")}
              </>
            )}
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
          confirmLabel={t("drive.dialogs.deleteForeverConfirm")}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
