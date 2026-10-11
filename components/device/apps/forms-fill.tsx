"use client";

// Filling one form on /store + /personal. A lite renderer of our own
// FormDefinitionV1 (never the manager's form library): a checklist is one
// screen of big check rows; every other form is one question per screen with
// "3/8" progress, Back / Next / Send and a confirmation sheet. Photo and file
// answers go to the respondent's My files through lib/forms/uploads.ts; on a
// staff-account store tablet they are off (decision C6b) and say why. Each
// question renders through the shared components/forms/renderer/lite-question.
// On /personal it fills a page (components/device/apps/lite-page.tsx) and takes the page's Back:
// one question back, or "leave without sending?" once something is answered.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Send, X } from "lucide-react";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { useDynamicUIElementPageBack, useDynamicUIElementPageClose } from "@/components/ui/dynamic-ui-element-page";
import { LiteQuestion } from "@/components/forms/renderer/lite-question";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { formIssueKey, hasFileQuestions, validateAnswers, type FormIssue } from "@/lib/forms/schema";
import { formFilesAllowed, uploadFormFiles, type FormUploadContext } from "@/lib/forms/uploads";
import type { AnswerValue, Answers, FileQuestion, FormDefinitionV1, FormView, InputQuestion } from "@/lib/forms/types";
import { formsErrorKey, submitFormResponse } from "@/lib/spacetimedb/actions/forms";
import { useFormUploadDevice } from "@/lib/spacetimedb/hooks/useForms";
import { newDocumentId } from "@/lib/docs/ids";
import type { OrgRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LiteButton, LiteScreen, LiteSection } from "./lite";
import type { LiteMember } from "./types";

// ── Pure helpers (exported for tests) ───────────────────────────────────────

export interface FillStep {
  question: InputQuestion;
  /** Title of the section the question sits in, or null before the first section. */
  section: string | null;
}

/** The questions a respondent answers, in order, each with its section heading. */
export function fillSteps(def: FormDefinitionV1): FillStep[] {
  const steps: FillStep[] = [];
  let section: string | null = null;
  for (const q of def.questions) {
    if (q.type === "section") section = q.title || null;
    else if (!q.archived) steps.push({ question: q, section });
  }
  return steps;
}

/** The first issue with one question's answer (`required`, out of range, …), or null when it may move on. */
export function questionIssue(def: FormDefinitionV1, q: InputQuestion, value: AnswerValue | undefined, allowFiles: boolean): FormIssue | null {
  const result = validateAnswers({ ...def, questions: [q] }, value === undefined ? {} : { [q.id]: value }, { allowFiles });
  return result.ok ? null : (result.issues[0] ?? null);
}

/** A checklist is filled on one screen; everything else one question at a time. */
export function fillsOnOneScreen(form: Pick<FormView, "kind">): boolean {
  return form.kind === "checklist";
}

function fileIds(value: AnswerValue | undefined): string[] {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value.driveItemIds : [];
}

// ── The fill flow ───────────────────────────────────────────────────────────

export interface FormFillProps {
  form: FormView;
  definition: FormDefinitionV1;
  surface: "store" | "personal";
  organizationId: string;
  /** The respondent: the PIN operator on /store, the signed-in member on /personal. */
  member: LiteMember;
  /** The role of the account signed in on this device: on /store the tablet's, not the operator's. */
  deviceAccountRole: OrgRole | null;
  onClose: () => void;
}

