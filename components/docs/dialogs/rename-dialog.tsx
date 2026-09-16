"use client";

import { useId, useRef, useState } from "react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/context";

/** Mirrors the server's `DOC_TITLE_MAX` (`cleanDocTitle` in the SpacetimeDB module). */
const DOC_TITLE_MAX = 200;

/** Same normalisation as the server's `cleanDocTitle`, so "unchanged" is judged the same way. */
function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, DOC_TITLE_MAX);
}

export interface RenameDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  initialTitle: string;
  /**
   * Persist the new title (already trimmed; may be `""`, shown as "Untitled document").
   * Resolve to close the dialog. Reject to keep it open — the caller reports the error.
   */
  onSubmit(title: string): Promise<void>;
}

export function RenameDialog({ open, onOpenChange, initialTitle, onSubmit }: RenameDialogProps): React.JSX.Element {
  const t = useT();
  const inputId = useId();
  const [draft, setDraft] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped on every submit and every close, so a slow submit can't close a dialog
  // that was dismissed and reopened in the meantime.
  const attemptRef = useRef(0);

  // Reset the draft each time the dialog opens (adjust-state-on-prop-change pattern).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialTitle);
      setSaving(false);
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptRef.current += 1;
    onOpenChange(next);
  };

  const submit = async () => {
    if (saving) return;
    const title = cleanTitle(draft);
    if (title === cleanTitle(initialTitle)) {
      handleOpenChange(false);
      return;
    }
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setSaving(true);
    try {
      await onSubmit(title);
      if (attempt === attemptRef.current) onOpenChange(false);
    } catch {
      // Keep the dialog open with the draft intact; `onSubmit` owns error reporting.
    } finally {
      if (attempt === attemptRef.current) setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("docs.rename.title")}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("docs.rename.label")} htmlFor={inputId}>
            <Input
              id={inputId}
              value={draft}
              maxLength={DOC_TITLE_MAX}
              placeholder={t("docs.untitled")}
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
              readOnly={saving}
              aria-busy={saving || undefined}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          <DialogActions
            onCancel={() => handleOpenChange(false)}
            confirmType="submit"
            saving={saving}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("common.save")}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
