"use client";

/**
 * Editor UI state and context (docs-editor-ui spec §4.3). One `DocEditorContext` per mounted editor session; the
 * desktop and mobile layouts, menubar, toolbar and dialogs read it through `useDocEditor()`.
 *
 * Per-viewer preferences (outline open, zoom, word-count chip) persist in localStorage, read in try/catch.
 */
import { createContext, useContext, type Dispatch, type RefObject } from "react";
import type { Editor } from "@tiptap/core";

import type { DocAccess, DocVersion, DocumentMeta } from "@/lib/docs/types";
import type { DocZoom } from "@/lib/docs/fonts";
import type { DocPageSetup } from "@/lib/docs/page-setup";
import type { PaginationLayout } from "@/lib/docs/pagination/measure";
import type { CommentDraft, CommentThreadsState, CommentsFilter } from "@/lib/docs/use-comment-threads";
import type { DocumentCollaboration } from "@/lib/docs/use-document-collaboration";
import type { HeaderFooterTarget } from "./header-footer-layer";
import type { DocEditorActions } from "./use-doc-actions";
import type { DocSaveState } from "./use-save-state";

export type DocRightPanel = "none" | "comments" | "history";
export type DocDialog =
  | "share"
  | "wordCount"
  | "nameVersion"
  | "import"
  | "open"
  | "restoreConfirm"
  | "imageUrl"
  | "insertDate"
  | "rename"
  | "pageSetup";
export type DocMobilePage = "comments" | "outline" | "history";
export type DocMobileSheet = "format" | "actions" | "insert" | "download" | "link" | "table";
export type DocMobileMode = "reading" | "editing";

export interface DocEditorUiState {
  readonly outlineOpen: boolean;
  readonly rightPanel: DocRightPanel;
  readonly commentsFilter: CommentsFilter;
  readonly activeThreadId: string | null;
  /** Quote of the in-progress new comment; its range lives in the comment-mark plugin. */
  readonly draftQuote: string | null;
  readonly find: { readonly open: boolean; readonly withReplace: boolean; readonly focusRequest: number };
  readonly zoom: DocZoom;
  readonly showRuler: boolean;
  readonly fullScreen: boolean;
  readonly dialog: DocDialog | null;
  /** Version awaiting restore confirmation. */
  readonly restoreVersionId: string | null;
  /** Desktop link editor popover. */
  readonly linkEditorOpen: boolean;
  readonly mobileMode: DocMobileMode;
  readonly mobilePage: DocMobilePage | null;
  readonly mobileSheet: DocMobileSheet | null;
  readonly showWordCount: boolean;
  readonly fatal: "schema" | null;
}

export type DocEditorUiAction =
  | { type: "setOutline"; open: boolean }
  | { type: "openPanel"; panel: "comments" | "history" }
  | { type: "closePanel" }
  | { type: "setCommentsFilter"; filter: CommentsFilter }
  | { type: "activateThread"; threadId: string | null }
  | { type: "startDraft"; quote: string }
  | { type: "endDraft" }
  | { type: "openFind"; withReplace: boolean }
  | { type: "setFindReplace"; withReplace: boolean }
  | { type: "closeFind" }
  | { type: "setZoom"; zoom: DocZoom }
  | { type: "setShowRuler"; show: boolean }
  | { type: "setFullScreen"; on: boolean }
  | { type: "openDialog"; dialog: DocDialog }
  | { type: "closeDialog" }
  | { type: "requestRestore"; versionId: string }
  | { type: "setLinkEditor"; open: boolean }
  | { type: "setMobileMode"; mode: DocMobileMode }
  | { type: "openMobilePage"; page: DocMobilePage }
  | { type: "closeMobilePage" }
  | { type: "openMobileSheet"; sheet: DocMobileSheet }
  | { type: "closeMobileSheet" }
  | { type: "setShowWordCount"; show: boolean }
  | { type: "fatal"; reason: "schema" };

