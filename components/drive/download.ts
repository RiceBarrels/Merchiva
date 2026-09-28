// Saving Drive entries from a gesture: one file directly, several as one zip where the device can
// hold it in memory, otherwise one by one (drive-ui §8.3; the plan is model/download-plan.ts).
//
// One file goes through lib/drive/download.ts (uploaded files: buffered save or a signed download
// URL, the share sheet or the system browser in the apps) or downloadExternalFile (files kept by
// other apps). Both may open a window, which the web allows only inside the click's user
// activation, so downloadEntries starts the first save synchronously: call it straight from the
// gesture handler. A zip fetches every file, packs it with fflate and saves it once; when a fetch
// or the save fails, the files go one by one instead. This is also the lite "Save to phone" path.
//
// One by one in the apps (Capacitor, Tauri) opens the system browser whenever a file needs it. On
// the web a window opened after an await is blocked, so a run there saves only what needs no
// window: uploaded files up to DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES and files kept by other apps,
// each fetched and saved as a blob. The one window a click allows goes to the first larger file.
// Whatever is left comes back as a `partial` result, for the UI to offer one file per click.

import { zip } from "fflate";
import {
  DRIVE_ZIP_MAX_BYTES_COARSE, DRIVE_ZIP_MAX_BYTES_FINE, planDownload, type DownloadEnv,
} from "@/components/drive/model/download-plan";
import { uniqueSiblingName } from "@/components/drive/model/names";
import type { FileEntry, VirtualEntry } from "@/components/drive/model/types";
import { isCapacitorNative } from "@/lib/capacitor";
import { saveBlob } from "@/lib/docs/download";
import { DriveClientError } from "@/lib/drive/errors";
import {
  DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES, chooseDownloadStrategy, downloadDriveItem, downloadExternalFile, driveDownloadName,
  fetchDriveItemBytes, type DriveDownloadResult, type DriveDownloadTarget,
} from "@/lib/drive/download";
import type { DriveFileKind } from "@/lib/drive/file-kinds";
import type { DriveUrlLoader } from "@/lib/drive/url-loader";
import { isNativeShell } from "@/lib/native-shell";

export type DownloadableEntry = FileEntry | VirtualEntry;

export interface DownloadDeps {
  /** The acting member's loader on /store (sharedDriveUrlLoader(actingMemberId)), the caller's elsewhere. */
  loader: DriveUrlLoader;
  env: DownloadEnv;
  /** Already translated, without the extension: fmt(t("drive.home.zipName"), { date: dateKey() }). */
  zipName: string;
  /** Files fetched for a zip, or handled in a one-by-one run. */
  onProgress?(done: number, total: number): void;
  /** A multi-file save goes one by one: the native apps, too much to zip, or the zip failed (copy: drive.home.downloadMany). */
  onSequential?(reason: "native" | "tooBig" | "zipFailed"): void;
}

/** A one-by-one run on the web that saved only part of the selection (see the file comment). */
export interface DownloadPartial {
  kind: "partial";
  /** Files saved by this run. */
  saved: number;
  total: number;
  /**
   * Not saved, in selection order: files too large to save without a window of their own, and files whose save
   * failed. Offer each through downloadEntries([entry], deps) from its own click (copy: drive.home.downloadNext).
   */
  remaining: DownloadableEntry[];
  /** The first save that failed, when one did (drive.errors.* through driveErrorToastKey). */
  error?: unknown;
}

/**
 * - `downloaded` / `shared` / `opened` / `cancelled`: one file was saved, shared, opened outside the app, or the share
 *   sheet was dismissed.
 * - `zipped`: several files were saved as one zip. `sequential`: every file was saved one by one.
 * - `partial` (web only): a one-by-one run saved some of the files (copy: drive.home.downloadPartial; see DownloadPartial).
 * - `refused`: too many files for one save in the native apps (copy: drive.home.downloadNativeLimit).
 * - `blocked`: the browser blocked the window one file needed; retry from a new click (copy: drive.home.downloadBlocked).
 */
export type DownloadEntriesResult =
  | "downloaded" | "shared" | "opened" | "cancelled" | "zipped" | "sequential" | "refused" | "blocked" | DownloadPartial;

type SingleResult = "downloaded" | "shared" | "opened" | "cancelled" | "blocked";

/** The device facts the plan needs. */
export function readDownloadEnv(): DownloadEnv {
  const coarsePointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return { capacitor: isCapacitorNative(), coarsePointer };
}

/** The web: a window opens only inside the click's activation. The apps open the system browser at any time. */
function windowsNeedGesture(env: DownloadEnv): boolean {
  return !env.capacitor && !isNativeShell();
}

