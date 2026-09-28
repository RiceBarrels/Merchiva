import { describe, expect, test } from "bun:test";
import {
  DRIVE_PDF_INLINE_MAX_BYTES,
  DRIVE_TEXT_PREVIEW_MAX_BYTES,
  type DrivePreviewKind,
  canInlinePdf,
  drivePreviewKind,
  driveUrlPurposeFor,
  isPdfMagic,
} from "@/lib/drive/preview";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("drivePreviewKind", () => {
  const byMime: Array<[string, string, DrivePreviewKind]> = [
    // image
    ["image/png", "a.png", "image"],
    ["image/jpeg", "a.jpg", "image"],
    ["image/gif", "a.gif", "image"],
    ["image/webp", "a.webp", "image"],
    ["image/avif", "a.avif", "image"],
    ["image/bmp", "a.bmp", "image"],
    ["image/svg+xml", "a.svg", "image"],
    ["IMAGE/JPEG; q=1", "a", "image"],
    // not drawable by browsers
    ["image/heic", "IMG_1.HEIC", "none"],
    ["image/heif", "a.heif", "none"],
    ["image/tiff", "a.tif", "none"],
    ["image/vnd.adobe.photoshop", "a.psd", "none"],
    ["image/heic", "renamed.jpg", "none"],
    // video / audio
    ["video/mp4", "a.mp4", "video"],
    ["video/webm", "a.webm", "video"],
    ["video/quicktime", "a.mov", "video"],
    ["video/ogg", "a.ogv", "video"],
    ["audio/mpeg", "a.mp3", "audio"],
    ["audio/mp4", "a.m4a", "audio"],
    ["audio/x-m4a", "a.m4a", "audio"],
    ["audio/aac", "a.aac", "audio"],
    ["audio/wav", "a.wav", "audio"],
    ["audio/ogg", "a.ogg", "audio"],
    ["audio/webm", "a.weba", "audio"],
    ["audio/flac", "a.flac", "audio"],
    // pdf
    ["application/pdf", "a.pdf", "pdf"],
    // text, shown as source (never rendered)
    ["text/plain", "a.txt", "text"],
    ["text/markdown", "a.md", "text"],
    ["application/json", "a.json", "text"],
    ["application/xml", "a.xml", "text"],
    ["text/xml", "a.xml", "text"],
    ["text/html", "page.html", "text"],
    ["application/xhtml+xml", "a.xhtml", "text"],
    ["application/ld+json", "a.jsonld", "text"],
    ["text/x-python", "a.py", "text"],
    // csv
    ["text/csv", "a.csv", "csv"],
    ["text/tab-separated-values", "a.tsv", "csv"],
    ["text/plain", "prices.csv", "csv"],
    ["text/plain", "prices.tsv", "csv"],
    // office
    [XLSX, "book.xlsx", "sheet"],
    [PPTX, "deck.pptx", "slides"],
    [DOCX, "letter.docx", "doc"],
    // legacy office formats have no importer
    ["application/vnd.ms-excel", "old.xls", "none"],
    ["application/vnd.ms-powerpoint", "old.ppt", "none"],
    ["application/msword", "old.doc", "none"],
    // everything else
    ["application/zip", "backup.zip", "none"],
    ["application/octet-stream", "blob.bin", "none"],
    ["", "README", "none"],
    ["video/x-matroska", "a.mkv", "none"],
  ];
  for (const [mime, name, kind] of byMime) {
    test(`${JSON.stringify(mime)} + ${name} → ${kind}`, () => expect(drivePreviewKind(mime, name)).toBe(kind));
  }

  test("a missing, generic or unknown type defers to the extension", () => {
    const cases: Array<[string, string, DrivePreviewKind]> = [
      ["", "photo.JPG", "image"],
      ["application/octet-stream", "clip.mp4", "video"],
      ["", "voice.m4a", "audio"],
      ["", "menu.pdf", "pdf"],
      ["application/octet-stream", "notes.md", "text"],
      ["", "server.log", "text"],
      // Windows reports .csv as the legacy Excel type.
      ["application/vnd.ms-excel", "prices.csv", "csv"],
      // Some pickers report OOXML packages as zip.
      ["application/zip", "book.xlsx", "sheet"],
      ["application/x-zip-compressed", "deck.pptx", "slides"],
      ["application/octet-stream", "letter.docx", "doc"],
      ["garbage", "image.png", "image"],
      ["", "IMG_2.heic", "none"],
      ["", "old.xls", "none"],
      ["", "x.unknown", "none"],
    ];
    for (const [mime, name, kind] of cases) expect(drivePreviewKind(mime, name)).toBe(kind);
  });

  test("a specific stored type wins over a disagreeing extension", () => {
    expect(drivePreviewKind("image/png", "file.pdf")).toBe("image");
    expect(drivePreviewKind("application/pdf", "file.png")).toBe("pdf");
    expect(drivePreviewKind("text/html", "file.png")).toBe("text");
  });
});

describe("canInlinePdf", () => {
  const desktop = { native: false, appleTouch: false, pdfViewerEnabled: true };

  test("desktop web with a PDF viewer, up to the size cap", () => {
    expect(canInlinePdf(desktop, 1024)).toBe(true);
    expect(canInlinePdf(desktop, DRIVE_PDF_INLINE_MAX_BYTES)).toBe(true);
    expect(canInlinePdf(desktop, DRIVE_PDF_INLINE_MAX_BYTES + 1)).toBe(false);
    expect(canInlinePdf(desktop, 0)).toBe(false);
    expect(canInlinePdf(desktop, Number.NaN)).toBe(false);
  });

  test("never in a native shell, on Apple touch devices, or without a known PDF viewer", () => {
    expect(canInlinePdf({ ...desktop, native: true }, 1024)).toBe(false);
    expect(canInlinePdf({ ...desktop, appleTouch: true }, 1024)).toBe(false);
    expect(canInlinePdf({ ...desktop, pdfViewerEnabled: false }, 1024)).toBe(false);
    expect(canInlinePdf({ ...desktop, pdfViewerEnabled: undefined }, 1024)).toBe(false);
  });
});

describe("isPdfMagic", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  test("accepts only a %PDF- prefix", () => {
    expect(isPdfMagic(bytes("%PDF-1.7\n%âãÏÓ"))).toBe(true);
    expect(isPdfMagic(bytes("%PDF-"))).toBe(true);
    expect(isPdfMagic(bytes("%PDF"))).toBe(false);
    expect(isPdfMagic(bytes("%pdf-1.7"))).toBe(false);
    expect(isPdfMagic(bytes(" %PDF-1.7"))).toBe(false);
    expect(isPdfMagic(bytes("<html><body>%PDF-"))).toBe(false);
    expect(isPdfMagic(new Uint8Array(0))).toBe(false);
  });
});

describe("driveUrlPurposeFor and limits", () => {
  test("media streams, everything else is a view", () => {
    expect(driveUrlPurposeFor("video")).toBe("stream");
    expect(driveUrlPurposeFor("audio")).toBe("stream");
    const views: DrivePreviewKind[] = ["image", "pdf", "text", "csv", "sheet", "slides", "doc", "none"];
    for (const kind of views) expect(driveUrlPurposeFor(kind)).toBe("view");
  });

  test("preview byte limits", () => {
    expect(DRIVE_TEXT_PREVIEW_MAX_BYTES).toBe(256 * 1024);
    expect(DRIVE_PDF_INLINE_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
