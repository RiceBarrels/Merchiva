"use client";

// The per-type part of the question editor: options for choice questions, ranges for number / multi-choice /
// scale, end labels for scales, and file limits for photo / file questions.

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addOption, moveOption, removeOption, renameOption, type DraftCopy } from "@/components/forms/builder/draft";
import { moveButtonProps, useMoveFocus } from "@/components/forms/builder/move-focus";
import {
  FORM_MAX_ACCEPT_LENGTH, FORM_MAX_FILES_PER_RESPONSE, FORM_MAX_OPTION_LABEL_LENGTH, FORM_MAX_OPTIONS,
  FORM_MAX_SCALE_LABEL_LENGTH, FORM_SCALE_MAX_HIGH, FORM_SCALE_MAX_LOW, FORM_SCALE_MIN_HIGH, FORM_SCALE_MIN_LOW,
} from "@/lib/forms/limits";
import type { Question } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";

/** '' → undefined; anything else → a finite number (integers when `int`), or undefined. */
function parseNumber(raw: string, int: boolean): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return int ? Math.trunc(n) : n;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export function TypeFields({
  q,
  onChange,
  copy,
  lockedOptionIds,
}: {
  q: Question;
  onChange: (next: Question) => void;
  copy: DraftCopy;
  /** Options already saved on a form with responses: they can be relabelled, never removed. */
  lockedOptionIds: ReadonlySet<string>;
}) {
  const t = useT();
  const id = (name: string) => `${q.id}-${name}`;
  const { root, moved } = useMoveFocus<HTMLDivElement>();

  if (q.type === "single_choice" || q.type === "multi_choice" || q.type === "dropdown") {
    return (
      <div className="space-y-3">
        <Field label={t("forms.builder.options")}>
          <div ref={root} className="space-y-1.5">
            {q.options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-1">
                <Input
                  id={id(`${o.id}-label`)}
                  value={o.label}
                  maxLength={FORM_MAX_OPTION_LABEL_LENGTH}
                  aria-label={t("forms.builder.optionLabel")}
                  onChange={(e) => onChange(renameOption(q, o.id, e.target.value))}
                  className="h-8 text-sm"
                />
                <Button variant="ghost" size="icon-sm" aria-label={t("forms.builder.moveUp")} disabled={i === 0}
                  aria-describedby={id(`${o.id}-label`)} {...moveButtonProps(o.id, "up")}
                  onClick={() => { moved(o.id, "up"); onChange(moveOption(q, o.id, -1)); }}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("forms.builder.moveDown")} disabled={i === q.options.length - 1}
                  aria-describedby={id(`${o.id}-label`)} {...moveButtonProps(o.id, "down")}
                  onClick={() => { moved(o.id, "down"); onChange(moveOption(q, o.id, 1)); }}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("forms.builder.removeOption")}
                  aria-describedby={id(`${o.id}-label`)}
                  disabled={q.options.length <= 1 || lockedOptionIds.has(o.id)}
                  title={lockedOptionIds.has(o.id) ? t("forms.builder.optionLocked") : undefined}
                  onClick={() => onChange(removeOption(q, o.id))}>
                  <X />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1" disabled={q.options.length >= FORM_MAX_OPTIONS}
              onClick={() => onChange(addOption(q, copy))}>
              <Plus />
              {t("forms.builder.addOption")}
            </Button>
          </div>
        </Field>
        {q.type === "multi_choice" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("forms.builder.minSelections")} htmlFor={id("min")}>
              <Input id={id("min")} type="number" inputMode="numeric" min={0} max={q.options.length} className="h-8 text-sm"
                value={q.min ?? ""} onChange={(e) => onChange({ ...q, min: parseNumber(e.target.value, true) })} />
            </Field>
            <Field label={t("forms.builder.maxSelections")} htmlFor={id("max")}>
              <Input id={id("max")} type="number" inputMode="numeric" min={1} max={q.options.length} className="h-8 text-sm"
                value={q.max ?? ""} onChange={(e) => onChange({ ...q, max: parseNumber(e.target.value, true) })} />
            </Field>
          </div>
        )}
      </div>
    );
  }

  if (q.type === "number") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("forms.builder.minValue")} htmlFor={id("min")}>
          <Input id={id("min")} type="number" inputMode="decimal" className="h-8 text-sm"
            value={q.min ?? ""} onChange={(e) => onChange({ ...q, min: parseNumber(e.target.value, false) })} />
        </Field>
        <Field label={t("forms.builder.maxValue")} htmlFor={id("max")}>
          <Input id={id("max")} type="number" inputMode="decimal" className="h-8 text-sm"
            value={q.max ?? ""} onChange={(e) => onChange({ ...q, max: parseNumber(e.target.value, false) })} />
        </Field>
      </div>
    );
  }

  if (q.type === "scale") {
    const pick = (value: number, values: number[], onPick: (n: number) => void, label: string) => (
      <Select value={String(value)} onValueChange={(v) => onPick(Number(v))}>
        <SelectTrigger className="h-8 w-full text-sm" aria-label={label}><SelectValue>{String(value)}</SelectValue></SelectTrigger>
        <SelectContent>
          {values.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
        </SelectContent>
      </Select>
    );
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("forms.builder.scaleFrom")}>
          {pick(q.min, range(FORM_SCALE_MIN_LOW, FORM_SCALE_MIN_HIGH), (n) => onChange({ ...q, min: n }), t("forms.builder.scaleFrom"))}
        </Field>
        <Field label={t("forms.builder.scaleTo")}>
          {pick(q.max, range(FORM_SCALE_MAX_LOW, FORM_SCALE_MAX_HIGH), (n) => onChange({ ...q, max: n }), t("forms.builder.scaleTo"))}
        </Field>
        <Field label={t("forms.builder.scaleLowLabel")} htmlFor={id("lo")}>
          <Input id={id("lo")} className="h-8 text-sm" maxLength={FORM_MAX_SCALE_LABEL_LENGTH} value={q.minLabel ?? ""}
            onChange={(e) => onChange({ ...q, minLabel: e.target.value || undefined })} />
        </Field>
        <Field label={t("forms.builder.scaleHighLabel")} htmlFor={id("hi")}>
          <Input id={id("hi")} className="h-8 text-sm" maxLength={FORM_MAX_SCALE_LABEL_LENGTH} value={q.maxLabel ?? ""}
            onChange={(e) => onChange({ ...q, maxLabel: e.target.value || undefined })} />
        </Field>
      </div>
    );
  }

  if (q.type === "photo" || q.type === "file") {
    return (
      <div className="space-y-3">
        <Field label={t("forms.builder.maxFiles")}>
          <Select value={String(q.maxFiles ?? 1)} onValueChange={(v) => onChange({ ...q, maxFiles: Number(v) })}>
            <SelectTrigger className="h-8 w-28 text-sm" aria-label={t("forms.builder.maxFiles")}>
              <SelectValue>{String(q.maxFiles ?? 1)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {range(1, FORM_MAX_FILES_PER_RESPONSE).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {q.type === "file" && (
          <Field label={t("forms.builder.accept")} htmlFor={id("accept")} hint={t("forms.builder.acceptHint")}>
            <Input id={id("accept")} className="h-8 font-mono text-sm" maxLength={FORM_MAX_ACCEPT_LENGTH} placeholder=".pdf,image/*"
              value={q.accept ?? ""} onChange={(e) => onChange({ ...q, accept: e.target.value.trim() || undefined })} />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">{t("forms.builder.filesNote")}</p>
      </div>
    );
  }

  return null;
}
