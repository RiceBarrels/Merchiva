"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileText, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { documentHref } from "@/lib/docs/hrefs";
import { useI18n, useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { DocItemContextMenu, DocItemMenu } from "./doc-item-menu";
import {
  docItemTime,
  docItemTimeKind,
  type DocItemAction,
  type DocListItem,
  type DocScope,
  type DocSort,
} from "./doc-list-model";
import { formatDocDateTime, formatDocStamp } from "./format";

const FRAME_CLASS = "-mx-4 overflow-hidden border-y border-border sm:mx-0 sm:rounded-lg sm:border";

function SortButton({
  active,
  direction,
  onClick,
  children,
}: {
  active: boolean;
  direction: "asc" | "desc";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold tracking-wide uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none",
        active && "text-foreground",
      )}
    >
      {children}
      {active && <Arrow aria-hidden className="h-3 w-3" />}
    </button>
  );
}

function DocListHeader({ scope, sort, onSort }: { scope: DocScope; sort: DocSort; onSort?: (sort: DocSort) => void }) {
  const t = useT();
  const timeKind = docItemTimeKind(sort, scope);
  const titleActive = sort === "title";
  const dateActive = !titleActive;
  const dateSort: DocSort = timeKind === "opened" ? "opened" : timeKind === "created" ? "created" : "modified";
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="text-start" aria-sort={titleActive ? "ascending" : undefined}>
          <SortButton active={titleActive} direction="asc" onClick={onSort && (() => onSort("title"))}>
            {t("docs.home.col.name")}
          </SortButton>
        </TableHead>
        <TableHead className="hidden text-start md:table-cell">{t("docs.home.col.owner")}</TableHead>
        <TableHead className="text-start" aria-sort={dateActive ? "descending" : undefined}>
          {scope === "trash" ? (
            <SortButton active={dateActive} direction="desc" onClick={onSort && (() => onSort("modified"))}>
              {t("docs.home.col.trashed")}
            </SortButton>
          ) : (
            <SortButton active={dateActive} direction="desc" onClick={onSort && (() => onSort(dateSort))}>
              {t(`docs.home.col.${timeKind}`)}
            </SortButton>
          )}
        </TableHead>
        <TableHead className="w-0">
          <span className="sr-only">{t("docs.home.col.actions")}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

/**
 * Hidden copy of the row's title link, stretched over one cell so the whole row opens the
 * document (and Mod/middle-click still reaches the browser shell as a link click). Overlays
 * are per cell because shipping WebKit (Safari, iOS WKWebView, Tauri on macOS) doesn't treat
 * `<tr>` as a containing block: an overlay meant for the row would cover the whole table.
 */
function RowCellLink({ href, title }: { href: string; title?: string }) {
  return <Link href={href} prefetch={false} aria-hidden tabIndex={-1} title={title} className="absolute inset-0" />;
}

function DocListRow({
  item,
  scope,
  sort,
  now,
  compact,
  onAction,
}: {
  item: DocListItem;
  scope: DocScope;
  sort: DocSort;
  now: number;
  compact: boolean;
  onAction(item: DocListItem, action: DocItemAction): void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const { doc } = item;
  const title = doc.title.trim() || t("docs.untitled");
  const ownerLabel = item.isMine ? t("docs.home.me") : (item.ownerName ?? t("docs.home.formerMember"));
  const date = new Date(docItemTime(item, sort, scope));
  const href = documentHref(doc.id);
  const handleAction = (action: DocItemAction) => onAction(item, action);

  // Every cell is its own containing block (see RowCellLink); the row itself must not be.
  return (
    <DocItemContextMenu
      item={item}
      onAction={handleAction}
      className="has-[a:focus-visible]:bg-muted/60"
      render={(props) => <TableRow {...props} />}
    >
      <TableCell className="relative w-full max-w-0 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link
            id={titleId}
            href={href}
            prefetch={false}
            dir="auto"
            className="min-w-0 truncate text-[13px] font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {title}
          </Link>
          {item.isShared && !compact ? (
            <StatusBadge tone="neutral" size="xs" className="hidden sm:inline-flex">
              {t("docs.home.shared")}
            </StatusBadge>
          ) : (
            <span className="sr-only">{item.isShared ? t("docs.home.shared") : t("docs.home.restricted")}</span>
          )}
        </div>
      </TableCell>
      {!compact && (
        <TableCell className="relative hidden py-1.5 md:table-cell">
          <RowCellLink href={href} />
          <span className="flex max-w-48 min-w-0 items-center gap-2">
            <Avatar size="xs" name={item.ownerName ?? ownerLabel} />
            <span className="truncate text-[12.5px] text-foreground">{ownerLabel}</span>
          </span>
        </TableCell>
      )}
      <TableCell className="relative py-1.5 font-mono text-[12px] text-muted-foreground tabular-nums">
        {/* The overlay sits on top of <time>, so it carries the full date tooltip. */}
        <RowCellLink href={href} title={formatDocDateTime(date, locale)} />
        <time dateTime={date.toISOString()} title={formatDocDateTime(date, locale)}>
          {formatDocStamp(date, locale, now)}
        </time>
      </TableCell>
      <TableCell className="relative w-0 py-1 ps-0 pe-1.5">
        <RowCellLink href={href} />
        <div className="relative z-10 flex items-center justify-end gap-0.5">
          {scope !== "trash" && !compact && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={item.starred}
              aria-label={item.starred ? t("docs.menu.unstar") : t("docs.menu.star")}
              aria-describedby={titleId}
              onClick={() => handleAction(item.starred ? "unstar" : "star")}
              className={cn("text-muted-foreground hover:text-foreground", item.starred && "text-foreground")}
            >
              <Star aria-hidden className={cn("h-4 w-4", item.starred && "fill-current")} />
            </Button>
          )}
          <DocItemMenu item={item} onAction={handleAction} describedBy={titleId} />
        </div>
      </TableCell>
    </DocItemContextMenu>
  );
}

export interface DocListProps {
  items: readonly DocListItem[];
  scope: DocScope;
  sort: DocSort;
  now: number;
  onSort(sort: DocSort): void;
  onAction(item: DocListItem, action: DocItemAction): void;
  /** Phone / device panel: name + date only, no column header, no sorting by it. */
  compact?: boolean;
}

/** Table view: Name / Owner / date column (by sort) / star + menu. Clicking a header changes the sort. */
export function DocList({ items, scope, sort, now, onSort, onAction, compact = false }: DocListProps) {
  return (
    <div className={FRAME_CLASS}>
      <Table>
        {!compact && <DocListHeader scope={scope} sort={sort} onSort={onSort} />}
        <TableBody>
          {items.map((item) => (
            <DocListRow key={item.doc.id} item={item} scope={scope} sort={sort} now={now} compact={compact} onAction={onAction} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const SKELETON_WIDTHS = ["62%", "48%", "70%", "55%", "40%", "66%", "52%", "58%"];

export function DocListSkeleton({
  scope,
  sort,
  rows = 8,
  compact = false,
}: {
  scope: DocScope;
  sort: DocSort;
  rows?: number;
  compact?: boolean;
}) {
  return (
    <div aria-hidden className={FRAME_CLASS}>
      <Table>
        {!compact && <DocListHeader scope={scope} sort={sort} />}
        <TableBody>
          {Array.from({ length: rows }, (_, index) => (
            <TableRow key={index} className="hover:bg-transparent">
              <TableCell className="w-full max-w-0 py-2.5">
                <div className="flex items-center gap-2.5">
                  <SkeletonText width="1rem" className="shrink-0" />
                  <SkeletonText width={SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]} />
                </div>
              </TableCell>
              {!compact && (
                <TableCell className="hidden py-2.5 md:table-cell">
                  <SkeletonText width="6rem" />
                </TableCell>
              )}
              <TableCell className="py-2.5">
                <SkeletonText width="4rem" />
              </TableCell>
              <TableCell className="w-0 py-2.5 pe-3">
                <SkeletonText width="3rem" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
