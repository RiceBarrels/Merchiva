"use client";

// Naming a Drive entry: "New folder" and "Rename" (drive-ui §7.6), structured like the Docs
// RenameDialog (components/docs/dialogs/rename-dialog.tsx). The draft is checked with the
// server's rules before it is sent (driveNameProblem: folders and files need a name without / or
// \ of at most DRIVE_NAME_MAX characters; Docs, Sheets and Slides keep document-title rules and
// may be left untitled), and cleaned the way the server stores it (cleanEntryName).

import { useId, useRef, useState } from "react";
import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cleanEntryName, DOC_TITLE_MAX, driveNameProblem, type DriveNameProblem } from "@/components/drive/model/names";
import type { DriveDocKind } from "@/components/drive/model/types";
import { DRIVE_NAME_MAX } from "@/lib/drive/rules";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export type DriveNameKind = "folder" | "file" | DriveDocKind;

export interface DriveNameDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: "newFolder" | "rename";
  /** The current name (rename) or the proposed one (a free "Untitled folder"). */
  initialName: string;
  kind: DriveNameKind;
  /**
   * Saves the cleaned name. Resolve to close the dialog; reject to keep it open with the draft (the caller shows
   * the error).
   */
  onSubmit(name: string): Promise<void>;
}

const isDocKind = (kind: DriveNameKind): kind is DriveDocKind => kind === "doc" || kind === "sheet" || kind === "slides";

function problemText(problem: DriveNameProblem, kind: DriveNameKind, t: (key: string) => string): string {
  switch (problem) {
    case "empty":
      return t("drive.dialogs.nameEmpty");
    case "tooLong":
      return fmt(t("drive.dialogs.nameTooLong"), { max: isDocKind(kind) ? DOC_TITLE_MAX : DRIVE_NAME_MAX });
    case "invalid":
      return t("drive.dialogs.nameInvalid");
  }
}

export function DriveNameDialog({ open, onOpenChange, mode, initialName, kind, onSubmit }: DriveNameDialogProps) {
  const t = useT();
  const inputId = useId();
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped on every submit and every close, so a slow save can't close a dialog reopened meanwhile.
  const attemptRef = useRef(0);

  // A fresh draft each time the dialog opens (adjust-state-on-prop-change, as the Docs RenameDialog).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialName);
      setSaving(false);
      setTouched(false);
    }
  }

  const problem = driveNameProblem(draft, kind);
  const error = touched && problem ? problemText(problem, kind, t) : null;

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptRef.current += 1;
    onOpenChange(next);
  };

  const submit = async () => {
    if (saving) return;
    setTouched(true);
    if (problem) return;
    const name = cleanEntryName(draft);
    if (mode === "rename" && name === cleanEntryName(initialName)) {
      handleOpenChange(false);
      return;
    }
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setSaving(true);
    try {
      await onSubmit(name);
      if (attempt === attemptRef.current) onOpenChange(false);
    } catch {
      // Keep the dialog and the draft; onSubmit reports the error.
    } finally {
      if (attempt === attemptRef.current) setSaving(false);
    }
  };

  const untitled = t(`drive.list.untitled.${kind}`);

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(mode === "newFolder" ? "drive.dialogs.newFolderTitle" : "drive.dialogs.renameTitle")}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("drive.dialogs.nameLabel")} htmlFor={inputId} error={error}>
            <Input
              id={inputId}
              value={draft}
              dir="auto"
              maxLength={isDocKind(kind) ? DOC_TITLE_MAX : DRIVE_NAME_MAX}
              placeholder={isDocKind(kind) ? untitled : undefined}
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
              readOnly={saving}
              aria-busy={saving || undefined}
              aria-invalid={error ? true : undefined}
              onFocus={(event) => selectStem(event.currentTarget, kind)}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => setTouched(true)}
            />
          </Field>
          <DialogActions
            onCancel={() => handleOpenChange(false)}
            confirmType="submit"
            saving={saving}
            disabled={touched && problem !== null}
            cancelLabel={t("common.cancel")}
            confirmLabel={t(mode === "newFolder" ? "drive.dialogs.create" : "drive.dialogs.save")}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Selects the name without its extension ("Report" of "Report.pdf"), so typing keeps the file's type. */
function selectStem(input: HTMLInputElement, kind: DriveNameKind): void {
  const value = input.value;
  const dot = kind === "file" ? value.lastIndexOf(".") : -1;
  if (dot > 0) input.setSelectionRange(0, dot);
  else input.select();
}
