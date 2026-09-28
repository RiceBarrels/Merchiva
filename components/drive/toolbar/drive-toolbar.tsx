"use client";

// The row above the Drive results: where the view is (breadcrumbs) on the left; search, type,
// sort and grid/list on the right — or, while entries are selected on desktop, the selection
// bar in their place. Below lg the search moves to a row of its own, after the section picker
// the page passes in (`mobileLeading`). Trash has no sort choice: it always lists the most
// recently trashed first.

import { useMemo } from "react";
import { LayoutGrid, List } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocsSearchInput } from "@/components/docs/home/docs-search-input";
import type { DriveDropHandlers } from "@/components/drive/list/use-entry-dnd";
import { DRIVE_SORTS, DRIVE_TYPE_FILTERS, type DriveCrumb, type DriveSection, type DriveSort, type DriveTypeFilter, type DriveView } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { DriveBreadcrumbs } from "./breadcrumbs";

export interface DriveToolbarProps {
  crumbs: readonly DriveCrumb[];
  section: DriveSection;
  query: string;
  onQuery(query: string): void;
  type: DriveTypeFilter;
  onType(type: DriveTypeFilter): void;
  sort: DriveSort;
  onSort(sort: DriveSort): void;
  view: DriveView;
  onView(view: DriveView): void;
  /** Search, type, sort and layout; off where they mean nothing (the members and apps overviews). */
  filters?: boolean;
  /** Id of the results region (the search field's aria-controls). */
  resultsId?: string;
  /** Desktop: the selection bar, shown instead of the filters while something is selected. */
  selection?: React.ReactNode;
  /** Below lg: shown before the search field (the section picker). */
  mobileLeading?: React.ReactNode;
  /** A crumb's link; default driveHref(crumb.params). */
  crumbHref?(crumb: DriveCrumb): string;
  /** Moves dropped on a crumb. */
  drop?: DriveDropHandlers | null;
  className?: string;
}

export function DriveToolbar({
  crumbs,
  section,
  query,
  onQuery,
  type,
  onType,
  sort,
  onSort,
  view,
  onView,
  filters = true,
  resultsId,
  selection = null,
  mobileLeading = null,
  crumbHref,
  drop = null,
  className,
}: DriveToolbarProps) {
  const t = useT();
  const typeItems = useMemo(() => DRIVE_TYPE_FILTERS.map((value) => ({ value, label: t(`drive.list.type.${value}`) })), [t]);
  const sortItems = useMemo(() => DRIVE_SORTS.map((value) => ({ value, label: t(`drive.list.sort.${value}`) })), [t]);
  const placeholder = t("drive.home.searchPlaceholder");
  const mobileRow = mobileLeading !== null || filters;

  return (
    <div className={cn("space-y-2", className)}>
      {mobileRow && (
        <div className="flex items-center gap-2 lg:hidden">
          {mobileLeading}
          {filters && (
            <DocsSearchInput
              value={query}
              onChange={onQuery}
              placeholder={placeholder}
              controls={resultsId}
              className="min-w-0 flex-1"
              inputClassName="h-8"
            />
          )}
        </div>
      )}
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
        <DriveBreadcrumbs crumbs={crumbs} hrefFor={crumbHref} drop={drop} className="min-w-0 flex-1" />
        {selection ??
          (filters && (
            <div className="flex flex-wrap items-center gap-2">
              <DocsSearchInput value={query} onChange={onQuery} placeholder={placeholder} controls={resultsId} className="hidden w-64 lg:block" />
              <Select
                items={typeItems}
                value={type}
                onValueChange={(value) => {
                  if (value) onType(value as DriveTypeFilter);
                }}
              >
                <SelectTrigger size="sm" aria-label={t("drive.list.type.label")} className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="text-[13px]">
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {section !== "trash" && (
                <Select
                  items={sortItems}
                  value={sort}
                  onValueChange={(value) => {
                    if (value) onSort(value as DriveSort);
                  }}
                >
                  <SelectTrigger size="sm" aria-label={t("drive.list.sort.label")} className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-[13px]">
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <SegmentedControl<DriveView>
                size="sm"
                aria-label={t("drive.list.view.label")}
                value={view}
                onChange={onView}
                options={[
                  { value: "grid", icon: LayoutGrid, label: <span className="sr-only">{t("drive.list.view.grid")}</span> },
                  { value: "list", icon: List, label: <span className="sr-only">{t("drive.list.view.list")}</span> },
                ]}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
