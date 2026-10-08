"use client";

/**
 * The presentation route (slides.md §7.1): `/manager/drive/slides?id=` on the back office, and the Drive lite panel on
 * /store and /personal, which passes `documentId`, `mobile` and `isNew`. It imports no editor code: the editor chunk (canvas,
 * TipTap, Yjs, moveable) loads through `next/dynamic` with `ssr: false` once the document resolves and the member may
 * view it.
 *
 * States, as the Docs and Sheets routes: invalid id → Drive home · not published · loading (a just-created row gets a
 * 5 s grace) · not found · wrong type → its own editor (a panel, or a type this version does not know, shows a notice
 * with an open action instead) · no access · ready. Redirects replace the URL, so Back never lands on one that
 * redirects again. Access is the one the server grants: inside a device panel useDocument evaluates the operator
 * (DriveActorOverrideContext), and a tablet account that is not an owner or manager caps it (the device ceiling), so a
 * staff-account tablet shows "no access" for an operator's private deck instead of a deck that can never save.
 *
 * The management notice (first-open acknowledgement) is mounted here on /manager, whatever the entry point; it does
 * not block: the deck loads behind it and the dialog sits on top. A `?present=1` link waits for it (the slideshow
 * would cover the dialog): the link stays in the URL and applies once the member acknowledges. Inside a device panel
 * the Drive lite host has gated already (NoticeGateScope), and the gate renders nothing.
 */
import { useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { CloudOff, FileQuestion, FileSymlink, Lock } from "lucide-react";

import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { useDriveActor } from "@/components/drive/drive-actor";
import { ManagementNoticeGate, NoticeGateScope } from "@/components/drive/notice/management-notice";
import { useManagementNoticeAck } from "@/components/drive/notice/use-notice-ack";
import { useSheetReplaceUrl } from "@/components/sheets/use-sheet-replace-url";
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
import { SLIDES_ID_RE } from "@/lib/slides/constants";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useDocument } from "@/lib/spacetimedb/hooks/useDocs";
import { BackToDriveButton, SlidesCenteredState, SlidesEditorSkeleton } from "./slides-editor-skeleton";

const SlidesEditor = dynamic(() => import("./slides-editor"), { ssr: false, loading: () => <SlidesEditorSkeleton /> });

/** How long a missing row is treated as "still arriving" before showing not found. */
const WAITING_MS = 5000;
/** Longest `?version=` value read (a version id is a uuid; anything longer is not one). */
const VERSION_PARAM_MAX = 64;

/** What a link to a deck asks for beyond the deck itself (all volatile: the editor consumes them, then drops them). */
export interface SlidesLinkParams {
  /** `?slide=`: the slide to open on (a malformed id is ignored). */
  slide: string | null;
  /** `?version=`: a version to preview. */
  version: string | null;
  /** `?present=1`: start the slideshow. */
  present: boolean;
  /** `?new=1`: just created. */
  isNew: boolean;
}

/** Reads exactly what `slidesHref(id, { slide, version, present, isNew })` writes. */
export function readSlidesLinkParams(search: Pick<URLSearchParams, "get">): SlidesLinkParams {
  const slide = search.get("slide")?.trim() ?? "";
  const version = search.get("version")?.trim() ?? "";
  return {
    slide: SLIDES_ID_RE.test(slide) ? slide : null,
    version: version !== "" && version.length <= VERSION_PARAM_MAX ? version : null,
    present: search.get("present") === "1",
    isNew: search.get("new") === "1",
  };
}

const NO_LINK_PARAMS: SlidesLinkParams = Object.freeze({ slide: null, version: null, present: false, isNew: false });
const NEW_IN_PANEL: SlidesLinkParams = Object.freeze({ ...NO_LINK_PARAMS, isNew: true });

export interface SlidesEditorRouteProps {
  /** Device panels pass the document; the /manager route reads `?id=`. */
  documentId?: string;
  /** Force the phone layout (a device panel is narrow even on a wide tablet). */
  mobile?: boolean;
  /**
   * A device panel's `?new=1`: the deck was just made there (New ▸ Slides, an import). A panel has no URL, so the
   * Drive lite app passes it; the /manager route reads `?new=1` and ignores this.
   */
  isNew?: boolean;
}

