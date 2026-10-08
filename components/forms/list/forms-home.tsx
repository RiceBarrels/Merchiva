"use client";

// /manager/forms: the Forms list.
//
// Owners and managers (canManageForms) see every form of the store by status — Active, Drafts, Closed,
// Archived — with counters, and create forms from templates. Everyone else sees what is waiting for them
// (To fill) and what they sent (My submissions); no builder control renders for them. Owners and managers can be
// assigned forms too, so they switch between Manage and My forms (the same To fill / My submissions list).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, FileClock, Inbox, PenLine, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/page-header";
import { FormRow } from "@/components/forms/list/form-row";
import { NewFormDialog } from "@/components/forms/list/new-form-dialog";
import { RespondentList } from "@/components/forms/list/respondent-list";
import {
  BUILDER_FILTERS, FILTER_STATUS, FORM_STATUS_TONE, formEditHref, type BuilderFilter,
} from "@/components/forms/list/status";
import { FormsToolbar } from "@/components/forms/list/toolbar";
import { useTabActions } from "@/lib/browser-shell/hooks";
import { answerableQuestions } from "@/lib/forms/schema";
import { fmt } from "@/lib/i18n/fmt";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import { formsPageContext } from "@/lib/merchiva/workspace-page-context";
import { useForms, type FormListItem } from "@/lib/spacetimedb/hooks/useForms";

export function FormsHome() {
  const t = useT();
  const { forms, canManage, isReady, notPublished } = useForms();
  const { openUrl } = useTabActions();
  const [newOpen, setNewOpen] = useState(false);
  const [homeView, setHomeView] = useState<"manage" | "mine">("manage");
  const [shown, setShown] = useState<{ view: string; count: number }>({ view: "", count: 0 });

  const open = useCallback((href: string) => openUrl(href, "current"), [openUrl]);
  const onShown = useCallback((view: string, count: number) => {
    setShown((prev) => (prev.view === view && prev.count === count ? prev : { view, count }));
  }, []);

  useMerchivaPageContext(formsPageContext({ view: shown.view, shown: shown.count, form: null, tab: "" }));

  return (
    <div className="pb-24">
      <PageHeader
        title={t("forms.title")}
        subtitle={t(canManage ? "forms.list.subtitleBuilder" : "forms.list.subtitleMember")}
        actions={canManage && !notPublished ? [{ icon: <Plus className="h-[18px] w-[18px]" />, onClick: () => setNewOpen(true) }] : undefined}
        right={
          canManage && !notPublished ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("forms.list.new")}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6 p-4 lg:p-6">
        {notPublished ? (
          <EmptyState
            className="py-20"
            icon={ClipboardList}
            title={t("forms.list.notPublished")}
            description={t("forms.list.notPublishedDesc")}
          />
        ) : canManage ? (
          <>
            <SegmentedControl<"manage" | "mine">
              aria-label={t("forms.title")}
              value={homeView}
              onChange={setHomeView}
              options={[
                { value: "manage", label: t("forms.list.view.manage"), icon: Settings2 },
                { value: "mine", label: t("forms.list.view.mine"), icon: PenLine },
              ]}
            />
            {homeView === "manage" ? (
              <BuilderList forms={forms} isReady={isReady} onOpen={open} onNew={() => setNewOpen(true)} onShown={onShown} />
            ) : (
              <RespondentList forms={forms} formsReady={isReady} onOpen={open} onShown={onShown} />
            )}
          </>
        ) : (
          <RespondentList forms={forms} formsReady={isReady} onOpen={open} onShown={onShown} />
        )}
      </div>

      {canManage && (
        <NewFormDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => open(formEditHref(id, "build"))} />
      )}
    </div>
  );
}

function BuilderList({
  forms,
  isReady,
  onOpen,
  onNew,
  onShown,
}: {
  forms: readonly FormListItem[];
  isReady: boolean;
  onOpen: (href: string) => void;
  onNew: () => void;
  onShown: (view: string, count: number) => void;
}) {
  const t = useT();
  const formatDate = useDateFormat();
  const [filter, setFilter] = useState<BuilderFilter>("active");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const out: Record<BuilderFilter, number> = { active: 0, drafts: 0, closed: 0, archived: 0 };
    for (const key of BUILDER_FILTERS) out[key] = forms.filter((i) => i.form.status === FILTER_STATUS[key]).length;
    return out;
  }, [forms]);
  const responses = useMemo(() => forms.reduce((sum, i) => sum + (i.meta?.responseCount ?? 0), 0), [forms]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => forms.filter((i) => i.form.status === FILTER_STATUS[filter] && (!q || i.form.title.toLowerCase().includes(q))),
    [forms, filter, q],
  );
  const shownCount = visible.length;
  useEffect(() => { onShown(filter, shownCount); }, [onShown, filter, shownCount]);

  return (
    <div className="space-y-6">
      <StatGrid>
        <StatTile icon={ClipboardList} label={t("forms.list.stats.open")} value={counts.active} />
        <StatTile icon={FileClock} label={t("forms.list.stats.drafts")} value={counts.drafts} />
        <StatTile icon={Inbox} label={t("forms.list.stats.responses")} value={responses} />
      </StatGrid>

      <FormsToolbar<BuilderFilter>
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        options={BUILDER_FILTERS.map((key) => ({
          value: key,
          label: t(`forms.list.filter.${key}`),
          count: counts[key] > 0 ? counts[key] : undefined,
        }))}
      />

      {!isReady && forms.length === 0 ? (
        <div className="flex justify-center py-24">
          <Spinner size={20} className="text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          className="py-20"
          icon={ClipboardList}
          title={t(q ? "forms.list.empty.search" : `forms.list.empty.${filter}`)}
          description={q ? undefined : t(`forms.list.empty.${filter}Desc`)}
          action={!q && (filter === "active" || filter === "drafts") ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onNew}>
              <Plus className="h-3.5 w-3.5" />
              {t("forms.list.new")}
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="divide-y divide-border rounded border border-border">
          {visible.map(({ form, meta }) => {
            const questions = form.definition ? answerableQuestions(form.definition).length : 0;
            return (
              <FormRow
                key={form.id}
                kind={form.kind}
                title={form.title}
                description={form.definition?.description}
                meta={[
                  t(`forms.kind.${form.kind}`),
                  fmt(t("forms.list.questions"), { n: questions }),
                  meta ? fmt(t("forms.list.responses"), { n: meta.responseCount }) : "",
                  fmt(t("forms.list.updated"), { date: formatDate(form.updatedAt, { month: "short", day: "numeric" }) }),
                ].filter(Boolean).join(" · ")}
                badge={t(`forms.status.${form.status}`)}
                badgeTone={FORM_STATUS_TONE[form.status]}
                onOpen={() => onOpen(formEditHref(form.id, form.status === "draft" ? "build" : "responses"))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
