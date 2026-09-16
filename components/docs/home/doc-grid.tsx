"use client";

import { useId } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { useT } from "@/lib/i18n/context";
import { DocCard } from "./doc-card";
import type { DocItemAction, DocItemGroup, DocListItem, DocScope, DocSort } from "./doc-list-model";

const DOC_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]";

interface GridCommonProps {
  scope: DocScope;
  sort: DocSort;
  now: number;
  onAction(item: DocListItem, action: DocItemAction): void;
}

export interface DocGridProps extends GridCommonProps {
  items: readonly DocListItem[];
  /** Date groups (Today, Previous 7 days, …) or null for a flat grid. */
  groups: readonly DocItemGroup[] | null;
}

function DocCardList({ items, ...common }: GridCommonProps & { items: readonly DocListItem[] }) {
  return (
    <ul className={DOC_GRID_CLASS}>
      {items.map((item) => (
        <li key={item.doc.id} className="min-w-0">
          <DocCard item={item} {...common} />
        </li>
      ))}
    </ul>
  );
}

function DocGridGroup({ group, ...common }: GridCommonProps & { group: DocItemGroup }) {
  const t = useT();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Eyebrow as="h3" id={headingId} className="mb-2">
        {t(`docs.home.group.${group.id}`)}
      </Eyebrow>
      <DocCardList items={group.items} {...common} />
    </section>
  );
}

export function DocGrid({ items, groups, ...common }: DocGridProps) {
  if (groups) {
    return (
      <div className="space-y-5">
        {groups.map((group) => (
          <DocGridGroup key={group.id} group={group} {...common} />
        ))}
      </div>
    );
  }
  return <DocCardList items={items} {...common} />;
}

export function DocGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden className={DOC_GRID_CLASS}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="aspect-[8.5/11] max-h-44 w-full border-b border-border bg-muted/50 p-3">
            <div className="h-full border border-border bg-background/60" />
          </div>
          <div className="flex items-center gap-2 p-2.5">
            <SkeletonText width="1rem" className="shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonText width="75%" className="h-3.5" />
              <SkeletonText width="45%" className="h-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
