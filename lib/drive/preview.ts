/**
 * What a Drive file previews as, and whether a PDF may be framed inline. Pure: drive-ui's
 * `lib/drive/file-kinds.ts` reads the environment and turns these kinds into preview modes.
 *
 * Nothing uploaded is ever rendered as HTML: `text` kinds are fetched and shown as source, and SVG only goes
 * through `<img>`, where scripts are inert.
 */

import { mimeFromExtension, normalizeDriveMime } from "@/lib/drive/rules";

export type DrivePreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "csv" | "sheet" | "slides" | "doc" | "none";

/** Text and CSV previews read at most this prefix of the file. */
export const DRIVE_TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
/** Larger PDFs open externally instead of being fetched into a `blob:` frame. */
export const DRIVE_PDF_INLINE_MAX_BYTES = 50 * 1024 * 1024;

const OOXML = "application/vnd.openxmlformats-officedocument";

/** Exact types. Anything not listed falls through to the family rules in `kindOfMime`. */
const KIND_BY_MIME: Readonly<Record<string, DrivePreviewKind>> = {
  "image/png": "image", "image/apng": "image", "image/jpeg": "image", "image/jpg": "image", "image/pjpeg": "image",
  "image/gif": "image", "image/webp": "image", "image/avif": "image", "image/bmp": "image", "image/x-ms-bmp": "image",
  "image/svg+xml": "image", "image/x-icon": "image", "image/vnd.microsoft.icon": "image",
  // Browsers can't draw these; the grid shows the uploaded thumbnail when there is one.
  "image/heic": "none", "image/heif": "none", "image/heic-sequence": "none", "image/heif-sequence": "none",
  "image/tiff": "none", "image/vnd.adobe.photoshop": "none", "image/x-photoshop": "none",
  "video/mp4": "video", "video/webm": "video", "video/quicktime": "video", "video/ogg": "video", "video/x-m4v": "video",
  "audio/mpeg": "audio", "audio/mp3": "audio", "audio/mp4": "audio", "audio/x-m4a": "audio", "audio/aac": "audio",
  "audio/x-aac": "audio", "audio/wav": "audio", "audio/x-wav": "audio", "audio/wave": "audio", "audio/vnd.wave": "audio",
  "audio/ogg": "audio", "audio/opus": "audio", "audio/webm": "audio", "audio/flac": "audio", "audio/x-flac": "audio",
  "application/pdf": "pdf", "application/x-pdf": "pdf",
  "text/csv": "csv", "text/x-csv": "csv", "application/csv": "csv", "application/x-csv": "csv",
  "text/comma-separated-values": "csv", "text/x-comma-separated-values": "csv", "text/tab-separated-values": "csv",
  "application/json": "text", "application/xml": "text", "application/xhtml+xml": "text",
  "application/javascript": "text", "application/x-javascript": "text", "application/ecmascript": "text",
  "application/yaml": "text", "application/x-yaml": "text", "application/x-ndjson": "text",
  [`${OOXML}.spreadsheetml.sheet`]: "sheet",
  [`${OOXML}.presentationml.presentation`]: "slides",
  [`${OOXML}.wordprocessingml.document`]: "doc",
};

/** Kind for a normalized MIME type; `null` when the type says nothing useful and the extension should decide. */
function kindOfMime(mime: string): DrivePreviewKind | null {
  if (mime === "") return null;
  const exact = KIND_BY_MIME[mime];
  if (exact) return exact;
  // Any other text type (html, markdown, plain, source code, …) is shown as source.
  if (mime.startsWith("text/")) return "text";
  if (mime.startsWith("application/") && (mime.endsWith("+json") || mime.endsWith("+xml"))) return "text";
  return null;
}

/**
 * The preview kind of a file. The stored type wins because it is the type the file is served with; a missing,
 * generic or unknown type (`application/octet-stream`, `application/zip` for an `.xlsx`, Windows'
 * `application/vnd.ms-excel` for a `.csv`) defers to the extension. A `.csv`/`.tsv` stored as plain text is `csv`.
 */
export function drivePreviewKind(mimeType: string, name: string): DrivePreviewKind {
  const byMime = kindOfMime(normalizeDriveMime(mimeType));
  const byExtension = kindOfMime(mimeFromExtension(name));
  if (byMime === null) return byExtension ?? "none";
  if (byMime === "text" && byExtension === "csv") return "csv";
  return byMime;
}

/**
 * Whether a PDF may be fetched and framed as a `blob:` URL: desktop web only, with the browser's own PDF viewer
 * (`navigator.pdfViewerEnabled === true`), never in a native shell or on an Apple touch device (WKWebView and
 * iOS/iPadOS Safari draw only a static first page), and only up to `DRIVE_PDF_INLINE_MAX_BYTES`.
 */
export function canInlinePdf(
  env: { native: boolean; appleTouch: boolean; pdfViewerEnabled: boolean | undefined },
  sizeBytes: number,
): boolean {
  if (env.native || env.appleTouch || env.pdfViewerEnabled !== true) return false;
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= DRIVE_PDF_INLINE_MAX_BYTES;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True when the bytes start with `%PDF-`. Checked before bytes are re-typed `application/pdf` and framed. */
export function isPdfMagic(head: Uint8Array): boolean {
  if (!head || head.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((byte, i) => head[i] === byte);
}

/** Signed-URL purpose for a preview: media streams (longer TTL), everything else is a view. */
export function driveUrlPurposeFor(kind: DrivePreviewKind): "view" | "stream" {
  return kind === "video" || kind === "audio" ? "stream" : "view";
}