export function FormFill({ form, definition: def, surface, organizationId, member, deviceAccountRole, onClose }: FormFillProps) {
  const t = useT();
  const steps = useMemo(() => fillSteps(def), [def]);
  const oneScreen = fillsOnOneScreen(form);
  const { holdsStoreSession } = useFormUploadDevice();
  const allowFiles = formFilesAllowed({ surface, deviceAccountRole, holdsStoreSession });
  const responseId = useMemo(() => newDocumentId(), []);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What is wrong with a question's answer, by question id (already translated). */
  const [issues, setIssues] = useState<ReadonlyMap<string, string>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // In a page the page's Back leads (and its title shows): leaving slides the page out.
  const closePage = useDynamicUIElementPageClose();
  const inPage = closePage !== null;
  const exit = closePage ?? onClose;

  const setAnswer = (id: string, value: AnswerValue | undefined) => {
    setError(null);
    setIssues((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const uploadCtx: FormUploadContext = {
    organizationId, surface, actingMemberId: surface === "store" ? member.id : "", deviceAccountRole, holdsStoreSession,
  };
  const pickFiles = (q: FileQuestion, picked: File[]): void => {
    if (uploading) return;
    const have = fileIds(answers[q.id]);
    abort.current = new AbortController();
    setUploading(q.id);
    setError(null);
    uploadFormFiles(picked, q, uploadCtx, { signal: abort.current.signal }, have.length)
      .then((added) => setAnswer(q.id, { driveItemIds: [...have, ...added.driveItemIds] }))
      .catch((err: unknown) => {
        hapticWarning();
        setIssues((prev) => new Map(prev).set(q.id, t(formsErrorKey(err))));
      })
      .finally(() => setUploading(null));
  };

  /** Checks every answer; on an issue flags it, jumps to it and says what is wrong. */
  const checkAll = (): boolean => {
    const result = validateAnswers(def, answers, { allowFiles });
    if (result.ok) return true;
    hapticWarning();
    const byQuestion = new Map<string, string>();
    for (const issue of result.issues) {
      if (issue.questionId && !byQuestion.has(issue.questionId)) byQuestion.set(issue.questionId, t(formIssueKey(issue)));
    }
    setIssues(byQuestion);
    if (byQuestion.size === 0) setError(t(formIssueKey(result.issues[0])));
    const at = steps.findIndex((s) => byQuestion.has(s.question.id));
    if (!oneScreen && at >= 0) setStep(at);
    return false;
  };

  const next = () => {
    const current = steps[step];
    const issue = current ? questionIssue(def, current.question, answers[current.question.id], allowFiles) : null;
    if (issue) {
      hapticWarning();
      setIssues(new Map([[current.question.id, t(formIssueKey(issue))]]));
      return;
    }
    if (step < steps.length - 1) setStep(step + 1);
    else if (checkAll()) setConfirming(true);
  };

  const send = () => {
    if (sending) return;
    setSending(true);
    setConfirming(false);
    setError(null);
    submitFormResponse({
      formId: form.id, organizationId, responseId, answers, surface,
      actingMemberId: surface === "store" ? member.id : "",
    })
      .then(() => { hapticSuccess(); setSent(true); })
      .catch((err: unknown) => { hapticWarning(); setError(t(formsErrorKey(err))); })
      .finally(() => setSending(false));
  };

  const back = () => {
    if (!oneScreen && step > 0) setStep(step - 1);
    else if (Object.keys(answers).length > 0) setLeaving(true);
    else onClose();
  };
  /** The page's Back: true when the form took it (a step back, the leave question, a send in flight). */
  const pageBack = (): boolean => {
    if (sent) return false;
    if (sending) return true;
    if (!oneScreen && step > 0) { setStep(step - 1); return true; }
    if (Object.keys(answers).length > 0) { setLeaving(true); return true; }
    return false;
  };
  useDynamicUIElementPageBack(inPage ? pageBack : null);

  if (sent) {
    return (
      <LiteScreen className={cn("items-center justify-center text-center", inPage && "flex-1 p-0")}>
        <CheckCircle2 className="h-14 w-14 text-emerald-600" />
        <p className="text-[18px] font-semibold">{def.settings.confirmation || t("device.lite.forms.thanks")}</p>
        <LiteButton icon={Check} label={t("common.done")} onClick={exit} />
      </LiteScreen>
    );
  }

  const current = steps[step];
  const shown = oneScreen ? steps : current ? [current] : [];
  const busy = sending || uploading !== null;
  const block = (s: FillStep, i: number) => {
    const q = s.question;
    const heading = s.section && (i === 0 || shown[i - 1]?.section !== s.section) ? s.section : null;
    return (
      <div key={q.id} className="space-y-3">
        {heading && <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</h3>}
        <LiteQuestion
          question={q}
          value={answers[q.id]}
          onChange={(v) => setAnswer(q.id, v)}
          onPickFiles={allowFiles ? pickFiles : undefined}
          filesNote={t("device.lite.forms.filesOffTablet")}
          uploading={uploading === q.id}
          disabled={sending}
          error={issues.get(q.id) ?? null}
        />
      </div>
    );
  };

  return (
    <LiteScreen className={inPage ? "flex-1 p-0" : undefined}>
      {/* In a page its corner Back and title pill take this row's place; the progress stays. */}
      {(!inPage || (!oneScreen && steps.length > 0)) && (
        <div className="flex items-center gap-2">
          {!inPage && (
            <>
              <button type="button" onClick={back} aria-label={t("common.back")} className="grid h-11 w-11 flex-none place-items-center rounded-lg border border-border active:bg-muted">
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
              </button>
              <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{def.title || form.title}</h2>
            </>
          )}
          {!oneScreen && steps.length > 0 && (
            <span className={cn("flex-none font-mono text-[15px] tabular-nums text-muted-foreground", inPage && "ms-auto")}>
              {fmt(t("device.lite.forms.progress"), { n: step + 1, total: steps.length })}
            </span>
          )}
        </div>
      )}
      {!oneScreen && steps.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      )}
      {def.description && (oneScreen || step === 0) && <p className="text-[14px] text-muted-foreground">{def.description}</p>}
      {surface === "store" && hasFileQuestions(def) && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-[13px]">{t("drive.disclosure.sharedDeviceNote")}</p>
      )}

      {oneScreen ? (
        <LiteSection title={t("device.lite.forms.checklistHint")}>
          <div className="space-y-4">{shown.map(block)}</div>
        </LiteSection>
      ) : (
        <div className="space-y-4">{shown.map(block)}</div>
      )}

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[14px] text-destructive">{error}</p>}

      <div className="mt-auto flex gap-2 pt-2">
        {!oneScreen && step > 0 && <LiteButton icon={ArrowLeft} tone="outline" label={t("common.back")} onClick={back} disabled={busy} className="[&_svg]:rtl:rotate-180" />}
        {oneScreen || step === steps.length - 1
          ? <LiteButton icon={Send} label={t("device.lite.forms.send")} onClick={() => { if (checkAll()) setConfirming(true); }} busy={sending} disabled={busy} />
          : <LiteButton label={t("common.next")} onClick={next} disabled={busy} />}
      </div>

      <DeviceDrawer
        open={confirming}
        onOpenChange={setConfirming}
        title={t("device.lite.forms.confirmTitle")}
        cancelLabel={t("device.lite.forms.keepEditing")}
        options={[{ id: "send", icon: Send, tone: "primary", label: t("device.lite.forms.confirmSend"), sub: t(surface === "personal" ? "forms.disclosure.respondentNote" : "device.lite.forms.confirmSub"), onSelect: send }]}
      />
      <DeviceDrawer
        open={leaving}
        onOpenChange={setLeaving}
        title={t("device.lite.forms.leaveTitle")}
        cancelLabel={t("device.lite.forms.keepEditing")}
        options={[{ id: "leave", icon: X, tone: "warn", label: t("device.lite.forms.leave"), sub: t("device.lite.forms.leaveSub"), onSelect: () => { setLeaving(false); exit(); } }]}
      />
    </LiteScreen>
  );
}
