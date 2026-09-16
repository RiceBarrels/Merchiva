"use client";

/**
 * Confirmation before restoring a version (docs-editor-ui spec §5.4 step 1).
 *
 * Props:
 * - `time` — the version's formatted time (e.g. `formatDateTime(version.createdAt, locale)` from lib/docs/format),
 *   substituted into `docs.versions.restoreConfirmDescription`.
 * - `onConfirm()` — runs the restore (`restoreDocumentVersion`). While it is pending, both buttons are disabled and
 *   the dialog can't be dismissed. Resolve to close; reject to keep it open (the caller shows the toast).
 */
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export interface RestoreVersionAlertProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  time: string;
  onConfirm(): Promise<void>;
}

export function RestoreVersionAlert({ open, onOpenChange, time, onConfirm }: RestoreVersionAlertProps): React.JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
      busyRef.current = false;
      onOpenChange(false);
    } catch {
      // Stay open; `onConfirm` owns error reporting.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("docs.versions.restoreConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{fmt(t("docs.versions.restoreConfirmDescription"), { time })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("docs.versions.restore")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
