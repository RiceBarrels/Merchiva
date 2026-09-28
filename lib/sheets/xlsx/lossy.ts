// The lossy report (sheets.md §11.8): the parts of a workbook an .xlsx round trip cannot keep. Import
// collects them from the prescan (part names and XML markers) plus the mappers' own findings; export from
// the workbook data plus the writer's findings. The dialogs list them in SHEET_LOSSY_ITEMS order, one
// `sheets.lossy.items.<item>` line each.

import type { ICellData, IWorkbookData } from "@univerjs/presets";
import { SHEET_LOSSY_ITEMS, type SheetLossyItem } from "@/lib/sheets/types";
import { CF_RULE_TYPE, CUSTOM_RANGE_HYPERLINK, DV_TYPE, RESOURCE } from "@/lib/sheets/univer-constants";
import { isRecord, readWorkbookResource } from "./types";

export type { SheetLossyItem } from "@/lib/sheets/types";

/** Zip parts whose presence means the import drops a feature (compared case-insensitively, as OPC names are). */
export const LOSSY_PART_PREFIXES: ReadonlyArray<{ prefix: string; item: SheetLossyItem }> = [
  { prefix: "xl/charts/", item: "charts" },
  { prefix: "xl/chartsheets/", item: "charts" },
  { prefix: "xl/pivottables/", item: "pivotTables" },
  { prefix: "xl/pivotcache/", item: "pivotTables" },
  { prefix: "xl/vbaproject.bin", item: "macros" },
  { prefix: "xl/media/", item: "images" },
  { prefix: "xl/threadedcomments/", item: "threadedComments" },
  { prefix: "xl/externallinks/", item: "externalLinks" },
  { prefix: "xl/slicers/", item: "slicers" },
  { prefix: "xl/slicercaches/", item: "slicers" },
  { prefix: "xl/tables/", item: "tables" },
  { prefix: "xl/activex/", item: "shapes" },
  { prefix: "xl/ctrlprops/", item: "shapes" },
  { prefix: "xl/embeddings/", item: "shapes" },
];

/** Text markers the prescan looks for inside the worksheet, drawing and workbook XML parts. */
export const LOSSY_XML_MARKERS: ReadonlyArray<{ marker: string; item: SheetLossyItem }> = [
  { marker: "x14:sparklineGroups", item: "sparklines" },
  { marker: "<xdr:pic>", item: "images" },
  { marker: "<xdr:pic ", item: "images" },
  { marker: "<xdr:sp>", item: "shapes" },
  { marker: "<xdr:sp ", item: "shapes" },
  { marker: "<sheetProtection", item: "protection" },
  { marker: "<workbookProtection", item: "protection" },
];

/** Bytes a chunk-boundary-safe scanner must carry over between chunks to find every marker. */
export const LOSSY_MARKER_CARRY_BYTES = Math.max(...LOSSY_XML_MARKERS.map((m) => m.marker.length)) - 1;

/** What the prescan saw, as far as the lossy report needs it. */
export interface PrescanLossyFacts {
  /** Every zip entry name. */
  partNames: Iterable<string>;
  /** The LOSSY_XML_MARKERS `marker` values found. */
  markers: Iterable<string>;
  /** stripHugeDataValidations removed a sheet's <dataValidations>. */
  dataValidationStripped: boolean;
}

