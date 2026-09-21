"use client";

// Bug tracker — reports about Merchiva itself.
//
// Filing is open to everyone on the team (here, on the store tablet and on the
// employee phone), so this page is the shared list: an owner or manager triages
// from it, everyone else reads it and sees what happened to their own report.

import { useCallback, useMemo, useState } from "react";
import { Bug, CheckCircle2, CircleDot, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Num } from "@/components/ui/num";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { BugDetailDialog } from "@/components/bugs/detail-dialog";
import { ReportBugDialog } from "@/components/bugs/report-dialog";
import { PageHeader } from "@/components/page-header";
import { PermissionGuard } from "@/components/permission-guard";
import { BUG_SEVERITY_TONE, BUG_STATUS_TONE, isBugOpen, type BugStatus } from "@/lib/bugs";
import { useI18n, useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useBugs } from "@/lib/spacetimedb/hooks/useBugs";

type FilterKey = "all" | BugStatus;

const FILTERS: FilterKey[] = ["all", "open", "in_progress", "fixed", "wont_fix"];

function BugsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { bugs, counts, openCount, canTriage, isReady } = useBugs();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bugs.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (!q) return true;
      return `${b.title} ${b.body} ${b.reporterName} ${b.route}`.toLowerCase().includes(q);
    });
  }, [bugs, filter, query]);

  const selected = useMemo(() => bugs.find((b) => b.id === openId) ?? null, [bugs, openId]);

  const when = useCallback(
    (d: Date) => d.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    [locale],
  );

  return (
    <div className="pb-24">
      <PageHeader
        title={t("bugs.title")}
        subtitle={openCount > 0 ? fmt(t("bugs.openCount"), { n: openCount }) : t("bugs.allClear")}
        actions={[{ icon: <Plus className="h-[18px] w-[18px]" />, onClick: () => setReportOpen(true) }]}
        right={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setReportOpen(true)}>
            <Bug className="h-3.5 w-3.5" />
            {t("bugs.report")}
          </Button>
        }
      />

      <div className="space-y-6 p-4 lg:p-6">
        <StatGrid>
          <StatTile
            icon={CircleDot}
            tone={counts.open > 0 ? "warning" : undefined}
            label={t("bugs.status.open")}
            value={counts.open}
          />
          <StatTile icon={Bug} label={t("bugs.status.in_progress")} value={counts.in_progress} />
          <StatTile icon={CheckCircle2} label={t("bugs.status.fixed")} value={counts.fixed} />
          <StatTile icon={X} label={t("bugs.status.wont_fix")} value={counts.wont_fix} />
        </StatGrid>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("bugs.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SegmentedControl<FilterKey>
              variant="chips"
              size="sm"
              className="flex-nowrap"
              aria-label={t("bugs.title")}
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((key) => {
                const count = key === "all" ? counts.all : counts[key];
                return {
                  value: key,
                  label: key === "all" ? t("bugs.filterAll") : t(`bugs.status.${key}`),
                  count: count > 0 ? count : undefined,
                };
              })}
            />
          </div>
        </div>

        {!isReady && bugs.length === 0 ? (
          <div className="flex justify-center py-24">
            <Spinner size={20} className="text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            className="py-20"
            icon={Bug}
            title={bugs.length === 0 ? t("bugs.empty") : t("bugs.emptyFiltered")}
            description={bugs.length === 0 ? t("bugs.emptyDesc") : t("bugs.emptyFilteredDesc")}
          />
        ) : (
          <div className="divide-y divide-border rounded border border-border">
            {visible.map((bug) => (
              <button
                key={bug.id}
                type="button"
                onClick={() => setOpenId(bug.id)}
                className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
                  {isBugOpen(bug.status) ? <CircleDot className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{bug.title}</span>
                    <StatusBadge tone={BUG_SEVERITY_TONE[bug.severity]} size="xs">
                      {t(`bugs.severity.${bug.severity}`)}
                    </StatusBadge>
                  </span>
                  {bug.body && (
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{bug.body}</span>
                  )}
                  <Num
                    size="xs"
                    muted
                    className="mt-1 block text-[10.5px]"
                    value={[
                      bug.reporterName || t("bugs.unknownReporter"),
                      t(`bugs.surface.${bug.surface}`),
                      when(bug.createdAt),
                    ].join(" · ")}
                  />
                </span>
                <StatusBadge tone={BUG_STATUS_TONE[bug.status]} className="mt-0.5 shrink-0">
                  {t(`bugs.status.${bug.status}`)}
                </StatusBadge>
              </button>
            ))}
          </div>
        )}
      </div>

      <BugDetailDialog bug={selected} canTriage={canTriage} onClose={() => setOpenId(null)} formatWhen={when} />
      <ReportBugDialog open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

// ── Exported with PermissionGuard ────────────────────────────────────────────

export default function BugsPageWithGuard() {
  return (
    <PermissionGuard section="dashboard">
      <BugsPage />
    </PermissionGuard>
  );
}
