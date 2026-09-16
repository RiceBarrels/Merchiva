"use client";

// "Open a document" picker (editor File ▸ Open, Mod-O). Searchable list of the
// documents the caller can view, most recent first.
//
// Rows are real links: a plain click navigates the current tab and closes the
// picker; Mod/middle-click is turned into a background tab by the browser shell
// (which marks the click as handled, so the picker stays open for more picks).
// Loaded lazily by the editor; must not import Tiptap or Yjs.

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { CloudOff, FileText, Loader2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  buildDocListItems,
  filterDocItems,
  sortDocItemsByRecent,
} from "@/components/docs/home/doc-list-model";
import { DocsSearchInput } from "@/components/docs/home/docs-search-input";
import { formatDocDateTime, formatDocStamp, useMinuteClock } from "@/components/docs/home/format";
import { dispositionFromKeyboard, useTabActions } from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import { idString } from "@/lib/docs/mappers";
import { useLastOpenedMap } from "@/lib/docs/recent";
import { useI18n } from "@/lib/i18n/context";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useCurrentMemberId, useDocuments } from "@/lib/spacetimedb/hooks/useDocs";

export interface OpenDocumentDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

const ROW_SELECTOR = "a[data-open-doc-row]";
const NO_STARS: ReadonlySet<string> = new Set();
const NO_GRANTS: ReadonlySet<string> = new Set();

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export function OpenDocumentDialog({ open, onOpenChange }: OpenDocumentDialogProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const searchId = useId();
  const listId = useId();
  const { docs, accessFor, isReady, backendStatus } = useDocuments();
  const memberId = useCurrentMemberId();
  const [memberRows] = useOrgMembers();
  const { organizationId } = usePermissions();
  const openedMap = useLastOpenedMap();
  const now = useMinuteClock();
  const { openUrl } = useTabActions();

  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  const memberNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of memberRows) {
      if (row.organizationId === organizationId) names.set(idString(row.id), row.displayName.trim() || row.email);
    }
    return names;
  }, [memberRows, organizationId]);

  const untitledLabel = t("docs.untitled");
  const results = useMemo(() => {
    const items = buildDocListItems({
      docs,
      accessFor,
      starredIds: NO_STARS,
      grantedDocIds: NO_GRANTS,
      memberNames,
      memberId,
      openedMap,
    });
    return sortDocItemsByRecent(filterDocItems(items, { scope: "recent", owner: "anyone", query, locale, untitledLabel }));
  }, [docs, accessFor, memberNames, memberId, openedMap, query, locale, untitledLabel]);

  const notPublished = backendStatus === "not_published";
  const loading = !notPublished && (!isReady || backendStatus === "checking");

  const rowLinks = (): HTMLAnchorElement[] =>
    Array.from(document.getElementById(listId)?.querySelectorAll<HTMLAnchorElement>(ROW_SELECTOR) ?? []);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      const first = rowLinks()[0];
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      const first = results[0];
      if (!first) return;
      event.preventDefault();
      const disposition = dispositionFromKeyboard(event, isMacPlatform());
      openUrl(documentHref(first.doc.id), disposition);
      if (disposition !== "new-background") onOpenChange(false);
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const links = rowLinks();
    const index = links.findIndex((link) => link === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === "Home") links[0]?.focus();
    else if (event.key === "End") links[links.length - 1]?.focus();
    else if (event.key === "ArrowDown") links[Math.min(index + 1, links.length - 1)]?.focus();
    else if (index === 0) document.getElementById(searchId)?.focus();
    else links[index - 1]?.focus();
  };

  let body: React.ReactNode;
  if (notPublished) {
    body = (
      <EmptyState
        compact
        icon={CloudOff}
        title={t("docs.home.notPublishedTitle")}
        description={t("docs.home.notPublishedDescription")}
      />
    );
  } else if (loading) {
    body = (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        {t("docs.home.loading")}
      </div>
    );
  } else if (results.length === 0) {
    body =
      query.trim() !== "" ? (
        <EmptyState
          compact
          icon={SearchX}
          title={t("docs.home.emptySearchTitle")}
          description={t("docs.home.emptySearchDescription")}
        />
      ) : (
        <EmptyState compact icon={FileText} title={t("docs.home.emptyTitle")} description={t("docs.home.emptyDescription")} />
      );
  } else {
    body = (
      <ul
        id={listId}
        aria-label={t("docs.open.listLabel")}
        onKeyDown={onListKeyDown}
        className="-mx-1 max-h-[min(60vh,420px)] overflow-y-auto"
      >
        {results.map((item) => {
          const title = item.doc.title.trim() || untitledLabel;
          const ownerLabel = item.isMine ? t("docs.home.me") : (item.ownerName ?? t("docs.home.formerMember"));
          const date = new Date(item.doc.updatedAt.getTime());
          return (
            <li key={item.doc.id}>
              <Link
                href={documentHref(item.doc.id)}
                prefetch={false}
                data-open-doc-row=""
                onClick={(event) => {
                  if (!event.defaultPrevented) onOpenChange(false);
                }}
                className="flex min-w-0 items-center gap-3 rounded px-2 py-2 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <FileText aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-[13px] font-medium text-foreground">
                    {title}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {ownerLabel}
                    {" · "}
                    <time dateTime={date.toISOString()} title={formatDocDateTime(date, locale)}>
                      {formatDocStamp(date, locale, now)}
                    </time>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("docs.open.title")}</SheetTitle>
        </SheetHeader>
        <div className="grid min-w-0 gap-3">
          {!notPublished && (
            <DocsSearchInput
              id={searchId}
              value={query}
              onChange={setQuery}
              placeholder={t("docs.open.searchPlaceholder")}
              controls={listId}
              onKeyDown={onSearchKeyDown}
              autoFocus
            />
          )}
          {body}
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={DOCS_HOME_HREF} prefetch={false} />}
              onClick={(event: React.MouseEvent) => {
                if (!event.defaultPrevented) onOpenChange(false);
              }}
            >
              {t("docs.open.allDocuments")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="ms-auto" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