const PREF_OUTLINE = "docs_outline_open";
const PREF_ZOOM = "docs_zoom";
const PREF_WORD_COUNT = "docs_show_wordcount";
const PREF_RULER = "docs_show_ruler";

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDocPrefs(ui: Pick<DocEditorUiState, "outlineOpen" | "zoom" | "showWordCount" | "showRuler">): void {
  try {
    window.localStorage.setItem(PREF_OUTLINE, ui.outlineOpen ? "1" : "0");
    window.localStorage.setItem(PREF_ZOOM, String(ui.zoom));
    window.localStorage.setItem(PREF_WORD_COUNT, ui.showWordCount ? "1" : "0");
    window.localStorage.setItem(PREF_RULER, ui.showRuler ? "1" : "0");
  } catch {
    // Storage blocked (private mode, quota): preferences just don't persist.
  }
}

function readZoom(): DocZoom {
  const raw = readPref(PREF_ZOOM);
  if (raw === "fit") return "fit";
  const n = Number(raw);
  return Number.isFinite(n) && n >= 50 && n <= 200 ? n : 100;
}

export interface DocEditorUiInit {
  /** Mobile + just created + can edit: open straight into editing (spec §7.1). */
  readonly startEditing: boolean;
  /** `?comment=` deep link. */
  readonly threadId: string | null;
  readonly isMobile: boolean;
}

export function initDocEditorUiState(init: DocEditorUiInit): DocEditorUiState {
  return {
    outlineOpen: readPref(PREF_OUTLINE) === "1",
    rightPanel: init.threadId && !init.isMobile ? "comments" : "none",
    commentsFilter: "open",
    activeThreadId: init.threadId,
    draftQuote: null,
    find: { open: false, withReplace: false, focusRequest: 0 },
    zoom: readZoom(),
    // The ruler is on unless the member turned it off (it is how margins and indents are set by hand).
    showRuler: readPref(PREF_RULER) !== "0",
    fullScreen: false,
    dialog: null,
    restoreVersionId: null,
    linkEditorOpen: false,
    mobileMode: init.startEditing ? "editing" : "reading",
    mobilePage: init.threadId && init.isMobile ? "comments" : null,
    mobileSheet: null,
    showWordCount: readPref(PREF_WORD_COUNT) === "1",
    fatal: null,
  };
}

export function docEditorUiReducer(state: DocEditorUiState, action: DocEditorUiAction): DocEditorUiState {
  switch (action.type) {
    case "setOutline":
      return state.outlineOpen === action.open ? state : { ...state, outlineOpen: action.open };
    case "openPanel":
      return { ...state, rightPanel: action.panel };
    case "closePanel":
      return { ...state, rightPanel: "none" };
    case "setCommentsFilter":
      return { ...state, commentsFilter: action.filter };
    case "activateThread":
      return { ...state, activeThreadId: action.threadId };
    case "startDraft":
      return { ...state, draftQuote: action.quote };
    case "endDraft":
      return state.draftQuote === null ? state : { ...state, draftQuote: null };
    case "openFind":
      return {
        ...state,
        find: { open: true, withReplace: action.withReplace || (state.find.open && state.find.withReplace), focusRequest: state.find.focusRequest + 1 },
      };
    case "setFindReplace":
      return { ...state, find: { ...state.find, withReplace: action.withReplace } };
    case "closeFind":
      return state.find.open ? { ...state, find: { ...state.find, open: false, withReplace: false } } : state;
    case "setZoom":
      return { ...state, zoom: action.zoom };
    case "setShowRuler":
      return state.showRuler === action.show ? state : { ...state, showRuler: action.show };
    case "setFullScreen":
      return state.fullScreen === action.on ? state : { ...state, fullScreen: action.on };
    case "openDialog":
      return { ...state, dialog: action.dialog };
    case "closeDialog":
      return state.dialog === null ? state : { ...state, dialog: null, restoreVersionId: state.dialog === "restoreConfirm" ? null : state.restoreVersionId };
    case "requestRestore":
      return { ...state, dialog: "restoreConfirm", restoreVersionId: action.versionId };
    case "setLinkEditor":
      return state.linkEditorOpen === action.open ? state : { ...state, linkEditorOpen: action.open };
    case "setMobileMode":
      return state.mobileMode === action.mode ? state : { ...state, mobileMode: action.mode, mobileSheet: action.mode === "reading" && state.mobileSheet === "format" ? null : state.mobileSheet };
    case "openMobilePage":
      return { ...state, mobilePage: action.page, mobileSheet: null };
    case "closeMobilePage":
      return state.mobilePage === null ? state : { ...state, mobilePage: null };
    case "openMobileSheet":
      return { ...state, mobileSheet: action.sheet };
    case "closeMobileSheet":
      return state.mobileSheet === null ? state : { ...state, mobileSheet: null };
    case "setShowWordCount":
      return { ...state, showWordCount: action.show };
    case "fatal":
      return { ...state, fatal: action.reason, mobileMode: "reading" };
    default:
      return state;
  }
}

