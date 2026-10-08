"use client";

/**
 * The spreadsheet editor (sheets.md §10): the dynamic target of SheetEditorRoute, so Univer loads only here.
 *
 * `SheetEditor` works out who edits (the signed-in account, and the PIN operator on /store) and the presence name
 * and colour. `SheetEditorSession` opens the sync session (lib/sheets/use-sheet-session.ts), owns the UI state and
 * the actions, turns the session's events into banners and toasts, wires the shell (docked / immersive chrome, back,
 * page actions) and renders the desktop or phone layout around the grid (univer-host.tsx).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { History, Share2 } from "lucide-react";
import { toast } from "sonner";

import { canonicalMemberId, type DriveActor } from "@/components/drive/drive-actor";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { useDocSaveState } from "@/components/docs/editor/use-save-state";
import { SidePanelFrame } from "@/components/docs/panels/side-panel-frame";
import { SheetBanners, type SheetLeaseLostNotice } from "@/components/sheets/chrome/sheet-banners";
import { SheetHeader } from "@/components/sheets/chrome/sheet-header";
import { useLossyConfirm } from "@/components/sheets/dialogs/lossy-report-dialog";
import { MobileSheetActions } from "@/components/sheets/mobile/mobile-sheet-actions";
import { MobileSheetHeader } from "@/components/sheets/mobile/mobile-sheet-header";
import { SheetVersionHistory, useSheetVersionPreview } from "@/components/sheets/panels/sheet-version-history";
import { VersionPreviewBar } from "@/components/sheets/panels/version-preview-bar";
import { useSheetReplaceUrl } from "@/components/sheets/use-sheet-replace-url";
import { useAuth } from "@/lib/auth/context";
import { useRegisterPageActions, useShellBackHandler, useShellChrome, type PageAction } from "@/lib/browser-shell";
import { colorForMember } from "@/lib/docs/colors";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import { sheetHref } from "@/lib/drive/hrefs";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import type { SheetSessionErrorCode } from "@/lib/sheets/sync/session";
import { acceptRemoteOp } from "@/lib/sheets/univer/mutation-filter";
import { useSheetSession } from "@/lib/sheets/use-sheet-session";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";
import { useIsMobile } from "@/lib/use-is-mobile";
import { SheetDialogs } from "./sheet-dialogs";
import {
  SheetEditorContext, initSheetUiState, sheetUiReducer, useSheetEditor, type SheetEditorContextValue, type SheetHostHandle,
} from "./sheet-editor-context";
import { SheetSkeleton } from "./sheet-skeleton";
import { UniverHost } from "./univer-host";
import { useSheetActions } from "./use-sheet-actions";

export interface SheetEditorProps {
  doc: DocumentMeta;
  /** The route's access, the device ceiling already applied. */
  access: DocAccess;
  isStarred: boolean;
  /** `?new=1`: just created. */
  initialNew: boolean;
  /** `?version=`: a version to show. */
  versionParam: string | null;
  /** Force the phone chrome (a device panel). */
  mobile: boolean;
  /** Inside a device panel (no URL of its own). */
  panel: boolean;
  /** Who edits (the route's useDriveActor: the PIN operator on /store). */
  actor: DriveActor;
}

/** Session failures worth a toast; the rest are banners (offline, too large), reloads (stale) or the lost notice. */
const ERROR_TOASTS: Partial<Record<SheetSessionErrorCode, string>> = {
  quota: "sheets.errors.quota",
  versions_full: "sheets.versions.full",
  sequence: "sheets.errors.sequence",
  stale: "sheets.errors.stale",
  invalid: "sheets.errors.invalid",
  not_sheet: "sheets.errors.notSheet",
};

export default function SheetEditor(props: SheetEditorProps) {
  const { t } = useI18n();
  const { actor } = props;
  const signedIn = useSignedInMember();
  const [members] = useOrgMembers();
  const { user: authUser } = useAuth();
  const memberId = canonicalMemberId(signedIn.memberId);
  const actorMemberId = actor.memberId ?? memberId;
  const organizationId = props.doc.organizationId;

  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const row of members) {
      if (row.organizationId !== organizationId) continue;
      const id = canonicalMemberId(row.id.toString());
      if (id) out.set(id, row.displayName?.trim() || row.email);
    }
    return out;
  }, [members, organizationId]);

  const displayName =
    (actorMemberId ? names.get(actorMemberId) : undefined) ||
    [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ").trim() ||
    authUser?.email ||
    t("docs.presence.anonymous");
  const user = useMemo(() => ({ name: displayName, color: colorForMember(actorMemberId ?? "") }), [displayName, actorMemberId]);

  if (!memberId || !actorMemberId) return <SheetSkeleton />;
  return <SheetEditorSession {...props} memberId={memberId} actorMemberId={actorMemberId} user={user} names={names} />;
}

