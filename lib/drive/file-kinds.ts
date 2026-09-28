// What an uploaded Drive file is, for people: its kind (icon, type filter, "drive.kind.*"
// label), which Merchiva editor can open a copy of it, whether the grid may draw the
// original as a thumbnail, and how the preview shows it on this device.
//
// Kinds build on lib/drive/preview.ts (drivePreviewKind: the stored type wins, the extension
// decides when the type is missing or generic) and add the families preview has no renderer
// for (HEIC photos are still images, a .xls is still a spreadsheet). The preview modes take
// canInlinePdf from the same module. Nothing here renders; readPreviewEnv is the only reader
// of the environment.

import { isCapacitorNative } from "@/lib/capacitor";
import type { DocFileType } from "@/lib/docs/types";
import { canInlinePdf, drivePreviewKind, type DrivePreviewKind } from "@/lib/drive/preview";
import { driveExtension, isActiveDriveMime, mimeFromExtension, normalizeDriveMime } from "@/lib/drive/rules";
import { isNativeShell } from "@/lib/native-shell";

export type DriveFileKind =
  | "image" | "pdf" | "video" | "audio" | "text" | "csv"
  | "document" | "spreadsheet" | "presentation" | "archive" | "other";

/** Every kind, in the order the type filter and the `drive.kind.*` labels list them. */
export const DRIVE_FILE_KINDS: readonly DriveFileKind[] = [
  "image", "pdf", "video", "audio", "text", "csv", "document", "spreadsheet", "presentation", "archive", "other",
];

/** An editor a file can be opened (imported) into; equal to lib/drive/editors.ts DriveDocKind. */
type ImportTarget = Exclude<DocFileType, "unknown">;

const OOXML = "application/vnd.openxmlformats-officedocument";
const OCTET_STREAM = "application/octet-stream";

/** Families preview.ts has no renderer for, by normalized MIME type. */
const KIND_BY_MIME: Readonly<Record<string, DriveFileKind>> = {
  "application/msword": "document",
  "application/rtf": "document",
  "application/vnd.oasis.opendocument.text": "document",
  "application/vnd.apple.pages": "document",
  "application/vnd.ms-excel": "spreadsheet",
  "application/vnd.ms-excel.sheet.macroenabled.12": "spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet": "spreadsheet",
  "application/vnd.apple.numbers": "spreadsheet",
  "application/vnd.ms-powerpoint": "presentation",
  "application/vnd.oasis.opendocument.presentation": "presentation",
  "application/vnd.apple.keynote": "presentation",
  "application/zip": "archive",
  "application/x-zip-compressed": "archive",
  "application/gzip": "archive",
  "application/x-gzip": "archive",
  "application/x-tar": "archive",
  "application/x-7z-compressed": "archive",
  "application/vnd.rar": "archive",
  "application/x-rar-compressed": "archive",
  "application/x-bzip2": "archive",
  "application/x-xz": "archive",
};

/** The same families by extension, for a missing or generic type. */
const KIND_BY_EXTENSION: Readonly<Record<string, DriveFileKind>> = {
  doc: "document", docx: "document", odt: "document", rtf: "document", pages: "document",
  xls: "spreadsheet", xlsx: "spreadsheet", xlsm: "spreadsheet", ods: "spreadsheet", numbers: "spreadsheet",
  ppt: "presentation", pptx: "presentation", odp: "presentation", key: "presentation",
  zip: "archive", gz: "archive", tgz: "archive", tar: "archive", "7z": "archive", rar: "archive", bz2: "archive", xz: "archive",
};

const KIND_BY_PREVIEW: Readonly<Record<Exclude<DrivePreviewKind, "none">, DriveFileKind>> = {
  image: "image", video: "video", audio: "audio", pdf: "pdf", text: "text", csv: "csv",
  doc: "document", sheet: "spreadsheet", slides: "presentation",
};

/**
 * Lowercased extension without the dot; '' when there is none. The same rule as the server's
 * blocked-type check (lib/drive/rules.ts driveExtension): trailing dots and spaces are ignored.
 */
export function extensionOf(name: string): string {
  return driveExtension(name);
}

/**
 * The kind of an uploaded file: preview.ts's kind first, then the MIME family (the extension's type when the stored
 * one is missing or generic), then the extension.
 */
export function fileKindOf(mimeType: string, name: string): DriveFileKind {
  const preview = drivePreviewKind(mimeType, name);
  if (preview !== "none") return KIND_BY_PREVIEW[preview];
  const stored = normalizeDriveMime(mimeType);
  const mime = stored === "" || stored === OCTET_STREAM ? mimeFromExtension(name) : stored;
  // Images a browser can't draw (HEIC, TIFF, PSD) and media preview doesn't know are still that kind.
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const byMime = KIND_BY_MIME[mime];
  if (byMime) return byMime;
  return KIND_BY_EXTENSION[extensionOf(name)] ?? "other";
}

