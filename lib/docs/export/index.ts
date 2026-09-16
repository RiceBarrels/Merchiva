/**
 * Export entry points (docs-editor-ui spec §6.0–6.3, §6.6).
 *
 * Call site (editor core): build the context from the live editor, or from the preview editor
 * while a version is previewed:
 *   `{ title, json: editor.getJSON(), html: editor.getHTML(), text: editor.getText({ blockSeparator: "\n\n" }), locale, pageSetup, headerFooter }`
 *
 * Every exporter loads its library with `await import(...)` (docx, turndown + turndown-plugin-gfm,
 * jspdf/html2canvas). This file keeps only `import type` from Tiptap so importing it costs nothing.
 *
 * Toast contract: `exportDocument` / `printDocument` own all user feedback. They show
 * `toast.loading(t("docs.export.preparing"))` while working, then `docs.export.imagesSkipped`,
 * `docs.export.unsupported` or `docs.export.failed` as needed. They never reject; the outcome is returned.
 */
import type { JSONContent } from "@tiptap/core";
import { toast } from "sonner";

import { isCapacitorNative } from "@/lib/capacitor";
import { saveBlob, type SaveBlobResult } from "@/lib/docs/download";
import type { HeaderFooterContent } from "@/lib/docs/header-footer-content";
import type { DocPageSetup } from "@/lib/docs/page-setup";
import { fmt } from "@/lib/i18n/fmt";
import { getNativeShellPlatform, isNativeShell } from "@/lib/native-shell";

import { exportFilename, stripCommentSpans } from "./utils";

export { exportFilename, stripCommentSpans } from "./utils";

export type ExportFormat = "pdf" | "docx" | "md" | "html" | "txt";
/** @deprecated The page is described by `DocPageSetup` now; kept for the PDF renderer's jsPDF format names. */
export type DocPaper = "letter" | "a4";

/** File ▸ Download menu order. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ["pdf", "docx", "md", "html", "txt"];

export const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  pdf: "pdf",
  docx: "docx",
  md: "md",
  html: "html",
  txt: "txt",
};

export interface ExportContext {
  title: string;
  json: JSONContent;
  html: string;
  text: string;
  /** App locale; `<html lang>` for HTML export. */
  locale: string;
  /** Paper size, orientation and margins — written into the DOCX section and the PDF page. */
  pageSetup: DocPageSetup;
  /** Header/footer content per variant; DOCX carries it, the other formats drop it. */
  headerFooter: HeaderFooterContent;
}

export interface ExportDeps {
  t: (key: string) => string;
  /**
   * The `<article class="doc-prose">` inside `PrintPortal` (components/docs/editor/print-portal.tsx).
   * Web print writes `stripCommentSpans(ctx.html)` into it right before `window.print()`, so the printout matches
   * the exported content (including a previewed version). The jsPDF fallback renders its own off-screen copy.
   */
  printTarget?: HTMLElement | null;
}

/**
 * - `downloaded` — a file was saved.
 * - `shared` — handed to the native share sheet.
 * - `printed` — the browser print dialog was opened.
 * - `cancelled` — the user dismissed the share sheet.
 * - `unsupported` — no download path on this platform (toast shown).
 * - `failed` — an error occurred (toast shown).
 */
export type ExportOutcome = "downloaded" | "shared" | "printed" | "cancelled" | "unsupported" | "failed";

const MIME: Readonly<Record<Exclude<ExportFormat, "pdf">, string>> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown;charset=utf-8",
  html: "text/html;charset=utf-8",
  txt: "text/plain;charset=utf-8",
};

/** If `afterprint` never fires (some WebViews), restore the tab title after this delay. */
const TITLE_RESTORE_FALLBACK_MS = 1500;

function untitled(t: ExportDeps["t"]): string {
  return t("docs.untitled");
}

/**
 * `window.print()` does nothing inside Capacitor's WebViews and Tauri's macOS WKWebView (plan A3-4); those get the
 * rasterized jsPDF download instead. Windows (WebView2) and Linux (WebKitGTK) print normally.
 */
function needsPdfFallback(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.print !== "function") return true;
  if (isCapacitorNative()) return true;
  try {
    if (isNativeShell() && getNativeShellPlatform() === "macos") return true;
  } catch {
    // Not running in Tauri.
  }
  return false;
}

function reportFailure(t: ExportDeps["t"], err: unknown): ExportOutcome {
  console.error("[docs] export failed", err);
  toast.error(t("docs.export.failed"));
  return "failed";
}

function reportSave(result: SaveBlobResult, skippedImages: number, t: ExportDeps["t"]): ExportOutcome {
  if (result === "unsupported") {
    toast(t("docs.export.unsupported"));
    return "unsupported";
  }
  if (skippedImages > 0 && (result === "downloaded" || result === "shared")) {
    toast.warning(fmt(t("docs.export.imagesSkipped"), { n: skippedImages }));
  }
  return result;
}

