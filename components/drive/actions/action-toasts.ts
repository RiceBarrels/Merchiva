// What the Drive manager page tells the person after a write or a download (drive-ui §7.7, §8.3).
// No React: toasts through sonner, copy through the caller's `t`.
//
// Downloads start inside the click that asked for them: downloadEntries opens its first window
// synchronously, and the web allows a new window only within the click's user activation. So
// startDownload must be called straight from the gesture handler, and every "Save next" and
// "Retry" toast action calls it (or downloadEntries) directly from its own onClick.

import { toast } from "sonner";
import { downloadEntries, type DownloadDeps, type DownloadableEntry, type DownloadEntriesResult } from "@/components/drive/download";
import { DRIVE_NATIVE_MULTI_MAX } from "@/components/drive/model/download-plan";
import { driveErrorToastKey } from "@/components/drive/model/errors";
import type { DriveMoveTarget, DriveSection } from "@/components/drive/model/types";
import { fmt } from "@/lib/i18n/fmt";
import { driveWriteErrorKey, type DriveWriteResult } from "./drive-writes";

type Translate = (key: string) => string;

/** How long a "Save next" offer stays: it waits for a click per file. */
const OFFER_DURATION_MS = 60_000;

const DOWNLOAD_FAILED_KEY = "drive.home.errors.downloadFailed";

/**
 * Saves `entries` and says how it went (see the file comment): one file directly, several as a zip or one by one.
 * Call it straight from the gesture handler, before any await. Never rejects.
 */
export function startDownload(entries: readonly DownloadableEntry[], deps: DownloadDeps, t: Translate): Promise<void> {
  let run: Promise<DownloadEntriesResult>;
  try {
    run = downloadEntries(entries, deps);
  } catch (err) {
    toast.error(t(driveErrorToastKey(err, DOWNLOAD_FAILED_KEY)));
    return Promise.resolve();
  }
  return run.then(
    (result) => announceDownload(result, entries, deps, t),
    (err: unknown) => {
      toast.error(t(driveErrorToastKey(err, DOWNLOAD_FAILED_KEY)));
    },
  );
}

/** The toast for a download result. `partial` offers the files left, one click each. */
export function announceDownload(result: DownloadEntriesResult, entries: readonly DownloadableEntry[], deps: DownloadDeps, t: Translate): void {
  if (typeof result === "object") {
    if (result.error !== undefined) toast.error(t(driveErrorToastKey(result.error, DOWNLOAD_FAILED_KEY)));
    offerRemaining(result.remaining, result.saved, result.total, deps, t);
    return;
  }
  switch (result) {
    case "sequential":
      toast(t("drive.home.downloadMany"));
      return;
    case "refused":
      toast.error(fmt(t("drive.home.downloadNativeLimit"), { max: DRIVE_NATIVE_MULTI_MAX }));
      return;
    case "blocked":
      // Only ever one file; a new click is allowed to open its window.
      toast.error(t("drive.home.downloadBlocked"), {
        action: { label: t("drive.upload.retry"), onClick: () => void startDownload(entries, deps, t) },
      });
      return;
    case "downloaded":
    case "shared":
    case "opened":
    case "cancelled":
    case "zipped":
      return;
  }
}

/**
 * "Saved {saved} of {total} files" with "Save next ({count} left)": each click saves the next file straight from the
 * click, then offers the rest the same way. A file whose save was blocked stays first in line; one that failed is
 * reported and skipped.
 */
export function offerRemaining(remaining: readonly DownloadableEntry[], saved: number, total: number, deps: DownloadDeps, t: Translate): void {
  if (remaining.length === 0) return;
  const [next, ...rest] = remaining;
  toast(fmt(t("drive.home.downloadPartial"), { saved, total }), {
    duration: OFFER_DURATION_MS,
    action: {
      label: fmt(t("drive.home.downloadNext"), { count: remaining.length }),
      onClick: () => {
        let run: Promise<DownloadEntriesResult>;
        try {
          run = downloadEntries([next], deps);
        } catch (err) {
          toast.error(t(driveErrorToastKey(err, DOWNLOAD_FAILED_KEY)));
          offerRemaining(rest, saved, total, deps, t);
          return;
        }
        run.then(
          (result) => {
            if (result === "blocked") offerRemaining(remaining, saved, total, deps, t);
            else offerRemaining(rest, result === "cancelled" ? saved : saved + 1, total, deps, t);
          },
          (err: unknown) => {
            toast.error(t(driveErrorToastKey(err, DOWNLOAD_FAILED_KEY)));
            offerRemaining(rest, saved, total, deps, t);
          },
        );
      },
    },
  });
}

export interface WriteAnnouncement {
  /** Copy when every entry was changed; null = say nothing. */
  success: string | null;
  /** An "Undo" (or other) button on the success toast. */
  action?: { label: string; onClick: () => void };
}

/**
 * The toast for a write that resolved: the success copy, or, when only some batches landed, "{done} of {total} done"
 * with the failure that stopped the rest.
 */
export function announceWrite(result: DriveWriteResult, announcement: WriteAnnouncement, t: Translate): void {
  if (result.done < result.total) {
    toast.warning(fmt(t("drive.home.bulkPartial"), { done: result.done, total: result.total }));
    if (result.error !== undefined) toast.error(t(driveWriteErrorKey(result.error)));
    return;
  }
  if (announcement.success === null) return;
  if (announcement.action) toast(announcement.success, { action: announcement.action });
  else toast.success(announcement.success);
}

/** "Moved to trash" / "{count} items moved to trash", and the like for restores. */
export function countMessage(t: Translate, oneKey: string, manyKey: string, count: number): string {
  return count === 1 ? t(oneKey) : fmt(t(manyKey), { count });
}

export interface CreatedAwayView {
  /** The section on screen. */
  section: DriveSection;
  /** Whose My files are the actor's own. */
  actorMemberId: string | null;
  /** Shows My files (the toast's "Show"). */
  showMyFiles(): void;
}

/**
 * "Added to My files" with "Show", after a folder or upload went to the root of the actor's own My files from a
 * section that doesn't list it: New and uploads target there from Shared, Recent and Starred (drive-ui §7.4).
 */
export function announceCreatedAway(target: DriveMoveTarget, view: CreatedAwayView, t: Translate): void {
  const myRoot = target.space === "my" && target.parentId === "" && target.ownerMemberId === view.actorMemberId;
  if (!myRoot || view.section === "my") return;
  toast(t("drive.home.createdInMy"), { action: { label: t("drive.home.show"), onClick: view.showMyFiles } });
}
