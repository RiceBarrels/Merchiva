"use client";

/**
 * The collaborative editor (dynamic target of `DocEditorRoute`; loads Tiptap + Yjs).
 *
 * `DocEditor` opens the collaboration session (`useDocumentCollaboration`, WP-5) and waits for the first sync.
 * `DocEditorSession` then creates the Tiptap editor (never with `content`), owns the UI state, wires the shell
 * (docked/immersive chrome, mobile page actions, back handling) and renders the desktop or mobile layout.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/core";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import { CloudOff, History, ListTree, MessageSquare, ShieldAlert, Share2 } from "lucide-react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth/context";
import {
  useRegisterPageActions,
  useShellBackHandler,
  useShellChrome,
  useTabActions,
  useVirtualKeyboard,
  type PageAction,
} from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { colorForMember } from "@/lib/docs/colors";
import type { DocEditorHandlers } from "@/lib/docs/editor-extensions";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import { createPaginationController, type PaginationController } from "@/lib/docs/extensions/pagination";
import { PAGE_STACK_GAP, pageMetricsPx } from "@/lib/docs/page-setup";
import type { PaginationLayout } from "@/lib/docs/pagination/measure";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { docExcerpt, docWordCount } from "@/lib/docs/text";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import { uploadDocImage, DOC_IMAGE_ACCEPT } from "@/lib/docs/uploads";
import { useCommentThreads, type CommentDraft } from "@/lib/docs/use-comment-threads";
import { usePageSetup } from "@/lib/docs/use-page-setup";
import { useDocumentCollaboration, type DocumentCollaboration } from "@/lib/docs/use-document-collaboration";
import { getCommentAnchor, getCommentDraft } from "@/lib/docs/extensions/comment-mark";
import { useI18n, useT } from "@/lib/i18n/context";
import { updateDocumentMeta } from "@/lib/spacetimedb/actions";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useCurrentMemberId, useDocsSender, useDocumentVersions, type DocsSender } from "@/lib/spacetimedb/hooks/useDocs";
import { useIsMobile } from "@/lib/use-is-mobile";

import { DesktopDocEditor } from "./desktop-doc-editor";
import { DocDialogs } from "./doc-dialogs";
import {
  DocEditorContext,
  docEditorUiReducer,
  initDocEditorUiState,
  writeDocPrefs,
  type DocEditorContextValue,
  type DocEditorRefs,
} from "./doc-editor-context";
import { DocShortcuts } from "./doc-shortcuts";
import { useHeaderFooterEditing } from "./header-footer-layer";
import { EditorSkeleton } from "./editor-skeleton";
import { PrintPortal } from "./print-portal";
import { useCoarsePointer } from "./use-coarse-pointer";
import { useDocActions } from "./use-doc-actions";
import { useDocEditorInstance } from "./use-doc-editor-instance";
import { useDocSaveState } from "./use-save-state";
import { MobileDocEditor } from "@/components/docs/mobile/mobile-doc-editor";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";

export interface DocEditorProps {
  doc: DocumentMeta;
  access: DocAccess;
  isStarred: boolean;
  /** `?new=1`: freshly created. */
  initialNew: boolean;
  /** `?comment=` thread to focus. */
  threadParam: string | null;
  /** `?version=` version to preview. */
  versionParam: string | null;
  /** Force the mobile layout — a device panel is narrow even on a wide tablet. */
  mobile?: boolean;
}

const EXCERPT_IDLE_MS = 5000;
const EXCERPT_MIN_GAP_MS = 30_000;

