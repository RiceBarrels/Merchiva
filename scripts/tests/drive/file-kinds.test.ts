// lib/drive/file-kinds.ts (kinds, import targets, thumbnails, preview modes) and
// lib/drive/format.ts (byte sizes).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRIVE_FILE_KINDS,
  DRIVE_ORIGINAL_THUMB_MAX_BYTES,
  extensionOf,
  fileKindOf,
  importTargetOf,
  isThumbable,
  previewModeOf,
  readPreviewEnv,
  type PreviewEnv,
} from "@/lib/drive/file-kinds";
import { formatDriveBytes } from "@/lib/drive/format";
import { DRIVE_PDF_INLINE_MAX_BYTES, type DrivePreviewKind } from "@/lib/drive/preview";
import { DRIVE_DEFAULT_QUOTA_BYTES, DRIVE_MAX_FILE_BYTES } from "@/lib/drive/rules";
import { MESSAGES_DIR, flattenMessages, leavesOf, loadFragments } from "@/scripts/i18n/drive/fragment";

const OOXML = "application/vnd.openxmlformats-officedocument";
const MIB = 1024 ** 2;

describe("fileKindOf", () => {
  test("by stored type and by extension", () => {
    const cases: [string, string, string][] = [
      ["image/png", "a.png", "image"],
      ["", "photo.JPG", "image"],
      ["image/heic", "IMG_1.HEIC", "image"],
      ["", "scan.tiff", "image"],
      ["image/svg+xml", "logo.svg", "image"],
      ["application/pdf", "menu.pdf", "pdf"],
      ["application/octet-stream", "menu.pdf", "pdf"],
      ["video/quicktime", "clip.mov", "video"],
      ["video/x-matroska", "clip.mkv", "video"],
      ["audio/mpeg", "song.mp3", "audio"],
      ["audio/x-aiff", "take.aif", "audio"],
      ["text/plain", "notes.txt", "text"],
      ["application/json", "data.json", "text"],
      ["text/html", "page.html", "text"],
      ["text/csv", "stock.csv", "csv"],
      ["text/plain", "stock.csv", "csv"],
      ["application/vnd.ms-excel", "stock.csv", "csv"],
      [`${OOXML}.wordprocessingml.document`, "letter.docx", "document"],
      ["application/msword", "old.doc", "document"],
      ["", "draft.odt", "document"],
      ["application/rtf", "memo.rtf", "document"],
      [`${OOXML}.spreadsheetml.sheet`, "stock.xlsx", "spreadsheet"],
      ["application/zip", "stock.xlsx", "spreadsheet"],
      ["application/vnd.ms-excel", "old.xls", "spreadsheet"],
      ["", "numbers.numbers", "spreadsheet"],
      [`${OOXML}.presentationml.presentation`, "deck.pptx", "presentation"],
      ["application/vnd.ms-powerpoint", "deck.ppt", "presentation"],
      ["", "talk.key", "presentation"],
      ["application/zip", "photos.zip", "archive"],
      ["", "backup.tar.gz", "archive"],
      ["application/x-7z-compressed", "a.7z", "archive"],
      ["application/octet-stream", "firmware.bin", "other"],
      ["", "README", "other"],
      ["not a type", "mystery", "other"],
    ];
    for (const [mime, name, kind] of cases) expect([mime, name, fileKindOf(mime, name)]).toEqual([mime, name, kind]);
  });

  test("the kinds are listed in the type filter's order", () => {
    expect([...DRIVE_FILE_KINDS]).toEqual([
      "image", "pdf", "video", "audio", "text", "csv", "document", "spreadsheet", "presentation", "archive", "other",
    ]);
  });

  test("every kind, folder and editor kind has a drive.kind label in English: messages/en.json or a Drive i18n fragment", () => {
    const known = new Set(flattenMessages(JSON.parse(readFileSync(join(MESSAGES_DIR, "en.json"), "utf8"))).keys());
    for (const fragment of loadFragments()) for (const key of leavesOf(fragment, "en").keys()) known.add(key);
    const missing = [...DRIVE_FILE_KINDS, "folder", "doc", "sheet", "slides"]
      .map((kind) => `drive.kind.${kind}`)
      .filter((key) => !known.has(key));
    expect(missing).toEqual([]);
  });

  test("extensionOf follows the server's extension rule", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
    expect(extensionOf("setup.exe. ")).toBe("exe");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("a.tar.gz")).toBe("gz");
  });
});

