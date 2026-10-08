"use client";

// The editor of one question: type, title, help, required, the per-type fields, and its validation issues.
// Once the form has responses a saved question keeps its type (the module refuses a change).

import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { retypeQuestion, type DraftCopy } from "@/components/forms/builder/draft";
import { TypeFields } from "@/components/forms/builder/type-fields";
import { FORM_MAX_HELP_LENGTH, FORM_MAX_QUESTION_TITLE_LENGTH } from "@/lib/forms/limits";
import { formIssueKey, type FormIssue } from "@/lib/forms/schema";
import { QUESTION_TYPES, type Question, type QuestionType } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";

export function QuestionEditor({
  q,
  onChange,
  onDuplicate,
  onRemove,
  copy,
  typeLocked,
  lockedOptionIds,
  archivesOnRemove,
  publicLink,
  issues,
}: {
  q: Question;
  onChange: (next: Question) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  copy: DraftCopy;
  /** Saved question on a form with responses. */
  typeLocked: boolean;
  lockedOptionIds: ReadonlySet<string>;
  /** Removing archives instead (the form has responses). */
  archivesOnRemove: boolean;
  /** The public link is on: photo and file questions are not offered. */
  publicLink: boolean;
  issues: readonly FormIssue[];
}) {
  const t = useT();
  const id = (name: string) => `${q.id}-${name}`;
  const types = QUESTION_TYPES.filter((type) => !(publicLink && (type === "photo" || type === "file")) || type === q.type);
  const removeArchives = archivesOnRemove && q.type !== "section";

  return (
    <div className="space-y-3 border-t border-border bg-muted/20 px-3 py-3">
      {q.archived && (
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
          <span>{t("forms.builder.archivedNote")}</span>
          <Button variant="outline" size="xs" className="gap-1" onClick={() => onChange({ ...q, archived: undefined })}>
            <ArchiveRestore />
            {t("forms.builder.restore")}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label={t(q.type === "section" ? "forms.builder.sectionTitle" : "forms.builder.questionTitle")} htmlFor={id("title")} required>
          <Input id={id("title")} className="h-8 text-sm" maxLength={FORM_MAX_QUESTION_TITLE_LENGTH} value={q.title}
            onChange={(e) => onChange({ ...q, title: e.target.value })} />
        </Field>
        <Field label={t("forms.builder.type")} hint={typeLocked ? t("forms.builder.typeLocked") : undefined}>
          <Select value={q.type} disabled={typeLocked} onValueChange={(v) => onChange(retypeQuestion(q, v as QuestionType, copy))}>
            <SelectTrigger className="h-8 w-full text-sm" aria-label={t("forms.builder.type")}>
              <SelectValue>{t(`forms.types.${q.type}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {types.map((type) => <SelectItem key={type} value={type}>{t(`forms.types.${type}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label={t("forms.builder.help")} htmlFor={id("help")}>
        <Textarea id={id("help")} rows={2} className="resize-none text-sm" maxLength={FORM_MAX_HELP_LENGTH} value={q.help ?? ""}
          placeholder={t("forms.builder.helpPlaceholder")} onChange={(e) => onChange({ ...q, help: e.target.value || undefined })} />
      </Field>

      <TypeFields q={q} onChange={onChange} copy={copy} lockedOptionIds={lockedOptionIds} />

      {issues.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {[...new Set(issues.map(formIssueKey))].map((key) => <li key={key}>{t(key)}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {q.type !== "section" && (
          <label className="me-auto flex items-center gap-2 text-sm">
            <Switch checked={q.required} onCheckedChange={(checked) => onChange({ ...q, required: checked })} />
            {t("forms.builder.required")}
          </label>
        )}
        <Button variant="ghost" size="sm" className="gap-1" onClick={onDuplicate}>
          <Copy />
          {t("forms.builder.duplicate")}
        </Button>
        {!q.archived && (
          <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={onRemove}>
            {removeArchives ? <Archive /> : <Trash2 />}
            {t(removeArchives ? "forms.builder.archive" : "forms.builder.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}
