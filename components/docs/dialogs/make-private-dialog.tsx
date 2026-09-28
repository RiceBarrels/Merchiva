"use client";

// Asked before someone other than the owner makes a store document private (share dialog, "General access"):
// setDocumentVisibility lets only the owner open a private document to the store again, so that person could not
// undo it (lib/docs/access.ts docVisibilityRule).

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

export interface MakePrivateDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The document owner's display name. */
  ownerName: string;
  /** Make it private; the dialog closes first and the caller reports the result. */
  onConfirm(): void;
}

export function MakePrivateDialog({ open, onOpenChange, ownerName, onConfirm }: MakePrivateDialogProps): React.JSX.Element {
  const t = useT();
  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("docs.share.makePrivateTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {fmt(t("docs.share.makePrivateDescription"), { name: ownerName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DialogActions
          onCancel={() => onOpenChange(false)}
          onConfirm={() => {
            onOpenChange(false);
            onConfirm();
          }}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("docs.share.makePrivateConfirm")}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
