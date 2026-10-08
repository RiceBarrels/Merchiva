"use client";

// Edit ▸ Responses (design B.6): the form's responses, subscribed while this view is mounted (useFormResponses). A
// Drive admin (owner, manager, drive.view) reads every response; anyone else only their own. Summary charts, a
// compact table, a detail dialog with review, and exports.

import { useMemo, useState } from "react";
import { BarChart3, CircleDot, Clock, Inbox, List, MessageSquareText } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { summarizeResponses } from "@/lib/forms/summary";
import type { FormView } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useCanManageForms, useFormResponses } from "@/lib/spacetimedb/hooks/useForms";
import { ResponseDetailDialog } from "./detail-dialog";
import { ResponsesExportMenu } from "./export-menu";
import { ResponsesSummary } from "./summary";
import { ResponsesTable } from "./table";

type ResponsesView = "summary" | "table";

export interface FormResponsesProps {
  form: FormView;
  className?: string;
}

export function FormResponses({ form, className }: FormResponsesProps) {
  const t = useT();
  const formatDate = useDateFormat();
  const canReview = useCanManageForms();
  const { responses, reviews, failed, isReady, notPublished } = useFormResponses(form.id);
  const [view, setView] = useState<ResponsesView>("summary");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const definition = form.definition;
  const summary = useMemo(() => (definition ? summarizeResponses(definition, responses) : null), [definition, responses]);
  const unreviewed = useMemo(() => responses.filter((r) => r.reviewStatus === "new").length, [responses]);
  const open = openId ? (responses.find((r) => r.id === openId) ?? null) : null;

  if (!isReady) return <div className="flex justify-center py-16"><Spinner size={20} /></div>;
  if (notPublished) return <EmptyState icon={Inbox} title={t("forms.errors.not_published")} />;
  if (!definition) return <EmptyState icon={Inbox} title={t("forms.errors.invalid_definition")} />;

  return (
    <div className={className ?? "flex flex-col gap-4"}>
      <StatGrid>
        <StatTile icon={MessageSquareText} label={t("forms.responses.total")} value={responses.length} />
        <StatTile
          icon={CircleDot}
          tone={unreviewed > 0 ? "info" : undefined}
          label={t("forms.responses.toReview")}
          value={unreviewed}
        />
        <StatTile
          icon={Clock}
          label={t("forms.responses.last")}
          value={summary?.lastAt ? formatDate(summary.lastAt, { dateStyle: "medium" }) : "—"}
          sub={summary?.lastAt ? formatDate(summary.lastAt, { timeStyle: "short" }) : undefined}
        />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<ResponsesView>
          size="sm"
          aria-label={t("forms.responses.viewLabel")}
          value={view}
          onChange={setView}
          options={[
            { value: "summary", label: t("forms.responses.summary"), icon: BarChart3 },
            { value: "table", label: t("forms.responses.table"), icon: List, count: responses.length },
          ]}
        />
        <ResponsesExportMenu
          definition={definition}
          title={form.title}
          organizationId={form.organizationId}
          responses={responses}
          onError={setError}
        />
      </div>

      {failed && <Callout tone="warning">{t("forms.responses.loadFailed")}</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}

      {responses.length === 0 ? (
        <EmptyState icon={Inbox} title={t("forms.responses.emptyTitle")} description={t("forms.responses.emptyBody")} />
      ) : view === "summary" && summary ? (
        <ResponsesSummary summary={summary} />
      ) : (
        <ResponsesTable definition={definition} responses={responses} onOpen={setOpenId} />
      )}

      <ResponseDetailDialog
        definition={definition}
        response={open}
        review={open ? (reviews.get(open.id) ?? null) : null}
        canReview={canReview}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