function targetOf(entry: FileEntry): DriveDownloadTarget {
  return { id: entry.id, name: entry.name, sizeBytes: entry.sizeBytes, mimeType: entry.mimeType };
}

function asSingleResult(result: DriveDownloadResult): SingleResult {
  // "unsupported" never leaves lib/drive/download.ts (it falls back to opening the URL); if it did, nothing was saved.
  return result === "unsupported" ? "blocked" : result;
}

/** Saves one entry. Starts synchronously (window.open inside the gesture), so call it before any await. */
function saveOne(entry: DownloadableEntry, loader: DriveUrlLoader): Promise<SingleResult> {
  const saved = entry.type === "virtual" ? downloadExternalFile(entry.url, entry.name) : downloadDriveItem(targetOf(entry), loader);
  return saved.then(asSingleResult);
}

/** The apps: one save per entry, in order. A dismissed share sheet (or a blocked window) stops the run. */
async function saveEach(entries: readonly DownloadableEntry[], deps: DownloadDeps): Promise<DownloadEntriesResult> {
  for (let index = 0; index < entries.length; index++) {
    const result = await saveOne(entries[index], deps.loader);
    deps.onProgress?.(index + 1, entries.length);
    if (result === "cancelled" || result === "blocked") return result;
  }
  return "sequential";
}

/** Kinds already compressed: stored as they are (deflating them again only costs time). */
const STORED_KINDS: ReadonlySet<DriveFileKind> = new Set<DriveFileKind>(["image", "video", "audio", "archive", "pdf"]);

/** A Blob part typed the way the DOM lib wants (fflate's output always sits on a plain ArrayBuffer). */
function blobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
}

function tooLarge(): DriveClientError {
  return new DriveClientError("too_large");
}