describe("importTargetOf", () => {
  test("Docs, Sheets and Slides importers by extension", () => {
    const cases: [string, string, string | null][] = [
      [`${OOXML}.wordprocessingml.document`, "letter.docx", "doc"],
      ["text/markdown", "notes.md", "doc"],
      ["", "notes.markdown", "doc"],
      ["text/html", "page.htm", "doc"],
      ["text/plain", "notes.TXT", "doc"],
      [`${OOXML}.spreadsheetml.sheet`, "stock.xlsx", "sheet"],
      ["application/zip", "stock.xlsx", "sheet"],
      ["", "macros.xlsm", "sheet"],
      ["text/csv", "stock.csv", "sheet"],
      [`${OOXML}.presentationml.presentation`, "deck.pptx", "slides"],
      // No importer: legacy binaries and other formats.
      ["application/msword", "old.doc", null],
      ["application/vnd.ms-excel", "old.xls", null],
      ["application/vnd.ms-powerpoint", "old.ppt", null],
      ["", "draft.odt", null],
      ["text/tab-separated-values", "stock.tsv", null],
      ["application/pdf", "menu.pdf", null],
      ["image/png", "a.png", null],
      // A known extension is never rescued by a text type.
      ["text/plain", "menu.pdf", null],
    ];
    for (const [mime, name, target] of cases) expect([mime, name, importTargetOf(mime, name)]).toEqual([mime, name, target]);
  });

  test("without an extension the type decides", () => {
    expect(importTargetOf(`${OOXML}.wordprocessingml.document`, "letter")).toBe("doc");
    expect(importTargetOf("text/plain; charset=utf-8", "README")).toBe("doc");
    expect(importTargetOf(`${OOXML}.spreadsheetml.sheet`, "export")).toBe("sheet");
    expect(importTargetOf("text/csv", "export")).toBe("sheet");
    expect(importTargetOf(`${OOXML}.presentationml.presentation`, "deck")).toBe("slides");
    expect(importTargetOf("application/octet-stream", "blob")).toBeNull();
  });
});

describe("isThumbable", () => {
  test("small images the browser can draw and view-sign", () => {
    expect(isThumbable({ mimeType: "image/jpeg", name: "a.jpg", sizeBytes: 1000 })).toBe(true);
    expect(isThumbable({ mimeType: "", name: "a.webp", sizeBytes: DRIVE_ORIGINAL_THUMB_MAX_BYTES })).toBe(true);
    expect(DRIVE_ORIGINAL_THUMB_MAX_BYTES).toBe(3 * MIB);
  });

  test("not too big, empty, HEIC, SVG or non-images", () => {
    expect(isThumbable({ mimeType: "image/jpeg", name: "a.jpg", sizeBytes: DRIVE_ORIGINAL_THUMB_MAX_BYTES + 1 })).toBe(false);
    expect(isThumbable({ mimeType: "image/jpeg", name: "a.jpg", sizeBytes: 0 })).toBe(false);
    expect(isThumbable({ mimeType: "image/heic", name: "a.heic", sizeBytes: 1000 })).toBe(false);
    expect(isThumbable({ mimeType: "image/svg+xml", name: "logo.svg", sizeBytes: 1000 })).toBe(false);
    // The kind falls back to the extension for a missing or generic type; so does the active-type check.
    expect(isThumbable({ mimeType: "", name: "logo.svg", sizeBytes: 1000 })).toBe(false);
    expect(isThumbable({ mimeType: "application/octet-stream", name: "logo.svg", sizeBytes: 1000 })).toBe(false);
    expect(isThumbable({ mimeType: "image/svg+xml; charset=utf-8", name: "logo", sizeBytes: 1000 })).toBe(false);
    expect(isThumbable({ mimeType: "application/pdf", name: "a.pdf", sizeBytes: 1000 })).toBe(false);
    expect(isThumbable({ mimeType: "image/png", name: "a.png", sizeBytes: Number.NaN })).toBe(false);
  });
});

describe("previewModeOf", () => {
  const desktop: PreviewEnv = { capacitor: false, nativeShell: false, appleTouch: false, pdfViewerEnabled: true };
  const pdf = 5 * MIB;

  test("a PDF is inline only on desktop web with the browser's viewer", () => {
    expect(previewModeOf("pdf", pdf, desktop)).toBe("pdf");
    expect(previewModeOf("pdf", pdf, { ...desktop, capacitor: true })).toBe("pdfExternal");
    expect(previewModeOf("pdf", pdf, { ...desktop, nativeShell: true })).toBe("pdfExternal"); // Tauri (WKWebView on macOS)
    expect(previewModeOf("pdf", pdf, { ...desktop, appleTouch: true })).toBe("pdfExternal"); // iOS, iPadOS-as-Mac
    expect(previewModeOf("pdf", pdf, { ...desktop, pdfViewerEnabled: false })).toBe("pdfExternal");
    expect(previewModeOf("pdf", pdf, { ...desktop, pdfViewerEnabled: undefined })).toBe("pdfExternal");
    expect(previewModeOf("pdf", DRIVE_PDF_INLINE_MAX_BYTES, desktop)).toBe("pdf");
    expect(previewModeOf("pdf", DRIVE_PDF_INLINE_MAX_BYTES + 1, desktop)).toBe("pdfExternal");
    expect(DRIVE_PDF_INLINE_MAX_BYTES).toBe(50 * MIB);
  });

  test("the other kinds map one to one, office files to the Open-as card", () => {
    const kinds: [DrivePreviewKind, string][] = [
      ["image", "image"], ["video", "video"], ["audio", "audio"], ["text", "text"], ["csv", "csv"],
      ["doc", "office"], ["sheet", "office"], ["slides", "office"], ["none", "none"],
    ];
    for (const [kind, mode] of kinds) {
      expect(previewModeOf(kind, 10, desktop)).toBe(mode as never);
      expect(previewModeOf(kind, 10, { ...desktop, capacitor: true, appleTouch: true })).toBe(mode as never);
    }
  });
});

