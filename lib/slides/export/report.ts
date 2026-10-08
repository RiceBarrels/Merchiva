// What an export had to simplify (slides.md §10.2, §10.3). The .pptx builder and the raster exports both count
// into a ReportCounter; the File ▸ Download toast shows the total through `slides.export.simplified({n})` and the
// per-code lines through `slides.export.report.<code>`. Pure: no DOM, no pptxgenjs, so the raster path can use it
// without pulling the .pptx builder in.

export type ExportIssueCode =
  | "gradientSolid"
  | "chartSkipped"
  | "imageMissing"
  | "maskApprox"
  | "decorFlattened"
  | "pathTextSplit"
  | "verticalTextFlattened";

export interface ExportReport {
  items: ReadonlyArray<{ code: ExportIssueCode; count: number }>;
}

/** Codes that describe how something was saved, not a loss (the toast leaves them out of its count). */
export const EXPORT_INFO_CODES: ReadonlySet<ExportIssueCode> = new Set<ExportIssueCode>(["decorFlattened"]);

/** Fixed order of the report lines. */
const ORDER: readonly ExportIssueCode[] = [
  "imageMissing",
  "chartSkipped",
  "gradientSolid",
  "maskApprox",
  "pathTextSplit",
  "verticalTextFlattened",
  "decorFlattened",
];

export class ReportCounter {
  private readonly counts = new Map<ExportIssueCode, number>();

  add(code: ExportIssueCode, n = 1): void {
    if (n <= 0) return;
    this.counts.set(code, (this.counts.get(code) ?? 0) + n);
  }

  count(code: ExportIssueCode): number {
    return this.counts.get(code) ?? 0;
  }

  /** Non-zero codes only, in a stable order. */
  toReport(): ExportReport {
    return { items: ORDER.flatMap((code) => (this.count(code) > 0 ? [{ code, count: this.count(code) }] : [])) };
  }
}

/** Items that changed what the reader sees (info codes excluded): the `{n}` of `slides.export.simplified`. */
export function exportWarningCount(report: ExportReport | null): number {
  if (!report) return 0;
  return report.items.reduce((sum, item) => (EXPORT_INFO_CODES.has(item.code) ? sum : sum + item.count), 0);
}
