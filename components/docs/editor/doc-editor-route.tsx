"use client";

/**
 * `/manager/docs/edit` loader (docs-editor-ui spec §4.1). Imports no Tiptap/Yjs: the editor chunk loads through
 * `next/dynamic` with `ssr: false` only once the document resolves and the member can view it.
 *
 * States: invalid id → replace to Docs home · backend not published · loading · waiting (a just-created row may
 * not have streamed in yet, 5 s grace) · not found · no access · ready. The tab title is set here, so it appears
 * before the editor chunk loads.
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CloudOff, FileQuestion, Lock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth/context";
import { useSetTabTitle, useShellChrome } from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { DOCS_HOME_HREF } from "@/lib/docs/hrefs";
import { isDocumentId } from "@/lib/docs/ids";
import { markDocumentOpened } from "@/lib/docs/recent";
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

export function DocEditorRoute() {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const rawId = search.get("id");
  const id = rawId && isDocumentId(rawId) ? rawId.toLowerCase() : null;
  const threadParam = readParam(search, "comment");
  const versionParam = readParam(search, "version");
  const isNew = search.get("new") === "1";

  const { organizationId } = usePermissions();
  const { user } = useAuth();
  const { doc, access, isStarred, isReady, notFound, backendStatus } = useDocument(id);
  const [members] = useOrgMembers();

  // Docked chrome for every state of the route (the editor adds immersive while editing).
  useShellChrome({ mobileChrome: "docked" });

  useEffect(() => {
    if (!id) router.replace(DOCS_HOME_HREF);
  }, [id, router]);

  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  const waitingKey = notFound && id ? id : null;
  useEffect(() => {
    if (!waitingKey) return;
    const timer = window.setTimeout(() => setExpiredFor(waitingKey), WAITING_MS);
    return () => window.clearTimeout(timer);
  }, [waitingKey]);
  const waitExpired = waitingKey !== null && expiredFor === waitingKey;

  const canView = !!doc && access.canView;
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
        <EmptyState icon={FileQuestion} title={t("docs.editor.notFoundTitle")} description={t("docs.editor.notFoundDescription")} action={backLink} />
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
    <DocEditor
      key={`${doc.organizationId}:${doc.id}`}
      doc={doc}
      access={access}
      isStarred={isStarred}
      initialNew={isNew}
      threadParam={threadParam}
      versionParam={versionParam}
    />
  );
}
