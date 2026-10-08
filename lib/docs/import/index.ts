/**
 * File import entry point (plan §B7.3, docs-editor-ui spec §6.4).
 *
 * This module must stay free of static Tiptap / marked / dompurify imports (only `import type`), because the docs
 * home imports it for drag-and-drop validation. `lib/docs/page-setup` is the one value import: it is pure
 * arithmetic with no dependencies, and an imported page size has to be normalised before it reaches the seed.
 * The converters load with `await import(...)` inside `importFile`:
 * - `.docx` → a WordprocessingML reader → HTML with inline styles, plus page setup and header/footer boxes,
 *   embedded images uploaded (`./docx`)
 * - `.md` / `.markdown` → marked (GFM) → HTML (`./markdown`)
 * - `.html` / `.htm` → as is
 * - `.txt` → editor JSON directly (`./txt`)
 * Every HTML result is task-list-normalised, sanitized with DOMPurify, has its images re-hosted (data URIs are
 * uploaded, never inlined), and is parsed with `generateJSON` against the editor extension set (`./html`).
 *
 * Text files (`.txt`, `.md`, `.html`) are decoded by `./decode` (BOM, HTML charset, UTF-16, UTF-8, then legacy
 * encodings for the user's languages), not assumed to be UTF-8.
 *
 * Error contract: both async functions reject with `DocImportError` (`code` `tooLarge`,
 * `unsupported` or `failed`; `docCode` when document creation failed with a docs reducer error, `driveKey` when a
 * placed create failed with a Drive error) for expected failures. Callers show `toast.error(t(importErrorMessageKey(err)))`,
 * which maps reducer codes to `docs.errors.*` / `drive.errors.*` and unknown errors to `docs.import.failed`.
 * Successful imports with lost formatting are reported by the caller from `result.warnings`
 * (`docs.import.warnings`) and `result.skippedImages` (`docs.import.imagesSkipped`).
 */
import type { JSONContent } from "@tiptap/core";

import type { DocPlacement } from "@/lib/docs/create";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import type { HeaderFooterVariant } from "@/lib/docs/header-footer";
import { defaultPageSetup, normalizePageSetup, type DocPageSetup } from "@/lib/docs/page-setup";
import type { DocErrorCode } from "@/lib/docs/types";
import { isQuotaExceededError } from "@/lib/storage/quota-error";

import { decodeImportText } from "./decode";

export type ImportKind = "docx" | "md" | "html" | "txt";

export interface ImportResult {
  /** First `h1` / title-styled paragraph text, else the HTML `<title>`, else the file name without its extension. */
  title: string;
  /** Sanitized ProseMirror JSON in the editor schema. */
  json: JSONContent;
  /** Paper size, orientation and margins read from the file; null when it didn't say. */
  pageSetup: DocPageSetup | null;
  /** Header/footer boxes per variant, in the header schema. */
  headers: Partial<Record<HeaderFooterVariant, JSONContent>>;
  footers: Partial<Record<HeaderFooterVariant, JSONContent>>;
  /** Converter messages — formatting that couldn't be kept. */
  warnings: number;
  /** Embedded images that failed to upload and were left out. */
  skippedImages: number;
}

/** `accept` attribute for file inputs. */
export const IMPORT_ACCEPT = ".docx,.md,.markdown,.html,.htm,.txt";

/** Files larger than this are rejected with `tooLarge` (20 MB). */
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

/** Mirrors the server's `DOC_TITLE_MAX`. */
const TITLE_MAX = 200;

const EXTENSION_KINDS: Readonly<Record<string, ImportKind>> = {
  docx: "docx",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  txt: "txt",
};

const MIME_KINDS: Readonly<Record<string, ImportKind>> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/html": "html",
  "text/plain": "txt",
};

