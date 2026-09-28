// Drive UI model: which actions an entry's menu offers (the manager's dropdown and context
// menu, the lite drawer) and which a multi-selection offers.
//
// Pure (no React). Everything is read off the entry's access flags (./entries), so a menu
// never offers what the module would refuse: trash, restore, delete forever and the space
// shortcuts need manager, rename and moves editor (CONTRACTS C21). The device apps are lite:
// no new tabs, sharing, stars or selection mode there.

import { importTargetOf } from "@/lib/drive/file-kinds";
import type { DriveSurface } from "@/lib/drive/types";
import type { DriveEntry, DriveSection } from "./types";

export type DriveAction =
  | "open" | "openNewTab" | "preview" | "download" | "openAsDoc" | "openAsSheet" | "openAsSlides"
  | "rename" | "move" | "moveToStore" | "moveToMy" | "share" | "star" | "unstar" | "details"
  | "openOriginal" | "select" | "trash" | "restore" | "deleteForever";

export interface ActionContext {
  surface: DriveSurface;
  /** The Docs app is installed: text documents open, and files can be opened as a Doc. */
  docsInstalled: boolean;
  section: DriveSection;
  /** No SpacetimeDB connection: nothing that writes is offered. */
  offline: boolean;
  /** Touch input on the manager page: offer "Select" to enter selection mode. */
  touch?: boolean;
}

/** Actions that change something (dropped while offline). Opening a file as a Doc/Sheet/Slides creates one. */
const WRITE_ACTIONS: ReadonlySet<DriveAction> = new Set<DriveAction>([
  "rename", "move", "moveToStore", "moveToMy", "star", "unstar", "trash", "restore", "deleteForever",
  "openAsDoc", "openAsSheet", "openAsSlides",
]);

/** Manager-only actions: the device apps have no tabs, share pane, Starred view or selection mode. */
const MANAGER_ONLY: ReadonlySet<DriveAction> = new Set<DriveAction>(["openNewTab", "openOriginal", "share", "star", "unstar", "select"]);

const OPEN_AS: Readonly<Record<"doc" | "sheet" | "slides", DriveAction>> = { doc: "openAsDoc", sheet: "openAsSheet", slides: "openAsSlides" };

/** Opening: a text document needs the Docs app; Sheets and Slides open in Drive's own editors. */
function openGroup(entry: DriveEntry, ctx: ActionContext): DriveAction[] {
  const a = entry.access;
  switch (entry.type) {
    case "folder":
      return a.canOpen ? ["open", "openNewTab"] : [];
    case "doc":
    case "sheet":
    case "slides":
      return a.canOpen && (entry.type !== "doc" || ctx.docsInstalled) ? ["open", "openNewTab"] : [];
    case "file": {
      const out: DriveAction[] = [];
      if (a.canOpen) out.push("preview");
      if (a.canDownload) out.push("download");
      const into = a.canOpen ? importTargetOf(entry.mimeType, entry.name) : null;
      if (into && (into !== "doc" || ctx.docsInstalled)) out.push(OPEN_AS[into]);
      return out;
    }
    case "virtual": {
      const out: DriveAction[] = [];
      if (a.canOpen) out.push("preview");
      if (a.canDownload) out.push("download");
      if (entry.originRoute) out.push("openOriginal");
      return out;
    }
  }
}

/** Where a trashed entry can still be looked at: files preview, documents open read-only; folders not at all. */
function trashedOpen(entry: DriveEntry, ctx: ActionContext): DriveAction[] {
  if (!entry.access.canOpen) return [];
  if (entry.type === "file") return ["preview"];
  if (entry.type === "doc" || entry.type === "sheet" || entry.type === "slides") {
    return entry.type !== "doc" || ctx.docsInstalled ? ["open"] : [];
  }
  return [];
}

/**
 * The menu of one entry: open · edit · destructive, empty groups dropped. `move` says whether moveRoots offers
 * the Store root and the owner's My-files root; the shortcuts show only for an entry at the root of the other
 * space. Trashed entries offer a look plus restore / delete forever.
 */
export function driveActionGroups(entry: DriveEntry, ctx: ActionContext, move: { toStore: boolean; toMy: boolean }): DriveAction[][] {
  const a = entry.access;
  let groups: DriveAction[][];
  if (entry.trashedAt !== null) {
    const destructive: DriveAction[] = [];
    if (a.canRestore) destructive.push("restore");
    if (a.canDeleteForever) destructive.push("deleteForever");
    groups = [trashedOpen(entry, ctx), destructive];
  } else {
    const edit: DriveAction[] = [];
    if (a.canRename) edit.push("rename");
    if (a.canMove) edit.push("move");
    const atRoot = entry.location !== null && entry.location.parentId === "";
    if (a.canMove && atRoot && entry.location?.space === "my" && move.toStore) edit.push("moveToStore");
    if (a.canMove && atRoot && entry.location?.space === "store" && move.toMy) edit.push("moveToMy");
    if (a.canShare) edit.push("share");
    if (a.canStar) edit.push(entry.starred ? "unstar" : "star");
    edit.push("details");
    if (ctx.touch) edit.push("select");
    groups = [openGroup(entry, ctx), edit, a.canTrash ? ["trash"] : []];
  }
  const lite = ctx.surface !== "manager";
  return groups
    .map((group) => group.filter((action) => !(lite && MANAGER_ONLY.has(action)) && !(ctx.offline && WRITE_ACTIONS.has(action))))
    .filter((group) => group.length > 0);
}

export type DriveBulkAction = "move" | "download" | "trash" | "restore" | "deleteForever";

/** What a multi-selection offers: each action only when every selected entry allows it. */
export function driveBulkActions(entries: readonly DriveEntry[], section: DriveSection): DriveBulkAction[] {
  if (entries.length === 0) return [];
  const every = (test: (entry: DriveEntry) => boolean) => entries.every(test);
  if (section === "trash") {
    const out: DriveBulkAction[] = [];
    if (every((e) => e.access.canRestore)) out.push("restore");
    if (every((e) => e.access.canDeleteForever)) out.push("deleteForever");
    return out;
  }
  const out: DriveBulkAction[] = [];
  if (every((e) => e.type !== "virtual" && e.access.canMove)) out.push("move");
  if (every((e) => (e.type === "file" || e.type === "virtual") && e.access.canDownload)) out.push("download");
  if (every((e) => e.access.canTrash)) out.push("trash");
  return out;
}

/** Lite drawer labels; explicit so "trash" reads "Delete" there, not the manager's "Move to trash". */
export const LITE_ACTION_LABEL: Readonly<Partial<Record<DriveAction, string>>> = {
  open: "device.lite.drive.open",
  preview: "device.lite.drive.preview",
  download: "device.lite.drive.download",
  openAsDoc: "device.lite.drive.openAsDoc",
  openAsSheet: "device.lite.drive.openAsSheet",
  openAsSlides: "device.lite.drive.openAsSlides",
  rename: "device.lite.drive.rename",
  move: "device.lite.drive.move",
  moveToStore: "device.lite.drive.moveToStore",
  moveToMy: "device.lite.drive.moveToMy",
  details: "device.lite.drive.details",
  trash: "device.lite.drive.trashItem",
  restore: "device.lite.drive.restore",
  deleteForever: "device.lite.drive.deleteForever",
};

