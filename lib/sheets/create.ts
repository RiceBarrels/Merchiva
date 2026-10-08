// New spreadsheets (sheets.md §0.2, §8): Drive's New ▸ Sheet, the editor's File ▸ New, and every import. A
// sheet is born with its content: createDriveDocument requires a gzipped workbook as the seed of a sheet, so
// the snapshot, its search text and its cell count are built here, never by the first client that opens it.
// Always through createDriveDocument (never the Docs createDocument, whose org_edit default would publish a
// sheet meant for My files): the server derives the visibility from the space and the owner from the
// container or the acting member, so on the store tablet the PIN operator owns the new sheet.
// No Univer runtime and no ExcelJS here: Drive imports this module.

import type { IWorkbookData, LocaleType } from "@univerjs/presets";
import type { DriveDocTarget } from "@/lib/drive/types";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/fmt";
import { createDriveDocument } from "@/lib/spacetimedb/actions/drive";
import { blankWorkbookData } from "./blank";
import { encodeSheetSnapshot } from "./codec";
import { SHEET_TUNING } from "./constants";
import { sanitizeWorkbookData } from "./sanitize";
import { serializeSheetText } from "./serialize-text";
import { UNIVER_LOCALE } from "./univer-constants";

/** A workbook ready to be stored: its encoded snapshot, search text and non-empty cell count. */
export interface SheetContent {
  state: Uint8Array;
  plainText: string;
  cellCount: number;
}

export interface CreateSheetOptions {
  /** App locale of the creator (lib/i18n/config); defaults to the page's language. */
  locale?: string;
  /** The creator's translator; defaults to the dictionary of `locale`. */
  t?: (key: string) => string;
}

/** = DOC_TITLE_MAX of the module. */
export const SHEET_TITLE_MAX = 200;
export const SHEET_BLANK_TEMPLATE_ID = "sheet:blank";
export const SHEET_IMPORT_TEMPLATE_ID = "sheet:import";

const UNIVER_LOCALE_BY_APP: Readonly<Record<string, LocaleType>> = {
  en: UNIVER_LOCALE.EN_US,
  es: UNIVER_LOCALE.ES_ES,
  fr: UNIVER_LOCALE.FR_FR,
  ar: UNIVER_LOCALE.AR_SA,
  "zh-cn": UNIVER_LOCALE.ZH_CN,
  "zh-tw": UNIVER_LOCALE.ZH_TW,
  "zh-hk": UNIVER_LOCALE.ZH_HK,
};

/** Univer's locale for an app locale (as lib/sheets/univer/locale-loader.ts maps it; hi has no pack → English). */
export function univerLocaleOf(appLocale: string): LocaleType {
  return UNIVER_LOCALE_BY_APP[appLocale.toLowerCase()] ?? UNIVER_LOCALE.EN_US;
}

/** The page's language (I18nProvider sets `<html lang>`), else the default locale. */
export function currentAppLocale(): string {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  return normalizeLocale(document.documentElement.lang) ?? DEFAULT_LOCALE;
}

/** `opts.t`, else a translator over the dictionary of `locale`. */
export function sheetTranslator(opts: CreateSheetOptions | undefined, locale: string): (key: string) => string {
  if (opts?.t) return opts.t;
  const dict = getDictionary(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return (key) => lookup(dict, key);
}

/** The name of the n-th sheet in the creator's language (sheets.defaultSheetName: "Sheet{n}"). */
export function defaultSheetName(t: (key: string) => string, n = 1): string {
  return fmt(t("sheets.defaultSheetName"), { n });
}

/** A document title from an uploaded file's name: no path, no extension, trimmed, at most 200 characters. */
export function sheetTitleFromFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/\.(xlsx|xlsm|csv)$/i, "").trim();
  return base.slice(0, SHEET_TITLE_MAX);
}

/** Sanitizes, encodes and serializes a workbook. Throws `[sheet.too_large]` past the snapshot limit. */
export function sheetContentFromWorkbook(wb: IWorkbookData): SheetContent {
  sanitizeWorkbookData(wb);
  const state = encodeSheetSnapshot(wb);
  if (state.byteLength > SHEET_TUNING.stateMaxBytes) throw new Error("[sheet.too_large] Spreadsheet is too large");
  const { plainText, cellCount } = serializeSheetText(wb);
  return { state, plainText, cellCount };
}

/** The content of a new, empty spreadsheet. */
export function blankSheetContent(opts: { title: string; locale: LocaleType; sheetName: string }): SheetContent {
  return sheetContentFromWorkbook(blankWorkbookData({ name: opts.title, locale: opts.locale, sheetName: opts.sheetName }));
}

/** What createSheetFromState sends to createDriveDocument. */
export function sheetDocumentInput(content: SheetContent, target: DriveDocTarget, opts: { templateId: string; title?: string }) {
  return {
    fileType: "sheet" as const,
    organizationId: target.organizationId,
    space: target.space,
    folderId: target.folderId,
    ownerMemberId: target.ownerMemberId,
    actingMemberId: target.actingMemberId,
    title: (opts.title ?? target.title ?? "").slice(0, SHEET_TITLE_MAX),
    templateId: opts.templateId,
    initialState: content.state,
    html: "",
    plainText: content.plainText,
    wordCount: content.cellCount,
  };
}

/**
 * Creates a spreadsheet document holding `content` in `target` and returns its id. Rejects with
 * `[sheet.too_large]` before any request when the snapshot is over the server's limit, or with the reducer's
 * error (`[sheet.quota]`, `[drive.*]`, `[doc.*]`).
 */
export async function createSheetFromState(content: SheetContent, target: DriveDocTarget, opts: { templateId: string; title?: string }): Promise<string> {
  if (content.state.byteLength > SHEET_TUNING.stateMaxBytes) throw new Error("[sheet.too_large] Spreadsheet is too large");
  return createDriveDocument(sheetDocumentInput(content, target, opts));
}

/** createSheetFromState for a workbook in memory (sanitized and encoded here): File ▸ Make a copy of a version, templates. */
export async function createSheetFromWorkbook(wb: IWorkbookData, target: DriveDocTarget, opts: { templateId: string; title?: string }): Promise<string> {
  return createSheetFromState(sheetContentFromWorkbook(wb), target, opts);
}

/** Drive's New ▸ Sheet and File ▸ New: an empty spreadsheet in `target`; resolves to the new document id. */
export async function createSheetDocument(target: DriveDocTarget, opts?: CreateSheetOptions): Promise<string> {
  const locale = opts?.locale ?? currentAppLocale();
  const t = sheetTranslator(opts, locale);
  const content = blankSheetContent({ title: target.title ?? "", locale: univerLocaleOf(locale), sheetName: defaultSheetName(t) });
  return createSheetFromState(content, target, { templateId: SHEET_BLANK_TEMPLATE_ID });
}