/** Importers by extension: Docs (lib/docs/import IMPORT_ACCEPT), Sheets (.xlsx/.xlsm/.csv), Slides (.pptx). */
const IMPORT_BY_EXTENSION: Readonly<Record<string, ImportTarget>> = {
  docx: "doc", md: "doc", markdown: "doc", html: "doc", htm: "doc", txt: "doc",
  xlsx: "sheet", xlsm: "sheet", csv: "sheet",
  pptx: "slides",
};

/** For a file without an extension only (the Docs importer's rule: a known extension is never rescued by the type). */
const IMPORT_BY_MIME: Readonly<Record<string, ImportTarget>> = {
  [`${OOXML}.wordprocessingml.document`]: "doc",
  "text/markdown": "doc",
  "text/x-markdown": "doc",
  "text/html": "doc",
  "text/plain": "doc",
  [`${OOXML}.spreadsheetml.sheet`]: "sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12": "sheet",
  "text/csv": "sheet",
  [`${OOXML}.presentationml.presentation`]: "slides",
};

/**
 * The editor that can open a copy of this file ("Open as Doc / Sheet / Slides"), or null. Imports
 * always create a new document; the original stays in Drive. Legacy binaries (.doc, .xls, .ppt)
 * and other formats have no importer.
 */
export function importTargetOf(mimeType: string, name: string): ImportTarget | null {
  const ext = extensionOf(name);
  if (ext !== "") return IMPORT_BY_EXTENSION[ext] ?? null;
  return IMPORT_BY_MIME[normalizeDriveMime(mimeType)] ?? null;
}

/** Largest original the grid draws as its own thumbnail when the upload attached none. */
export const DRIVE_ORIGINAL_THUMB_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Whether the grid may show the original file as a thumbnail: a small image the browser can
 * draw (not HEIC/TIFF/PSD) and that may be signed for viewing (never an active type such as SVG,
 * which is only ever served as a download). The kind falls back to the extension when the stored
 * type is missing or generic, so the extension's type must not be active either: a `logo.svg`
 * stored as application/octet-stream is still an SVG.
 */
export function isThumbable(file: { mimeType: string; name: string; sizeBytes: number }): boolean {
  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > DRIVE_ORIGINAL_THUMB_MAX_BYTES) return false;
  if (isActiveDriveMime(file.mimeType) || isActiveDriveMime(mimeFromExtension(file.name))) return false;
  return drivePreviewKind(file.mimeType, file.name) === "image";
}

/** The device facts preview modes depend on. */
export interface PreviewEnv {
  /** Capacitor app (iOS or Android). */
  capacitor: boolean;
  /** Tauri desktop shell (WKWebView on macOS). */
  nativeShell: boolean;
  /** iPhone, iPod, or an iPad (iPadOS reports Macintosh with touch points). */
  appleTouch: boolean;
  /** `navigator.pdfViewerEnabled`; undefined where the browser doesn't say. */
  pdfViewerEnabled: boolean | undefined;
}

export type PreviewMode = "image" | "pdf" | "pdfExternal" | "video" | "audio" | "text" | "csv" | "office" | "none";

/** Reads this device's PreviewEnv. On the server (no window) every flag is false. */
export function readPreviewEnv(): PreviewEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { capacitor: false, nativeShell: false, appleTouch: false, pdfViewerEnabled: undefined };
  }
  const ua = navigator.userAgent ?? "";
  // Same test as lib/browser-shell/mobile/platform.ts (iosDevice).
  const appleTouch = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const pdfViewerEnabled = typeof navigator.pdfViewerEnabled === "boolean" ? navigator.pdfViewerEnabled : undefined;
  return { capacitor: isCapacitorNative(), nativeShell: isNativeShell(), appleTouch, pdfViewerEnabled };
}

/**
 * How the preview shows a file of `kind` and `sizeBytes` here. A PDF is framed inline only where
 * canInlinePdf allows it (desktop web with the browser's own viewer, not on a native shell or an
 * Apple touch device, up to 50 MiB); every other PDF opens externally. Office files show the
 * "Open as …" card.
 */
export function previewModeOf(kind: DrivePreviewKind, sizeBytes: number, env: PreviewEnv): PreviewMode {
  switch (kind) {
    case "pdf":
      return canInlinePdf(
        { native: env.capacitor || env.nativeShell, appleTouch: env.appleTouch, pdfViewerEnabled: env.pdfViewerEnabled },
        sizeBytes,
      )
        ? "pdf"
        : "pdfExternal";
    case "doc":
    case "sheet":
    case "slides":
      return "office";
    case "image":
    case "video":
    case "audio":
    case "text":
    case "csv":
    case "none":
      return kind;
  }
}
