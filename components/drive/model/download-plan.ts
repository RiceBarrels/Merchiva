// How a selection of files is saved: one file directly, several as one zip where the device can
// hold it in memory, otherwise one by one. Pure; components/drive/download.ts carries it out.
//
// A zip holds every input and the output in memory (about twice the total at peak), so it has a
// cap per pointer type. The Capacitor apps never zip: their only save path is the share sheet or
// the system browser, one file per gesture, so they get a short sequential run instead.

import type { FileEntry, VirtualEntry } from "./types";

/** Largest total zipped on a fine-pointer device (desktop web, Tauri). */
export const DRIVE_ZIP_MAX_BYTES_FINE = 200 * 1024 ** 2;
/** Largest total zipped on a coarse-pointer web device (phones, tablets). */
export const DRIVE_ZIP_MAX_BYTES_COARSE = 50 * 1024 ** 2;
/** Most files one save action handles in the Capacitor apps. */
export const DRIVE_NATIVE_MULTI_MAX = 10;
/** Assumed size of a file stored in another app (its size is unknown): the task-evidence image cap. */
export const DRIVE_VIRTUAL_ASSUMED_BYTES = 8 * 1024 ** 2;

export interface DownloadEnv {
  capacitor: boolean;
  coarsePointer: boolean;
}

export type DownloadPlan =
  | { kind: "single"; entry: FileEntry | VirtualEntry }
  | { kind: "zip"; entries: (FileEntry | VirtualEntry)[]; totalBytes: number }
  | { kind: "sequential"; entries: (FileEntry | VirtualEntry)[]; reason: "native" | "tooBig" }
  | { kind: "refused"; reason: "nativeLimit" };

function knownBytes(entry: FileEntry | VirtualEntry): number {
  if (entry.type === "virtual") return DRIVE_VIRTUAL_ASSUMED_BYTES;
  return Number.isFinite(entry.sizeBytes) && entry.sizeBytes > 0 ? entry.sizeBytes : 0;
}

/**
 * - One entry → `single`.
 * - Several in the Capacitor apps → `sequential` (`native`) up to DRIVE_NATIVE_MULTI_MAX, else `refused`.
 * - Several elsewhere → `zip` when the total (virtual entries at DRIVE_VIRTUAL_ASSUMED_BYTES each)
 *   fits the pointer type's cap, else `sequential` (`tooBig`).
 * Callers pass at least one entry; an empty selection plans an empty sequential run (nothing to do).
 */
export function planDownload(entries: readonly (FileEntry | VirtualEntry)[], env: DownloadEnv): DownloadPlan {
  if (entries.length === 1) return { kind: "single", entry: entries[0] };
  if (env.capacitor) {
    if (entries.length > DRIVE_NATIVE_MULTI_MAX) return { kind: "refused", reason: "nativeLimit" };
    return { kind: "sequential", entries: [...entries], reason: "native" };
  }
  if (entries.length === 0) return { kind: "sequential", entries: [], reason: "tooBig" };
  const totalBytes = entries.reduce((sum, entry) => sum + knownBytes(entry), 0);
  const cap = env.coarsePointer ? DRIVE_ZIP_MAX_BYTES_COARSE : DRIVE_ZIP_MAX_BYTES_FINE;
  if (totalBytes <= cap) return { kind: "zip", entries: [...entries], totalBytes };
  return { kind: "sequential", entries: [...entries], reason: "tooBig" };
}
