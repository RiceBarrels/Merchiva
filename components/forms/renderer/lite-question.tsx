"use client";

// In-house inputs for one Forms question (design B.6): the /store and /personal fill flow renders these
// directly — the vendor renderer never reaches a device surface — and the /manager fill page falls back to them
// when the renderer cannot load. Big tap targets, an icon beside every action, logical (RTL-safe) classes only.
// Values follow lib/forms/types.ts `AnswerValue`; `undefined` = unanswered. Validation is the caller's
// (validateAnswers) and the reducer's; this only keeps the value in the shape its question takes.

import { useId, useRef, type ReactNode } from "react";
import { Camera, Check, Paperclip, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FORM_MAX_LONG_TEXT_LENGTH, FORM_MAX_SHORT_TEXT_LENGTH, FORM_RATING_MAX } from "@/lib/forms/limits";
import { questionMaxFiles } from "@/lib/forms/uploads";
import type { AnswerValue, ChoiceQuestion, FileAnswer, FileQuestion, InputQuestion, ScaleQuestion } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface LiteQuestionProps {
  question: InputQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  /**
   * File and photo questions: uploads the picked files (lib/forms/uploads.ts) and adds them to the answer.
   * Absent where files cannot be given (a staff-account store tablet, a preview): the question then shows `filesNote`.
   */
  onPickFiles?: (question: FileQuestion, files: File[]) => Promise<void> | void;
  /** Why files cannot be added here (shown instead of the picker). */
  filesNote?: string;
  uploading?: boolean;
  /** Shown under the question (already translated). */
  error?: string | null;
  disabled?: boolean;
  /** Hide the title row (a checklist row carries the title itself). */
  hideTitle?: boolean;
}

/** Whether `value` counts as an answer for `question` (a checklist item counts only when checked). */
export function isLiteAnswered(question: InputQuestion, value: AnswerValue | undefined): boolean {
  if (value === undefined || value === "") return false;
  if (question.type === "checklist_item") return value === true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return value.driveItemIds.length > 0;
  return true;
}

function fileAnswerOf(value: AnswerValue | undefined): FileAnswer {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : { driveItemIds: [] };
}

/**
 * What names and describes a question's control for assistive tech: the title (and help, error) element ids, plus
 * the required and invalid state. Spread onto inputs and onto the group/radiogroup wrapping button choices.
 */
interface FieldA11y {
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

const tapRow =
  "flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-3 text-start text-[16px] transition-colors disabled:opacity-50";

function OptionRow({ on, multi, label, onClick, disabled }: {
  on: boolean; multi: boolean; label: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={on}
      disabled={disabled}
      onClick={() => { hapticLight(); onClick(); }}
      className={cn(tapRow, on ? "border-primary bg-primary/5" : "border-border bg-background active:bg-muted")}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center border",
          multi ? "rounded-sm" : "rounded-full",
          on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
      >
        {on && <Check className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 break-words">{label}</span>
    </button>
  );
}

function ChoiceInput({ question, value, onChange, disabled, a11y }: {
  question: ChoiceQuestion; value: AnswerValue | undefined; onChange: LiteQuestionProps["onChange"]; disabled?: boolean;
  a11y: FieldA11y;
}) {
  const t = useT();
  const options = question.options;
  if (question.type === "dropdown" && options.length > 6) {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || undefined)}
        {...a11y}
        className="h-14 w-full rounded-lg border border-border bg-background px-4 text-[16px]"
      >
        <option value="">{t("forms.runtime.placeholder")}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    );
  }
  const multi = question.type === "multi_choice";
  const picked = multi ? (Array.isArray(value) ? value : []) : [];
  return (
    <div role={multi ? "group" : "radiogroup"} {...a11y} className="flex flex-col gap-2">
      {options.map((o) => {
        const on = multi ? picked.includes(o.id) : value === o.id;
        const toggle = () => {
          if (!multi) return onChange(on && !question.required ? undefined : o.id);
          const next = on ? picked.filter((id) => id !== o.id) : [...picked, o.id];
          onChange(next.length ? next : undefined);
        };
        return <OptionRow key={o.id} on={on} multi={multi} label={o.label} onClick={toggle} disabled={disabled} />;
      })}
    </div>
  );
}

