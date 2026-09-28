"use client";

/**
 * The spreadsheet route (sheets.md §10.2): `/manager/drive/sheet?id=` on the back office, and the Drive lite panel on
 * /store and /personal, which passes `documentId` and `mobile`. It imports no Univer and no ExcelJS: the editor chunk
 * loads through `next/dynamic` with `ssr: false` once the document resolves and the member may view it.
 *
 * States, as the Docs route: invalid id → Drive home · not published · loading (a just-created row gets a 5 s grace) ·
 * not found · wrong type → its own editor (a panel shows a notice instead) · no access · ready. Both redirects replace
 * the URL, so Back never returns to one that redirects again. Access is the one the server grants: inside a device
 * panel useDocument evaluates the operator (DriveActorOverrideContext), and a tablet account that is not an owner or
 * manager caps it (the device ceiling), so a staff-account tablet shows "no access" for an operator's private sheet
 * instead of a grid that can never save. The management notice gates every ready and no-access state on /manager, and
 * the editor mounts (and takes a lease) only once it is acknowledged; in a panel the lite host has already gated.
 */
import { useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { CloudOff, FileQuestion, FileSymlink, Lock } from "lucide-react";

import { useDriveActor } from "@/components/drive/drive-actor";
import { ManagementNoticeGate, NoticeGateScope } from "@/components/drive/notice/management-notice";
import { useManagementNoticeAck } from "@/components/drive/notice/use-notice-ack";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth/context";
import { useSetTabTitle, useShellChrome } from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { isDocumentId } from "@/lib/docs/ids";
import { markDocumentOpened } from "@/lib/docs/recent";
import { DRIVE_HOME_HREF, documentFileHref } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { intersectDocAccess } from "@/lib/sheets/access";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useDocument } from "@/lib/spacetimedb/hooks/useDocs";
import { useSheetsBackendStatus } from "@/lib/spacetimedb/hooks/useSheets";
import { SheetSkeleton } from "./editor/sheet-skeleton";
import { useSheetReplaceUrl } from "./use-sheet-replace-url";

const SheetEditor = dynamic(() => import("./editor/sheet-editor"), { ssr: false, loading: () => <SheetSkeleton /> });

/** How long a missing row is treated as "still arriving" before showing not found. */
const WAITING_MS = 5000;

function readParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">{children}</div>;
}

export interface SheetEditorRouteProps {
  /** Device panels pass the document; the /manager route reads `?id=`. */
  documentId?: string;
  /** Force the phone chrome (a device panel is narrow even on a wide tablet). */
  mobile?: boolean;
  /** A device panel's "just created" (the /manager route reads `?new=1`). */
  isNew?: boolean;
}

