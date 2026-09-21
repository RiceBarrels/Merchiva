"use client";

import { useMemo } from "react";
import { Clock, LayoutGrid, List, Star, Trash2 } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n/context";
import {
  DOC_SORTS,
  OWNER_FILTERS,
  type DocScope,
  type DocSort,
  type DocView,
  type OwnerFilter,
} from "./doc-list-model";
import { DocsSearchInput } from "./docs-search-input";

export interface DocsHomeToolbarProps {
  scope: DocScope;
  onScope(scope: DocScope): void;
  owner: OwnerFilter;
  onOwner(owner: OwnerFilter): void;
  sort: DocSort;
  onSort(sort: DocSort): void;
  view: DocView;
  onView(view: DocView): void;
  query: string;
  onQuery(query: string): void;
  counts: { starred: number; trash: number };
  /** Id of the results region (for the search field's aria-controls). */
  resultsId?: string;
  /** Phone / device panel: just the Recent / Starred / Trash switch — the search
   *  box sits above the list there, and owner / sort / layout stay on defaults. */
  compact?: boolean;
}

export function DocsHomeToolbar({
  scope,
  onScope,
  owner,
  onOwner,
  sort,
  onSort,
  view,
  onView,
  query,
  onQuery,
  counts,
  resultsId,
  compact = false,
}: DocsHomeToolbarProps) {
  const t = useT();
  const ownerItems = useMemo(
    () => OWNER_FILTERS.map((value) => ({ value, label: t(`docs.home.owner.${value}`) })),
    [t],
  );
  const sortItems = useMemo(() => DOC_SORTS.map((value) => ({ value, label: t(`docs.home.sort.${value}`) })), [t]);

  const scopes = (
    <SegmentedControl<DocScope>
      size="sm"
      aria-label={t("docs.home.scope.label")}
      value={scope}
      onChange={onScope}
      options={[
        { value: "recent", label: t("docs.home.scope.recent"), icon: Clock },
        {
          value: "starred",
          label: t("docs.home.scope.starred"),
          icon: Star,
          count: counts.starred > 0 ? counts.starred : undefined,
        },
        {
          value: "trash",
          label: t("docs.home.scope.trash"),
          icon: Trash2,
          count: counts.trash > 0 ? counts.trash : undefined,
        },
      ]}
    />
  );

  if (compact) return scopes;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {scopes}
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <DocsSearchInput value={query} onChange={onQuery} controls={resultsId} className="hidden w-64 lg:block" />
        <Select
          items={ownerItems}
          value={owner}
          onValueChange={(value) => {
            if (value) onOwner(value as OwnerFilter);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("docs.home.owner.label")} className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ownerItems.map((item) => (
              <SelectItem key={item.value} value={item.value} className="text-[13px]">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={sortItems}
          value={sort}
          onValueChange={(value) => {
            if (value) onSort(value as DocSort);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("docs.home.sort.label")} className="text-xs">
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
        <SegmentedControl<DocView>
          size="sm"
          aria-label={t("docs.home.view.label")}
          value={view}
          onChange={onView}
          options={[
            { value: "grid", icon: LayoutGrid, label: <span className="sr-only">{t("docs.home.view.grid")}</span> },
            { value: "list", icon: List, label: <span className="sr-only">{t("docs.home.view.list")}</span> },
          ]}
        />
      </div>
    </div>
  );
}
