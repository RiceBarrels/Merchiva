// The small state rules of the preview sheet and the preview body, kept apart so they can be
// tested: the files previous / next step through, which way an arrow key steps (mirrored in a
// right-to-left layout), and the one retry of an image or media element that failed to load.
// Pure (no React, no DOM).

import type { DriveEntry } from "@/components/drive/model/types";
import { isPreviewable, type PreviewableEntry } from "./preview-mode";

export interface PreviewNeighbours {
  /** The files of the listing, in its order; empty when the entry itself doesn't preview (a folder, a document). */
  files: PreviewableEntry[];
  prev: PreviewableEntry | null;
  next: PreviewableEntry | null;
}

/** The files previous / next step through from `entry`, among the listing it was opened from. */
export function previewNeighbours(entry: DriveEntry, siblings: readonly DriveEntry[]): PreviewNeighbours {
  const files = isPreviewable(entry) ? siblings.filter(isPreviewable) : [];
  const index = files.findIndex((e) => e.key === entry.key);
  return {
    files,
    prev: index > 0 ? files[index - 1] : null,
    next: index >= 0 && index < files.length - 1 ? files[index + 1] : null,
  };
}

/** The parts of a keydown the sheet reads. */
export interface ArrowKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

/**
 * -1 (previous) or 1 (next) for a bare Left / Right arrow; a right-to-left layout mirrors them, as its chevrons are.
 * null for any other key, a modified arrow (text selection, history, the OS's shortcuts) or one already handled.
 */
export function arrowStep(event: ArrowKeyEvent, rtl: boolean): -1 | 1 | null {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return null;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return (event.key === "ArrowLeft") !== rtl ? -1 : 1;
}

export interface PreviewAttempt {
  /** The entry the attempt belongs to. */
  key: string;
  /** The one retry with a freshly signed URL has been used. */
  retried: boolean;
  failed: boolean;
}

/** The attempt for `key`: the stored one when it is that entry's, else a fresh one (another entry starts over). */
export function attemptFor(stored: PreviewAttempt, key: string): PreviewAttempt {
  return stored.key === key ? stored : { key, retried: false, failed: false };
}

/**
 * After an image, video or audio element failed: an uploaded file tries once more (`invalidate`: forget its signed
 * URL first, as it may have expired); a link kept by another app, or a second failure, gives up.
 */
export function attemptAfterError(current: PreviewAttempt, isFile: boolean): { attempt: PreviewAttempt; invalidate: boolean } {
  if (!current.retried && isFile) return { attempt: { key: current.key, retried: true, failed: false }, invalidate: true };
  return { attempt: { ...current, failed: true }, invalidate: false };
}
