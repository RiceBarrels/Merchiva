"use client";

// Where the view is: the listing's crumbs (components/drive/model/listing.ts), e.g.
// "My files › Receipts › 2026". The last crumb is the view's heading; the earlier ones are
// links and accept dragged entries (dropping moves them into that folder or root). A path of
// more than four crumbs keeps the first and the last two and folds the rest into a "…" menu.

import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight, Folder, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import type { DriveCrumb } from "@/components/drive/model/types";
import { useDriveDropTarget, type DriveDropHandlers } from "@/components/drive/list/use-entry-dnd";
import { driveHref } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

/** Crumbs shown in full; a longer path folds its middle. */
export const MAX_VISIBLE_CRUMBS = 4;

/** The crumbs to show and the ones folded into the "…" menu (between the first and the last two). */
export function foldCrumbs<T>(crumbs: readonly T[], max: number = MAX_VISIBLE_CRUMBS): { head: T[]; folded: T[]; tail: T[] } {
  if (crumbs.length <= max) return { head: [...crumbs], folded: [], tail: [] };
  return { head: crumbs.slice(0, 1), folded: crumbs.slice(1, -2), tail: crumbs.slice(-2) };
}

/** The crumb's text: a folder's own name, else its i18n label. */
export function crumbLabel(crumb: DriveCrumb, t: (key: string) => string): string {
  if (crumb.label !== null) return crumb.label.trim() || t("drive.list.untitled.folder");
  return crumb.labelKey ? fmt(t(crumb.labelKey), crumb.labelVars ?? {}) : "";
}

function defaultHref(crumb: DriveCrumb): string {
  return driveHref(crumb.params);
}

function CrumbLink({ crumb, href, drop }: { crumb: DriveCrumb; href: string; drop: DriveDropHandlers | null }) {
  const t = useT();
  const { isOver, handlers } = useDriveDropTarget(crumb.dropTarget, drop);
  return (
    <Link
      href={href}
      prefetch={false}
      dir="auto"
      data-over={isOver || undefined}
      {...handlers}
      className="max-w-48 min-w-0 truncate rounded px-1 py-0.5 text-[13px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-over:bg-muted data-over:text-foreground data-over:ring-2 data-over:ring-ring/60"
    >
      {crumbLabel(crumb, t)}
    </Link>
  );
}

function Separator() {
  return <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />;
}

export interface DriveBreadcrumbsProps {
  crumbs: readonly DriveCrumb[];
  /** A crumb's link; default driveHref(crumb.params). */
  hrefFor?(crumb: DriveCrumb): string;
  /** Moves dropped on a crumb; null = no drops. */
  drop?: DriveDropHandlers | null;
  className?: string;
}

export function DriveBreadcrumbs({ crumbs, hrefFor = defaultHref, drop = null, className }: DriveBreadcrumbsProps) {
  const t = useT();
  if (crumbs.length === 0) return null;
  const current = crumbs[crumbs.length - 1];
  const { head, folded, tail } = foldCrumbs(crumbs.slice(0, -1), MAX_VISIBLE_CRUMBS - 1);

  return (
    <nav aria-label={t("drive.nav.breadcrumbs")} className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-0.5">
        {head.map((crumb) => (
          <Fragment key={crumb.key}>
            <li className="flex min-w-0 shrink items-center">
              <CrumbLink crumb={crumb} href={hrefFor(crumb)} drop={drop} />
            </li>
            <li aria-hidden className="flex items-center">
              <Separator />
            </li>
          </Fragment>
        ))}
        {folded.length > 0 && (
          <>
            <li className="flex items-center">
              <DocMenu>
                <DocMenuTrigger
                  render={
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={t("drive.nav.morePath")} className="text-muted-foreground" />
                  }
                >
                  <MoreHorizontal aria-hidden className="h-4 w-4" />
                </DocMenuTrigger>
                <DocMenuContent align="start">
                  {folded.map((crumb) => (
                    <DocMenuItem key={crumb.key} icon={Folder} render={<Link href={hrefFor(crumb)} prefetch={false} />}>
                      <span dir="auto">{crumbLabel(crumb, t)}</span>
                    </DocMenuItem>
                  ))}
                </DocMenuContent>
              </DocMenu>
            </li>
            <li aria-hidden className="flex items-center">
              <Separator />
            </li>
          </>
        )}
        {tail.map((crumb) => (
          <Fragment key={crumb.key}>
            <li className="flex min-w-0 shrink items-center">
              <CrumbLink crumb={crumb} href={hrefFor(crumb)} drop={drop} />
            </li>
            <li aria-hidden className="flex items-center">
              <Separator />
            </li>
          </Fragment>
        ))}
        <li className="flex min-w-0 shrink-[0.5] items-center" aria-current="page">
          <h2 dir="auto" className="min-w-0 truncate px-1 text-[15px] font-semibold text-foreground">
            {crumbLabel(current, t)}
          </h2>
        </li>
      </ol>
    </nav>
  );
}