function CenteredState({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-1 items-center justify-center">{children}</div>;
}

export default function DocEditor(props: DocEditorProps) {
  const { doc, access } = props;
  const t = useT();
  const memberId = useCurrentMemberId();
  // Comments, versions and edits are recorded for the signed-in account (on /store the tablet, not the operator).
  const sender = useDocsSender();
  const [members] = useOrgMembers();
  const { user: authUser } = useAuth();
  const isMobile = useIsMobile() || props.mobile === true;

  const memberNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of members) {
      if (row.organizationId !== doc.organizationId) continue;
      names.set(row.id.toString(), row.displayName?.trim() || row.email);
    }
    return names;
  }, [members, doc.organizationId]);

  const displayName =
    (memberId ? memberNames.get(memberId) : undefined) ||
    [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ").trim() ||
    authUser?.email ||
    t("docs.presence.anonymous");
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

  const backLink = (
    <Link href={DOCS_HOME_HREF} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {t("docs.editor.backToDocs")}
    </Link>
  );

  if (collab.error?.code === "not_published") {
    return (
      <CenteredState>
        <EmptyState icon={CloudOff} title={t("docs.editor.notPublishedTitle")} description={t("docs.errors.notPublished")} action={backLink} />
      </CenteredState>
    );
  }

  if (!collab.synced || !collab.ydoc || !collab.provider || !memberId || !user) {
    if (collab.accessLost) {
      return (
        <CenteredState>
          <EmptyState
            icon={ShieldAlert}
            title={t("docs.editor.accessLostTitle")}
            description={t(DOC_ERROR_I18N_KEYS[collab.accessLost])}
            action={backLink}
          />
        </CenteredState>
      );
    }
    const status = collab.status === "offline" ? t("docs.status.offline") : collab.status === "syncing" ? t("docs.status.syncing") : t("docs.status.connecting");
    return <EditorSkeleton status={status} />;
  }

  return (
    <DocEditorSession
      {...props}
      collab={collab}
      ydoc={collab.ydoc}
      provider={collab.provider}
      memberId={memberId}
      sender={sender}
      user={user}
      memberNames={memberNames}
      isMobile={isMobile}
    />
  );
}

type LiveProvider = NonNullable<DocumentCollaboration["provider"]>;

interface DocEditorSessionProps extends DocEditorProps {
  collab: DocumentCollaboration;
  ydoc: Y.Doc;
  provider: LiveProvider;
  memberId: string;
  sender: DocsSender;
  user: { name: string; color: string };
  memberNames: ReadonlyMap<string, string>;
  isMobile: boolean;
}

