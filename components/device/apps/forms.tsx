"use client";

// "Forms" on /store + /personal: a lite list of the forms a person can fill,
// and the fill flow in ./forms-fill (our own lite renderer, never the manager's
// form library). Building, sharing and reading responses stay on
// /manager/forms.
//
// - /store: the PIN operator answers (actingMemberId). Home shows the
//   checklists left today with who did them (form_completion; the tablet never
//   reads answers, decision C7), "Report something", and the other forms.
// - /personal: "To fill" (assigned, not done this period, with due dates),
//   "Open to everyone", and "My submissions" (read-only, with the review
//   status), under the note that management can see the answers.

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, ClipboardList, Inbox, MessageSquare, TriangleAlert, type LucideIcon } from "lucide-react";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { dateFromKey, dateKey } from "@/lib/date-key";
import { buildResponseTable } from "@/lib/forms/export";
import { formPeriodForDateKey } from "@/lib/forms/period";
import type { FormCompletionView, FormKind, FormResponseView, FormView } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useNow } from "@/lib/use-now";
import { useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";
import { useFormAssignments, useFormCompletions, useForms, useMyFormResponses } from "@/lib/spacetimedb/hooks/useForms";
import { FormFill } from "./forms-fill";
import { LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import type { LiteAppProps } from "./types";

// ── Pure helpers (exported for tests) ───────────────────────────────────────

/** Whether a person may open `form` to answer it now (the reducer re-checks all of this). */
export function formIsFillable(form: FormView, now: Date, assignedFormIds: ReadonlySet<string>): boolean {
  if (form.status !== "open" || form.definition === null) return false;
  if (form.closesAt !== null && now.getTime() >= form.closesAt.getTime()) return false;
  if (form.audience === "private") return false;
  if (form.audience === "assigned" && !assignedFormIds.has(form.id)) return false;
  return form.definition.questions.some((q) => q.type !== "section" && !q.archived);
}

/**
 * Whether `memberId` already answered `form` in the current period (`today` = store-local YYYY-MM-DD): from their
 * own responses where readable (/personal), else from completion rows (/store, tracked forms only).
 */
export function periodDone(
  form: Pick<FormView, "id" | "perMember">,
  today: string,
  memberId: string,
  responses: readonly Pick<FormResponseView, "formId" | "period">[],
  completions: readonly Pick<FormCompletionView, "formId" | "memberId" | "period">[],
): boolean {
  if (form.perMember === "unlimited") return false;
  const period = formPeriodForDateKey(form.perMember, today);
  const me = memberId.toLowerCase();
  return responses.some((r) => r.formId === form.id && r.period === period)
    || completions.some((c) => c.formId === form.id && c.memberId.toLowerCase() === me && c.period === period);
}

/** The latest completion of `formId` among `completions` (already one day's), or null. */
export function lastCompletion<T extends Pick<FormCompletionView, "formId" | "completedAt">>(formId: string, completions: readonly T[]): T | null {
  let best: T | null = null;
  for (const c of completions) if (c.formId === formId && (!best || c.completedAt > best.completedAt)) best = c;
  return best;
}

/**
 * The completions of `form` that count for its current period: today's for a daily (or unlimited) form, this ISO
 * week's from the last seven days for a weekly one, the last seven days' for a `once` form.
 */
export function currentCompletions<T extends Pick<FormCompletionView, "formId" | "period">>(
  form: Pick<FormView, "id" | "perMember">, today: string, todays: readonly T[], recent: readonly T[],
): T[] {
  if (form.perMember === "unlimited" || form.perMember === "daily") return todays.filter((c) => c.formId === form.id);
  const period = formPeriodForDateKey(form.perMember, today);
  return recent.filter((c) => c.formId === form.id && c.period === period);
}

/** Assigned forms first by due date (none last), then by title. */
export function byDueDate(dueOf: (formId: string) => string) {
  return (a: FormView, b: FormView): number => {
    const da = dueOf(a.id) || "9999-99-99";
    const db = dueOf(b.id) || "9999-99-99";
    return da === db ? a.title.localeCompare(b.title) : da < db ? -1 : 1;
  };
}

const KIND_ICON: Record<FormKind, LucideIcon> = {
  checklist: ClipboardCheck,
  report: TriangleAlert,
  survey: MessageSquare,
  form: ClipboardList,
};

/** Rows per section; a device list never needs to be longer. */
const MAX_ROWS = 40;

// ── App ─────────────────────────────────────────────────────────────────────

export function FormsLite({ surface, organizationId, member }: LiteAppProps) {
  const t = useT();
  const { forms, isReady, notPublished } = useForms();
  const { mine } = useFormAssignments(member.id);
  const { completions, recent } = useFormCompletions();
  const signedIn = useSignedInMember();
  const now = useNow(60_000);
  const [filling, setFilling] = useState<FormView | null>(null);

  const assigned = useMemo(() => new Map(mine.map((a) => [a.formId, a.dueDate])), [mine]);
  const fillable = useMemo(() => {
    const assignedIds = new Set(assigned.keys());
    return forms.map((f) => f.form).filter((f) => formIsFillable(f, now, assignedIds));
  }, [forms, now, assigned]);
  const formsById = useMemo(() => new Map(forms.map((f) => [f.form.id, f.form])), [forms]);

  if (filling?.definition) {
    return (
      <FormFill
        form={filling}
        definition={filling.definition}
        surface={surface}
        organizationId={organizationId}
        member={member}
        deviceAccountRole={signedIn.role}
        onClose={() => setFilling(null)}
      />
    );
  }
  if (!isReady) return <LiteScreen><LiteLoading /></LiteScreen>;
  if (notPublished) {
    return <LiteScreen><LiteEmpty icon={ClipboardList} title={t("forms.errors.not_published")} /></LiteScreen>;
  }
  const home = { fillable, completions, recent, assigned, memberId: member.id, today: dateKey(now), onOpen: setFilling };
  return surface === "store" ? <StoreHome {...home} /> : <PersonalHome {...home} formsById={formsById} />;
}

interface HomeProps {
  fillable: FormView[];
  /** Today's completions (who did which checklist). */
  completions: FormCompletionView[];
  /** The last seven days' completions: whether a daily or weekly form is already done this period. */
  recent: FormCompletionView[];
  /** Due date by assigned form id ('' = none). */
  assigned: ReadonlyMap<string, string>;
  memberId: string;
  today: string;
  onOpen: (form: FormView) => void;
}

function StoreHome({ fillable, completions, recent, memberId, today, onOpen }: HomeProps) {
  const t = useT();
  const formatDate = useDateFormat();
  const checklists = fillable.filter((f) => f.kind === "checklist");
  const reports = fillable.filter((f) => f.kind === "report");
  const others = fillable.filter((f) => f.kind === "form" || f.kind === "survey").slice(0, MAX_ROWS);
  const lastOf = (f: FormView) => lastCompletion(f.id, currentCompletions(f, today, completions, recent));
  const left = checklists.filter((f) => f.trackCompletion && !lastOf(f)).length;

  const row = (f: FormView, sub?: string) => {
    const done = periodDone(f, today, memberId, [], recent);
    return (
      <LiteRow
        key={f.id}
        icon={done ? CheckCircle2 : KIND_ICON[f.kind]}
        iconTone={done ? "success" : f.kind === "report" ? "warning" : "muted"}
        title={f.title}
        sub={done ? t("device.lite.forms.doneByYou") : sub}
        onClick={done ? undefined : () => onOpen(f)}
        chevron={!done}
      />
    );
  };

  if (fillable.length === 0) {
    return <LiteScreen><LiteEmpty icon={ClipboardList} title={t("device.lite.forms.none")} description={t("device.lite.forms.noneHint")} /></LiteScreen>;
  }
  return (
    <LiteScreen>
      {checklists.length > 0 && (
        <LiteStat
          icon={ClipboardCheck}
          tone={left > 0 ? "warning" : "success"}
          label={t("device.lite.forms.checklistsLeft")}
          value={left}
          sub={t(left > 0 ? "device.lite.forms.checklistsLeftHint" : "device.lite.forms.allDone")}
        />
      )}
      {checklists.length > 0 && (
        <LiteSection title={t("device.lite.forms.today")}>
          <div className="space-y-2">
            {checklists.slice(0, MAX_ROWS).map((f) => {
              const last = lastOf(f);
              const sub = last
                ? fmt(t("device.lite.forms.doneBy"), {
                  name: last.memberName,
                  // A weekly checklist may have been done on another day this week: name the day then.
                  time: formatDate(last.completedAt, last.date === today
                    ? { hour: "numeric", minute: "2-digit" }
                    : { weekday: "short", hour: "numeric", minute: "2-digit" }),
                })
                : t("device.lite.forms.notDone");
              return row(f, sub);
            })}
          </div>
        </LiteSection>
      )}
      {reports.length > 0 && (
        <LiteSection title={t("device.lite.forms.report")}>
          <div className="space-y-2">{reports.slice(0, MAX_ROWS).map((f) => row(f, f.definition?.description || undefined))}</div>
        </LiteSection>
      )}
      {others.length > 0 && (
        <LiteSection title={t("device.lite.forms.other")}>
          <div className="space-y-2">{others.map((f) => row(f, f.definition?.description || undefined))}</div>
        </LiteSection>
      )}
    </LiteScreen>
  );
}

function PersonalHome({ fillable, recent, assigned, memberId, today, onOpen, formsById }: HomeProps & { formsById: ReadonlyMap<string, FormView> }) {
  const t = useT();
  const formatDate = useDateFormat();
  const mine = useMyFormResponses();
  const [detail, setDetail] = useState<FormResponseView | null>(null);
  const day = (key: string) => formatDate(dateFromKey(key), { month: "short", day: "numeric" });

  const done = (f: FormView) => periodDone(f, today, memberId, mine.responses, recent);
  const toFill = fillable.filter((f) => assigned.has(f.id) && !done(f)).sort(byDueDate((id) => assigned.get(id) ?? ""));
  const openToAll = fillable.filter((f) => f.audience === "members" && !assigned.has(f.id)).slice(0, MAX_ROWS);
  const isOverdue = (f: FormView) => {
    const due = assigned.get(f.id) ?? "";
    return due !== "" && due < today;
  };
  const overdue = toFill.some(isOverdue);
  const sent = mine.responses.slice(0, MAX_ROWS);

  const dueSub = (f: FormView) => {
    const due = assigned.get(f.id) ?? "";
    if (!due) return t("device.lite.forms.noDue");
    return fmt(t(isOverdue(f) ? "device.lite.forms.overdue" : "device.lite.forms.due"), { date: day(due) });
  };

  return (
    <LiteScreen>
      <LiteStat
        icon={ClipboardList}
        tone={overdue ? "warning" : toFill.length === 0 ? "success" : "default"}
        label={t("device.lite.forms.toFill")}
        value={toFill.length}
        sub={t(toFill.length > 0 ? "device.lite.forms.toFillHint" : "device.lite.forms.allDone")}
      />
      {toFill.length > 0 && (
        <LiteSection title={t("device.lite.forms.toFill")}>
          <div className="space-y-2">
            {toFill.slice(0, MAX_ROWS).map((f) => (
              <LiteRow key={f.id} icon={KIND_ICON[f.kind]} iconTone={isOverdue(f) ? "warning" : "primary"} title={f.title} sub={dueSub(f)} onClick={() => onOpen(f)} chevron />
            ))}
          </div>
        </LiteSection>
      )}
      {openToAll.length > 0 && (
        <LiteSection title={t("device.lite.forms.openToAll")}>
          <div className="space-y-2">
            {openToAll.map((f) => (done(f)
              ? <LiteRow key={f.id} icon={CheckCircle2} iconTone="success" title={f.title} sub={t("device.lite.forms.doneForNow")} />
              : <LiteRow key={f.id} icon={KIND_ICON[f.kind]} title={f.title} sub={f.definition?.description || undefined} onClick={() => onOpen(f)} chevron />))}
          </div>
        </LiteSection>
      )}
      <LiteSection title={t("device.lite.forms.mySubmissions")}>
        {!mine.isReady ? <LiteLoading /> : sent.length === 0 ? (
          <LiteEmpty icon={Inbox} title={t("device.lite.forms.noSubmissions")} className="min-h-[20vh]" />
        ) : (
          <div className="space-y-2">
            {sent.map((r) => (
              <LiteRow
                key={r.id}
                icon={r.reviewStatus === "reviewed" ? CheckCircle2 : ClipboardList}
                iconTone={r.reviewStatus === "reviewed" ? "success" : "muted"}
                title={r.formTitle}
                sub={fmt(t("device.lite.forms.sentOn"), { date: day(r.date) })}
                right={<ReviewBadge status={r.reviewStatus} />}
                onClick={() => setDetail(r)}
              />
            ))}
          </div>
        )}
      </LiteSection>
      <p className="text-[13px] text-muted-foreground">{t("forms.disclosure.respondentNote")}</p>
      <SubmissionDrawer response={detail} form={detail ? (formsById.get(detail.formId) ?? null) : null} onClose={() => setDetail(null)} />
    </LiteScreen>
  );
}

function ReviewBadge({ status }: { status: FormResponseView["reviewStatus"] }) {
  const t = useT();
  return (
    <StatusBadge tone={status === "reviewed" ? "success" : "neutral"}>
      {t(status === "reviewed" ? "device.lite.forms.status.reviewed" : "device.lite.forms.status.new")}
    </StatusBadge>
  );
}

/** One of my submissions, read-only: respondents never edit or delete what they sent (decision C8). */
function SubmissionDrawer({ response, form, onClose }: { response: FormResponseView | null; form: FormView | null; onClose: () => void }) {
  const t = useT();
  const formatDate = useDateFormat();
  const rows = useMemo(() => {
    const def = form?.definition;
    if (!response || !def) return null;
    const table = buildResponseTable(def, [response], { t, includeArchived: true });
    const types = new Map(def.questions.map((q) => [q.id, q.type]));
    return table.columns.flatMap((col, i) => {
      if (!col.questionId) return [];
      const cell = table.rows[0]?.[i] ?? "";
      if (cell === "") return [];
      const type = types.get(col.questionId);
      const text = type === "photo" || type === "file" ? fmt(t("device.lite.forms.filesAdded"), { count: cell }) : String(cell);
      return [{ id: col.questionId, title: col.header, text }];
    });
  }, [response, form, t]);

  return (
    <DeviceDrawer
      open={response !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={response?.formTitle ?? ""}
      cancelLabel={t("common.close")}
    >
      {response && (
        <div className="space-y-3 pb-2">
          <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
            <span className="font-mono tabular-nums">{formatDate(response.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
            <ReviewBadge status={response.reviewStatus} />
          </div>
          {rows === null ? (
            <p className="text-[14px] text-muted-foreground">{t("device.lite.forms.unavailable")}</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-[13px] text-muted-foreground">{r.title}</p>
                <p className="whitespace-pre-wrap break-words text-[15px] font-medium">{r.text}</p>
              </div>
            ))
          )}
          <p className="text-[13px] text-muted-foreground">{t("forms.disclosure.respondentNote")}</p>
        </div>
      )}
    </DeviceDrawer>
  );
}
