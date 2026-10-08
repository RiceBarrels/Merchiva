"use client";

// The Build tab: the form's text, its questions, and the autosave status line (components/forms/builder/
// use-autosave.ts). Only the form's owner or an owner / manager reaches it (the edit shell checks canManageForms).

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { DraftCopy } from "@/components/forms/builder/draft";
import { QuestionList } from "@/components/forms/builder/question-list";
import { isDetailsIssue, SettingsPanel } from "@/components/forms/builder/settings-panel";
import type { AutosaveStatus, FormAutosave } from "@/components/forms/builder/use-autosave";
import { formIssueKey } from "@/lib/forms/schema";
import type { FormMetaView, FormView } from "@/lib/forms/types";
import { fmt } from "@/lib/i18n/fmt";
import { useT } from "@/lib/i18n/context";

/** `autosave` is owned by the edit page (useFormAutosave), so the draft outlives a switch to another tab. */
export function FormBuilder({ form, meta, autosave }: { form: FormView; meta: FormMetaView | null; autosave: FormAutosave }) {
  const t = useT();
  const hasResponses = (meta?.responseCount ?? 0) > 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const copy = useMemo<DraftCopy>(() => ({
    question: t("forms.builder.newQuestion"),
    section: t("forms.builder.newSection"),
    option: (n) => fmt(t("forms.builder.newOption"), { n }),
  }), [t]);

  if (!form.definition) {
    return <Callout tone="danger" title={t("forms.builder.brokenTitle")}>{t("forms.builder.brokenDesc")}</Callout>;
  }
  const draft = autosave.draft;
  if (!draft) return null;

  const general = autosave.issues.filter((i) => !i.questionId && !isDetailsIssue(i));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex min-h-7 items-center justify-end gap-2">
        <SaveStatus status={autosave.status} />
        {autosave.status === "error" && (
          <Button variant="outline" size="xs" onClick={autosave.retry}>{t("forms.builder.retry")}</Button>
        )}
      </div>

      {autosave.status === "conflict" && (
        <Callout
          tone="warning"
          title={t("forms.builder.conflictTitle")}
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="xs" onClick={autosave.loadTheirs}>{t("forms.builder.loadTheirs")}</Button>
              <Button size="xs" onClick={autosave.keepMine}>{t("forms.builder.keepMine")}</Button>
            </div>
          }
        >
          {t("forms.builder.conflictDesc")}
        </Callout>
      )}
      {autosave.status === "error" && autosave.errorKey && <Callout tone="danger">{t(autosave.errorKey)}</Callout>}
      {hasResponses && <Callout tone="info">{t("forms.builder.lockedNote")}</Callout>}
      {form.publicEnabled && <Callout tone="neutral">{t("forms.builder.publicNote")}</Callout>}

      <SettingsPanel draft={draft} setDraft={autosave.setDraft} issues={autosave.issues} />

      {general.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {[...new Set(general.map(formIssueKey))].map((key) => <li key={key}>{t(key)}</li>)}
        </ul>
      )}

      <QuestionList
        draft={draft}
        saved={form.definition}
        setDraft={autosave.setDraft}
        selectedId={selectedId}
        onSelect={setSelectedId}
        copy={copy}
        hasResponses={hasResponses}
        publicLink={form.publicEnabled}
        issues={autosave.issues}
      />
    </div>
  );
}

function SaveStatus({ status }: { status: AutosaveStatus }) {
  const t = useT();
  if (status === "conflict") return null;
  const icon = status === "saving" || status === "pending"
    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
    : status === "saved" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />;
  return (
    <span
      role="status"
      aria-live="polite"
      className={status === "invalid" || status === "error" ? "flex items-center gap-1 text-xs text-destructive" : "flex items-center gap-1 text-xs text-muted-foreground"}
    >
      {icon}
      {t(`forms.builder.status.${status}`)}
    </span>
  );
}
