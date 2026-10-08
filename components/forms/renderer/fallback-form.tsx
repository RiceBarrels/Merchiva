"use client";

// The in-house form renderer: what ./lazy-host.tsx shows when the vendor renderer cannot load. One page, every
// question in order with the same inputs as the device apps (./lite-question.tsx); sections become headings.
// Same contract as SurveyHost: validateAnswers before onSubmit, uploads through lib/forms/uploads.ts.

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Spinner } from "@/components/ui/loaders/geometric";
import { validateAnswers } from "@/lib/forms/answers";
import { formIssueKey } from "@/lib/forms/schema";
import type { AnswerValue, Answers, FileAnswer, FileQuestion } from "@/lib/forms/types";
import { formFilesAllowed, uploadFormFiles } from "@/lib/forms/uploads";
import { useT } from "@/lib/i18n/context";
import { formsErrorKey } from "@/lib/spacetimedb/actions/forms";
import { LiteQuestion } from "./lite-question";
import type { SurveyHostProps } from "./survey-host";

export function FallbackForm(props: SurveyHostProps) {
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  if (done) return <>{props.renderComplete(() => { setDone(false); setRound((n) => n + 1); })}</>;
  return <FallbackRound key={round} {...props} onDone={() => setDone(true)} />;
}

function FallbackRound({ definition, mode, upload, onSubmit, onDone }: SurveyHostProps & { onDone: () => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<Answers>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const allowFiles = mode === "fill" && !!upload && formFilesAllowed(upload);

  const setAnswer = (id: string, value: AnswerValue | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
    setIssues((prev) => (prev[id] ? { ...prev, [id]: "" } : prev));
  };

  const pickFiles = async (question: FileQuestion, files: File[]) => {
    if (!upload) return;
    const current = (answers[question.id] as FileAnswer | undefined)?.driveItemIds ?? [];
    setUploading(question.id);
    try {
      const added = await uploadFormFiles(files, question, upload, {}, current.length);
      setAnswer(question.id, { driveItemIds: [...current, ...added.driveItemIds] });
    } catch (err) {
      setIssues((prev) => ({ ...prev, [question.id]: t(formsErrorKey(err)) }));
    } finally {
      setUploading(null);
    }
  };

  const send = async () => {
    if (mode === "preview") return onDone();
    setError(null);
    const checked = validateAnswers(definition, answers, { allowFiles });
    if (!checked.ok) {
      const byQuestion: Record<string, string> = {};
      for (const issue of checked.issues) if (issue.questionId) byQuestion[issue.questionId] ??= t(formIssueKey(issue));
      setIssues(byQuestion);
      setError(t(formIssueKey(checked.issues[0])));
      return;
    }
    setSending(true);
    try {
      await onSubmit(checked.value);
      onDone();
    } catch (err) {
      setError(t(formsErrorKey(err)));
    } finally {
      setSending(false);
    }
  };

  const filesNote = t(mode === "preview" ? "forms.runtime.previewNoUpload" : "forms.runtime.filesUnavailableHere");
  return (
    <div className="flex flex-col gap-6">
      {(definition.title || definition.description) && (
        <div className="flex flex-col gap-1">
          {definition.title && <h2 className="text-lg font-semibold break-words">{definition.title}</h2>}
          {definition.description && <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{definition.description}</p>}
        </div>
      )}
      {definition.questions.map((q) => {
        if (q.archived) return null;
        if (q.type === "section") {
          return (
            <div key={q.id} className="border-b border-border pb-1.5 pt-2">
              <h3 className="text-base font-semibold break-words">{q.title}</h3>
              {q.help && <p className="text-sm text-muted-foreground break-words">{q.help}</p>}
            </div>
          );
        }
        return (
          <LiteQuestion
            key={q.id}
            question={q}
            value={answers[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
            onPickFiles={allowFiles ? pickFiles : undefined}
            filesNote={filesNote}
            uploading={uploading === q.id}
            error={issues[q.id] || null}
            disabled={sending}
          />
        );
      })}
      {error && <Callout tone="danger">{error}</Callout>}
      <Button onClick={() => void send()} disabled={sending || uploading !== null} className="self-start">
        {sending ? <Spinner size={14} /> : <Send className="h-4 w-4" />}
        {t("forms.runtime.completeText")}
      </Button>
    </div>
  );
}
