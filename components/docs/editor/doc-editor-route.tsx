"use client";

/**
 * `/manager/docs/edit` loader (docs-editor-ui spec §4.1). Imports no Tiptap/Yjs: the editor chunk loads through
 * `next/dynamic` with `ssr: false` only once the document resolves and the member can view it.
 *
 * States: invalid id → replace to Docs home · backend not published · loading · waiting (a just-created row may
 * not have streamed in yet, 5 s grace) · not found (which also covers "not shared with you": a document the member
 * may not open is never sent to them) · another file type (a spreadsheet or deck: the /manager route replaces the
 * URL with its own editor, a panel shows a notice that opens it, or leads back to Docs when the panel's host has no
 * editor for it; Tiptap never binds to their Y.Doc) · no access · ready.
 * The tab title is set here, so it appears before the editor chunk loads. The management notice gates the ready
 * editor on /manager; a device panel's lite host has gated already.
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CloudOff, FileQuestion, FileSymlink, Lock } from "lucide-react";

import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { ManagementNoticeGate } from "@/components/drive/notice/management-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth/context";
import { useSetTabTitle, useShellChrome } from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { DOCS_HOME_HREF } from "@/lib/docs/hrefs";
import { canonicalUuidText, isDocumentId } from "@/lib/docs/ids";
import { markDocumentOpened } from "@/lib/docs/recent";
import { documentFileHref } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useDocument } from "@/lib/spacetimedb/hooks/useDocs";
import { EditorSkeleton } from "./editor-skeleton";

const DocEditor = dynamic(() => import("./doc-editor"), { ssr: false, loading: () => <EditorSkeleton /> });

/** How long a missing row is treated as "still arriving" before showing not found. */
const WAITING_MS = 5000;

function readParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

export interface DocEditorRouteProps {
  /** Device surfaces (/store, /personal) render the editor inside a panel and
   *  pass the document directly; the /manager route reads it from `?id=`. */
  documentId?: string;
  /** Force the mobile layout (see `DocEditorProps.mobile`). */
  mobile?: boolean;
  /**
   * Panels only: whether the host's opener (`DocsOpenProvider`) can show a spreadsheet or presentation. DocsLite
   * cannot and passes false, so a non-doc id offers the way back to Docs instead of an "Open" that would do nothing.
   * Default true: a host that maps every editor link to a screen of its own.
   */
  opensOtherFileTypes?: boolean;
  /**
   * Panels only: the document was just created here (a panel has no `?new=1` of its own; the page's URL is the
   * device surface's). The /manager route reads `?new=1` instead.
   */
  isNew?: boolean;
}

export function DocEditorRoute({ documentId, mobile, opensOtherFileTypes = true, isNew: isNewProp }: DocEditorRouteProps = {}) {
  const t = useT();
  const router = useRouter();
  const openUrl = useDocsOpenUrl();
  const search = useSearchParams();
  const rawId = documentId ?? search.get("id");
  const id = rawId && isDocumentId(rawId) ? rawId.toLowerCase() : null;
  const threadParam = readParam(search, "comment");
  // Version ids are hyphenated; a link from before that (32 bare hex digits) still finds its version.
  const rawVersion = readParam(search, "version");
  const versionParam = rawVersion ? canonicalUuidText(rawVersion) : null;
  const isNew = documentId !== undefined ? isNewProp === true : search.get("new") === "1";

  const { organizationId } = usePermissions();
  const { user } = useAuth();
  const { doc, access, isStarred, isReady, notFound, backendStatus } = useDocument(id);
  const [members] = useOrgMembers();

  // Docked chrome for every state of the route (the editor adds immersive while editing).
  useShellChrome({ mobileChrome: "docked" });

  useEffect(() => {
    // Only the /manager route can be on a bad URL; a panel passes the id in.
    if (!id && documentId === undefined) router.replace(DOCS_HOME_HREF);
  }, [id, documentId, router]);

  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  const waitingKey = notFound && id ? id : null;
  useEffect(() => {
    if (!waitingKey) return;
    const timer = window.setTimeout(() => setExpiredFor(waitingKey), WAITING_MS);
    return () => window.clearTimeout(timer);
  }, [waitingKey]);
  const waitExpired = waitingKey !== null && expiredFor === waitingKey;

  // A spreadsheet or deck (or a newer client's type) opened here: the /manager route moves to its own editor,
  // keeping a comment thread as the module's notification links do. A panel shows a notice below.
  const redirectTo =
    doc && doc.fileType !== "doc" && documentId === undefined
      ? documentFileHref(doc, { comment: threadParam ?? undefined })
      : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  const canView = !!doc && doc.fileType === "doc" && access.canView;
  useSetTabTitle(canView && doc ? doc.title || t("docs.untitled") : null);

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

  const backLink = (
    <Link href={DOCS_HOME_HREF} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {t("docs.editor.backToDocs")}
    </Link>
  );

  if (!id) return <EditorSkeleton />;

  if (backendStatus === "not_published") {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <EmptyState icon={CloudOff} title={t("docs.editor.notPublishedTitle")} description={t("docs.errors.notPublished")} action={backLink} />
      </div>
    );
  }

  if (!isReady || backendStatus === "checking" || (notFound && !waitExpired)) return <EditorSkeleton />;

  if (notFound || !doc) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <EmptyState icon={FileQuestion} title={t("docs.editor.notFoundTitle")} description={t("docs.editor.notFoundOrNoAccess")} action={backLink} />
      </div>
    );
  }

  if (doc.fileType !== "doc") {
    // /manager: the effect above replaces the URL.
    if (documentId === undefined) return <EditorSkeleton />;
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <EmptyState
          icon={FileSymlink}
          title={t("docs.editor.otherTypeTitle")}
          description={t("docs.editor.otherTypeDescription")}
          action={
            opensOtherFileTypes ? (
              <Button type="button" variant="outline" size="sm" onClick={() => openUrl(documentFileHref(doc), "current")}>
                {t("docs.editor.openInDrive")}
              </Button>
            ) : (
              backLink
            )
          }
        />
      </div>
    );
  }

  if (!access.canView) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <EmptyState
          icon={Lock}
          title={t("docs.editor.noAccessTitle")}
          description={
            ownerName
              ? fmt(t("docs.editor.noAccessDescription"), { name: ownerName })
              : t("docs.editor.noAccessDescriptionNoOwner")
          }
          action={backLink}
        />
      </div>
    );
  }

  return (
    <>
      <DocEditor
        key={`${doc.organizationId}:${doc.id}`}
        doc={doc}
        access={access}
        isStarred={isStarred}
        initialNew={isNew}
        threadParam={threadParam}
        versionParam={versionParam}
        mobile={mobile}
      />
      <ManagementNoticeGate />
    </>
  );
}