/** By extension (`.docx .md .markdown .html .htm .txt`), falling back to the MIME type for extensionless files. */
export function detectImportKind(file: File): ImportKind | null {
  const name = file.name.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) {
    const byExtension = EXTENSION_KINDS[name.slice(dot + 1)];
    if (byExtension) return byExtension;
    // A known-but-unsupported extension (e.g. ".pdf") is not rescued by a generic MIME type.
    return null;
  }
  const mime = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_KINDS[mime] ?? null;
}

export type DocImportErrorCode = "tooLarge" | "unsupported" | "failed";

export class DocImportError extends Error {
  readonly code: DocImportErrorCode;
  /** Set when document creation failed with a docs reducer error (e.g. `too_large` above the server's 8 MB state limit). */
  readonly docCode: DocErrorCode | null;
  /** Set when a placed create (a /store panel) failed with a Drive error: its `drive.errors.*` key (`placedCreateErrorKey`). */
  readonly driveKey: string | null;
  constructor(
    code: DocImportErrorCode,
    message?: string,
    options?: { cause?: unknown; docCode?: DocErrorCode | null; driveKey?: string | null },
  ) {
    super(message ?? `Import failed: ${code}`, options);
    this.name = "DocImportError";
    this.code = code;
    this.docCode = options?.docCode ?? null;
    this.driveKey = options?.driveKey ?? null;
  }
}

/** Synchronous pre-flight check (size, then kind). `null` when the file can be imported. */
export function validateImportFile(file: File): Exclude<DocImportErrorCode, "failed"> | null {
  if (file.size > IMPORT_MAX_BYTES) return "tooLarge";
  if (!detectImportKind(file)) return "unsupported";
  return null;
}

const ERROR_KEYS: Readonly<Record<DocImportErrorCode, string>> = {
  tooLarge: "docs.import.tooLarge",
  unsupported: "docs.import.unsupported",
  failed: "docs.import.failed",
};

/**
 * i18n key for any error thrown by `importFile` / `importAsNewDocument`. Reducer failures with a specific docs code
 * (too large to save, not published, …) use that code's `docs.errors.*` message; `invalid` stays generic. A placed
 * create's Drive failure (operator, device_scope, …) uses its `drive.errors.*` message.
 */
export function importErrorMessageKey(err: unknown): string {
  if (err instanceof DocImportError && err.driveKey) return err.driveKey;
  const docCode = err instanceof DocImportError ? err.docCode : docErrorCode(err);
  if (docCode && docCode !== "invalid") return DOC_ERROR_I18N_KEYS[docCode];
  return err instanceof DocImportError ? ERROR_KEYS[err.code] : ERROR_KEYS.failed;
}

/** `"Q3 plan.final.docx"` → `"Q3 plan.final"`; whitespace collapsed, capped at the server's title length. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  const dot = base.lastIndexOf(".");
  return cleanImportTitle(dot > 0 ? base.slice(0, dot) : base);
}

/** Same normalisation as the server's `cleanDocTitle`. */
export function cleanImportTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

export interface ImportFileDeps {
  t: (key: string) => string;
  /** App locale — the fallback paper size for a file that carries no section properties. */
  locale: string;
  /** Uploads an embedded image and resolves to its hosted URL (`uploadDocImage` from `lib/docs/uploads`). */
  uploadImage(file: File): Promise<string>;
}

function asImportError(err: unknown, driveKey: string | null = null): DocImportError {
  if (err instanceof DocImportError) return err;
  return new DocImportError("failed", err instanceof Error ? err.message : undefined, { cause: err, docCode: docErrorCode(err), driveKey });
}

async function readText(file: File, kind: "txt" | "md" | "html"): Promise<string> {
  return decodeImportText(await file.arrayBuffer(), kind);
}

