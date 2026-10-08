"use client";

// What every screen and drawer of the Drive lite app reads from its router (lite-router.tsx): the data and
// writes (use-lite-drive.ts), how to move between screens, which drawer to open and what an action does
// (use-lite-runner.ts). One context instead of props through every screen. The home screen owns its upload
// pickers and its New drawer itself.

import { createContext, useContext } from "react";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import type { DriveAction } from "@/components/drive/model/actions";
import type { DriveDocKind, DriveEntry, DriveMoveTarget } from "@/components/drive/model/types";
import type { MovePlan } from "@/components/drive/model/move";
import type { EditorKind } from "@/lib/device-apps";
import type { LiteDriveScreen, LiteTab } from "./lite-state";
import type { LiteDrive } from "./use-lite-drive";

export type LitePanelKind = "actions" | "details" | "name" | "move" | "confirm" | "space" | "notice" | "install" | "templates";
/** The drawers that show a value of their own (LitePanelState keeps it under the same name). */
export type LiteValuePanel = Exclude<LitePanelKind, "notice">;

export interface LiteNameTarget {
  mode: "newFolder" | "rename";
  /** rename: the entry renamed. */
  entry: DriveEntry | null;
  /** newFolder: where the folder goes. */
  target: DriveMoveTarget | null;
  initialName: string;
  kind: "folder" | "file" | DriveDocKind;
}

/** A file whose editor plugin is missing: download it, then `then` (open the editor, create, open as). */
export interface LiteInstallRequest {
  kind: EditorKind;
  mode: "open" | "create";
  then: () => void;
}

export interface LiteConfirm {
  action: "trash" | "deleteForever";
  entry: DriveEntry;
}

/** The drawer on screen, and the last value of each (kept while it slides away). */
export interface LitePanelState {
  open: LitePanelKind | null;
  actions: DriveEntry | null;
  details: DriveEntry | null;
  name: LiteNameTarget | null;
  move: readonly DriveEntry[];
  confirm: LiteConfirm | null;
  space: MovePlan | null;
  install: LiteInstallRequest | null;
  /** Where a Doc from a template goes (lite-template-drawer.tsx). */
  templates: DriveMoveTarget | null;
}

export const NO_PANEL: LitePanelState = {
  open: null,
  actions: null,
  details: null,
  name: null,
  move: [],
  confirm: null,
  space: null,
  install: null,
  templates: null,
};

export interface LiteNav {
  /** The screen on top. */
  top: LiteDriveScreen;
  /** The screen under it (where Back goes); null on the first screen. */
  below: LiteDriveScreen | null;
  /** Opens a screen on top (nothing when that screen is on top already). */
  push(screen: LiteDriveScreen): void;
  /** Back one screen. */
  pop(): void;
  /** Back from `screen` only while it is still on top (for a write that resolves late). */
  popIfTop(screen: LiteDriveScreen): void;
  /** Changes the screen on top (a typed search). */
  replaceTop(screen: LiteDriveScreen): void;
  /** Shows a tab's root, as the first screen. */
  setTab(tab: LiteTab): void;
  /** The panel's opener (what the Docs, Sheets and Slides screens call). */
  openUrl: DocsOpenUrl;
}

export interface LitePanels {
  state: LitePanelState;
  openActions(entry: DriveEntry): void;
  openDetails(entry: DriveEntry): void;
  openName(target: LiteNameTarget): void;
  openMove(entries: readonly DriveEntry[]): void;
  openConfirm(confirm: LiteConfirm): void;
  openSpaceChange(plan: MovePlan): void;
  openNotice(): void;
  /** The download prompt in front of an editor whose plugin is missing (lite-install-drawer.tsx). */
  openInstall(request: LiteInstallRequest): void;
  /** New ▸ Doc from a template: the store templates, for a Doc created in `target`. */
  openTemplates(target: DriveMoveTarget): void;
  close(): void;
  /**
   * Closes `kind` only while it is still open showing `value` (the same object it was opened with): a write that
   * resolves late never closes a drawer opened since.
   */
  closeIf<K extends LiteValuePanel>(kind: K, value: LitePanelState[K]): void;
}

export interface LiteDriveContextValue {
  drive: LiteDrive;
  nav: LiteNav;
  panels: LitePanels;
  /** Runs one drawer or button action on an entry (use-lite-runner.ts). */
  act(entry: DriveEntry, action: DriveAction): void;
  /** A tap on an entry: a folder opens, a file previews, a document opens its editor. */
  openEntry(entry: DriveEntry): void;
}

const LiteDriveContext = createContext<LiteDriveContextValue | null>(null);
LiteDriveContext.displayName = "LiteDriveContext";

export const LiteDriveProvider = LiteDriveContext.Provider;

/** The router's value; the lite screens render only under DriveLiteRouter. */
export function useLiteDriveContext(): LiteDriveContextValue {
  const value = useContext(LiteDriveContext);
  if (!value) throw new Error("useLiteDriveContext must be used inside DriveLiteRouter");
  return value;
}