export function SheetEditorRoute({ documentId, mobile, isNew: isNewProp }: SheetEditorRouteProps = {}): React.JSX.Element {
  const t = useT();
  const search = useSearchParams();
  const openUrl = useDocsOpenUrl();
  const replaceUrl = useSheetReplaceUrl();
  const panel = documentId !== undefined;
  const rawId = documentId ?? search.get("id");
  const id = rawId && isDocumentId(rawId) ? rawId.toLowerCase() : null;
  // A panel has no URL of its own: it is told `isNew`, and `version` belongs to the /manager route only.
  const versionParam = panel ? null : readParam(search, "version");
  const isNew = panel ? isNewProp === true : search.get("new") === "1";

  const { organizationId } = usePermissions();
  const { user } = useAuth();
  const { doc, access: baseAccess, isStarred, isReady, notFound, backendStatus } = useDocument(id);
  const sheetsStatus = useSheetsBackendStatus();
  const actor = useDriveActor();
  const [members] = useOrgMembers();
  const noticeScoped = useContext(NoticeGateScope);
  const notice = useManagementNoticeAck();

  // Docked chrome in every state (the editor adds immersive while a phone edits).
  useShellChrome({ mobileChrome: "docked" });

  useEffect(() => {
    if (!id && !panel) replaceUrl(DRIVE_HOME_HREF);
  }, [id, panel, replaceUrl]);

  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  const waitingKey = notFound && id ? id : null;
  useEffect(() => {
    if (!waitingKey) return;
    const timer = window.setTimeout(() => setExpiredFor(waitingKey), WAITING_MS);
    return () => window.clearTimeout(timer);
  }, [waitingKey]);
  const waitExpired = waitingKey !== null && expiredFor === waitingKey;

  // Once settled for this sheet, a later re-check of the device ceiling never unmounts an open editor.
  const [actorSettledFor, setActorSettledFor] = useState<string | null>(null);
  if (actor.ready && id && actorSettledFor !== id) setActorSettledFor(id);
  const actorReady = actor.ready || (id !== null && actorSettledFor === id);

  // /manager: the editor waits for the notice to be acknowledged (it would take the lease behind the dialog). Once
  // clear for this sheet it stays mounted; a lite host (NoticeGateScope) has gated already.
  const noticeClearNow = noticeScoped || (notice.ready && !notice.needsAck);
  const [noticeClearedFor, setNoticeClearedFor] = useState<string | null>(null);
  if (noticeClearNow && id && noticeClearedFor !== id) setNoticeClearedFor(id);
  const noticeClear = noticeClearNow || (id !== null && noticeClearedFor === id);

  const ceiling = actor.ceiling;
  const access = useMemo(
    () => (doc && ceiling ? intersectDocAccess(baseAccess, ceiling.doc(doc)) : baseAccess),
    [doc, ceiling, baseAccess],
  );

  // Another file type opened here: /manager moves to its own editor.
  const redirectTo = doc && doc.fileType !== "sheet" && !panel ? documentFileHref(doc) : null;
  useEffect(() => {
    if (redirectTo) replaceUrl(redirectTo);
  }, [redirectTo, replaceUrl]);

  const canView = !!doc && doc.fileType === "sheet" && access.canView;
  useSetTabTitle(canView && doc ? doc.title || t("sheets.untitled") : null);

  const userId = user?.id ?? null;
  const openedDocId = canView && doc ? doc.id : null;
  useEffect(() => {
    if (!openedDocId || !userId || !organizationId) return;
    markDocumentOpened({ userId, organizationId }, openedDocId);
  }, [openedDocId, userId, organizationId]);

  const ownerName = useMemo(() => {
    if (!doc) return null;
    const owner = members.find((m) => m.id.toString() === doc.ownerMemberId);
    return owner?.displayName?.trim() || null;
  }, [members, doc]);

  const backButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => openUrl(DRIVE_HOME_HREF, "current")}>
      {t("sheets.editor.backToDrive")}
    </Button>
  );

  const notFoundState = (
    <Centered>
      <EmptyState icon={FileQuestion} title={t("sheets.editor.notFoundTitle")} description={t("sheets.editor.notFoundDescription")} action={backButton} />
    </Centered>
  );

  // /manager leaves a bad URL for Drive (the effect above); a panel was handed a bad id.
  if (!id) return panel ? notFoundState : <SheetSkeleton />;

  if (backendStatus === "not_published" || sheetsStatus === "not_published") {
    return (
      <Centered>
        <EmptyState icon={CloudOff} title={t("sheets.editor.notPublishedTitle")} description={t("sheets.editor.notPublishedDescription")} action={backButton} />
      </Centered>
    );
  }

  if (!isReady || backendStatus === "checking" || sheetsStatus === "checking" || (notFound && !waitExpired)) return <SheetSkeleton />;

  if (notFound || !doc) return notFoundState;

  if (doc.fileType !== "sheet") {
    if (!panel) return <SheetSkeleton />;
    return (
      <Centered>
        <EmptyState
          icon={FileSymlink}
          title={t("docs.editor.otherTypeTitle")}
          description={t("docs.editor.otherTypeDescription")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => openUrl(documentFileHref(doc), "current")}>
              {t("docs.editor.openInDrive")}
            </Button>
          }
        />
      </Centered>
    );
  }

  // The device ceiling needs the tablet account's grants before "no access" can be told apart from "loading".
  if (!actorReady) return <SheetSkeleton />;

  if (!access.canView) {
    return (
      <>
        <Centered>
          <EmptyState
            icon={Lock}
            title={t("sheets.editor.noAccessTitle")}
            description={ownerName ? fmt(t("sheets.editor.noAccessDescription"), { name: ownerName }) : t("sheets.editor.noAccessDescriptionNoOwner")}
            action={backButton}
          />
        </Centered>
        <ManagementNoticeGate />
      </>
    );
  }

  if (!noticeClear) {
    return (
      <>
        <SheetSkeleton />
        <ManagementNoticeGate />
      </>
    );
  }

  return (
    <>
      <SheetEditor
        key={`${doc.organizationId}:${doc.id}`}
        doc={doc}
        access={access}
        isStarred={isStarred}
        initialNew={isNew}
        versionParam={versionParam}
        mobile={mobile === true}
        panel={panel}
        actor={actor}
      />
      <ManagementNoticeGate />
    </>
  );
}
