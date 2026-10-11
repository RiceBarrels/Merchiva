"use client";

import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogActions } from "@/components/ui/dialog-actions";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";

export interface PersonalPunchPromptProps {
  open: boolean;
  /** "Yes": the screen opens the Punch in app, where the store QR is scanned. */
  onYes: () => void;
  onSkip: () => void;
}

/**
 * Asked when the phone is unlocked while the member is off shift. "Yes" opens
 * the Punch in app: its Punch in scans the store device's QR, which logs the
 * member in there, and the punch is tapped on the device.
 */
export function PersonalPunchPrompt({ open, onYes, onSkip }: PersonalPunchPromptProps) {
  const t = useT();
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onSkip(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("personalDevice.punchPrompt.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("personalDevice.punchPrompt.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DialogActions
            divider={false}
            cancelLabel={t("personalDevice.punchPrompt.no")}
            confirmLabel={t("personalDevice.punchPrompt.yes")}
            onCancel={() => { hapticLight(); onSkip(); }}
            onConfirm={() => { hapticLight(); onYes(); }}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
