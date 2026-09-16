"use client";

/**
 * Name or rename a version (docs-editor-ui spec §5.5).
 *
 * Props:
 * - `mode`:
 *   - `"name"` (default) — File ▸ Version history ▸ Name current version. A non-empty name is required; the editor
 *     core saves with `provider.saveVersion("named", name)`.
 *   - `"rename"` — an existing version (`VersionHistoryPanel`). An empty name clears it back to "Autosaved"
 *     (`renameDocumentVersion(documentId, versionId, "")`) when `allowClear` (default true); otherwise a name is required
 *     (the server lets only the creator or a manager clear a named version's name).
 * - `initialName` — prefilled draft; reset every time the dialog opens.
 * - `onSubmit(name)` — receives the trimmed name, max `VERSION_NAME_MAX` (80) characters. Resolve to close; reject to
 *   keep the dialog open with the draft (the caller reports the error).
 *
 * Title is the stable `t("docs.versions.name")` / `t("docs.versions.rename")`, never the version name.
 */
import { useId, useRef, useState } from "react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VERSION_NAME_MAX } from "@/lib/docs/versions";
import { useT } from "@/lib/i18n/context";

export interface NameVersionDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode?: "name" | "rename";
  /** Rename mode: whether an empty name (clear back to "Autosaved") may be submitted. */
  allowClear?: boolean;
  initialName?: string;
  onSubmit(name: string): Promise<void>;
}

export function NameVersionDialog({
  open,
  onOpenChange,
  mode = "name",
  allowClear = true,
  initialName = "",
  onSubmit,
}: NameVersionDialogProps): React.JSX.Element {
  const t = useT();
  const inputId = useId();
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped on every submit and close so a slow submit can't close a dialog that was reopened meanwhile.
  const attemptRef = useRef(0);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialName);
      setSaving(false);
    }
  }

  const name = draft.replace(/\s+/g, " ").trim().slice(0, VERSION_NAME_MAX);
  const canSubmit = name.length > 0 || (mode === "rename" && allowClear);
  const title = mode === "rename" ? t("docs.versions.rename") : t("docs.versions.name");

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptRef.current += 1;
    onOpenChange(next);
  };

  const submit = async () => {
    if (saving || !canSubmit) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setSaving(true);
    try {
      await onSubmit(name);
      if (attempt === attemptRef.current) onOpenChange(false);
    } catch {
      // Keep the dialog open with the draft; `onSubmit` owns error reporting.
    } finally {
      if (attempt === attemptRef.current) setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("docs.versions.namePlaceholder")} htmlFor={inputId}>
            <Input
              id={inputId}
              value={draft}
              maxLength={VERSION_NAME_MAX}
              placeholder={t("docs.versions.namePlaceholder")}
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
            disabled={!canSubmit}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("common.save")}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
