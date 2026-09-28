"use client";

// What the preview hands to its caller and what it does itself: the action wiring shared by the
// preview sheet, its body and the "Stored in apps" view, the signed-URL loader of the person
// using Drive, and "Open" (the file outside the app, when it can't be shown here).
//
// Opening may need a new window, which the web allows only inside the click's user activation,
// so openEntryOutside starts synchronously: call it straight from the click handler.

import { useCallback } from "react";
import { toast } from "sonner";
import { driveErrorToastKey } from "@/components/drive/model/errors";
import type { ActionContext, DriveAction } from "@/components/drive/model/actions";
import type { DriveDocKind, DriveEntry, FileEntry, VirtualEntry } from "@/components/drive/model/types";
import { openExternal } from "@/lib/browser-shell/mobile/share";
import { useDriveActorOverride } from "@/lib/drive/actor-context";
import { openDriveItem } from "@/lib/drive/download";
import { sharedDriveUrlLoader, type DriveUrlLoader } from "@/lib/drive/url-loader";
import { useDriveTokenBridge } from "@/lib/drive/use-drive-token";
import { useT } from "@/lib/i18n/context";
import { getNativeShell, isNativeShell } from "@/lib/native-shell";

/** The manager's per-entry action runner, as the list uses it (components/drive/actions/use-drive-actions.ts). */
export interface DriveEntryActions {
  ctx: ActionContext;
  /** moveRoots(...) for the entry: whether the Store root and the owner's My-files root are offered. */
  moveFor(entry: DriveEntry): { toStore: boolean; toMy: boolean };
  /** Runs one action. "download" must start synchronously (downloadEntries straight from the click). */
  onAction(entry: DriveEntry, action: DriveAction): void;
  /** Whether an action on this entry is running (its buttons are then disabled), and which one. */
  runningFor?(entry: DriveEntry): DriveAction | null;
}

/** The actions of the one entry a preview body shows. */
export interface PreviewEntryActions {
  /** driveActionGroups(entry, …).flat(): the body offers Download and "Open as …" only when listed here. */
  available: readonly DriveAction[];
  onAction(action: DriveAction): void;
  /** The action running on the entry ("Open as …" then reads "Opening…"); every button is disabled meanwhile. */
  running?: DriveAction | null;
}

export const OPEN_AS_ACTIONS: Readonly<Record<DriveDocKind, DriveAction>> = {
  doc: "openAsDoc",
  sheet: "openAsSheet",
  slides: "openAsSlides",
};

/** The "Open as …" action offered for the entry, if any (a file imports into one editor at most). */
export function openAsActionOf(available: readonly DriveAction[]): { action: DriveAction; kind: DriveDocKind } | null {
  for (const kind of ["doc", "sheet", "slides"] as const) {
    if (available.includes(OPEN_AS_ACTIONS[kind])) return { action: OPEN_AS_ACTIONS[kind], kind };
  }
  return null;
}

/** The signed-URL loader of the person using Drive: the PIN operator inside a /store panel, the caller elsewhere. */
export function usePreviewLoader(): DriveUrlLoader {
  useDriveTokenBridge();
  return sharedDriveUrlLoader(useDriveActorOverride()?.actingMemberId ?? "");
}

/**
 * Opens the entry outside the app: an uploaded file through a signed URL (a new window on the web, the system
 * browser in the apps), a link kept by another app as it is. Starts synchronously; call it from the gesture.
 */
export function openEntryOutside(entry: FileEntry | VirtualEntry, loader: DriveUrlLoader): Promise<"opened" | "blocked"> {
  if (entry.type === "file") {
    return openDriveItem({ id: entry.id, name: entry.name, sizeBytes: entry.sizeBytes, mimeType: entry.mimeType }, loader);
  }
  const shell = isNativeShell() ? getNativeShell() : null;
  const opened = shell ? shell.openExternalAuth(entry.url) : openExternal(entry.url);
  return opened.then(() => "opened" as const);
}

/** "Open" with its outcome as a toast: a blocked window asks for another click, a failure says why. */
export function useOpenOutside(): (entry: FileEntry | VirtualEntry) => void {
  const t = useT();
  const loader = usePreviewLoader();
  return useCallback(
    (entry: FileEntry | VirtualEntry) => {
      openEntryOutside(entry, loader)
        .then((result) => {
          if (result === "blocked") toast.error(t("drive.preview.openBlocked"));
        })
        .catch((err: unknown) => {
          toast.error(t(driveErrorToastKey(err, "drive.preview.failed")));
        });
    },
    [loader, t],
  );
}