/** A file kept by another app, read through at most `maxBytes`: `too_large` as soon as it declares or passes more. */
async function fetchVirtual(url: string, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!/^https?:\/\//i.test(url)) throw new DriveClientError("invalid", "[drive.invalid] Unsupported file address");
  let res: Response;
  try {
    res = await fetch(url, { credentials: "omit" });
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new DriveClientError(offline ? "network" : "download_failed");
  }
  if (!res.ok) throw new DriveClientError("download_failed", `[drive.download_failed] HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (!res.body) {
    const whole = new Uint8Array(await res.arrayBuffer());
    if (whole.byteLength > maxBytes) throw tooLarge();
    return whole;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** An uploaded file that the web saves only through a window of its own (a signed download URL): too large to buffer. */
function needsWindow(entry: DownloadableEntry): boolean {
  return entry.type === "file" && chooseDownloadStrategy(entry.sizeBytes) === "direct";
}

/** The web: fetches the file and saves it as a blob. It opens no window, so it still works after the click has passed. */
async function saveWithoutWindow(entry: DownloadableEntry, loader: DriveUrlLoader): Promise<SingleResult> {
  const bytes =
    entry.type === "virtual"
      ? await fetchVirtual(entry.url, DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES)
      : new Uint8Array(await fetchDriveItemBytes(targetOf(entry), loader, { maxBytes: DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES }));
  const blob = new Blob([blobPart(bytes)], { type: entry.mimeType || "application/octet-stream" });
  const saved = await saveBlob(blob, driveDownloadName(entry.name));
  if (saved === "unsupported") throw new DriveClientError("download_failed", "[drive.download_failed] Saving files is not available here");
  return saved;
}

/** The entry the click's one window is spent on: the first that needs one, else the first uploaded file; -1 for none. */
function leadIndexOf(entries: readonly DownloadableEntry[]): number {
  const large = entries.findIndex(needsWindow);
  return large >= 0 ? large : entries.findIndex((entry) => entry.type === "file");
}

/**
 * The web: one by one without a window after the first await (see the file comment). `inGesture`: the caller is still
 * inside the click, so the lead entry goes through the normal single save, started synchronously.
 */
async function saveEachOnWeb(entries: readonly DownloadableEntry[], deps: DownloadDeps, inGesture: boolean): Promise<DownloadEntriesResult> {
  const total = entries.length;
  const leadIndex = inGesture ? leadIndexOf(entries) : -1;
  const lead = leadIndex >= 0 ? saveOne(entries[leadIndex], deps.loader) : null;
  const unsaved: number[] = [];
  let saved = 0;
  let done = 0;
  let error: unknown;
  const settle = async (index: number, save: () => Promise<SingleResult>): Promise<boolean> => {
    try {
      const result = await save();
      if (result === "cancelled") return false;
      if (result === "blocked") unsaved.push(index);
      else saved++;
    } catch (err) {
      if (error === undefined) error = err;
      unsaved.push(index);
    }
    deps.onProgress?.(++done, total);
    return true;
  };

  if (lead && !(await settle(leadIndex, () => lead))) return "cancelled";
  for (let index = 0; index < total; index++) {
    if (index === leadIndex) continue;
    const entry = entries[index];
    if (needsWindow(entry)) {
      unsaved.push(index);
      deps.onProgress?.(++done, total);
      continue;
    }
    if (!(await settle(index, () => saveWithoutWindow(entry, deps.loader)))) return "cancelled";
  }
  if (unsaved.length === 0) return "sequential";
  const remaining = [...unsaved].sort((a, b) => a - b).map((index) => entries[index]);
  return error === undefined ? { kind: "partial", saved, total, remaining } : { kind: "partial", saved, total, remaining, error };
}

/** One by one: every file in the apps, only what needs no window on the web (plus the lead while `inGesture`). */
function saveOneByOne(
  entries: readonly DownloadableEntry[],
  deps: DownloadDeps,
  reason: "native" | "tooBig" | "zipFailed",
  inGesture: boolean,
): Promise<DownloadEntriesResult> {
  deps.onSequential?.(reason);
  return windowsNeedGesture(deps.env) ? saveEachOnWeb(entries, deps, inGesture) : saveEach(entries, deps);
}

type ZipInput = Record<string, [Uint8Array, { level: 0 | 6 }]>;

/**
 * `name`, or a free "name (n)" when it is "__proto__": fflate's input and its own flatten map are plain objects, where
 * that key sets the prototype instead of adding an entry, so the file would be lost and junk entries zipped instead.
 */
function zipEntryName(name: string, used: readonly string[]): string {
  return name === "__proto__" ? uniqueSiblingName(name, [...used, name]) : name;
}

/** Every entry's bytes under a unique, file-system-safe name; throws once the total passes `maxBytes`, reading no further. */
async function collect(entries: readonly DownloadableEntry[], deps: DownloadDeps, maxBytes: number): Promise<ZipInput> {
  const files: ZipInput = {};
  const used: string[] = [];
  let total = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const budget = Math.max(1, maxBytes - total);
    const bytes =
      entry.type === "virtual"
        ? await fetchVirtual(entry.url, budget)
        : new Uint8Array(await fetchDriveItemBytes(targetOf(entry), deps.loader, { maxBytes: budget }));
    total += bytes.byteLength;
    if (total > maxBytes) throw tooLarge();
    const name = zipEntryName(uniqueSiblingName(driveDownloadName(entry.name), used), used);
    used.push(name);
    files[name] = [bytes, { level: STORED_KINDS.has(entry.fileKind) ? 0 : 6 }];
    deps.onProgress?.(index + 1, entries.length);
  }
  return files;
}

function zipBytes(files: ZipInput): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** The zip cap of this device (the plan decided with the same numbers). */
function zipCap(env: DownloadEnv): number {
  return env.coarsePointer ? DRIVE_ZIP_MAX_BYTES_COARSE : DRIVE_ZIP_MAX_BYTES_FINE;
}

async function zipAndSave(entries: readonly DownloadableEntry[], deps: DownloadDeps): Promise<DownloadEntriesResult> {
  let archive: Uint8Array;
  try {
    // Files kept by other apps were planned at an assumed size; the real bytes still have to fit the cap.
    archive = await zipBytes(await collect(entries, deps, zipCap(deps.env)));
  } catch (err) {
    console.warn("[drive] zip download failed; saving one by one", err);
    return saveOneByOne(entries, deps, "zipFailed", false);
  }
  const saved = await saveBlob(new Blob([blobPart(archive)], { type: "application/zip" }), driveDownloadName(`${deps.zipName}.zip`));
  if (saved === "unsupported") return saveOneByOne(entries, deps, "zipFailed", false);
  return saved === "cancelled" ? "cancelled" : "zipped";
}

/**
 * Saves the entries (see the file comment). Call it synchronously from the user's gesture. Rejects with the
 * DriveClientError of a single file that could not be saved (e.g. `not_found`, `download_failed`, `network`); a
 * multi-file run on the web reports its failures in a `partial` result instead.
 */
export function downloadEntries(entries: readonly DownloadableEntry[], deps: DownloadDeps): Promise<DownloadEntriesResult> {
  const plan = planDownload(entries, deps.env);
  switch (plan.kind) {
    case "single":
      return saveOne(plan.entry, deps.loader);
    case "refused":
      return Promise.resolve("refused");
    case "sequential":
      if (plan.entries.length === 0) return Promise.resolve("sequential");
      return saveOneByOne(plan.entries, deps, plan.reason, true);
    case "zip":
      return zipAndSave(plan.entries, deps);
  }
}
