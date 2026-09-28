// Planning uploads before any request: the folders a dropped folder tree needs (parents first),
// the camera's photo names, and the size / quota checks the server repeats.
//
// Pure (no React, no DOM beyond reading `File.name` and `File.size`). The folder walker
// (components/drive/upload/folder-upload.ts) creates the planned folders, merging into
// same-named existing ones, and hands the files to the upload queue.

import { dateKey } from "@/lib/date-key";
import type { DriveUsageView } from "@/lib/drive/types";
import { fmt } from "@/lib/i18n/fmt";
import { cleanDriveName } from "@/lib/drive/rules";
import { cleanEntryName } from "./names";

export interface DroppedFile {
  file: File;
  /** "Folder/Sub/a.pdf" (a folder drop or picker) or "a.pdf". */
  path: string;
}

export type FolderUploadSkipReason = "unsafePath" | "invalidName" | "tooDeep";

export interface FolderUploadPlan {
  /** Unique directory paths (cleaned names), every parent before its children. */
  folders: string[][];
  /** Each file with the directory it goes into ([] = the drop target itself). */
  uploads: { file: File; dir: string[] }[];
  /** Files left out, with the reason (junk files such as .DS_Store are dropped silently). */
  skipped: { file: File; path: string; reason: FolderUploadSkipReason }[];
}

/** Directory levels a dropped tree may add below the drop target. */
export const DRIVE_UPLOAD_MAX_DIR_DEPTH = 16;

/** OS metadata files that are never uploaded. */
const JUNK_FILE_NAMES: ReadonlySet<string> = new Set([".ds_store", "thumbs.db"]);

function isJunk(name: string): boolean {
  return JUNK_FILE_NAMES.has(name.trim().toLowerCase());
}

/**
 * The folders and uploads of a dropped or picked tree. Paths are split on "/"; empty and "."
 * segments are ignored, a ".." segment skips the file (`unsafePath`), a directory name the server
 * would refuse skips it (`invalidName`), and so does a file more than DRIVE_UPLOAD_MAX_DIR_DEPTH
 * directories down (`tooDeep`). Directory names are cleaned (NFC, controls stripped, trimmed), so
 * the decomposed names macOS reports merge with composed ones.
 */
export function planFolderUpload(files: readonly DroppedFile[]): FolderUploadPlan {
  const folders: string[][] = [];
  const seen = new Set<string>();
  const uploads: FolderUploadPlan["uploads"] = [];
  const skipped: FolderUploadPlan["skipped"] = [];

  for (const dropped of files) {
    const segments = dropped.path.split("/").filter((segment) => segment !== "" && segment !== ".");
    const fileName = segments.length > 0 ? segments[segments.length - 1] : dropped.file.name;
    if (isJunk(fileName) || isJunk(dropped.file.name)) continue;
    const rawDirs = segments.slice(0, -1);
    if (segments.includes("..")) {
      skipped.push({ file: dropped.file, path: dropped.path, reason: "unsafePath" });
      continue;
    }
    if (rawDirs.length > DRIVE_UPLOAD_MAX_DIR_DEPTH) {
      skipped.push({ file: dropped.file, path: dropped.path, reason: "tooDeep" });
      continue;
    }
    const dir = rawDirs.map(cleanEntryName);
    if (rawDirs.some((raw) => cleanDriveName(raw) === null)) {
      skipped.push({ file: dropped.file, path: dropped.path, reason: "invalidName" });
      continue;
    }
    for (let depth = 1; depth <= dir.length; depth++) {
      const prefix = dir.slice(0, depth);
      const key = JSON.stringify(prefix);
      if (seen.has(key)) continue;
      seen.add(key);
      folders.push(prefix);
    }
    uploads.push({ file: dropped.file, dir });
  }
  // Each path adds its prefixes shortest first, so every parent is already listed before a child.
  return { folders, uploads, skipped };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * A camera photo's name: `template` (t("drive.upload.photoName") = "Photo {date}") with the local
 * date and time, then the extension: "Photo 2026-09-26 14.32.08.jpg". Characters a name can't hold
 * ("/", "\") become "-"; `ext` may come with or without its dot and is lowercased.
 */
export function photoFileName(template: string, now: Date, ext: string): string {
  const date = `${dateKey(now)} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  let base = cleanEntryName(fmt(template, { date })).replace(/[/\\]/g, "-");
  if (base === "" || base === "." || base === "..") base = date;
  const suffix = ext.replace(/^\.+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return suffix ? `${base}.${suffix}` : base;
}

export type UploadRejection = { file: File; reason: "tooLarge" | "empty" | "quota" };

/**
 * Splits a batch into files to upload and files refused before any request: empty files and
 * files over `maxFileBytes` are refused one by one. When `quotaBytes` > 0 (0 = no limit) and the
 * accepted files don't fit next to what is used and reserved, the whole batch is refused with
 * `quota` (files already refused keep their own reason). The server checks again.
 */
export function preflightUploads(
  files: readonly File[],
  usage: Pick<DriveUsageView, "usedBytes" | "reservedBytes"> | null,
  quotaBytes: number,
  maxFileBytes: number,
): { accepted: File[]; rejected: UploadRejection[] } {
  const reasons = new Map<File, UploadRejection["reason"]>();
  const fitting: File[] = [];
  let batchBytes = 0;
  for (const file of files) {
    if (!(file.size > 0)) reasons.set(file, "empty");
    else if (file.size > maxFileBytes) reasons.set(file, "tooLarge");
    else {
      fitting.push(file);
      batchBytes += file.size;
    }
  }
  const used = (usage?.usedBytes ?? 0) + (usage?.reservedBytes ?? 0);
  const overQuota = quotaBytes > 0 && fitting.length > 0 && used + batchBytes > quotaBytes;
  if (overQuota) for (const file of fitting) reasons.set(file, "quota");
  const accepted = overQuota ? [] : fitting;
  const rejected = files.filter((file) => reasons.has(file)).map((file) => ({ file, reason: reasons.get(file) ?? "quota" }));
  return { accepted, rejected };
}