export interface DocEditorRefs {
  /** Canvas scroll container (desktop DocCanvas / mobile canvas). */
  readonly scroll: RefObject<HTMLDivElement | null>;
  /** The `.doc-page` sheet. */
  readonly sheet: RefObject<HTMLDivElement | null>;
  /** `<article>` inside the print portal (print + jsPDF fallback). */
  readonly printTarget: RefObject<HTMLElement | null>;
  /** Desktop title input. */
  readonly titleInput: RefObject<HTMLInputElement | null>;
  /** Hidden image file input. */
  readonly imageInput: RefObject<HTMLInputElement | null>;
}

export interface DocEditorContextValue {
  readonly doc: DocumentMeta;
  readonly access: DocAccess;
  readonly isStarred: boolean;
  /**
   * Who this person's comments, versions and edits are recorded as, for "mine" checks (edit or delete my comment,
   * delete my version, "last edit by you"): useDocsSender().memberId — on /store the tablet account, which the Docs
   * reducers record and check, not the PIN operator.
   */
  readonly memberId: string | null;
  /** On /store the operator is not the tablet account: star and "Make a copy" are not offered. */
  readonly actingForOther: boolean;
  /** Live collaborative editor (null until created). */
  readonly editor: Editor | null;
  /** Editor whose content export, print and word count use: the version preview while previewing. */
  readonly contentEditor: Editor | null;
  readonly setPreviewEditor: (editor: Editor | null) => void;
  readonly collab: DocumentCollaboration;
  /** access.canEdit, minus access lost and schema errors. */
  readonly canEditNow: boolean;
  /** Whether the live editor currently accepts input. */
  readonly editable: boolean;
  readonly ui: DocEditorUiState;
  readonly dispatch: Dispatch<DocEditorUiAction>;
  readonly threads: CommentThreadsState;
  readonly draft: CommentDraft | null;
  /** `?version=` — the version being previewed, or null. */
  readonly previewVersionId: string | null;
  readonly actions: DocEditorActions;
  /** Canvas scroll container (desktop DocCanvas / mobile canvas). */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** The `.doc-page` sheet. */
  readonly sheetRef: RefObject<HTMLDivElement | null>;
  /** `<article>` inside the print portal (print + jsPDF fallback). */
  readonly printTargetRef: RefObject<HTMLElement | null>;
  /** Desktop title input. */
  readonly titleInputRef: RefObject<HTMLInputElement | null>;
  /** Paper size, orientation, margins and header/footer distances, shared through the Y.Doc. */
  readonly pageSetup: DocPageSetup;
  readonly setPageSetup: (next: DocPageSetup) => void;
  /** Page rectangles from the pagination plugin; null on mobile and before the first measurement. */
  readonly pageLayout: PaginationLayout | null;
  /** The header or footer box being edited in place, or null. */
  readonly headerFooterEditing: HeaderFooterTarget | null;
  readonly setHeaderFooterEditing: (next: HeaderFooterTarget | null) => void;
  readonly locale: string;
  readonly isMobile: boolean;
  readonly coarsePointer: boolean;
  readonly saveState: { readonly state: DocSaveState; readonly showLabel: boolean };
  /** Display name of an org member id, or null when unknown. */
  readonly memberName: (memberId: string | null) => string | null;
  /** A saved version row (loaded while history, preview or restore is active). */
  readonly findVersion: (versionId: string) => DocVersion | undefined;
}

export const DocEditorContext = createContext<DocEditorContextValue | null>(null);

export function useDocEditor(): DocEditorContextValue {
  const value = useContext(DocEditorContext);
  if (!value) throw new Error("useDocEditor must be used inside DocEditorContext");
  return value;
}