export function lossyFromPrescan(facts: PrescanLossyFacts): Set<SheetLossyItem> {
  const items = new Set<SheetLossyItem>();
  for (const name of facts.partNames) {
    const lower = name.toLowerCase().replace(/^\//, "");
    for (const { prefix, item } of LOSSY_PART_PREFIXES) if (lower.startsWith(prefix)) items.add(item);
  }
  const markers = new Set(facts.markers);
  for (const { marker, item } of LOSSY_XML_MARKERS) if (markers.has(marker)) items.add(item);
  if (facts.dataValidationStripped) items.add("dataValidationLimit");
  return items;
}

/** Each item once, in the order the dialogs list them. */
export function orderedLossy(items: Iterable<SheetLossyItem>): SheetLossyItem[] {
  const set = new Set(items);
  return SHEET_LOSSY_ITEMS.filter((item) => set.has(item));
}

/** The i18n key of an item's line in the lossy dialogs. */
export function lossyItemKey(item: SheetLossyItem): string {
  return `sheets.lossy.items.${item}`;
}

// ── Export ───────────────────────────────────────────────────────────────────────────────────────

/** The per-sheet values of a `{ [sheetId]: T }` resource. */
function sheetEntries(resource: unknown): unknown[] {
  return isRecord(resource) ? Object.values(resource) : [];
}

function hasDrawings(wb: IWorkbookData): boolean {
  for (const entry of sheetEntries(readWorkbookResource(wb, RESOURCE.DRAWING))) {
    if (!isRecord(entry)) continue;
    if (isRecord(entry.data) && Object.keys(entry.data).length > 0) return true;
    if (Array.isArray(entry.order) && entry.order.length > 0) return true;
  }
  const sheets = isRecord(wb.sheets) ? Object.values(wb.sheets) : [];
  return sheets.some((sheet) => {
    const background = isRecord(sheet) ? sheet.backgroundImage : undefined;
    return isRecord(background) && typeof background.source === "string" && background.source !== "";
  });
}

function hasRule(resource: unknown, test: (rule: Record<string, unknown>) => boolean): boolean {
  return sheetEntries(resource).some((rules) => Array.isArray(rules) && rules.some((rule) => isRecord(rule) && test(rule)));
}

function hasFilterCriteria(wb: IWorkbookData): boolean {
  return sheetEntries(readWorkbookResource(wb, RESOURCE.FILTER)).some(
    (filter) => isRecord(filter) && Array.isArray(filter.filterColumns) && filter.filterColumns.length > 0,
  );
}

/** The distinct hyperlink URLs in a cell's rich text, in text order. */
export function cellLinkUrls(cell: ICellData | null | undefined): Array<{ url: string; tooltip: string }> {
  const ranges = cell?.p?.body?.customRanges;
  if (!Array.isArray(ranges)) return [];
  const links: Array<{ url: string; tooltip: string; start: number }> = [];
  for (const range of ranges) {
    if (!isRecord(range) || range.rangeType !== CUSTOM_RANGE_HYPERLINK || !isRecord(range.properties)) continue;
    const { url, tooltip } = range.properties;
    if (typeof url !== "string" || url === "" || links.some((link) => link.url === url)) continue;
    const start = typeof range.startIndex === "number" ? range.startIndex : 0;
    links.push({ url, tooltip: typeof tooltip === "string" ? tooltip : "", start });
  }
  return links.sort((a, b) => a.start - b.start).map(({ url, tooltip }) => ({ url, tooltip }));
}

function hasRichLinks(wb: IWorkbookData): boolean {
  const sheets = isRecord(wb.sheets) ? Object.values(wb.sheets) : [];
  for (const sheet of sheets) {
    const matrix = isRecord(sheet) ? sheet.cellData : undefined;
    if (!isRecord(matrix)) continue;
    for (const row of Object.values(matrix)) {
      if (!isRecord(row)) continue;
      for (const cell of Object.values(row)) if (isRecord(cell) && cellLinkUrls(cell as ICellData).length > 1) return true;
    }
  }
  return false;
}

/**
 * What an .xlsx export of `wb` leaves out: drawings and background images, icon-set rules, filter criteria,
 * checkbox / multi-select validation (written as a plain list), and extra links inside one cell.
 */
export function lossyForExport(wb: IWorkbookData): Set<SheetLossyItem> {
  const items = new Set<SheetLossyItem>();
  if (hasDrawings(wb)) items.add("images");
  const cf = readWorkbookResource(wb, RESOURCE.CONDITIONAL_FORMATTING);
  if (hasRule(cf, (rule) => isRecord(rule.rule) && rule.rule.type === CF_RULE_TYPE.iconSet)) items.add("iconSets");
  if (hasFilterCriteria(wb)) items.add("filterCriteria");
  const dv = readWorkbookResource(wb, RESOURCE.DATA_VALIDATION);
  if (hasRule(dv, (rule) => rule.type === DV_TYPE.CHECKBOX || rule.type === DV_TYPE.LIST_MULTIPLE)) {
    items.add("unsupportedValidation");
  }
  if (hasRichLinks(wb)) items.add("richLinks");
  return items;
}
