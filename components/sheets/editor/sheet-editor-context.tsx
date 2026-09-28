"use client";

// What every piece of the spreadsheet editor chrome reads (sheets.md §10.1): the document, the route's access, the
// session facade, the grid's handle, the UI state and the actions. Components get the facade only; they never open
// subscriptions or touch the connection (lib/sheets/use-sheet-session.ts).

import { createContext, useContext, type Dispatch, type RefObject } from "react";
import type { IWorkbookData } from "@univerjs/presets";
import type { DriveActor } from "@/components/drive/drive-actor";
import type { DocSaveState } from "@/components/docs/editor/use-save-state";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import type { SheetSessionFacade } from "@/lib/sheets/use-sheet-session";
import type { SheetLossyItem } from "@/lib/sheets/types";
import type { SheetActions } from "./use-sheet-actions";

/** The mounted grid (components/sheets/editor/univer-host.tsx); null while Univer (re)mounts. */
export interface SheetHostHandle {
  undo(): void;
  redo(): void;
  /** The live workbook with shared formulas expanded (xlsx export). Throws while nothing is loaded. */
  exportWorkbook(): IWorkbookData;
  /** The active sheet's displayed values as injection-safe CSV, or null when there is no sheet. */
  activeSheetCsv(): { sheetName: string; csv: string } | null;
  /** Shows a decoded, sanitized version read-only over the live sheet (replaces an earlier preview). */
  showPreview(wb: IWorkbookData): void;
  hidePreview(): void;
}

export type SheetDialog = "share" | "import" | "nameVersion" | "rename" | null;

export interface SheetUiState {
  dialog: SheetDialog;
  /** Version history: the side panel (desktop) or its page (phone). */
  historyOpen: boolean;
  /** The phone's "More" drawer. */
  mobileActions: boolean;
  /** The version shown read-only over the sheet (`?version=` on /manager). */
  previewVersionId: string | null;
  /** The version the restore confirmation is about. */
  restoreVersionId: string | null;
  /** A lossy report waiting for Continue / Cancel. */
  lossy: { kind: "import" | "export"; items: SheetLossyItem[] } | null;
}

export type SheetUiAction =
  | { type: "openDialog"; dialog: Exclude<SheetDialog, null> }
  | { type: "closeDialog" }
  /** Closing ends the preview too, unless `keepPreview` (the phone closes its history page to show a version). */
  | { type: "setHistory"; open: boolean; keepPreview?: boolean }
  | { type: "setMobileActions"; open: boolean }
  | { type: "preview"; versionId: string | null }
  | { type: "askRestore"; versionId: string | null }
  | { type: "showLossy"; kind: "import" | "export"; items: SheetLossyItem[] }
  | { type: "closeLossy" };

/** `?version=` opens on that version: beside the history panel on a desktop, full width on a phone. */
export function initSheetUiState(init: { previewVersionId: string | null; mobile: boolean }): SheetUiState {
  const { previewVersionId } = init;
  return {
    dialog: null,
    historyOpen: previewVersionId !== null && !init.mobile,
    mobileActions: false,
    previewVersionId,
    restoreVersionId: null,
    lossy: null,
  };
}

export function sheetUiReducer(state: SheetUiState, action: SheetUiAction): SheetUiState {
  switch (action.type) {
    case "openDialog":
      return { ...state, dialog: action.dialog, mobileActions: false };
    case "closeDialog":
      return state.dialog === null ? state : { ...state, dialog: null };
    case "setHistory":
      return {
        ...state,
        historyOpen: action.open,
        mobileActions: false,
        previewVersionId: action.open || action.keepPreview ? state.previewVersionId : null,
      };
    case "setMobileActions":
      return state.mobileActions === action.open ? state : { ...state, mobileActions: action.open };
    case "preview":
      return state.previewVersionId === action.versionId ? state : { ...state, previewVersionId: action.versionId };
    case "askRestore":
      return { ...state, restoreVersionId: action.versionId };
    case "showLossy":
      return { ...state, lossy: { kind: action.kind, items: action.items } };
    case "closeLossy":
      return state.lossy === null ? state : { ...state, lossy: null };
  }
}

export interface SheetEditorContextValue {
  doc: DocumentMeta;
  /** The route's access (the device ceiling already applied). */
  access: DocAccess;
  isStarred: boolean;
  facade: SheetSessionFacade;
  actor: DriveActor;
  /** Our chrome's phone layout (a narrow screen, or a device panel). */
  mobile: boolean;
  /** Rendered inside a device panel (no URL of its own). */
  panel: boolean;
  /** This session holds the lease. */
  editing: boolean;
  host: SheetHostHandle | null;
  ui: SheetUiState;
  dispatch: Dispatch<SheetUiAction>;
  actions: SheetActions;
  saveState: { state: DocSaveState; showLabel: boolean };
  memberName(id: string | null): string | null;
  titleInputRef: RefObject<HTMLInputElement | null>;
}

export const SheetEditorContext = createContext<SheetEditorContextValue | null>(null);
SheetEditorContext.displayName = "SheetEditorContext";

export function useSheetEditor(): SheetEditorContextValue {
  const value = useContext(SheetEditorContext);
  if (!value) throw new Error("useSheetEditor must be used inside the spreadsheet editor");
  return value;
}
