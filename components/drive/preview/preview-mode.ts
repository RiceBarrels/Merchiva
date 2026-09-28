// How the preview shows one file entry, an uploaded file or a link another app keeps, and the
// labels the preview sheet reads off any entry. Builds on lib/drive/file-kinds.ts previewModeOf
// (which decides inline vs external PDFs from the device) and adds what only an entry knows.
// Pure (no React).

import type { DriveEntry, FileEntry, VirtualEntry } from "@/components/drive/model/types";
import { previewModeOf, type PreviewEnv, type PreviewMode } from "@/lib/drive/file-kinds";
import { drivePreviewKind, type DrivePreviewKind } from "@/lib/drive/preview";
import { normalizeDriveMime } from "@/lib/drive/rules";

export type PreviewableEntry = FileEntry | VirtualEntry;

const GENERIC_MIMES: ReadonlySet<string> = new Set(["", "application/octet-stream"]);

/** Kinds an app's declared family keeps when the link has neither a real type nor an extension. */
const FAMILY_KINDS: Readonly<Partial<Record<VirtualEntry["fileKind"], DrivePreviewKind>>> = {
  image: "image", video: "video", audio: "audio", pdf: "pdf",
};

/**
 * The preview kind of an entry (lib/drive/preview.ts drivePreviewKind). A link whose app declared only a family
 * ("image", as task evidence is stored) and whose name and address have no extension keeps that family.
 */
export function entryPreviewKind(entry: PreviewableEntry): DrivePreviewKind {
  const kind = drivePreviewKind(entry.mimeType, entry.name);
  if (kind !== "none" || entry.type !== "virtual" || !GENERIC_MIMES.has(normalizeDriveMime(entry.mimeType))) return kind;
  return FAMILY_KINDS[entry.fileKind] ?? "none";
}

export interface EntryPreviewOptions {
  /** false: a PDF always opens outside (the lite apps). Default true: inline where the device allows it. */
  inlinePdf?: boolean;
}

/**
 * The preview mode of an entry on this device. A link kept by another app has no known size, so a PDF link is
 * judged by the device alone and PdfPreview enforces the 50 MiB cap (from the declared length when the host sends
 * one, else while reading). Office files kept by other
 * apps have no "Open as" (only uploaded files are imported), so they show no preview.
 */
export function entryPreviewMode(entry: PreviewableEntry, env: PreviewEnv, opts: EntryPreviewOptions = {}): PreviewMode {
  const kind = entryPreviewKind(entry);
  if (kind === "pdf" && opts.inlinePdf === false) return "pdfExternal";
  const mode = previewModeOf(kind, entry.type === "file" ? entry.sizeBytes : 1, env);
  return mode === "office" && entry.type === "virtual" ? "none" : mode;
}

/** Entries the sheet steps through with previous / next: files and app-stored links (folders and documents open). */
export function isPreviewable(entry: DriveEntry): entry is PreviewableEntry {
  return entry.type === "file" || entry.type === "virtual";
}

/** An entry's name, or the untitled label of its type (drive.list.untitled.*) when it has none. */
export function entryLabel(entry: DriveEntry, t: (key: string) => string): string {
  if (entry.name.trim() !== "") return entry.name;
  if (entry.type === "folder" || entry.type === "doc" || entry.type === "sheet" || entry.type === "slides") {
    return t(`drive.list.untitled.${entry.type}`);
  }
  return t("drive.list.untitled.file");
}

/** The kind label key of an entry (drive.kind.*). */
export function entryKindKey(entry: DriveEntry): string {
  return entry.type === "file" || entry.type === "virtual" ? `drive.kind.${entry.fileKind}` : `drive.kind.${entry.type}`;
}
