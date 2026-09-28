// What the Drive lite app offers for one entry (drive-ui §14.4): the rows of its actions drawer, with the
// lite labels, an icon each and the tone of the destructive ones. Also which failure means the store's PIN
// session is gone, so the app can offer to log in again.
//
// Pure (no React). The rows come from driveActionGroups over the entry's own access flags, with the lite
// filter (no new tabs, sharing, stars, "open in app" or selection mode on the devices), so the drawer never
// offers what the module would refuse (CONTRACTS C21).

import {
  ArchiveRestore,
  Download,
  Eye,
  FilePlusCorner,
  FolderInput,
  FolderOpen,
  HardDrive,
  Info,
  Pencil,
  Store,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { driveActionGroups, LITE_ACTION_LABEL, type ActionContext, type DriveAction } from "@/components/drive/model/actions";
import type { DriveEntry } from "@/components/drive/model/types";
import { driveErrorCode } from "@/lib/drive/errors";

export type LiteActionTone = "default" | "primary" | "warn";

export interface LiteActionOption {
  action: DriveAction;
  /** device.lite.drive.* */
  labelKey: string;
  icon: LucideIcon;
  tone: LiteActionTone;
}

const ACTION_ICONS: Readonly<Partial<Record<DriveAction, LucideIcon>>> = {
  open: FolderOpen,
  preview: Eye,
  download: Download,
  openAsDoc: FilePlusCorner,
  openAsSheet: FilePlusCorner,
  openAsSlides: FilePlusCorner,
  rename: Pencil,
  move: FolderInput,
  moveToStore: Store,
  moveToMy: HardDrive,
  details: Info,
  trash: Trash2,
  restore: ArchiveRestore,
  deleteForever: Trash2,
};

function toneOf(action: DriveAction): LiteActionTone {
  if (action === "trash" || action === "deleteForever") return "warn";
  return action === "moveToStore" ? "primary" : "default";
}

/**
 * The drawer rows of `entry`, in menu order (open · change · delete). `moves` says whether moveRoots offers the
 * Store root and the owner's My-files root for it. Actions without a lite label are left out.
 */
export function liteActionOptions(entry: DriveEntry, ctx: ActionContext, moves: { toStore: boolean; toMy: boolean }): LiteActionOption[] {
  return driveActionGroups(entry, ctx, moves).flat().flatMap((action): LiteActionOption[] => {
    const labelKey = LITE_ACTION_LABEL[action];
    const icon = ACTION_ICONS[action];
    return labelKey && icon ? [{ action, labelKey, icon, tone: toneOf(action) }] : [];
  });
}

/**
 * A write refused with `[drive.operator]`: the tablet's PIN session for this person is missing or too old
 * (spacetimedb/src/drive/context.ts). Also read through a DriveEditorError, which keeps the reducer's error as its
 * cause.
 */
export function isOperatorError(err: unknown): boolean {
  if (driveErrorCode(err) === "operator") return true;
  const cause = err instanceof Error ? err.cause : undefined;
  return cause !== undefined && cause !== null && driveErrorCode(cause) === "operator";
}
