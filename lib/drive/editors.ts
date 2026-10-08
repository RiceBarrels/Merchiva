// Drive's adapter to its three editors (drive-ui UI-3b; CONTRACTS §2.10, §2.11): New ▸ Doc / Sheet / Slides
// (createDriveDoc), a Doc from a store template (createDriveDocFromTemplate) and "Open as Doc / Sheet / Slides" of an
// uploaded .docx, .xlsx, .csv or .pptx (importIntoDrive), used by the manager page and the device lite app.
//
// Every document is created through createDriveDocument, never the Docs createDocument (whose org_edit default
// would publish something meant for My files): the module derives the visibility from the target space and the
// owner from the container or the acting member, so on the store tablet the PIN operator owns what they create.
// Sheets and Slides go through their own create / import modules (lib/sheets/{create,import}, lib/slides/create,
// lib/slides/import), which end in the same wrapper; a text document composes the existing Docs pieces
// (blankDocumentInput, buildDocTemplate or importFile + buildSeed) with it.
//
// No editor module is imported statically: each loads with import() inside the call, so the Drive home pulls none
// of Tiptap, Yjs, Univer, ExcelJS or the .pptx parser into its own chunk. An import failure is rethrown as a
// DriveEditorError that carries the person's copy, because each importer has its own error type; a create failure
// is the reducer's `[drive.*]` / `[doc.*]` / `[sheet.*]` error, which driveErrorKey reads.
//
// The SDK never settles a reducer call sent on a connection that dropped, so callers bound the reply
// (withReducerTimeoutFrom in components/drive/actions/drive-writes.ts). They can't time the whole call: a parse
// may legitimately take long. So `ctx.beforeCreate` marks the moment the create reducer goes out, right after
// the content is built or the file parsed. The Sheets importer can't say when it sends, so it is marked up front
// with the longest its read may take (the xlsx worker's start and read limits).

import type { DocTemplateId } from "@/lib/docs/templates";
import type { DocFileType } from "@/lib/docs/types";
import { DRIVE_GENERIC_ERROR_KEY, driveErrorCode, driveErrorKey } from "@/lib/drive/errors";
import { formatDriveBytes } from "@/lib/drive/format";
import type { DriveDocTarget } from "@/lib/drive/types";
import { fmt } from "@/lib/i18n/fmt";
import { createDriveDocument } from "@/lib/spacetimedb/actions/drive";

/** A document kind Drive creates and opens. */
export type DriveDocKind = Exclude<DocFileType, "unknown">;

export interface DriveEditorContext {
  /** The creator's translator: default sheet names, imported headings, error copy. */
  t: (key: string) => string;
  /** App locale (paper size of an imported doc, the spreadsheet's locale). */
  locale: string;
  /**
   * Called once, right before the create reducer is sent, or up front with `withinMs` when the importer sends within
   * that long but can't say when (see the file comment): where a caller starts timing the reply.
   */
  beforeCreate?(withinMs?: number): void;
}

/** Fallback copy of a failed "Open as …" whose error names nothing more specific. */
export const DRIVE_IMPORT_FAILED_KEY = "drive.home.errors.importFailed";

/** = DOC_STATE_MAX_BYTES of the module: the largest initial state createDriveDocument accepts. */
const DOC_STATE_MAX_BYTES = 8_388_608;

/** A create or import that failed, with the copy to show (already translated with the context's `t`). */
export class DriveEditorError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, cause: unknown) {
    super(userMessage, { cause });
    this.name = "DriveEditorError";
    this.userMessage = userMessage;
  }
}

/** Copy for any failure of createDriveDoc / importIntoDrive: the importer's own, else the error's key, else `fallbackKey`. */
export function driveEditorErrorMessage(err: unknown, t: (key: string) => string, fallbackKey: string = DRIVE_GENERIC_ERROR_KEY): string {
  if (err instanceof DriveEditorError) return err.userMessage;
  const key = driveErrorKey(err);
  return t(key === DRIVE_GENERIC_ERROR_KEY ? fallbackKey : key);
}

/** The createDriveDocument fields every text document shares: where it goes and for whom. */
function placement(target: DriveDocTarget) {
  return {
    organizationId: target.organizationId,
    space: target.space,
    folderId: target.folderId,
    ownerMemberId: target.ownerMemberId ?? "",
    actingMemberId: target.actingMemberId,
  };
}

