"use client";

// The tab's upload queue for React: its entries (re-rendered on every change,
// progress at most every 100 ms) and the queue itself for enqueue / cancel /
// retry. The "leave site?" guard belongs to the shared queue, not to this
// hook, so it stays armed after the Drive page unmounts.

import { useMemo, useSyncExternalStore } from "react";
import { sharedDriveUploadQueue, type DriveUploadEntry, type DriveUploadQueue } from "@/lib/drive/upload-queue";
import { useDriveTokenBridge } from "@/lib/drive/use-drive-token";

const NO_ENTRIES: readonly DriveUploadEntry[] = Object.freeze([]);
const serverSnapshot = () => NO_ENTRIES;

export function useDriveUploads(): { entries: readonly DriveUploadEntry[]; queue: DriveUploadQueue } {
  useDriveTokenBridge();
  const queue = sharedDriveUploadQueue();
  const entries = useSyncExternalStore(queue.subscribe, queue.getSnapshot, serverSnapshot);
  return useMemo(() => ({ entries, queue }), [entries, queue]);
}
