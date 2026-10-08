/**
 * Forms responses export: a rows/columns table (reused by an .xlsx export) and its CSV.
 *
 * The CSV goes through the formula-injection-safe helpers in `lib/sheets/xlsx/csv.ts` (never `lib/export.ts`
 * `downloadCSV`): respondents type the cells, so a text cell starting with = + - @ TAB or CR gets a leading
 * apostrophe, while real numbers (like -18.5) stay numeric. Copy comes from `t()` with the keys in
 * `FORM_EXPORT_KEYS`; option ids are always shown as their labels, never raw.
 */
import { sheetToSafeCsv } from "@/lib/sheets/xlsx/csv";
import type { AnswerValue, FormDefinitionV1, FormResponseView, InputQuestion, ResponseSource, ReviewStatus } from "./types";

/** A cell: text, or a number that a spreadsheet should keep numeric. '' = no answer. */
export type ExportCell = string | number;

export interface ExportColumn {
  /** `submittedAt` | `respondent` | `source` | `reviewStatus`, or the question id. */
  id: string;
  header: string;
  /** Set on answer columns. */
  questionId?: string;
}

export interface ResponseTable {
  columns: ExportColumn[];
  /** One row per response, oldest first, aligned with `columns`. */
  rows: ExportCell[][];
}

/** The response fields the export reads. */
export type ExportResponse = Pick<FormResponseView, "answers" | "respondentName" | "source" | "reviewStatus" | "createdAt">;

export interface BuildResponseTableOptions {
  t: (key: string) => string;
  /** How the submitted-at cell reads. Default: ISO 8601 (`toISOString`), unambiguous in every spreadsheet. */
  formatTimestamp?: (at: Date) => string;
  /** Include archived questions (default true: their old answers are still data). */
  includeArchived?: boolean;
}

const SOURCE_KEYS: Record<ResponseSource, string> = {
  manager: "forms.export.source.manager",
  store: "forms.export.source.store",
  personal: "forms.export.source.personal",
  public: "forms.export.source.public",
};

const REVIEW_KEYS: Record<ReviewStatus, string> = {
  new: "forms.export.review.new",
  reviewed: "forms.export.review.reviewed",
};

/** The export's own copy keys (written by the Forms i18n step). */
export const FORM_EXPORT_KEY = {
  submittedAt: "forms.export.submittedAt",
  respondent: "forms.export.respondent",
  sourceHeader: "forms.export.sourceHeader",
  reviewHeader: "forms.export.reviewHeader",
  anonymous: "forms.export.anonymous",
  yes: "forms.export.yes",
  no: "forms.export.no",
  removedOption: "forms.export.removedOption",
} as const;

/** Every i18n key the export references. */
export const FORM_EXPORT_KEYS: readonly string[] = [
  ...Object.values(FORM_EXPORT_KEY),
  ...Object.values(SOURCE_KEYS),
  ...Object.values(REVIEW_KEYS),
];

/** Joins multi-choice labels; a semicolon, since labels often contain commas. */
const LIST_SEPARATOR = "; ";

function answerCell(q: InputQuestion, value: AnswerValue | undefined, t: (key: string) => string): ExportCell {
  if (value === undefined) return "";
  switch (q.type) {
    case "short_text":
    case "long_text":
    case "date":
    case "time":
      return typeof value === "string" ? value : "";
    case "single_choice":
    case "dropdown":
    case "multi_choice": {
      const ids = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
      return ids.map((id) => q.options.find((o) => o.id === id)?.label ?? t(FORM_EXPORT_KEY.removedOption)).join(LIST_SEPARATOR);
    }
    case "yes_no":
    case "checklist_item":
      return typeof value === "boolean" ? t(value ? FORM_EXPORT_KEY.yes : FORM_EXPORT_KEY.no) : "";
    case "number":
    case "rating":
    case "scale":
      return typeof value === "number" && Number.isFinite(value) ? value : "";
    case "photo":
    case "file":
      // The file count: the files themselves are Drive items, opened from the app, not from a spreadsheet.
      return typeof value === "object" && value !== null && !Array.isArray(value) && Array.isArray(value.driveItemIds)
        ? value.driveItemIds.length
        : "";
  }
}

/** The export table: meta columns, then one column per input question in definition order. */
export function buildResponseTable(
  def: FormDefinitionV1,
  responses: readonly ExportResponse[],
  options: BuildResponseTableOptions,
): ResponseTable {
  const { t } = options;
  const formatTimestamp = options.formatTimestamp ?? ((at: Date) => at.toISOString());
  const includeArchived = options.includeArchived ?? true;
  const questions = def.questions.filter(
    (q): q is InputQuestion => q.type !== "section" && (includeArchived || !q.archived),
  );
  const columns: ExportColumn[] = [
    { id: "submittedAt", header: t(FORM_EXPORT_KEY.submittedAt) },
    { id: "respondent", header: t(FORM_EXPORT_KEY.respondent) },
    { id: "source", header: t(FORM_EXPORT_KEY.sourceHeader) },
    { id: "reviewStatus", header: t(FORM_EXPORT_KEY.reviewHeader) },
    ...questions.map((q) => ({ id: q.id, header: q.title, questionId: q.id })),
  ];
  const ordered = [...responses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const rows = ordered.map((r): ExportCell[] => [
    formatTimestamp(r.createdAt),
    r.respondentName || t(FORM_EXPORT_KEY.anonymous),
    t(SOURCE_KEYS[r.source] ?? SOURCE_KEYS.manager),
    t(REVIEW_KEYS[r.reviewStatus] ?? REVIEW_KEYS.new),
    ...questions.map((q) => answerCell(q, r.answers[q.id], t)),
  ]);
  return { columns, rows };
}

/** The table as a downloadable CSV: injection safe, RFC 4180, CRLF, with a UTF-8 BOM. */
export function responseTableToCsv(table: ResponseTable): string {
  const display = [table.columns.map((c) => c.header), ...table.rows.map((row) => row.map((cell) => String(cell)))];
  return sheetToSafeCsv(display, (r, c) => {
    const cell = r === 0 ? undefined : table.rows[r - 1]?.[c];
    return typeof cell === "number" ? { v: cell } : null;
  });
}

/** `buildResponseTable` + `responseTableToCsv`. */
export function responsesToCsv(
  def: FormDefinitionV1,
  responses: readonly ExportResponse[],
  options: BuildResponseTableOptions,
): string {
  return responseTableToCsv(buildResponseTable(def, responses, options));
}