function RatingInput({ value, onChange, disabled, a11y }: {
  value: AnswerValue | undefined; onChange: LiteQuestionProps["onChange"]; disabled?: boolean; a11y: FieldA11y;
}) {
  const t = useT();
  const current = typeof value === "number" ? value : 0;
  return (
    <div role="radiogroup" {...a11y} className="flex gap-1">
      {Array.from({ length: FORM_RATING_MAX }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={fmt(t("forms.fill.ratingLabel"), { n, max: FORM_RATING_MAX })}
          disabled={disabled}
          onClick={() => { hapticLight(); onChange(n); }}
          className="flex h-14 w-14 items-center justify-center rounded-lg active:bg-muted disabled:opacity-50"
        >
          <Star className={cn("h-9 w-9", n <= current ? "fill-primary text-primary" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

function ScaleInput({ question, value, onChange, disabled, a11y }: {
  question: ScaleQuestion; value: AnswerValue | undefined; onChange: LiteQuestionProps["onChange"]; disabled?: boolean;
  a11y: FieldA11y;
}) {
  const steps: number[] = [];
  for (let n = question.min; n <= question.max && steps.length < 11; n++) steps.push(n);
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" {...a11y} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(steps.length, 6)}, minmax(0, 1fr))` }}>
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={disabled}
            onClick={() => { hapticLight(); onChange(n); }}
            className={cn(
              "h-12 rounded-lg border font-mono text-[16px] tabular-nums disabled:opacity-50",
              value === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background active:bg-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(question.minLabel || question.maxLabel) && (
        <div className="flex justify-between gap-3 text-[13px] text-muted-foreground">
          <span>{question.minLabel}</span>
          <span className="text-end">{question.maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function FileInput({ question, value, onChange, onPickFiles, filesNote, uploading, disabled, a11y }: {
  question: FileQuestion; value: AnswerValue | undefined; onChange: LiteQuestionProps["onChange"];
  onPickFiles?: LiteQuestionProps["onPickFiles"]; filesNote?: string; uploading?: boolean; disabled?: boolean;
  a11y: FieldA11y;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const count = fileAnswerOf(value).driveItemIds.length;
  const max = questionMaxFiles(question);
  if (!onPickFiles) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-3 text-[14px] text-muted-foreground">{filesNote}</p>;
  }
  const photo = question.type === "photo";
  const Icon = photo ? Camera : Paperclip;
  return (
    <div role="group" {...a11y} className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={max > 1}
        accept={photo ? "image/*" : question.accept || undefined}
        capture={photo ? "environment" : undefined}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void onPickFiles(question, files);
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading || count >= max}
        onClick={() => { hapticLight(); inputRef.current?.click(); }}
        className={cn(tapRow, "justify-center border-dashed border-border bg-background font-medium active:bg-muted")}
      >
        <Icon className="h-5 w-5" />
        {uploading ? t("forms.fill.uploading") : t(photo ? "forms.fill.addPhoto" : "forms.fill.addFile")}
      </button>
      {count > 0 && (
        <div className="flex items-center justify-between gap-3 text-[14px]">
          <span className="font-mono tabular-nums text-muted-foreground">
            {fmt(t("forms.fill.filesAttached"), { count, max })}
          </span>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => onChange(undefined)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
            {t("forms.fill.removeFiles")}
          </button>
        </div>
      )}
    </div>
  );
}

const fieldClass = "h-14 rounded-lg px-4 text-[16px]";

function Control(props: LiteQuestionProps & { a11y: FieldA11y }) {
  const t = useT();
  const { question: q, value, onChange, disabled, a11y } = props;
  const text = typeof value === "string" ? value : "";
  switch (q.type) {
    case "short_text":
      return <Input {...a11y} value={text} disabled={disabled} maxLength={FORM_MAX_SHORT_TEXT_LENGTH} className={fieldClass}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />;
    case "long_text":
      return <Textarea {...a11y} value={text} disabled={disabled} maxLength={FORM_MAX_LONG_TEXT_LENGTH} rows={5}
        className="min-h-32 rounded-lg px-4 py-3 text-[16px]"
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />;
    case "number":
      return <Input {...a11y} type="number" inputMode="decimal" value={typeof value === "number" ? String(value) : ""} disabled={disabled}
        min={q.min} max={q.max} className={cn(fieldClass, "font-mono tabular-nums")}
        onChange={(e) => {
          const n = e.target.value === "" ? NaN : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : undefined);
        }} />;
    case "date":
    case "time":
      return <Input {...a11y} type={q.type} value={text} disabled={disabled} className={cn(fieldClass, "font-mono tabular-nums")}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value.slice(0, q.type === "time" ? 5 : 10))} />;
    case "single_choice":
    case "multi_choice":
    case "dropdown":
      return <ChoiceInput question={q} value={value} onChange={onChange} disabled={disabled} a11y={a11y} />;
    case "yes_no":
      return (
        <div role="radiogroup" {...a11y} className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <OptionRow key={String(v)} on={value === v} multi={false} disabled={disabled}
              label={t(v ? "forms.runtime.booleanCheckedLabel" : "forms.runtime.booleanUncheckedLabel")}
              onClick={() => onChange(value === v && !q.required ? undefined : v)} />
          ))}
        </div>
      );
    case "checklist_item":
      return <OptionRow on={value === true} multi disabled={disabled} label={q.title}
        onClick={() => onChange(value === true ? undefined : true)} />;
    case "rating":
      return <RatingInput value={value} onChange={onChange} disabled={disabled} a11y={a11y} />;
    case "scale":
      return <ScaleInput question={q} value={value} onChange={onChange} disabled={disabled} a11y={a11y} />;
    case "photo":
    case "file":
      return <FileInput question={q} value={value} onChange={onChange} onPickFiles={props.onPickFiles}
        filesNote={props.filesNote} uploading={props.uploading} disabled={disabled} a11y={a11y} />;
  }
}

/** One question: its title, help and required mark, the input, and an error line. */
export function LiteQuestion(props: LiteQuestionProps) {
  const t = useT();
  const { question: q, error } = props;
  const titled = !props.hideTitle && q.type !== "checklist_item";
  const id = useId();
  const titleId = `${id}-title`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  // A checklist item's control is a button whose text is the title, so it needs no label from here.
  const described = [q.help ? helpId : "", error ? errorId : ""].filter(Boolean).join(" ");
  const a11y: FieldA11y = {
    ...(titled ? { "aria-labelledby": titleId } : {}),
    ...(described ? { "aria-describedby": described } : {}),
    ...(q.required ? { "aria-required": true } : {}),
    ...(error ? { "aria-invalid": true } : {}),
  };
  const help = q.help && <p id={helpId} className="text-[14px] text-muted-foreground break-words">{q.help}</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {titled && (
        <div className="flex flex-col gap-1">
          <div id={titleId} className="text-[17px] font-semibold leading-snug break-words">
            {q.title}
            {q.required && (
              <>
                <span aria-hidden className="ms-1 text-destructive">*</span>
                <span className="sr-only">{t("forms.fill.required")}</span>
              </>
            )}
          </div>
          {help}
        </div>
      )}
      {!titled && help}
      <Control {...props} a11y={a11y} />
      {error && <p id={errorId} role="alert" className="text-[14px] text-destructive">{error}</p>}
    </div>
  );
}