/** Converts a file to sanitized editor JSON. Never creates a document. */
export async function importFile(file: File, deps: ImportFileDeps): Promise<ImportResult> {
  const problem = validateImportFile(file);
  if (problem) throw new DocImportError(problem);
  const kind = detectImportKind(file);
  if (!kind) throw new DocImportError("unsupported");
  const fallbackTitle = titleFromFileName(file.name);

  try {
    if (kind === "txt") {
      const { textToDocJson } = await import("./txt");
      return {
        title: fallbackTitle,
        json: textToDocJson(await readText(file, "txt")),
        pageSetup: null,
        headers: {},
        footers: {},
        warnings: 0,
        skippedImages: 0,
      };
    }

    const { headerFooterHtmlToJson, htmlToDocJson, prepareImportHtml } = await import("./html");

    let rawHtml: string;
    let warnings = 0;
    let skippedImages = 0;
    let pageSetup: DocPageSetup | null = null;
    const headers: Partial<Record<HeaderFooterVariant, JSONContent>> = {};
    const footers: Partial<Record<HeaderFooterVariant, JSONContent>> = {};
    if (kind === "docx") {
      const { docxToHtml } = await import("./docx");
      const converted = await docxToHtml(await file.arrayBuffer(), deps.uploadImage);
      rawHtml = converted.html;
      warnings = converted.warnings;
      skippedImages = converted.skippedImages;
      if (converted.pageSetup) pageSetup = normalizePageSetup(converted.pageSetup, defaultPageSetup(deps.locale));
      for (const [variant, html] of Object.entries(converted.headers)) {
        const json = headerFooterHtmlToJson(html);
        if (json) headers[variant as HeaderFooterVariant] = json;
      }
      for (const [variant, html] of Object.entries(converted.footers)) {
        const json = headerFooterHtmlToJson(html);
        if (json) footers[variant as HeaderFooterVariant] = json;
      }
    } else if (kind === "md") {
      const { markdownToHtml } = await import("./markdown");
      rawHtml = markdownToHtml(await readText(file, "md"));
    } else {
      rawHtml = await readText(file, "html");
    }

    const prepared = await prepareImportHtml(rawHtml, { uploadImage: deps.uploadImage });
    return {
      title: (prepared.title && cleanImportTitle(prepared.title)) || fallbackTitle,
      json: htmlToDocJson(prepared.html),
      pageSetup,
      headers,
      footers,
      warnings,
      skippedImages: skippedImages + prepared.skippedImages,
    };
  } catch (err) {
    // An image refused for a full store: say so, not "the import failed".
    throw asImportError(err, isQuotaExceededError(err) ? "appUpload.quotaExceeded" : null);
  }
}

/**
 * `importFile` + seed + `createDocument({ templateId: "blank" })` (visibility `org_edit`, D40), or with
 * `deps.placement` (a device panel on /store) `createDriveDocument` in that container, owned by the PIN operator.
 * Resolves with the new document id; the caller opens `documentHref(documentId, { isNew: true })`.
 */
export async function importAsNewDocument(
  file: File,
  deps: { t: (key: string) => string; locale: string; organizationId: string; placement?: DocPlacement | null },
): Promise<{ documentId: string; result: ImportResult }> {
  const problem = validateImportFile(file);
  if (problem) throw new DocImportError(problem);

  let modules: [typeof import("@/lib/docs/uploads"), typeof import("@/lib/docs/create")];
  try {
    modules = await Promise.all([import("@/lib/docs/uploads"), import("@/lib/docs/create")]);
  } catch (err) {
    throw asImportError(err);
  }
  const [{ uploadDocImage }, { createDocumentFromContent, placedCreateErrorKey }] = modules;

  const uploadImage = (image: File) => uploadDocImage(image, deps.organizationId);
  const result = await importFile(file, { t: deps.t, locale: deps.locale, uploadImage });
  try {
    const documentId = await createDocumentFromContent({
      title: result.title,
      content: result.json,
      templateId: "blank",
      pageSetup: result.pageSetup,
      headers: result.headers,
      footers: result.footers,
      placement: deps.placement,
    });
    return { documentId, result };
  } catch (err) {
    throw asImportError(err, placedCreateErrorKey(err));
  }
}
