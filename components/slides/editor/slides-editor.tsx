"use client";

/**
 * The collaborative presentation editor (the dynamic target of SlidesEditorRoute; loads the canvas, TipTap and Yjs).
 *
 * `SlidesEditor` works out who edits (the signed-in member, or the panel's member on a device: the PIN operator on
 * /store), their presence name and colour, opens the collaboration session (useDocumentCollaboration) and waits for
 * the first sync. `SlidesSession` (slides-session.tsx) then builds the deck store, the UI state and the actions and
 * renders the desktop or phone layout.
 */
import { useEffect, useMemo } from "react";
import { CloudOff, ShieldAlert } from "lucide-react";

import { canonicalMemberId } from "@/components/drive/drive-actor";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth/context";
import { colorForMember } from "@/lib/docs/colors";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import { useDocumentCollaboration } from "@/lib/docs/use-document-collaboration";
import { useT } from "@/lib/i18n/context";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useCurrentMemberId } from "@/lib/spacetimedb/hooks/useDocs";
import { useIsMobile } from "@/lib/use-is-mobile";

import { BackToDriveButton, SlidesCenteredState, SlidesEditorSkeleton } from "./slides-editor-skeleton";
import { SlidesSession } from "./slides-session";

export interface SlidesEditorProps {
  doc: DocumentMeta;
  /** The route's access, the device ceiling already applied. */
  access: DocAccess;
  isStarred: boolean;
  /** `?new=1`: just created (or just imported). */
  initialNew: boolean;
  /** `?slide=`: the slide to open on. */
  initialSlideId: string | null;
  /** `?version=`: a version to preview. */
  versionParam: string | null;
  /** `?present=1`: start the slideshow. */
  startPresenting: boolean;
  /** Force the phone layout (a device panel is narrow even on a wide tablet). */
  mobile?: boolean;
}

export default function SlidesEditor(props: SlidesEditorProps): React.JSX.Element {
  const { doc, access } = props;
  const t = useT();
  const memberId = canonicalMemberId(useCurrentMemberId());
  const [members] = useOrgMembers();
  const { user: authUser } = useAuth();
  const isMobile = useIsMobile() || props.mobile === true;

  const displayName = useMemo(() => {
    if (memberId) {
      for (const row of members) {
        if (row.organizationId !== doc.organizationId || canonicalMemberId(row.id.toString()) !== memberId) continue;
        const name = row.displayName?.trim() || row.email;
        if (name) return name;
      }
    }
    return [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ").trim() || authUser?.email || t("docs.presence.anonymous");
  }, [members, doc.organizationId, memberId, authUser, t]);
  const user = useMemo(() => (memberId ? { name: displayName, color: colorForMember(memberId) } : null), [memberId, displayName]);

  const collab = useDocumentCollaboration({
    documentId: doc.id,
    organizationId: doc.organizationId,
    memberId,
    user,
    readOnly: !access.canEdit,
  });

  // Unload guard: warn while local edits haven't reached the server (offline or mid-push).
  const provider = collab.provider;
  useEffect(() => {
    if (!provider) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Edits that can no longer be saved (access lost, read-only) don't hold the page, as in lib/docs/session-cache.
      if (!provider.hasUnsavedChanges() || provider.accessLostCode !== null || provider.isReadOnly) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [provider]);

  if (collab.error?.code === "not_published") {
    return (
      <SlidesCenteredState>
        <EmptyState icon={CloudOff} title={t("slides.editor.notPublishedTitle")} description={t("docs.errors.notPublished")} action={<BackToDriveButton />} />
      </SlidesCenteredState>
    );
  }

  if (!collab.synced || !collab.ydoc || !collab.provider || !memberId) {
    if (collab.accessLost) {
      return (
        <SlidesCenteredState>
          <EmptyState
            icon={ShieldAlert}
            title={t("slides.editor.accessLostTitle")}
            description={t(DOC_ERROR_I18N_KEYS[collab.accessLost])}
            action={<BackToDriveButton />}
          />
        </SlidesCenteredState>
      );
    }
    const status = collab.status === "offline" ? t("docs.status.offline") : collab.status === "syncing" ? t("docs.status.syncing") : t("docs.status.connecting");
    return <SlidesEditorSkeleton status={status} />;
  }

  return <SlidesSession {...props} collab={collab} ydoc={collab.ydoc} provider={collab.provider} memberId={memberId} isMobile={isMobile} />;
}
