/**
 * Page setup: paper size, orientation, margins and header/footer distances.
 *
 * Pure module — no Yjs, no React, no DOM — so the importer, the exporters and the Bun tests all share it.
 * Lengths are inches; `pxPerInch` is the CSS reference 96, which is also what the page sheet renders at.
 *
 * The value lives in the document's Y.Doc (lib/docs/page-setup-store.ts), not on the SpacetimeDB row: it syncs
 * with the content, survives version restore, and needs no schema migration.
 */

export type PaperId = "letter" | "legal" | "tabloid" | "a3" | "a4" | "a5" | "b5" | "executive" | "custom";

export type PageOrientation = "portrait" | "landscape";

export interface DocMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface DocPageSetup {
  readonly paper: PaperId;
  readonly orientation: PageOrientation;
  /** Portrait dimensions used only when `paper === "custom"`. */
  readonly customWidth: number;
  readonly customHeight: number;
  readonly margins: DocMargins;
  /** Page edge → top of the header box. */
  readonly headerDistance: number;
  /** Page edge → bottom of the footer box. */
  readonly footerDistance: number;
  readonly differentFirstPage: boolean;
  readonly differentOddEven: boolean;
  /** `#rrggbb` page colour, or null for white. */
  readonly background: string | null;
}

export interface PaperSize {
  /** Portrait width, inches. */
  readonly width: number;
  /** Portrait height, inches. */
  readonly height: number;
}

/** CSS reference resolution; the sheet renders 1in as 96px before zoom. */
export const PX_PER_INCH = 96;
/** Visible space between two sheets in the paged canvas, px. */
export const PAGE_STACK_GAP = 24;
export const TWIPS_PER_INCH = 1440;
/** Word stores lengths as EMUs in drawings and twips in `w:pgSz` / `w:pgMar`. */
export const EMU_PER_INCH = 914400;
export const CM_PER_INCH = 2.54;

/**
 * Portrait dimensions in inches. The ISO sizes carry enough decimals that converting to twips lands on the exact
 * values Word writes (A4 = 11906 × 16838), which is what makes a round-trip through `.docx` byte-stable.
 */
export const PAPER_SIZES: Readonly<Record<Exclude<PaperId, "custom">, PaperSize>> = {
  letter: { width: 8.5, height: 11 },
  legal: { width: 8.5, height: 14 },
  tabloid: { width: 11, height: 17 },
  a3: { width: 11.6929134, height: 16.5354331 },
  a4: { width: 8.2677165, height: 11.6929134 },
  a5: { width: 5.8267717, height: 8.2677165 },
  b5: { width: 6.9291339, height: 9.8425197 },
  executive: { width: 7.25, height: 10.5 },
};

/** Order shown in the page-setup dialog. */
export const PAPER_IDS: readonly PaperId[] = ["letter", "legal", "tabloid", "executive", "a3", "a4", "a5", "b5", "custom"];

export const MIN_PAGE_IN = 1;
export const MAX_PAGE_IN = 48;
/** Word's own floor; below this the text column disappears. */
export const MIN_CONTENT_IN = 0.5;

const DEFAULT_MARGIN = 1;

export const DEFAULT_MARGINS: DocMargins = Object.freeze({
  top: DEFAULT_MARGIN,
  right: DEFAULT_MARGIN,
  bottom: DEFAULT_MARGIN,
  left: DEFAULT_MARGIN,
});

/** Paper size follows the locale: US English → Letter, everything else → A4 (docs-editor-ui spec §4.6). */
export function paperForLocale(locale: string): "letter" | "a4" {
  return locale === "en" ? "letter" : "a4";
}

/** Locale-appropriate ruler/dialog unit. Only the US, Liberia and Myanmar read inches; `en` here means US English. */
export function unitForLocale(locale: string): "in" | "cm" {
  return locale === "en" ? "in" : "cm";
}