interface SheetEditorSessionProps extends SheetEditorProps {
  memberId: string;
  actorMemberId: string;
  user: { name: string; color: string };
  names: ReadonlyMap<string, string>;
}

function SheetEditorSession(props: SheetEditorSessionProps) {
  const { doc, access, isStarred, initialNew, versionParam, panel, actor, memberId, actorMemberId, user, names } = props;
  const { t, locale } = useI18n();
  const phone = useIsMobile();
  const mobile = phone || props.mobile;
  const openDocsUrl = useDocsOpenUrl();
  const replaceUrl = useSheetReplaceUrl();

  const facade = useSheetSession({
    doc,
    access,
    user,
    memberId,
    actor: { actorMemberId, actingMemberId: actor.actingMemberId },
    // Desktops and tablets take a free lease on open; a phone opens to read and Edit takes it (sheets.md §5.4). The
    // route mounts this editor only once the management notice is acknowledged, so no lease is taken behind the gate.
    autoAcquire: !phone,
    acceptRemoteOp,
  });
  const session = facade.session;
  const editing = facade.lease.kind === "mine";

  const [ui, dispatch] = useReducer(sheetUiReducer, { previewVersionId: versionParam, mobile }, initSheetUiState);
  // A new `?version=` while mounted (a link to a version of this sheet): show it.
  const [seenVersionParam, setSeenVersionParam] = useState(versionParam);
  if (versionParam !== seenVersionParam) {
    setSeenVersionParam(versionParam);
    if (versionParam) {
      dispatch({ type: "preview", versionId: versionParam });
      if (!mobile) dispatch({ type: "setHistory", open: true });
    }
  }

  const [host, setHost] = useState<SheetHostHandle | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const lossy = useLossyConfirm(dispatch);
  const saveState = useDocSaveState(facade.status, editing);
  const actions = useSheetActions({
    doc, access, actor, facade, host, mobile, dispatch, openDocsUrl, titleInputRef, confirmLossy: lossy.confirm, t, locale,
  });

  // Session events → the lost notice, the "paused" and "now editing" toasts, and failures worth a toast.
  const [leaseLost, setLeaseLost] = useState<SheetLeaseLostNotice | null>(null);
  const handedOver = useRef(false);
  useEffect(() => {
    if (!session) return;
    const offs = [
      session.on("leaseLost", (info) => setLeaseLost(info)),
      session.on("released", (reason) => {
        if (reason === "idle" || reason === "hidden") toast(t("sheets.lease.paused"));
        handedOver.current = reason === "hand_over";
      }),
      session.on("error", ({ code }) => {
        const key = ERROR_TOASTS[code];
        if (key) toast.error(t(key));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [session, t]);
  const lease = facade.lease;
  useEffect(() => {
    if (!handedOver.current || lease.kind !== "other") return;
    handedOver.current = false;
    toast(fmt(t("sheets.lease.nowEditing"), { name: lease.holderName }));
  }, [lease, t]);
  // Editing again: the lost notice is over.
  if (editing && leaseLost) setLeaseLost(null);

  // Edit rights taken away while the sheet is open.
  const hadEdit = useRef(access.canEdit);
  useEffect(() => {
    if (hadEdit.current && !access.canEdit) toast(t("sheets.lease.cannotEdit"));
    hadEdit.current = access.canEdit;
  }, [access.canEdit, t]);

  // `?new=1`: the title is focused for naming (desktop), then the flag leaves the URL (replaced: Back skips it).
  const newHandled = useRef(false);
  useEffect(() => {
    if (!initialNew || newHandled.current) return;
    newHandled.current = true;
    if (!mobile && access.canEdit) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
    if (!panel) replaceUrl(sheetHref(doc.id));
  }, [initialNew, mobile, access.canEdit, panel, replaceUrl, doc.id]);

  // Shell: immersive while a phone edits; Back closes what is open first, then leaves editing.
  useShellChrome({ immersive: mobile && editing, mobileChrome: "docked" });
  const pageActions = useMemo<readonly PageAction[] | null>(
    () =>
      mobile
        ? [
            { id: "sheets-share", label: t("sheets.menu.share"), icon: Share2, onSelect: () => dispatch({ type: "openDialog", dialog: "share" }) },
            { id: "sheets-history", label: t("docs.versions.title"), icon: History, onSelect: () => dispatch({ type: "setHistory", open: true }) },
          ]
        : null,
    [mobile, t],
  );
  useRegisterPageActions(pageActions);
  const stopEditing = actions.stopEditing;
  const previewVersion = actions.previewVersion;
  useShellBackHandler(() => {
    if (ui.mobileActions) dispatch({ type: "setMobileActions", open: false });
    else if (ui.historyOpen) dispatch({ type: "setHistory", open: false });
    else if (ui.previewVersionId) previewVersion(null);
    else if (editing) void stopEditing();
    else return false;
    return true;
  }, mobile && (ui.mobileActions || ui.historyOpen || ui.previewVersionId !== null || editing));

  const onBlocked = useCallback(() => {
    if (ui.previewVersionId) return;
    toast(t(access.canEdit ? "sheets.lease.viewOnlyHint" : "sheets.lease.cannotEdit"), {
      id: "sheet-view-only",
      action: access.canEdit ? { label: t("sheets.lease.edit"), onClick: () => void actions.requestEdit() } : undefined,
    });
  }, [ui.previewVersionId, access.canEdit, actions, t]);

  const memberName = useCallback((id: string | null) => (id ? (names.get(canonicalMemberId(id) ?? "") ?? null) : null), [names]);

  const value = useMemo<SheetEditorContextValue>(
    () => ({ doc, access, isStarred, facade, actor, mobile, panel, editing, host, ui, dispatch, actions, saveState, memberName, titleInputRef }),
    [doc, access, isStarred, facade, actor, mobile, panel, editing, host, ui, actions, saveState, memberName],
  );

  return (
    <SheetEditorContext.Provider value={value}>
      <SheetEditorBody leaseLost={leaseLost} onDismissLeaseLost={() => setLeaseLost(null)} onReady={setHost} onBlocked={onBlocked} lossy={lossy} />
    </SheetEditorContext.Provider>
  );
}

interface SheetEditorBodyProps {
  leaseLost: SheetLeaseLostNotice | null;
  onDismissLeaseLost(): void;
  onReady(handle: SheetHostHandle | null): void;
  onBlocked(): void;
  lossy: ReturnType<typeof useLossyConfirm>;
}

function SheetEditorBody({ leaseLost, onDismissLeaseLost, onReady, onBlocked, lossy }: SheetEditorBodyProps) {
  const { t } = useI18n();
  const { doc, facade, host, mobile, panel, ui, dispatch } = useSheetEditor();
  const preview = useSheetVersionPreview();
  // Univer failed to mount: the host shows "Couldn't open" + Retry, which the skeleton must not cover.
  const [hostFailed, setHostFailed] = useState(false);
  // The first load only: a reload keeps the grid and shows its banner.
  const gridLoading = !hostFailed && (!host || (facade.loadState === "loading" && !facade.reloading));

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background" data-sheet-editor="" data-no-sidebar-swipe>
      {mobile ? <MobileSheetHeader /> : <SheetHeader />}
      <SheetBanners leaseLost={leaseLost} onDismissLeaseLost={onDismissLeaseLost} />
      <VersionPreviewBar preview={preview} />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <UniverHost
            bindModel={facade.bindModel}
            panel={panel}
            mobile={mobile}
            previewing={ui.previewVersionId !== null}
            onReady={onReady}
            onFailed={setHostFailed}
            onBlocked={onBlocked}
            organizationId={doc.organizationId}
          />
          {gridLoading && facade.loadState !== "load_failed" && <SheetSkeleton chrome={false} className="absolute inset-0 z-10" />}
        </div>
        {!mobile && ui.historyOpen && (
          <SidePanelFrame title={t("docs.versions.title")} onClose={() => dispatch({ type: "setHistory", open: false })}>
            <SheetVersionHistory variant="panel" />
          </SidePanelFrame>
        )}
      </div>
      {mobile && <MobileSheetActions />}
      <SheetDialogs preview={preview} lossy={lossy} />
    </div>
  );
}
