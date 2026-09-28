"use client";

// Docs home (`/manager/docs`): template band, recent / starred / trash lists in
// grid or list layout, owner filter, search, per-document actions, import by
// button or drag-and-drop, and the loading / empty / not-published states.
//
// No Tiptap or Yjs is imported here: templates are plain JSON, creation and
// import load their converters lazily, and ShareDialog is code-split.
// Until the management notice is acknowledged it blocks the page and creation;
// on /store a new document belongs to the PIN operator (useDocCreatePlacement),
// and star / copy, which the Docs reducers write for the tablet account, are
// hidden and refused while the operator is someone else (useDocsSender).

import { useCallback, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Loader2, Plus, SearchX, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { DeleteForeverDialog } from "@/components/docs/dialogs/delete-forever-dialog";
import { ImportDialog } from "@/components/docs/dialogs/import-dialog";
import { RenameDialog } from "@/components/docs/dialogs/rename-dialog";
import { useDocCreatePlacement } from "@/components/drive/drive-actor";
import { ManagementNoticeBanner, ManagementNoticeGate } from "@/components/drive/notice/management-notice";
import { useManagementNoticeAck } from "@/components/drive/notice/use-notice-ack";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth/context";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { usePermissions } from "@/lib/context/permissions";
import { createDocumentFromTemplate, placedCreateErrorKey } from "@/lib/docs/create";
import { documentHref } from "@/lib/docs/hrefs";
import { DocImportError, importAsNewDocument, importErrorMessageKey, validateImportFile } from "@/lib/docs/import";
import { idString } from "@/lib/docs/mappers";
import { useLastOpenedMap } from "@/lib/docs/recent";
import type { DocTemplateId } from "@/lib/docs/templates";
import { useI18n, useT } from "@/lib/i18n/context";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";
import { useCurrentMemberId, useDocsSender, useDocuments } from "@/lib/spacetimedb/hooks/useDocs";
import { DocGrid, DocGridSkeleton } from "./doc-grid";
import { DocList, DocListSkeleton } from "./doc-list";
import {
  buildDocListItems,
  docsEmptyKind,
  filterDocItems,
  groupDocItems,
  sortDocItems,
  type DocItemAction,
  type DocListItem,
  type DocsEmptyKind,
  type DocView,
} from "./doc-list-model";
import { DocsHomeToolbar } from "./docs-home-toolbar";
import { DocsSearchInput } from "./docs-search-input";
import { useMinuteClock } from "./format";
import { ImportDropZone } from "./import-drop-zone";
import { TemplateRow } from "./template-row";
import { docErrorToastKey, useDocItemActions } from "./use-doc-item-actions";
import { useDocsHomeState } from "./use-docs-home-state";

const ShareDialog = dynamic(
  () => import("@/components/docs/dialogs/share-dialog").then((mod) => mod.ShareDialog),
  { ssr: false },
);

// Written for the signed-in account, which on /store is the tablet, not always the operator the list is for:
// toggleDocumentStar would star for the tablet (drive-ui §5.2) and duplicateDocument would make the copy the tablet's.
// The list hides them then (canStarAndCopy); this also refuses them.
const REFUSED_WHILE_ACTING: ReadonlySet<DocItemAction> = new Set<DocItemAction>(["star", "unstar", "copy"]);

function DocsEmpty({
  kind,
  canCreate,
  onCreate,
  onClearFilters,
}: {
  kind: DocsEmptyKind;
  canCreate: boolean;
  onCreate(): void;
  onClearFilters(): void;
}) {
  const t = useT();
  switch (kind) {
    case "noMatches":
      return (
        <EmptyState
          icon={SearchX}
          title={t("docs.home.emptySearchTitle")}
          description={t("docs.home.emptySearchDescription")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
              {t("docs.home.clearFilters")}
            </Button>
          }
        />
      );
    case "noStarred":
      return (
        <EmptyState icon={Star} title={t("docs.home.emptyStarredTitle")} description={t("docs.home.emptyStarredDescription")} />
      );
    case "trashEmpty":
      return (
        <EmptyState icon={Trash2} title={t("docs.home.emptyTrashTitle")} description={t("docs.home.emptyTrashDescription")} />
      );
    case "noDocuments":
      return (
        <EmptyState
          icon={FileText}
          title={t("docs.home.emptyTitle")}
          description={t("docs.home.emptyDescription")}
          action={
            canCreate ? (
              <Button type="button" size="sm" onClick={onCreate}>
                <Plus aria-hidden className="h-3.5 w-3.5" />
                {t("docs.home.newDocument")}
              </Button>
            ) : undefined
          }
        />
      );
  }
}

export interface DocsHomeProps {
  /** Force the simplified layout: one "New document" button, the scope switch
   *  and a plain list. A device panel passes it because it stays narrow even on
   *  a wide store tablet; a phone-width window gets it on its own. */
  compact?: boolean;
}

export function DocsHome({ compact = false }: DocsHomeProps = {}) {
  const { t, locale } = useI18n();
  // A device panel has no URL of its own; its filters stay in React (see the hook).
  const home = useDocsHomeState({ url: !compact });
  const { scope, owner, sort, query } = home;
  // A phone, or a panel on a device surface that is narrow whatever the window
  // says: one creation button, the scope switch, and a plain list.
  const isMobile = useIsMobile();
  const simple = compact || isMobile;
  const view: DocView = simple ? "list" : home.view;
  const { docs, trashed, starredIds, grants, accessFor, isReady, backendStatus } = useDocuments();
  const memberId = useCurrentMemberId();
  const [memberRows] = useOrgMembers();
  const { organizationId, currentOrg } = usePermissions();
  const { user } = useAuth();
  const openedMap = useLastOpenedMap();
  const now = useMinuteClock();
  const openUrl = useDocsOpenUrl();
  const actions = useDocItemActions();
  const resultsId = useId();
  const notice = useManagementNoticeAck();
  const placement = useDocCreatePlacement();
  const { actingForOther } = useDocsSender();

  const notPublished = backendStatus === "not_published";
  const loading = !notPublished && (!isReady || backendStatus === "checking");
  const canCreate = backendStatus === "ready" && isReady && notice.ready && !notice.needsAck;

  // ── Derived list ──────────────────────────────────────────────────────────
  const memberNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of memberRows) {
      if (row.organizationId !== organizationId) continue;
      names.set(idString(row.id), row.displayName.trim() || row.email);
    }
    return names;
  }, [memberRows, organizationId]);

  const grantedDocIds = useMemo(() => new Set(grants.map((grant) => grant.documentId)), [grants]);

  const allItems = useMemo(
    () =>
      buildDocListItems({
        docs: [...docs, ...trashed],
        accessFor,
        starredIds,
        grantedDocIds,
        memberNames,
        memberId,
        openedMap,
        actingForOther,
      }),
    [docs, trashed, accessFor, starredIds, grantedDocIds, memberNames, memberId, openedMap, actingForOther],
  );

  const itemsById = useMemo(() => new Map(allItems.map((item) => [item.doc.id, item])), [allItems]);

  const counts = useMemo(
    () => ({
      starred: allItems.filter((item) => item.starred && item.doc.trashedAt === null).length,
      trash: trashed.length,
    }),
    [allItems, trashed.length],
  );

  const untitledLabel = t("docs.untitled");
  const visibleItems = useMemo(
    () => sortDocItems(filterDocItems(allItems, { scope, owner, query, locale, untitledLabel }), sort, scope, locale),
    [allItems, scope, owner, query, locale, untitledLabel, sort],
  );
  const groups = useMemo(
    () => (view === "grid" ? groupDocItems(visibleItems, sort, scope, now) : null),
    [view, visibleItems, sort, scope, now],
  );

  // ── Create ────────────────────────────────────────────────────────────────
  const [pendingTemplate, setPendingTemplate] = useState<DocTemplateId | null>(null);
  const creatingRef = useRef(false);
  const authorName = useMemo(() => {
    const fromMember = memberId ? memberNames.get(memberId) : undefined;
    if (fromMember) return fromMember;
    if (!user) return null;
    return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || null;
  }, [memberId, memberNames, user]);

  const create = useCallback(
    async (templateId: DocTemplateId) => {
      if (creatingRef.current || !canCreate) return;
      creatingRef.current = true;
      setPendingTemplate(templateId);
      try {
        const documentId = await createDocumentFromTemplate(templateId, {
          t,
          locale,
          storeName: currentOrg?.name ?? null,
          authorName,
          placement,
        });
        openUrl(documentHref(documentId, { isNew: true }), "current");
      } catch (err) {
        // A placed create (/store) fails with Drive codes; "[drive.operator]" asks for the PIN again.
        toast.error(t(placedCreateErrorKey(err) ?? docErrorToastKey(err, "docs.home.createFailed")));
      } finally {
        creatingRef.current = false;
        setPendingTemplate(null);
      }
    },
    [canCreate, t, locale, currentOrg?.name, authorName, placement, openUrl],
  );

  // ── Import ────────────────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [dropImporting, setDropImporting] = useState(false);
  const dropImportingRef = useRef(false);

  const importDroppedFile = useCallback(
    async (file: File) => {
      if (dropImportingRef.current || !canCreate) return;
      const invalid = validateImportFile(file);
      if (invalid) {
        toast.error(t(importErrorMessageKey(new DocImportError(invalid))));
        return;
      }
      dropImportingRef.current = true;
      setDropImporting(true);
      try {
        const { documentId, result } = await importAsNewDocument(file, { t, locale, placement });
        if (result.warnings > 0) toast(t("docs.import.warnings"));
        if (result.skippedImages > 0) toast.warning(t("docs.import.imagesSkipped"));
        openUrl(documentHref(documentId, { isNew: true }), "current");
      } catch (err) {
        toast.error(t(importErrorMessageKey(err)));
      } finally {
        dropImportingRef.current = false;
        setDropImporting(false);
      }
    },
    [canCreate, t, locale, placement, openUrl],
  );

  // ── Item actions ──────────────────────────────────────────────────────────
  const runItemAction = actions.run;
  const onItemAction = useCallback(
    (item: DocListItem, action: DocItemAction) => {
      if (actingForOther && REFUSED_WHILE_ACTING.has(action)) {
        toast.error(t("drive.errors.forbidden"));
        return;
      }
      runItemAction(item, action);
    },
    [actingForOther, runItemAction, t],
  );

  // ── Dialog targets (resolved against live rows so sharing reflects changes) ─
  const shareItem = actions.share.item ? (itemsById.get(actions.share.item.doc.id) ?? actions.share.item) : null;

  const headerActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setImportOpen(true)}
        disabled={!canCreate}
        className="gap-1.5"
      >
        <Upload aria-hidden className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">{t("docs.home.import")}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => void create("blank")}
        disabled={!canCreate || (pendingTemplate !== null && pendingTemplate !== "blank")}
        aria-busy={pendingTemplate === "blank" || undefined}
        className="gap-1.5"
      >
        {pendingTemplate === "blank" ? (
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus aria-hidden className="h-3.5 w-3.5" />
        )}
        <span className="sr-only sm:not-sr-only">{t("docs.home.newDocument")}</span>
      </Button>
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      {/*
        The drop zone spans the whole page, header included, so a file released anywhere
        on it imports instead of opening in the tab. The dialogs stay outside it: React
        events bubble through portals, and a drop inside the import dialog must not
        reach this zone as well.
      */}
      <ImportDropZone
        disabled={!canCreate}
        busy={dropImporting}
        onFile={(file) => void importDroppedFile(file)}
        className="flex flex-1 flex-col"
      >
        <PageHeader title={t("docs.title")} right={headerActions} />
        <ManagementNoticeBanner compact={simple} className="mx-auto w-full max-w-[1100px] px-4 pt-3" />

        {!notPublished && (
          <div className={cn("border-b border-border px-4 py-2", !simple && "lg:hidden")}>
            <DocsSearchInput value={query} onChange={home.setQuery} controls={resultsId} inputClassName="h-9" />
          </div>
        )}

        {notPublished ? (
          <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
            <Callout tone="warning" title={t("docs.home.notPublishedTitle")}>
              {t("docs.home.notPublishedDescription")}
            </Callout>
          </div>
        ) : (
          <>
            <TemplateRow
              collapsed={home.templatesCollapsed}
              onToggle={home.toggleTemplates}
              pendingId={pendingTemplate}
              disabled={!canCreate}
              onPick={(id) => void create(id)}
              compact={simple}
            />
            <section aria-label={t("docs.home.documents")} className="mx-auto w-full max-w-[1100px] space-y-3 px-4 py-4">
              <DocsHomeToolbar
                scope={scope}
                onScope={home.setScope}
                owner={owner}
                onOwner={home.setOwner}
                sort={sort}
                onSort={home.setSort}
                view={view}
                onView={home.setView}
                query={query}
                onQuery={home.setQuery}
                counts={counts}
                resultsId={resultsId}
                compact={simple}
              />
              {scope === "trash" && <Callout tone="neutral">{t("docs.home.trashNotice")}</Callout>}
              <div id={resultsId} aria-busy={loading || undefined}>
                {loading ? (
                  <>
                    <span role="status" className="sr-only">
                      {t("docs.home.loading")}
                    </span>
                    {view === "grid" ? <DocGridSkeleton /> : <DocListSkeleton scope={scope} sort={sort} compact={simple} />}
                  </>
                ) : visibleItems.length === 0 ? (
                  <DocsEmpty
                    kind={docsEmptyKind(scope, owner, query)}
                    canCreate={canCreate}
                    onCreate={() => void create("blank")}
                    onClearFilters={home.clearFilters}
                  />
                ) : view === "grid" ? (
                  <DocGrid
                    items={visibleItems}
                    groups={groups}
                    scope={scope}
                    sort={sort}
                    now={now}
                    onAction={onItemAction}
                  />
                ) : (
                  <DocList
                    items={visibleItems}
                    scope={scope}
                    sort={sort}
                    now={now}
                    onSort={home.setSort}
                    onAction={onItemAction}
                    compact={simple}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </ImportDropZone>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(documentId) => openUrl(documentHref(documentId, { isNew: true }), "current")}
      />
      <RenameDialog
        open={actions.rename.open}
        onOpenChange={actions.setRenameOpen}
        initialTitle={actions.rename.item?.doc.title ?? ""}
        onSubmit={actions.submitRename}
      />
      <DeleteForeverDialog
        open={actions.remove.open}
        onOpenChange={actions.setRemoveOpen}
        title={actions.remove.item?.doc.title ?? ""}
        onConfirm={actions.confirmRemove}
      />
      {shareItem && (
        <ShareDialog
          open={actions.share.open}
          onOpenChange={actions.setShareOpen}
          doc={shareItem.doc}
          access={shareItem.access}
        />
      )}
      <ManagementNoticeGate />
    </div>
  );
}