describe("readPreviewEnv", () => {
  const g = globalThis as { window?: unknown };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const stubbed: string[] = [];
  function stubNavigator(key: string, value: unknown) {
    Object.defineProperty(nav, key, { value, configurable: true });
    stubbed.push(key);
  }

  afterEach(() => {
    delete g.window;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    for (const key of stubbed.splice(0)) delete nav[key];
  });

  test("on the server every flag is off", () => {
    delete g.window;
    expect(readPreviewEnv()).toEqual({ capacitor: false, nativeShell: false, appleTouch: false, pdfViewerEnabled: undefined });
  });

  test("desktop Chrome", () => {
    g.window = { location: { protocol: "https:" } };
    stubNavigator("userAgent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36");
    stubNavigator("maxTouchPoints", 0);
    stubNavigator("pdfViewerEnabled", true);
    expect(readPreviewEnv()).toEqual({ capacitor: false, nativeShell: false, appleTouch: false, pdfViewerEnabled: true });
  });

  test("an iPad reporting a Mac user agent is an Apple touch device", () => {
    g.window = { location: { protocol: "https:" } };
    stubNavigator("userAgent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15");
    stubNavigator("maxTouchPoints", 5);
    stubNavigator("pdfViewerEnabled", true);
    expect(readPreviewEnv().appleTouch).toBe(true);
  });

  test("the Capacitor app", () => {
    g.window = { location: { protocol: "capacitor:" } };
    stubNavigator("userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15");
    stubNavigator("maxTouchPoints", 5);
    const env = readPreviewEnv();
    expect(env.capacitor).toBe(true);
    expect(env.appleTouch).toBe(true);
    expect(env.pdfViewerEnabled).toBeUndefined();
  });
});

describe("formatDriveBytes", () => {
  test("binary steps with one decimal below 100", () => {
    expect(formatDriveBytes(0, "en")).toBe("0 bytes");
    expect(formatDriveBytes(1, "en")).toBe("1 byte");
    expect(formatDriveBytes(512, "en")).toBe("512 bytes");
    expect(formatDriveBytes(1536, "en")).toBe("1.5 kB");
    expect(formatDriveBytes(12.34 * MIB, "en")).toBe("12.3 MB");
    expect(formatDriveBytes(250 * MIB, "en")).toBe("250 MB");
    expect(formatDriveBytes(DRIVE_MAX_FILE_BYTES, "en")).toBe("1 GB");
    expect(formatDriveBytes(DRIVE_DEFAULT_QUOTA_BYTES, "en")).toBe("10 GB");
  });

  test("a value that would round to 1024 moves to the next unit", () => {
    expect(formatDriveBytes(1023.96 * 1024, "en")).toBe("1 MB");
    expect(formatDriveBytes(1023, "en")).toBe("1,023 bytes");
  });

  test("negative and non-finite input reads as 0", () => {
    expect(formatDriveBytes(-5, "en")).toBe("0 bytes");
    expect(formatDriveBytes(Number.NaN, "en")).toBe("0 bytes");
    expect(formatDriveBytes(Number.POSITIVE_INFINITY, "en")).toBe("0 bytes");
  });

  test("units and numbers follow the app locale", () => {
    // CLDR puts a (narrow) no-break space between number and unit.
    expect(formatDriveBytes(12.34 * MIB, "fr")).toMatch(/^12,3\sMo$/);
    expect(formatDriveBytes(12.34 * MIB, "es")).toMatch(/^12,3\sMB$/);
    expect(formatDriveBytes(12.34 * MIB, "zh-cn")).toContain("12.3");
    expect(formatDriveBytes(12.34 * MIB, "not a locale!")).toBe("12.3 MB");
  });
});
