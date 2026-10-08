"use client";

// The Forms list for members who do not build forms: "To fill" (open forms meant for me, not yet answered this
// period) and "My submissions" (my own responses of the last 90 days, with their review status).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Send } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { FormRow } from "@/components/forms/list/form-row";
import { FormsToolbar } from "@/components/forms/list/toolbar";
import {
  dueDateOf, formEditHref, formFillHref, isAcceptingAt, isDoneThisPeriod, isFormForMember, RESPONDENT_FILTERS, REVIEW_STATUS_TONE,
  type RespondentFilter,
} from "@/components/forms/list/status";
import { dateFromKey } from "@/lib/date-key";
import { fmt } from "@/lib/i18n/fmt";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useNow } from "@/lib/use-now";
import type { FormListItem } from "@/lib/spacetimedb/hooks/useForms";
import { useFormAssignments, useMyFormResponses } from "@/lib/spacetimedb/hooks/useForms";
import { useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";

export function RespondentList({
  forms,
  formsReady,
  onOpen,
  onShown,
}: {
  forms: readonly FormListItem[];
  formsReady: boolean;
  onOpen: (href: string) => void;
  /** The filter and row count on screen (for Mr. Merchiva's page context). */
  onShown?: (view: RespondentFilter, shown: number) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<RespondentFilter>("toFill");
  const [query, setQuery] = useState("");
  const formatDate = useDateFormat();
  const now = useNow(60_000);
  const { memberId } = useSignedInMember();
  const { assignments } = useFormAssignments();
  const mine = useMyFormResponses();

  const toFill = useMemo(
    () => forms
      .map((item) => item.form)
      .filter((f) => isAcceptingAt(f, now) && isFormForMember(f, assignments, memberId) && !isDoneThisPeriod(f, mine.responses, now)),
    [forms, assignments, memberId, mine.responses, now],
  );
  const reviewed = mine.responses.filter((r) => r.reviewStatus === "reviewed").length;
  const counts: Record<RespondentFilter, number> = { toFill: toFill.length, mine: mine.responses.length };

  const q = query.trim().toLowerCase();
  const shownForms = q ? toFill.filter((f) => f.title.toLowerCase().includes(q)) : toFill;
  const shownResponses = q ? mine.responses.filter((r) => r.formTitle.toLowerCase().includes(q)) : mine.responses;
  const kindOf = useMemo(() => new Map(forms.map((item) => [item.form.id, item.form.kind] as const)), [forms]);

  const day = (d: Date) => formatDate(d, { month: "short", day: "numeric" });
  const loading = filter === "toFill" ? !formsReady || !mine.isReady : !mine.isReady;
  const shown = filter === "toFill" ? shownForms.length : shownResponses.length;
  useEffect(() => { onShown?.(filter, shown); }, [filter, shown, onShown]);

  return (
    <div className="space-y-6">
      <StatGrid>
        <StatTile icon={ClipboardList} tone={toFill.length > 0 ? "info" : undefined} label={t("forms.list.stats.toFill")} value={toFill.length} />
        <StatTile icon={Send} label={t("forms.list.stats.submitted")} value={mine.responses.length} sub={t("forms.list.stats.last90")} />
        <StatTile icon={CheckCircle2} label={t("forms.list.stats.reviewed")} value={reviewed} />
      </StatGrid>

      <FormsToolbar<RespondentFilter>
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        options={RESPONDENT_FILTERS.map((key) => ({
          value: key,
          label: t(`forms.list.filter.${key}`),
          count: counts[key] > 0 ? counts[key] : undefined,
        }))}
      />

      {loading && (filter === "toFill" ? shownForms.length === 0 : shownResponses.length === 0) ? (
        <div className="flex justify-center py-24">
          <Spinner size={20} className="text-muted-foreground" />
        </div>
      ) : filter === "toFill" ? (
        shownForms.length === 0 ? (
          <EmptyState
            className="py-20"
            icon={CheckCircle2}
            title={t(q ? "forms.list.empty.search" : "forms.list.empty.toFill")}
            description={q ? undefined : t("forms.list.empty.toFillDesc")}
          />
        ) : (
          <div className="divide-y divide-border rounded border border-border">
            {shownForms.map((f) => {
              const due = dueDateOf(f, assignments, memberId);
              return (
                <FormRow
                  key={f.id}
                  kind={f.kind}
                  title={f.title}
                  description={f.definition?.description}
                  meta={[
                    t(`forms.kind.${f.kind}`),
                    t(`forms.perMember.${f.perMember}`),
                    due ? fmt(t("forms.list.due"), { date: day(dateFromKey(due)) }) : "",
                    f.closesAt ? fmt(t("forms.list.closes"), { date: day(f.closesAt) }) : "",
                  ].filter(Boolean).join(" · ")}
                  badge={t("forms.list.fill")}
                  badgeTone="info"
                  onOpen={() => onOpen(formFillHref(f.id))}
                />
              );
            })}
          </div>
        )
      ) : shownResponses.length === 0 ? (
        <EmptyState
          className="py-20"
          icon={Send}
          title={t(q ? "forms.list.empty.search" : "forms.list.empty.mine")}
          description={q ? undefined : t("forms.list.empty.mineDesc")}
        />
      ) : (
        <div className="divide-y divide-border rounded border border-border">
          {shownResponses.map((r) => (
            <FormRow
              key={r.id}
              kind={kindOf.get(r.formId) ?? "form"}
              title={r.formTitle}
              meta={formatDate(r.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              badge={t(`forms.reviewStatus.${r.reviewStatus}`)}
              badgeTone={REVIEW_STATUS_TONE[r.reviewStatus]}
              onOpen={() => {
                // The form row is readable only while it is open or closed and not private: once it is archived,
                // back in drafts or private, the edit page would say "not found". Say why instead, like /personal.
                if (formsReady && !kindOf.has(r.formId)) toast.info(t("device.lite.forms.unavailable"));
                else onOpen(formEditHref(r.formId, "responses"));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