export function defaultPageSetup(locale: string): DocPageSetup {
  const paper = paperForLocale(locale);
  return {
    paper,
    orientation: "portrait",
    customWidth: PAPER_SIZES[paper].width,
    customHeight: PAPER_SIZES[paper].height,
    margins: DEFAULT_MARGINS,
    headerDistance: 0.5,
    footerDistance: 0.5,
    differentFirstPage: false,
    differentOddEven: false,
    background: null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to 1/10000 in (~0.0025mm), so float noise from twip conversion doesn't churn the CRDT. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function finite(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Portrait dimensions of the chosen paper (custom included). */
function portraitSize(setup: Pick<DocPageSetup, "paper" | "customWidth" | "customHeight">): PaperSize {
  if (setup.paper === "custom") return { width: setup.customWidth, height: setup.customHeight };
  return PAPER_SIZES[setup.paper];
}

/** The page as laid out: portrait dimensions swapped when landscape. */
export function pageSizeIn(setup: DocPageSetup): PaperSize {
  const { width, height } = portraitSize(setup);
  return setup.orientation === "landscape" ? { width: height, height: width } : { width, height };
}

/** Width of the text column, inches. */
export function contentWidthIn(setup: DocPageSetup): number {
  return Math.max(MIN_CONTENT_IN, pageSizeIn(setup).width - setup.margins.left - setup.margins.right);
}

/** Height of the text column, inches. */
export function contentHeightIn(setup: DocPageSetup): number {
  return Math.max(MIN_CONTENT_IN, pageSizeIn(setup).height - setup.margins.top - setup.margins.bottom);
}

export interface PageMetricsPx {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly headerDistance: number;
  readonly footerDistance: number;
}

/** The same numbers in CSS px at 96dpi — what the sheet, the ruler and the pagination plugin lay out with. */
export function pageMetricsPx(setup: DocPageSetup): PageMetricsPx {
  const size = pageSizeIn(setup);
  const pageWidth = Math.round(size.width * PX_PER_INCH);
  const pageHeight = Math.round(size.height * PX_PER_INCH);
  const marginTop = Math.round(setup.margins.top * PX_PER_INCH);
  const marginRight = Math.round(setup.margins.right * PX_PER_INCH);
  const marginBottom = Math.round(setup.margins.bottom * PX_PER_INCH);
  const marginLeft = Math.round(setup.margins.left * PX_PER_INCH);
  return {
    pageWidth,
    pageHeight,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    contentWidth: Math.max(Math.round(MIN_CONTENT_IN * PX_PER_INCH), pageWidth - marginLeft - marginRight),
    contentHeight: Math.max(Math.round(MIN_CONTENT_IN * PX_PER_INCH), pageHeight - marginTop - marginBottom),
    headerDistance: Math.round(setup.headerDistance * PX_PER_INCH),
    footerDistance: Math.round(setup.footerDistance * PX_PER_INCH),
  };
}

/**
 * Clamps a candidate setup into a usable page: sizes inside [1in, 48in], margins that leave at least
 * `MIN_CONTENT_IN` of text column in both directions, and header/footer boxes inside their margins.
 */
export function normalizePageSetup(input: Partial<DocPageSetup> | null | undefined, fallback: DocPageSetup): DocPageSetup {
  const source = input ?? {};
  const paper: PaperId = PAPER_IDS.includes(source.paper as PaperId) ? (source.paper as PaperId) : fallback.paper;
  const orientation: PageOrientation = source.orientation === "landscape" ? "landscape" : "portrait";
  const base = paper === "custom" ? { width: fallback.customWidth, height: fallback.customHeight } : PAPER_SIZES[paper];
  const customWidth = round(clamp(finite(source.customWidth, base.width), MIN_PAGE_IN, MAX_PAGE_IN));
  const customHeight = round(clamp(finite(source.customHeight, base.height), MIN_PAGE_IN, MAX_PAGE_IN));

  const size = pageSizeIn({ paper, orientation, customWidth, customHeight } as DocPageSetup);
  const marginsIn = source.margins ?? fallback.margins;
  // Each pair may take at most (page - MIN_CONTENT_IN); split the surplus proportionally rather than dropping one side.
  const pair = (a: number, b: number, extent: number): [number, number] => {
    const first = Math.max(0, round(finite(a, DEFAULT_MARGIN)));
    const second = Math.max(0, round(finite(b, DEFAULT_MARGIN)));
    const budget = extent - MIN_CONTENT_IN;
    const total = first + second;
    if (total <= budget) return [first, second];
    if (total === 0) return [0, 0];
    const scale = budget / total;
    return [round(first * scale), round(second * scale)];
  };
  const [top, bottom] = pair(marginsIn.top, marginsIn.bottom, size.height);
  const [left, right] = pair(marginsIn.left, marginsIn.right, size.width);

  // A header that reaches past its margin would sit on top of the text.
  const headerDistance = round(clamp(finite(source.headerDistance, fallback.headerDistance), 0, Math.max(0, top)));
  const footerDistance = round(clamp(finite(source.footerDistance, fallback.footerDistance), 0, Math.max(0, bottom)));

  return {
    paper,
    orientation,
    customWidth,
    customHeight,
    margins: { top, right, bottom, left },
    headerDistance,
    footerDistance,
    differentFirstPage: source.differentFirstPage === true,
    differentOddEven: source.differentOddEven === true,
    background: typeof source.background === "string" && /^#[0-9a-f]{6}$/i.test(source.background) ? source.background.toLowerCase() : null,
  };
}

export function samePageSetup(a: DocPageSetup, b: DocPageSetup): boolean {
  return (
    a.paper === b.paper &&
    a.orientation === b.orientation &&
    a.customWidth === b.customWidth &&
    a.customHeight === b.customHeight &&
    a.margins.top === b.margins.top &&
    a.margins.right === b.margins.right &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    a.headerDistance === b.headerDistance &&
    a.footerDistance === b.footerDistance &&
    a.differentFirstPage === b.differentFirstPage &&
    a.differentOddEven === b.differentOddEven &&
    a.background === b.background
  );
}

/** Matches portrait dimensions (within 0.05in) to a known paper, so an imported `w:pgSz` shows as "A4", not "Custom". */
export function matchPaper(widthIn: number, heightIn: number): Exclude<PaperId, "custom"> | null {
  const [w, h] = widthIn <= heightIn ? [widthIn, heightIn] : [heightIn, widthIn];
  for (const id of Object.keys(PAPER_SIZES) as Exclude<PaperId, "custom">[]) {
    const size = PAPER_SIZES[id];
    if (Math.abs(size.width - w) <= 0.05 && Math.abs(size.height - h) <= 0.05) return id;
  }
  return null;
}

export const inToTwips = (value: number): number => Math.round(value * TWIPS_PER_INCH);
export const twipsToIn = (value: number): number => round(value / TWIPS_PER_INCH);
export const inToPx = (value: number): number => value * PX_PER_INCH;
export const pxToIn = (value: number): number => value / PX_PER_INCH;

/** Formats a length for the ruler and the page-setup dialog (2 decimals in, 2 decimals cm). */
export function formatLength(valueIn: number, unit: "in" | "cm"): string {
  const value = unit === "cm" ? valueIn * CM_PER_INCH : valueIn;
  return (Math.round(value * 100) / 100).toString();
}

/** A CSS length (`0.5in`, `36pt`, `48px`, `1.27cm`, `12mm`) in inches; null when it isn't one. */
export function parseCssLengthIn(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(in|pt|px|cm|mm|pc|q)?\s*$/i.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "in":
      return n;
    case "pt":
      return n / 72;
    case "cm":
      return n / CM_PER_INCH;
    case "mm":
      return n / (CM_PER_INCH * 10);
    case "pc":
      return n / 6;
    case "q":
      return n / (CM_PER_INCH * 40);
    default:
      return n / PX_PER_INCH;
  }
}

/** Parses a dialog field back to inches; null when it isn't a number. */
export function parseLength(raw: string, unit: "in" | "cm"): number | null {
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return round(unit === "cm" ? value / CM_PER_INCH : value);
}