async function buildBlob(
  format: Exclude<ExportFormat, "pdf">,
  ctx: ExportContext,
  t: ExportDeps["t"],
): Promise<{ blob: Blob; skippedImages: number }> {
  const title = ctx.title.trim() || untitled(t);
  switch (format) {
    case "docx": {
      const [{ pmJsonToDocx }, { fetchImageForExport }] = await Promise.all([import("./docx"), import("./images")]);
      const { blob, skippedImages } = await pmJsonToDocx(ctx.json, {
        title,
        pageSetup: ctx.pageSetup,
        headerFooter: ctx.headerFooter,
        fetchImage: fetchImageForExport,
        imageLabel: t("docs.export.imagePlaceholder"),
      });
      return { blob: blob.type ? blob : new Blob([blob], { type: MIME.docx }), skippedImages };
    }
    case "md": {
      const { htmlToMarkdown } = await import("./markdown");
      return { blob: new Blob([htmlToMarkdown(stripCommentSpans(ctx.html))], { type: MIME.md }), skippedImages: 0 };
    }
    case "html": {
      const { buildStandaloneHtml } = await import("./html");
      return { blob: new Blob([buildStandaloneHtml({ title, html: ctx.html, locale: ctx.locale, pageSetup: ctx.pageSetup })], { type: MIME.html }), skippedImages: 0 };
    }
    case "txt": {
      const text = ctx.text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      return { blob: new Blob([text ? `${text}\n` : ""], { type: MIME.txt }), skippedImages: 0 };
    }
  }
}

/** Downloads (or shares) the document in the given format. `"pdf"` goes through `printDocument`. Never rejects. */
export async function exportDocument(format: ExportFormat, ctx: ExportContext, deps: ExportDeps): Promise<ExportOutcome> {
  if (format === "pdf") return printDocument(ctx, deps);
  const { t } = deps;
  const toastId = toast.loading(t("docs.export.preparing"));
  try {
    const { blob, skippedImages } = await buildBlob(format, ctx, t);
    const result = await saveBlob(blob, exportFilename(ctx.title, EXPORT_EXTENSIONS[format], untitled(t)));
    toast.dismiss(toastId);
    return reportSave(result, skippedImages, t);
  } catch (err) {
    toast.dismiss(toastId);
    return reportFailure(t, err);
  }
}

function browserPrint(ctx: ExportContext, deps: ExportDeps): ExportOutcome {
  const { t } = deps;
  if (deps.printTarget) deps.printTarget.innerHTML = stripCommentSpans(ctx.html);
  const previousTitle = document.title;
  const printTitle = ctx.title.trim() || untitled(t);
  let restored = false;
  let fallback = 0;
  const restore = () => {
    if (restored) return;
    restored = true;
    window.removeEventListener("afterprint", restore);
    window.clearTimeout(fallback);
    if (document.title === printTitle) document.title = previousTitle;
  };
  window.addEventListener("afterprint", restore);
  // Browsers use the page title as the suggested PDF file name.
  document.title = printTitle;
  try {
    window.print();
  } catch (err) {
    restore();
    throw err;
  }
  // Chromium blocks inside print() and fires afterprint first; Safari returns immediately and fires it on close.
  fallback = window.setTimeout(restore, TITLE_RESTORE_FALLBACK_MS);
  return "printed";
}

/**
 * File ▸ Print, Download ▸ PDF and Mod+P on native. Web: sets `document.title = ctx.title` for the PDF name, calls
 * `window.print()`, and restores the title on `afterprint`. Capacitor and Tauri macOS: jsPDF fallback saved with
 * `saveBlob`. Never rejects.
 */
export async function printDocument(ctx: ExportContext, deps: ExportDeps): Promise<ExportOutcome> {
  const { t } = deps;
  if (typeof window === "undefined" || typeof document === "undefined") return "unsupported";
  if (!needsPdfFallback()) {
    try {
      return browserPrint(ctx, deps);
    } catch (err) {
      return reportFailure(t, err);
    }
  }
  const toastId = toast.loading(t("docs.export.preparing"));
  try {
    const { renderPdfBlob } = await import("./pdf");
    const blob = await renderPdfBlob({ title: ctx.title.trim() || untitled(t), html: ctx.html, pageSetup: ctx.pageSetup });
    const result = await saveBlob(blob, exportFilename(ctx.title, EXPORT_EXTENSIONS.pdf, untitled(t)));
    toast.dismiss(toastId);
    return reportSave(result, 0, t);
  } catch (err) {
    toast.dismiss(toastId);
    return reportFailure(t, err);
  }
}