function DocEditorSession(props: DocEditorSessionProps) {
  const { doc, access, isStarred, initialNew, threadParam, versionParam, collab, ydoc, provider, memberId, sender, user, memberNames, isMobile } =
    props;
  const t = useT();
  const { locale } = useI18n();
  const coarsePointer = useCoarsePointer();
  const tabActions = useTabActions();
  const openDocsUrl = useDocsOpenUrl();
  const { currentOrg } = usePermissions();
  const shortcutLabel = useDocShortcutLabels();
  const previewVersionId = versionParam;
  const { setup: pageSetup, setSetup: setPageSetup } = usePageSetup(ydoc, locale);

  const [ui, dispatch] = useReducer(
    docEditorUiReducer,
    { startEditing: isMobile && initialNew && access.canEdit, threadId: threadParam, isMobile },
    initDocEditorUiState,
  );

  // A different `?comment=` while mounted (e.g. a notification for this document): focus that thread.
  const [seenThreadParam, setSeenThreadParam] = useState(threadParam);
  if (threadParam !== seenThreadParam) {
    setSeenThreadParam(threadParam);
    if (threadParam) {
      dispatch({ type: "activateThread", threadId: threadParam });
      dispatch(isMobile ? { type: "openMobilePage", page: "comments" } : { type: "openPanel", panel: "comments" });
    }
  }

  const outlineOpen = ui.outlineOpen;
  const zoom = ui.zoom;
  const showWordCount = ui.showWordCount;
  const showRuler = ui.showRuler;
  useEffect(() => {
    writeDocPrefs({ outlineOpen, zoom, showWordCount, showRuler });
  }, [outlineOpen, zoom, showWordCount, showRuler]);

  // Paged layout: the plugin measures and reports back, React draws the sheets.
  // The controller is created once so a margin change never rebuilds the editor.
  const paginationRef = useRef<PaginationController | null>(null);
  paginationRef.current ??= createPaginationController();
  const pagination = paginationRef.current;
  const [pageLayout, setPageLayout] = useState<PaginationLayout | null>(null);
  const [headerFooterEditing, setHeaderFooterEditing] = useHeaderFooterEditing();
  useEffect(() => {
    pagination.onLayout = setPageLayout;
    return () => {
      pagination.onLayout = null;
    };
  }, [pagination]);
  useEffect(() => {
    const metrics = pageMetricsPx(pageSetup);
    // Mobile is one continuous sheet at full width, so it has no page boundaries to compute.
    pagination.metrics = isMobile ? null : { ...metrics, gap: PAGE_STACK_GAP };
    pagination.refresh();
  }, [pagination, pageSetup, isMobile]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const printTargetRef = useRef<HTMLElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const refs = useMemo<DocEditorRefs>(
    () => ({ scroll: scrollRef, sheet: sheetRef, printTarget: printTargetRef, titleInput: titleInputRef, imageInput: imageInputRef }),
    [],
  );
  const pendingFocus = useRef<number | "start" | "end" | null>(null);

  // Editor handlers are baked into the extensions at creation; they forward to the latest callbacks.
  const latestHandlers = useRef<DocEditorHandlers>({});
  const [handlers] = useState<DocEditorHandlers>(() => ({
    openLinkEditor: () => latestHandlers.current.openLinkEditor?.(),
    addComment: () => latestHandlers.current.addComment?.(),
    activateComment: (threadId) => latestHandlers.current.activateComment?.(threadId),
    uploadImage: (file) => uploadDocImage(file, doc.organizationId),
    notify: (key, tone) => latestHandlers.current.notify?.(key, tone),
  }));

  const keyboard = useVirtualKeyboard();
  const scrollMarginBottom = isMobile && ui.mobileMode === "editing" ? keyboard.inset + 44 + 16 : 0;
  const canEditNow = access.canEdit && !collab.accessLost && ui.fatal === null;

  const editor = useDocEditorInstance({
    ydoc,
    provider,
    canEdit: access.canEdit && !collab.accessLost,
    coarsePointer,
    user: { name: user.name, color: user.color, memberId },
    t,
    handlers,
    pagination,
    onFatal: () => dispatch({ type: "fatal", reason: "schema" }),
    scrollMarginBottom,
    ariaLabel: doc.title || t("docs.untitled"),
  });

  // Caret label follows name changes without rebuilding the editor.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !("updateUser" in editor.commands)) return;
    editor.commands.updateUser({ name: user.name, color: user.color, memberId });
  }, [editor, user.name, user.color, memberId]);

  const editable = !!editor && canEditNow && !previewVersionId && (!isMobile || ui.mobileMode === "editing");
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    if (editable && pendingFocus.current !== null) {
      const target = pendingFocus.current;
      pendingFocus.current = null;
      editor.commands.focus(target);
    }
  }, [editor, editable]);

  // Snapshot serializer for compaction and versions.
  useEffect(() => {
    if (!editor) return;
    provider.setSerializer(() => {
      const plainText = editor.getText();
      return { html: editor.getHTML(), plainText, wordCount: docWordCount(plainText) };
    });
    return () => provider.setSerializer(null);
  }, [editor, provider]);

  // Card excerpt: after 5 s without local edits, at most every 30 s (remote edits never write).
  const excerptRef = useRef(doc.excerpt);
  useLayoutEffect(() => {
    excerptRef.current = doc.excerpt;
  });
  useEffect(() => {
    if (!editor || !canEditNow) return;
    let idleTimer: number | undefined;
    let lastWrite = 0;
    const flush = () => {
      if (editor.isDestroyed) return;
      const wait = EXCERPT_MIN_GAP_MS - (Date.now() - lastWrite);
      if (wait > 0) {
        idleTimer = window.setTimeout(flush, wait);
        return;
      }
      const excerpt = docExcerpt(editor.getText({ blockSeparator: " " }));
      if (excerpt === excerptRef.current) return;
      lastWrite = Date.now();
      excerptRef.current = excerpt;
      updateDocumentMeta(doc.id, { excerpt }).catch(() => {
        // Best effort: compaction also refreshes the excerpt.
      });
    };
    const onUpdate = ({ transaction }: { transaction: Parameters<typeof isChangeOrigin>[0] }) => {
      if (isChangeOrigin(transaction)) return;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(flush, EXCERPT_IDLE_MS);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      window.clearTimeout(idleTimer);
    };
  }, [editor, canEditNow, doc.id]);

  // Losing edit rights while the document is open.
  const hadEdit = useRef(access.canEdit);
  useEffect(() => {
    if (hadEdit.current && !access.canEdit) toast(t("docs.editor.accessChanged"));
    hadEdit.current = access.canEdit;
  }, [access.canEdit, t]);

  // Version preview comes from the URL; its panel is forced open on desktop.
  const setPreviewVersion = useCallback(
    (versionId: string | null) => {
      // Through the surface's opener, not navigateActive: on a device panel
      // there is no bound shell, so navigateActive falls back to the router
      // and tapping a version row threw the whole tablet out of /store into
      // /manager — and selectVersion(null) is the only way back, so there was
      // no return path. This needs no edit right either, so any viewer could
      // trigger it.
      openDocsUrl(documentHref(doc.id, { version: versionId ?? undefined }), "current");
    },
    [openDocsUrl, doc.id],
  );
  const [previewEditor, setPreviewEditor] = useState<Editor | null>(null);
  const contentEditor = previewVersionId ? previewEditor : editor;
  const uiView = useMemo(
    () => (previewVersionId && !isMobile && ui.rightPanel !== "history" ? { ...ui, rightPanel: "history" as const } : ui),
    [previewVersionId, isMobile, ui],
  );

  const versionsEnabled = uiView.rightPanel === "history" || ui.mobilePage === "history" || !!previewVersionId || ui.dialog === "restoreConfirm";
  const { versions } = useDocumentVersions(doc.id, versionsEnabled);
  const findVersion = useCallback((versionId: string) => versions.find((v) => v.id === versionId), [versions]);

  // Comments: one subscription for the whole editor; anchors only while threads are visible.
  const commentsVisible = isMobile ? ui.mobilePage === "comments" : uiView.rightPanel === "comments";
  const threads = useCommentThreads(doc.id, editor, { trackAnchors: commentsVisible || !!threadParam });
  const draftQuote = ui.draftQuote;
  const draft = useMemo<CommentDraft | null>(
    () => (draftQuote === null || !editor ? null : { quote: draftQuote, getRange: () => (editor.isDestroyed ? null : getCommentDraft(editor.state)) }),
    [draftQuote, editor],
  );
  const activeThreadId = ui.activeThreadId;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setActiveComment(activeThreadId);
  }, [editor, activeThreadId]);

  // `?comment=` deep link: jump to the anchor once the thread is known.
  const jumpedTo = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !threadParam || jumpedTo.current === threadParam || !threads.ready) return;
    const thread = threads.threads.find((candidate) => candidate.threadId === threadParam);
    if (!thread) return;
    jumpedTo.current = threadParam;
    // Read the anchor (mark or position) from the editor: position anchors reach the plugin in an effect of this same
    // commit, after `threads` was rendered.
    const anchor = getCommentAnchor(editor.state, thread.threadId);
    if (anchor) editor.chain().setTextSelection(anchor.from).scrollIntoView().run();
  }, [editor, threadParam, threads]);

  // `?new=1`: focus the title (desktop) or the body (mobile editing), then drop the flag from the URL.
  const newHandled = useRef(false);
  useEffect(() => {
    if (!initialNew || newHandled.current || !editor) return;
    newHandled.current = true;
    if (access.canEdit) {
      const input = titleInputRef.current;
      if (!isMobile && input) {
        input.focus();
        input.select();
      } else if (isMobile) {
        editor.commands.focus("end");
      }
    }
    openDocsUrl(
      documentHref(doc.id, { comment: threadParam ?? undefined, version: versionParam ?? undefined }),
      "current",
    );
  }, [initialNew, editor, access.canEdit, isMobile, openDocsUrl, doc.id, threadParam, versionParam]);

  const saveState = useDocSaveState(collab.status, canEditNow);
  const memberName = useCallback((id: string | null) => (id ? (memberNames.get(id) ?? null) : null), [memberNames]);
  const authorName = memberNames.get(memberId) ?? user.name;

  const actions = useDocActions({
    doc,
    access,
    canEditNow,
    editor,
    contentEditor,
    provider,
    ui: uiView,
    dispatch,
    refs,
    pendingFocus,
    t,
    locale,
    pageSetup,
    ydoc,
    isMobile,
    tabActions,
    openDocsUrl,
    storeName: currentOrg?.name ?? null,
    authorName,
    findVersion,
    setPreviewVersion,
    pasteShortcut: shortcutLabel("paste"),
    actingForOther: sender.actingForOther,
  });

  useLayoutEffect(() => {
    latestHandlers.current = {
      openLinkEditor: actions.openLinkEditor,
      addComment: actions.startComment,
      activateComment: (threadId) => {
        if (threadId === null) dispatch({ type: "activateThread", threadId: null });
        else actions.activateThread(threadId);
      },
      notify: (key, tone) => (tone === "error" ? toast.error(t(key)) : toast(t(key))),
    };
  });

  // Shell integration (plan §B7.4).
  useShellChrome({ immersive: isMobile ? ui.mobileMode === "editing" : ui.fullScreen, mobileChrome: "docked" });
  const pageActions = useMemo<readonly PageAction[] | null>(
    () =>
      isMobile
        ? [
            { id: "docs-share", label: t("docs.menu.share"), icon: Share2, onSelect: () => dispatch({ type: "openDialog", dialog: "share" }) },
            { id: "docs-comments", label: t("docs.comments.title"), icon: MessageSquare, onSelect: () => dispatch({ type: "openMobilePage", page: "comments" }) },
            { id: "docs-outline", label: t("docs.outline.title"), icon: ListTree, onSelect: () => dispatch({ type: "openMobilePage", page: "outline" }) },
            { id: "docs-history", label: t("docs.versions.title"), icon: History, onSelect: () => dispatch({ type: "openMobilePage", page: "history" }) },
          ]
        : null,
    [isMobile, t],
  );
  useRegisterPageActions(pageActions);
  const exitEditing = actions.exitEditing;
  useShellBackHandler(() => {
    if (previewVersionId) {
      setPreviewVersion(null);
      return true;
    }
    if (ui.mobileMode === "editing") {
      exitEditing();
      return true;
    }
    return false;
  }, isMobile && (ui.mobileMode === "editing" || !!previewVersionId));

  const value = useMemo<DocEditorContextValue>(
    () => ({
      doc,
      access,
      isStarred,
      memberId: sender.memberId,
      actingForOther: sender.actingForOther,
      editor,
      contentEditor,
      setPreviewEditor,
      collab,
      canEditNow,
      editable,
      ui: uiView,
      dispatch,
      threads,
      draft,
      previewVersionId,
      actions,
      scrollRef,
      sheetRef,
      printTargetRef,
      titleInputRef,
      pageSetup,
      setPageSetup,
      pageLayout,
      headerFooterEditing,
      setHeaderFooterEditing,
      locale,
      isMobile,
      coarsePointer,
      saveState,
      memberName,
      findVersion,
    }),
    [doc, access, isStarred, sender, editor, contentEditor, collab, canEditNow, editable, uiView, threads, draft, previewVersionId, actions, pageSetup, setPageSetup, pageLayout, headerFooterEditing, setHeaderFooterEditing, locale, isMobile, coarsePointer, saveState, memberName, findVersion],
  );

  return (
    <DocEditorContext.Provider value={value}>
      <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background" data-doc-editor="">
        {isMobile ? <MobileDocEditor /> : <DesktopDocEditor />}
      </div>
      <DocShortcuts />
      <PrintPortal />
      <DocDialogs />
      <input
        ref={imageInputRef}
        type="file"
        accept={DOC_IMAGE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) actions.insertImageFromFile(file);
        }}
      />
    </DocEditorContext.Provider>
  );
}
