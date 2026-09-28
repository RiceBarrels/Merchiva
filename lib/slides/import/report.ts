// What a .pptx import changed or left out (slides.md §10.1). The mapper and the image upload add items while they
// work; the editor shows the finished report once, in the import report dialog. Two codes are information, not
// warnings: they describe how the model differs from the file (no animations, no groups), never a loss the user
// could fix, so importWarningCount leaves them out.

export type ImportIssueCode =
  | "chartPlaceholder" | "mediaDropped" | "mathAsImage" | "smartArtFlattened" | "groupsFlattened" | "imageUnsupported"
  | "imageTooLarge" | "imageUploadFailed" | "patternApprox" | "fontSubstituted" | "linkRemoved" | "verticalText"
  | "transitionApprox" | "animationsDropped" | "filtersDropped" | "slidesTruncated";

/** Display order of the report (losses first, approximations next, information last). */
export const IMPORT_ISSUE_CODES: readonly ImportIssueCode[] = [
  "slidesTruncated", "imageUploadFailed", "imageTooLarge", "imageUnsupported", "mediaDropped", "chartPlaceholder",
  "linkRemoved", "mathAsImage", "smartArtFlattened", "patternApprox", "filtersDropped", "fontSubstituted",
  "verticalText", "transitionApprox", "animationsDropped", "groupsFlattened",
];

/** Codes that are information only: listed in the report, never counted as warnings. */
export const IMPORT_INFO_CODES: ReadonlySet<ImportIssueCode> = new Set<ImportIssueCode>(["animationsDropped", "groupsFlattened"]);

export interface ImportReportItem { code: ImportIssueCode; count: number; detail?: string[] }
/** `slides` is the number of slides the new deck holds. */
export interface ImportReport { slides: number; items: ReadonlyArray<ImportReportItem> }

export interface ImportReportBuilder {
  /** Adds `count` (default 1) to `code`; `detail` (a font name, say) is listed once however often it is added. */
  add(code: ImportIssueCode, count?: number, detail?: string): void;
  count(code: ImportIssueCode): number;
  build(slides: number): ImportReport;
}

/** Details kept per code (the dialog lists them; more would not be read). */
const MAX_DETAILS = 20;
const MAX_DETAIL_CHARS = 80;

export function createImportReportBuilder(): ImportReportBuilder {
  const counts = new Map<ImportIssueCode, number>();
  const details = new Map<ImportIssueCode, Set<string>>();
  return {
    add(code, count = 1, detail) {
      if (!Number.isFinite(count) || count <= 0) return;
      counts.set(code, (counts.get(code) ?? 0) + Math.floor(count));
      const text = typeof detail === "string" ? detail.trim().slice(0, MAX_DETAIL_CHARS) : "";
      if (text === "") return;
      const set = details.get(code) ?? new Set<string>();
      if (set.size < MAX_DETAILS) set.add(text);
      details.set(code, set);
    },
    count(code) {
      return counts.get(code) ?? 0;
    },
    build(slides) {
      const items: ImportReportItem[] = [];
      for (const code of IMPORT_ISSUE_CODES) {
        const count = counts.get(code) ?? 0;
        if (count <= 0) continue;
        const list = details.get(code);
        items.push(list && list.size > 0 ? { code, count, detail: [...list] } : { code, count });
      }
      return { slides: Math.max(0, Math.floor(slides)), items };
    },
  };
}

/** Sum of the item counts, leaving out IMPORT_INFO_CODES (what Drive shows as "N warnings"). */
export function importWarningCount(report: ImportReport): number {
  let total = 0;
  for (const item of report.items) if (!IMPORT_INFO_CODES.has(item.code)) total += item.count;
  return total;
}

/** i18n key of an item's line (each takes `{n}`). */
export function importIssueKey(code: ImportIssueCode): string {
  return `slides.import.report.${code}`;
}
