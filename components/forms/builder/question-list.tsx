"use client";

// The builder's question list: one row per question with move up / down, the selected one expanded into its
// editor, and an "Add question" menu by type at the bottom.

import { ArrowDown, ArrowUp, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  duplicateQuestion, insertQuestion, moveQuestion, newQuestion, removeQuestion, savedOptionIds, updateQuestion,
  type DraftCopy,
} from "@/components/forms/builder/draft";
import { moveButtonProps, useMoveFocus } from "@/components/forms/builder/move-focus";
import { QuestionEditor } from "@/components/forms/builder/question-editor";
import { FORM_MAX_QUESTIONS } from "@/lib/forms/limits";
import type { FormIssue } from "@/lib/forms/schema";
import { QUESTION_TYPES, type FormDefinitionV1, type QuestionType } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function QuestionList({
  draft,
  saved,
  setDraft,
  selectedId,
  onSelect,
  copy,
  hasResponses,
  publicLink,
  issues,
}: {
  draft: FormDefinitionV1;
  /** The last saved definition (type and option locks once the form has responses). */
  saved: FormDefinitionV1 | null;
  setDraft: (update: (def: FormDefinitionV1) => FormDefinitionV1) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  copy: DraftCopy;
  hasResponses: boolean;
  publicLink: boolean;
  issues: readonly FormIssue[];
}) {
  const t = useT();
  const { root, moved } = useMoveFocus<HTMLOListElement>();
  const savedIds = new Set(saved?.questions.map((q) => q.id) ?? []);
  const count = draft.questions.length;
  const addTypes = QUESTION_TYPES.filter((type) => !(publicLink && (type === "photo" || type === "file")));

  const add = (type: QuestionType) => {
    const q = newQuestion(type, copy);
    setDraft((def) => insertQuestion(def, q, selectedId));
    onSelect(q.id);
  };

  // Visible numbering skips sections and archived questions.
  const numbers = new Map<string, number>();
  for (const q of draft.questions) if (q.type !== "section" && !q.archived) numbers.set(q.id, numbers.size + 1);

  return (
    <div className="space-y-3">
      <ol ref={root} className="divide-y divide-border rounded border border-border">
        {draft.questions.map((q, i) => {
          const selected = q.id === selectedId;
          const own = issues.filter((issue) => issue.questionId === q.id);
          return (
            <li key={q.id} className={cn(q.type === "section" && "bg-muted/30")}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : q.id)}
                  aria-expanded={selected}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-start"
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
                    {numbers.get(q.id) ?? ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span id={`${q.id}-row-title`} className={cn("block truncate text-sm", q.type === "section" ? "font-semibold" : "font-medium", q.archived && "text-muted-foreground line-through")}>
                      {q.title || t("forms.builder.untitledQuestion")}
                      {q.type !== "section" && q.required && <span className="ms-0.5 text-destructive" aria-hidden>*</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t(`forms.types.${q.type}`)}</span>
                  </span>
                  {q.archived && <StatusBadge size="xs">{t("forms.builder.archived")}</StatusBadge>}
                  {own.length > 0 && <StatusBadge tone="danger" size="xs">{t("forms.builder.needsFix")}</StatusBadge>}
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", selected && "rotate-180")} />
                </button>
                {/* aria-describedby names the question, so each row's move buttons are told apart. */}
                <Button variant="ghost" size="icon-sm" aria-label={t("forms.builder.moveUp")} disabled={i === 0}
                  aria-describedby={`${q.id}-row-title`} {...moveButtonProps(q.id, "up")}
                  onClick={() => { moved(q.id, "up"); setDraft((def) => moveQuestion(def, q.id, -1)); }}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("forms.builder.moveDown")} disabled={i === count - 1}
                  aria-describedby={`${q.id}-row-title`} {...moveButtonProps(q.id, "down")}
                  onClick={() => { moved(q.id, "down"); setDraft((def) => moveQuestion(def, q.id, 1)); }}>
                  <ArrowDown />
                </Button>
              </div>
              {selected && (
                <QuestionEditor
                  q={q}
                  onChange={(next) => setDraft((def) => updateQuestion(def, q.id, () => next))}
                  onDuplicate={() => setDraft((def) => duplicateQuestion(def, q.id))}
                  onRemove={() => {
                    setDraft((def) => removeQuestion(def, q.id, hasResponses && savedIds.has(q.id)));
                    if (!(hasResponses && savedIds.has(q.id) && q.type !== "section")) onSelect(null);
                  }}
                  copy={copy}
                  typeLocked={hasResponses && savedIds.has(q.id)}
                  lockedOptionIds={hasResponses ? savedOptionIds(saved, q.id) : new Set()}
                  archivesOnRemove={hasResponses && savedIds.has(q.id)}
                  publicLink={publicLink}
                  issues={own}
                />
              )}
            </li>
          );
        })}
      </ol>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" disabled={count >= FORM_MAX_QUESTIONS} />}>
          <Plus />
          {t("forms.builder.addQuestion")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-52 overflow-y-auto">
          {addTypes.map((type) => (
            <DropdownMenuItem key={type} onClick={() => add(type)}>
              {t(`forms.types.${type}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
