"use client";

// The form's own text: title, description and the message shown after sending. Who answers, how often and
// until when live on the Share tab (components/forms/share/share-panel.tsx).

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FORM_MAX_CONFIRMATION_LENGTH, FORM_MAX_DESCRIPTION_LENGTH, FORM_MAX_TITLE_LENGTH,
} from "@/lib/forms/limits";
import { formIssueKey, type FormIssue } from "@/lib/forms/schema";
import type { FormDefinitionV1 } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";

const OWN_CODES = new Set(["title_required", "title_too_long", "description_too_long", "confirmation_too_long"]);

export function SettingsPanel({
  draft,
  setDraft,
  issues,
}: {
  draft: FormDefinitionV1;
  setDraft: (update: (def: FormDefinitionV1) => FormDefinitionV1) => void;
  issues: readonly FormIssue[];
}) {
  const t = useT();
  const errorFor = (code: string) => {
    const issue = issues.find((i) => i.code === code && !i.questionId);
    return issue ? t(formIssueKey(issue)) : undefined;
  };
  const titleError = errorFor("title_required") ?? errorFor("title_too_long");

  return (
    <section className="space-y-3 rounded border border-border p-3" aria-label={t("forms.builder.details")}>
      <Field label={t("forms.builder.formTitle")} htmlFor="form-title" required error={titleError}>
        <Input
          id="form-title"
          className="h-9 text-base font-medium"
          maxLength={FORM_MAX_TITLE_LENGTH}
          value={draft.title}
          onChange={(e) => setDraft((def) => ({ ...def, title: e.target.value }))}
        />
      </Field>
      <Field label={t("forms.builder.description")} htmlFor="form-description" error={errorFor("description_too_long")}>
        <Textarea
          id="form-description"
          rows={2}
          className="resize-none text-sm"
          maxLength={FORM_MAX_DESCRIPTION_LENGTH}
          placeholder={t("forms.builder.descriptionPlaceholder")}
          value={draft.description}
          onChange={(e) => setDraft((def) => ({ ...def, description: e.target.value }))}
        />
      </Field>
      <Field
        label={t("forms.builder.confirmation")}
        htmlFor="form-confirmation"
        hint={t("forms.builder.confirmationHint")}
        error={errorFor("confirmation_too_long")}
      >
        <Textarea
          id="form-confirmation"
          rows={2}
          className="resize-none text-sm"
          maxLength={FORM_MAX_CONFIRMATION_LENGTH}
          placeholder={t("forms.builder.confirmationPlaceholder")}
          value={draft.settings.confirmation}
          onChange={(e) => setDraft((def) => ({ ...def, settings: { ...def.settings, confirmation: e.target.value } }))}
        />
      </Field>
    </section>
  );
}

/** Issues the details panel shows itself (the builder lists the rest above the questions). */
export function isDetailsIssue(issue: FormIssue): boolean {
  return !issue.questionId && OWN_CODES.has(issue.code);
}
