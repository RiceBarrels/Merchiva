// Reading what someone dropped or picked into a list of files with their relative paths
// ("Folder/Sub/a.pdf"), for planFolderUpload (components/drive/model/upload-plan.ts).
//
// A dropped folder is only readable through the entries API (DataTransferItem.webkitGetAsEntry,
// FileSystemDirectoryReader.readEntries, which hands out a directory in batches until it returns
// an empty one). The items are only readable while the drop event is being dispatched, so
// readDroppedFiles takes every entry synchronously and reads them afterwards; call it straight
// from the drop handler. A folder picker (<input webkitdirectory>) gives plain files with
// `webkitRelativePath` instead: droppedFromFiles.

import { DriveClientError } from "@/lib/drive/errors";
import { DRIVE_MAX_SUBTREE } from "@/lib/drive/rules";
import type { DroppedFile } from "@/components/drive/model/upload-plan";

/** Directory levels read below a dropped folder; planFolderUpload refuses deeper files anyway. */
const MAX_READ_DEPTH = 64;

export interface ReadDropOptions {
  /** More files than this rejects with `batch_too_large` (default DRIVE_MAX_SUBTREE). */
  maxFiles?: number;
}

function limitOf(opts: ReadDropOptions | undefined): number {
  const max = Math.trunc(Number(opts?.maxFiles ?? DRIVE_MAX_SUBTREE));
  return Number.isFinite(max) && max > 0 ? max : DRIVE_MAX_SUBTREE;
}

function tooMany(): DriveClientError {
  return new DriveClientError("batch_too_large", "[drive.batch_too_large] Too many files dropped at once");
}

/** The path a picked file sits at: its folder-picker relative path, else its name. */
function pickedPath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: unknown }).webkitRelativePath;
  return typeof relative === "string" && relative !== "" ? relative : file.name;
}

/** Picked files (a file, photo or folder picker) as dropped files. */
export function droppedFromFiles(files: Iterable<File> | ArrayLike<File>, opts?: ReadDropOptions): DroppedFile[] {
  const list = Array.from(files);
  if (list.length > limitOf(opts)) throw tooMany();
  return list.map((file) => ({ file, path: pickedPath(file) }));
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

/** Every entry of a directory: readEntries answers in batches and signals the end with an empty one. */
async function readAll(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return out;
    out.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, prefix: string, depth: number, out: DroppedFile[], max: number): Promise<void> {
  if (isFileEntry(entry)) {
    if (out.length >= max) throw tooMany();
    out.push({ file: await fileOf(entry), path: `${prefix}${entry.name}` });
    return;
  }
  if (!isDirectoryEntry(entry) || depth >= MAX_READ_DEPTH) return;
  for (const child of await readAll(entry)) await walk(child, `${prefix}${entry.name}/`, depth + 1, out, max);
}

/**
 * The files of a drop, folders walked, with paths relative to the drop ("Folder/Sub/a.pdf" or "a.pdf"). Empty
 * folders add nothing. Rejects with `batch_too_large` past `maxFiles`, or with the browser's error when a file
 * cannot be read. Call synchronously from the drop handler (see the file comment).
 */
export function readDroppedFiles(dataTransfer: DataTransfer, opts?: ReadDropOptions): Promise<DroppedFile[]> {
  const max = limitOf(opts);
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const withEntries = items.length > 0 && items.every((item) => typeof item.webkitGetAsEntry === "function");
  if (withEntries) {
    for (const item of items) {
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
        continue;
      }
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  } else {
    loose.push(...Array.from(dataTransfer.files ?? []));
  }

  return (async () => {
    const out: DroppedFile[] = [];
    for (const file of loose) {
      if (out.length >= max) throw tooMany();
      out.push({ file, path: file.name });
    }
    for (const entry of entries) await walk(entry, "", 0, out, max);
    return out;
  })();
}
