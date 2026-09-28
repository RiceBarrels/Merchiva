"use client";

// Whether Drive's file store takes uploads right now, for the screens that offer them: while it is `unavailable`
// (not configured, or paused) the Upload entry points are off and say why; folders and Docs / Sheets / Slides don't
// need the store and stay on. `checking` and `unknown` (the status route could not be read) leave uploads on: they
// fail on their own if they must.
//
// It reads the tab's shared answer (lib/drive/upload.ts driveStorageReady: GET /api/drive/status, trusted for a
// minute) rather than fetching its own, so screens and uploads agree: an upload that finds the store gone turns
// Upload off on every screen. The answer is read again when the tab comes back to the foreground and, while it is
// `unavailable`, each time the cached one runs out: every upload entry point is off then, so no upload reads it.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  DRIVE_STORAGE_STATUS_TTL_MS, driveStorageReady, getDriveStorageAvailability, subscribeDriveStorageAvailability,
  type DriveStorageAvailability,
} from "@/lib/drive/upload";
import { useDriveTokenBridge } from "@/lib/drive/use-drive-token";

export type { DriveStorageAvailability };
export interface DriveStorageStatus { status: DriveStorageAvailability }

const serverSnapshot = (): DriveStorageAvailability => "checking";

export function useDriveStorageStatus(): DriveStorageStatus {
  useDriveTokenBridge();
  const status = useSyncExternalStore(subscribeDriveStorageAvailability, getDriveStorageAvailability, serverSnapshot);

  useEffect(() => {
    let cancelled = false;
    let reading = false;
    // The answer lands in the shared store above; this only asks for it (a cached one costs no request).
    const read = () => {
      if (cancelled || reading) return;
      reading = true;
      driveStorageReady()
        .catch((err: unknown) => {
          // It resolves null instead of rejecting; if it ever throws, the last answer stays and uploads are not blocked.
          console.error("[drive] reading the storage status failed", err);
        })
        .finally(() => {
          reading = false;
        });
    };
    read();
    const doc = typeof document === "undefined" ? null : document;
    const onVisible = () => {
      if (doc?.visibilityState === "visible") read();
    };
    doc?.addEventListener("visibilitychange", onVisible);
    // A store that comes back turns Upload on by itself, with no reload or tab switch.
    const timer = setInterval(() => {
      if (getDriveStorageAvailability() === "unavailable") read();
    }, DRIVE_STORAGE_STATUS_TTL_MS);
    return () => {
      cancelled = true;
      doc?.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  return useMemo(() => ({ status }), [status]);
}