/**
 * Creates an empty Doc, Sheet or Slides file in `target` (titled `target.title`, else untitled) and resolves to its
 * id. The caller opens `documentFileHref({ id, fileType: kind }, { isNew: true })`. Rejects with the reducer's error.
 */
export async function createDriveDoc(kind: DriveDocKind, target: DriveDocTarget, ctx: DriveEditorContext): Promise<string> {
  switch (kind) {
    case "doc": {
      // One empty paragraph seeded at creation, so two first edits share it (lib/docs/blank-state.ts).
      const { blankDocumentInput } = await import("@/lib/docs/blank-state");
      ctx.beforeCreate?.();
      return createDriveDocument({ ...placement(target), fileType: "doc", title: target.title ?? "", ...blankDocumentInput() });
    }
    // A blank workbook or deck is built synchronously on the way to the reducer.
    case "sheet": {
      const { createSheetDocument } = await import("@/lib/sheets/create");
      ctx.beforeCreate?.();
      return createSheetDocument(target, { t: ctx.t, locale: ctx.locale });
    }
    case "slides": {
      const { createSlidesDocument } = await import("@/lib/slides/create");
      ctx.beforeCreate?.();
      return createSlidesDocument(target);
    }
  }
}

/**
 * Creates a Doc from one of the Docs store templates (lib/docs/templates.ts) in `target` (titled `target.title`, else
 * the template's title) and resolves to its id. The template's headings, dates and names are resolved once, in the
 * creator's language, and seeded at creation like an import. The caller opens
 * `documentFileHref({ id, fileType: "doc" }, { isNew: true })`. Rejects like createDriveDoc, with the reducer's error
 * (or `[doc.too_large]` before sending a state the module would refuse).
 */
export async function createDriveDocFromTemplate(
  templateId: Exclude<DocTemplateId, "blank">,
  target: DriveDocTarget,
  ctx: DriveEditorContext & { storeName: string | null; authorName: string | null },
): Promise<string> {
  const [{ buildDocTemplate }, { buildSeed }] = await Promise.all([import("@/lib/docs/templates"), import("@/lib/docs/seed")]);
  const template = buildDocTemplate(templateId, ctx.t, { locale: ctx.locale, storeName: ctx.storeName, authorName: ctx.authorName });
  const seed = buildSeed(template.content);
  if (seed.initialState.byteLength > DOC_STATE_MAX_BYTES) throw new Error("[doc.too_large] Document is too large");
  ctx.beforeCreate?.();
  return createDriveDocument({
    ...placement(target),
    fileType: "doc",
    title: target.title?.trim() || template.title,
    templateId,
    initialState: seed.initialState,
    html: seed.html,
    plainText: seed.plainText,
    wordCount: seed.wordCount,
  });
}

export interface DriveImportContext extends DriveEditorContext {
  /** The Drive file being opened: a deck records it as its source (meta.source). */
  driveItemId?: string;
}

/** What an "Open as …" file looks like before its bytes are fetched. */
export interface DriveImportFileInfo {
  name: string;
  size: number;
  type: string;
}

/**
 * Why `file` cannot be opened as `kind` (translated), or null when it can: the importer's own size and type rules,
 * checked before any byte is downloaded.
 */
export async function checkDriveImport(kind: DriveDocKind, file: DriveImportFileInfo, ctx: DriveEditorContext): Promise<string | null> {
  switch (kind) {
    case "doc": {
      const { IMPORT_MAX_BYTES, detectImportKind } = await import("@/lib/docs/import");
      if (file.size > IMPORT_MAX_BYTES) return ctx.t("docs.import.tooLarge");
      return detectImportKind(new File([], file.name, { type: file.type })) ? null : ctx.t("docs.import.unsupported");
    }
    case "sheet": {
      const { spreadsheetKind, spreadsheetMaxBytes } = await import("@/lib/sheets/xlsx/client");
      const sheetKind = spreadsheetKind(file);
      if (!sheetKind) return ctx.t("sheets.import.unsupported");
      const max = spreadsheetMaxBytes(sheetKind);
      if (file.size <= max) return null;
      return fmt(ctx.t("sheets.import.tooLarge"), { size: formatDriveBytes(file.size, ctx.locale), max: formatDriveBytes(max, ctx.locale) });
    }
    case "slides": {
      const { SlidesImportError, checkPptxFile, slidesImportErrorMessage } = await import("@/lib/slides/import");
      const problem = checkPptxFile(file);
      return problem ? slidesImportErrorMessage(new SlidesImportError(problem), ctx.t) : null;
    }
  }
}