export function SlidesEditorRoute({ documentId, mobile, isNew: isNewProp }: SlidesEditorRouteProps = {}): React.JSX.Element {
  const t = useT();
  const search = useSearchParams();
  const openUrl = useDocsOpenUrl();
  const replaceUrl = useSheetReplaceUrl();
  const panel = documentId !== undefined;
  const rawId = documentId ?? search.get("id");
  const id = rawId && isDocumentId(rawId) ? rawId.toLowerCase() : null;
  // A panel has no URL of its own: the link parameters belong to the /manager route only, apart from `isNew`, which
  // the panel passes (a new deck opens editing on a phone and shows its import report).
  const link = panel ? (isNewProp === true ? NEW_IN_PANEL : NO_LINK_PARAMS) : readSlidesLinkParams(search);

  const { organizationId } = usePermissions();
  const { user } = useAuth();
  const { doc, access: baseAccess, isStarred, isReady, notFound, backendStatus } = useDocument(id);
  const actor = useDriveActor();
  const [members] = useOrgMembers();
  const noticeScoped = useContext(NoticeGateScope);
  const notice = useManagementNoticeAck();

  // Docked chrome in every state (the editor adds immersive while presenting or editing on a phone).
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

  // Once settled for this deck, a later re-check of the device ceiling never unmounts an open editor.
  const [actorSettledFor, setActorSettledFor] = useState<string | null>(null);
  if (actor.ready && id && actorSettledFor !== id) setActorSettledFor(id);
  const actorReady = actor.ready || (id !== null && actorSettledFor === id);

  // A slideshow link waits for the management notice: the show sits above every dialog and would hide it. Until the
  // notice is clear the editor gets no link at all, so the session consumes none of it and the URL keeps it; once
  // clear for this deck it stays clear. A lite host (NoticeGateScope) has gated already.
  const noticeClearNow = noticeScoped || (notice.ready && !notice.needsAck);
  const [noticeClearedFor, setNoticeClearedFor] = useState<string | null>(null);
  if (noticeClearNow && id && noticeClearedFor !== id) setNoticeClearedFor(id);
  const noticeClear = noticeClearNow || (id !== null && noticeClearedFor === id);
  const editorLink = link.present && !noticeClear ? NO_LINK_PARAMS : link;

  const ceiling = actor.ceiling;
  const access = useMemo(
    () => (doc && ceiling ? intersectDocAccess(baseAccess, ceiling.doc(doc)) : baseAccess),
    [doc, ceiling, baseAccess],
  );

  // Another known file type opened here: /manager moves to its own editor. A type this version does not know
  // ("unknown", from a newer client) has no editor to move to, so it keeps the notice below.
  const redirectTo = doc && !panel && (doc.fileType === "doc" || doc.fileType === "sheet") ? documentFileHref(doc) : null;
  useEffect(() => {
    if (redirectTo) replaceUrl(redirectTo);
  }, [redirectTo, replaceUrl]);

  const isDeck = !!doc && doc.fileType === "slides";
  const canView = isDeck && access.canView;
  useSetTabTitle(canView && doc ? doc.title || t("slides.untitled") : null);

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

  const notFoundState = (
    <SlidesCenteredState>
      <EmptyState icon={FileQuestion} title={t("slides.editor.notFoundTitle")} description={t("slides.editor.notFoundDescription")} action={<BackToDriveButton />} />
    </SlidesCenteredState>
  );

  // /manager leaves a bad URL for Drive (the effect above); a panel was handed a bad id.
  if (!id) return panel ? notFoundState : <SlidesEditorSkeleton />;

  if (backendStatus === "not_published") {
    return (
      <SlidesCenteredState>
        <EmptyState icon={CloudOff} title={t("slides.editor.notPublishedTitle")} description={t("docs.errors.notPublished")} action={<BackToDriveButton />} />
      </SlidesCenteredState>
    );
  }

  if (!isReady || backendStatus === "checking" || (notFound && !waitExpired)) return <SlidesEditorSkeleton />;

  if (notFound || !doc) return notFoundState;

  if (!isDeck) {
    if (redirectTo) return <SlidesEditorSkeleton />;
    return (
      <SlidesCenteredState>
        <EmptyState
          icon={FileSymlink}
          title={t("slides.editor.notPresentationTitle")}
          description={t("slides.editor.notPresentationDescription")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => openUrl(documentFileHref(doc), "current")}>
              {t("slides.editor.openFile")}
            </Button>
          }
        />
      </SlidesCenteredState>
    );
  }

  // The device ceiling needs the tablet account's grants before "no access" can be told apart from "loading".
  if (!actorReady) return <SlidesEditorSkeleton />;

  if (!access.canView) {
    return (
      <>
        <SlidesCenteredState>
          <EmptyState
            icon={Lock}
            title={t("slides.editor.noAccessTitle")}
            description={ownerName ? fmt(t("slides.editor.noAccessDescription"), { name: ownerName }) : t("slides.editor.noAccessDescriptionNoOwner")}
            action={<BackToDriveButton />}
          />
        </SlidesCenteredState>
        <ManagementNoticeGate />
      </>
    );
  }

  return (
    <>
      <SlidesEditor
        key={`${doc.organizationId}:${doc.id}`}
        doc={doc}
        access={access}
        isStarred={isStarred}
        initialNew={editorLink.isNew}
        initialSlideId={editorLink.slide}
        versionParam={editorLink.version}
        startPresenting={editorLink.present}
        mobile={mobile}
      />
      <ManagementNoticeGate />
    </>
  );
}
