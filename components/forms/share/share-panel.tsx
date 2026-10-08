"use client";

// The Share tab: who may answer (audience and assignees), how often (per member), until when (close date,
// response cap), completion tracking for checklists, owner notifications, the public link, and the disclosure
// that the store's management can see every answer (like drive.disclosure.*, never softened).

import { useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Assignees } from "@/components/forms/share/assignees";
import { DateCommitInput } from "@/components/forms/share/date-commit-input";
import { PublicLink } from "@/components/forms/share/public-link";
import { dateFromKey, dateKey } from "@/lib/date-key";
import { FORM_MAX_RESPONSE_LIMIT } from "@/lib/forms/limits";
import { FORM_AUDIENCES, PER_MEMBER_RULES, type FormMetaView, type FormView, type PerMemberRule } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { formsErrorKey, updateFormSettings, type FormSettingsInput } from "@/lib/spacetimedb/actions/forms";

function settingsOf(form: FormView): FormSettingsInput {
  return {
    audience: form.audience,
    perMember: form.perMember,
    responseLimit: form.responseLimit,
    closesAt: form.closesAt,
    trackCompletion: form.trackCompletion,
    notifyOwner: form.notifyOwner,
  };
}

/** A `YYYY-MM-DD` close date → the end of that local day; '' → never. */
function closeDateToInstant(key: string): Date | null {
  if (!key) return null;
  const d = dateFromKey(key);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

export function SharePanel({ form, meta }: { form: FormView; meta: FormMetaView | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [limitText, setLimitText] = useState<string | null>(null);

  const save = async (patch: Partial<FormSettingsInput>) => {
    setBusy(true);
    try {
      await updateFormSettings(form.id, { ...settingsOf(form), ...patch });
    } catch (err) {
      toast.error(t(formsErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const commitLimit = () => {
    if (limitText === null) return;
    const n = Math.trunc(Number(limitText));
    setLimitText(null);
    if (!Number.isFinite(n) || n === form.responseLimit) return;
    void save({ responseLimit: Math.min(FORM_MAX_RESPONSE_LIMIT, Math.max(1, n)) });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Callout tone="info" icon={Eye} title={t("forms.disclosure.managersTitle")}>
        {t("forms.disclosure.managersNote")}
      </Callout>

      <section className="space-y-3 rounded border border-border p-3" aria-labelledby="form-audience-title">
        <h3 id="form-audience-title" className="text-sm font-medium">{t("forms.share.audienceTitle")}</h3>
        <SegmentedControl
          aria-label={t("forms.share.audienceTitle")}
          size="sm"
          value={form.audience}
          onChange={(audience) => { void save({ audience }); }}
          options={FORM_AUDIENCES.map((a) => ({ value: a, label: t(`forms.share.audience.${a}`), disabled: busy }))}
        />
        <p className="text-xs text-muted-foreground">{t(`forms.share.audienceDesc.${form.audience}`)}</p>
        {form.audience !== "private" && (
          <Field label={t("forms.share.assignees")} hint={t(form.audience === "assigned" ? "forms.share.assigneesOnly" : "forms.share.assigneesHint")}>
            <Assignees formId={form.id} />
          </Field>
        )}
      </section>

      <section className="space-y-3 rounded border border-border p-3" aria-labelledby="form-rules-title">
        <h3 id="form-rules-title" className="text-sm font-medium">{t("forms.share.rulesTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("forms.share.perMember")}>
            <Select value={form.perMember} disabled={busy} onValueChange={(v) => { void save({ perMember: v as PerMemberRule }); }}>
              <SelectTrigger className="h-8 w-full text-sm" aria-label={t("forms.share.perMember")}>
                <SelectValue>{t(`forms.perMember.${form.perMember}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PER_MEMBER_RULES.map((rule) => <SelectItem key={rule} value={rule}>{t(`forms.perMember.${rule}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("forms.share.responseLimit")} htmlFor="form-limit">
            <Input
              id="form-limit"
              type="number"
              inputMode="numeric"
              min={1}
              max={FORM_MAX_RESPONSE_LIMIT}
              className="h-8 font-mono text-sm tabular-nums"
              disabled={busy}
              value={limitText ?? String(form.responseLimit)}
              onChange={(e) => setLimitText(e.target.value)}
              onBlur={commitLimit}
              onKeyDown={(e) => { if (e.key === "Enter") commitLimit(); }}
            />
          </Field>
          <Field label={t("forms.share.closesOn")} htmlFor="form-closes">
            <div className="flex items-center gap-1">
              <DateCommitInput
                id="form-closes"
                className="h-8 font-mono text-sm tabular-nums"
                value={form.closesAt ? dateKey(form.closesAt) : ""}
                onCommit={(key) => { void save({ closesAt: closeDateToInstant(key) }); }}
              />
              {form.closesAt && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void save({ closesAt: null }); }}>
                  {t("forms.share.never")}
                </Button>
              )}
            </div>
          </Field>
        </div>

        <ToggleRow
          label={t("forms.share.trackCompletion")}
          hint={t("forms.share.trackCompletionHint")}
          checked={form.trackCompletion}
          disabled={busy}
          onChange={(trackCompletion) => { void save({ trackCompletion }); }}
        />
        <ToggleRow
          label={t("forms.share.notifyOwner")}
          hint={t("forms.share.notifyOwnerHint")}
          checked={form.notifyOwner}
          disabled={busy}
          onChange={(notifyOwner) => { void save({ notifyOwner }); }}
        />
      </section>

      {meta && <PublicLink form={form} meta={meta} />}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 border-t border-border pt-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