/** A Drive, Docs or Sheets reducer error keeps its own copy; anything else gets the importer's. */
function reducerKey(err: unknown): string | null {
  const key = driveErrorKey(err);
  return driveErrorCode(err) !== null || key !== DRIVE_GENERIC_ERROR_KEY ? key : null;
}

async function importDoc(file: File, target: DriveDocTarget, ctx: DriveImportContext): Promise<{ documentId: string; warnings: number }> {
  const [{ importErrorMessageKey, importFile }, { uploadDocImage }, { buildSeed }] = await Promise.all([
    import("@/lib/docs/import"),
    import("@/lib/docs/uploads"),
    import("@/lib/docs/seed"),
  ]);
  try {
    const uploadImage = (image: File) => uploadDocImage(image, target.organizationId);
    const result = await importFile(file, { t: ctx.t, locale: ctx.locale, uploadImage });
    const seed = buildSeed(result.json, { pageSetup: result.pageSetup, headers: result.headers, footers: result.footers });
    // Fail before the request rather than send more than the module accepts (docs.errors.tooLarge).
    if (seed.initialState.byteLength > DOC_STATE_MAX_BYTES) throw new Error("[doc.too_large] Document is too large");
    ctx.beforeCreate?.();
    const documentId = await createDriveDocument({
      ...placement(target),
      fileType: "doc",
      title: target.title?.trim() || result.title,
      templateId: "blank",
      initialState: seed.initialState,
      html: seed.html,
      plainText: seed.plainText,
      wordCount: seed.wordCount,
    });
    return { documentId, warnings: result.warnings + result.skippedImages };
  } catch (err) {
    const drive = driveErrorCode(err) !== null ? driveErrorKey(err) : null;
    throw new DriveEditorError(ctx.t(drive ?? importErrorMessageKey(err)), err);
  }
}

async function importSheet(file: File, target: DriveDocTarget, ctx: DriveImportContext): Promise<{ documentId: string; warnings: number }> {
  const [{ importSheetFile }, xlsx] = await Promise.all([import("@/lib/sheets/import"), import("@/lib/sheets/xlsx/client")]);
  const { SpreadsheetReadError, spreadsheetKind, spreadsheetMaxBytes, spreadsheetReadErrorKey } = xlsx;
  try {
    ctx.beforeCreate?.(xlsx.XLSX_WORKER_READY_MS + xlsx.XLSX_READ_TIMEOUT_MS);
    const outcome = await importSheetFile(file, target, { t: ctx.t, locale: ctx.locale });
    return { documentId: outcome.documentId, warnings: outcome.warnings };
  } catch (err) {
    if (!(err instanceof SpreadsheetReadError)) throw new DriveEditorError(ctx.t(reducerKey(err) ?? DRIVE_IMPORT_FAILED_KEY), err);
    const kind = spreadsheetKind(file);
    const max = kind ? spreadsheetMaxBytes(kind) : 0;
    const text = fmt(ctx.t(spreadsheetReadErrorKey(err)), {
      size: formatDriveBytes(file.size, ctx.locale),
      max: formatDriveBytes(max, ctx.locale),
    });
    throw new DriveEditorError(text, err);
  }
}

async function importSlides(file: File, target: DriveDocTarget, ctx: DriveImportContext): Promise<{ documentId: string; warnings: number }> {
  const { importSlidesFile, slidesImportErrorMessage } = await import("@/lib/slides/import");
  try {
    const outcome = await importSlidesFile(file, target, {
      driveItemId: ctx.driveItemId,
      onProgress: (progress) => {
        if (progress.stage === "creating") ctx.beforeCreate?.();
      },
    });
    return { documentId: outcome.documentId, warnings: outcome.warnings };
  } catch (err) {
    throw new DriveEditorError(slidesImportErrorMessage(err, ctx.t), err);
  }
}

/**
 * Opens `file` as a new Doc, Sheet or Slides file in `target` (titled `target.title`, else from the file) and
 * resolves to its id and how many things the import could not keep. The original file is left where it is.
 * Rejects with a DriveEditorError (driveEditorErrorMessage has its copy).
 */
export async function importIntoDrive(
  file: File,
  kind: DriveDocKind,
  target: DriveDocTarget,
  ctx: DriveImportContext,
): Promise<{ documentId: string; warnings: number }> {
  switch (kind) {
    case "doc":
      return importDoc(file, target, ctx);
    case "sheet":
      return importSheet(file, target, ctx);
    case "slides":
      return importSlides(file, target, ctx);
  }
}
