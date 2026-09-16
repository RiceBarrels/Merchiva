/**
 * Headers and footers.
 *
 * Each zone/variant pair is its own Y.XmlFragment on the document's Y.Doc, beside the editor's `default` fragment,
 * so it syncs and persists with the content and needs no schema migration. Word's three variants map 1:1:
 * `w:hdr`/`w:ftr` referenced as `first`, `even` and `default`.
 *
 * Pure module: names, variant resolution and page-field substitution only. No Yjs, no DOM.
 */

export type HeaderFooterZone = "header" | "footer";
export type HeaderFooterVariant = "default" | "first" | "even";

export const HEADER_FOOTER_ZONES: readonly HeaderFooterZone[] = ["header", "footer"];
export const HEADER_FOOTER_VARIANTS: readonly HeaderFooterVariant[] = ["default", "first", "even"];

/** Y.Doc field holding one zone/variant, e.g. `hf:header:first`. */
export function headerFooterField(zone: HeaderFooterZone, variant: HeaderFooterVariant): string {
  return `hf:${zone}:${variant}`;
}

export interface HeaderFooterOptions {
  readonly differentFirstPage: boolean;
  readonly differentOddEven: boolean;
}

/**
 * Which variant a 1-based page number uses. Word's rule: the first page wins over odd/even, and "even" covers
 * pages 2, 4, 6 … only while `differentOddEven` is on.
 */
export function variantForPage(pageNumber: number, options: HeaderFooterOptions): HeaderFooterVariant {
  if (options.differentFirstPage && pageNumber === 1) return "first";
  if (options.differentOddEven && pageNumber % 2 === 0) return "even";
  return "default";
}

/** Variants that can appear at all under these options — the ones worth mounting an editor for. */
export function activeVariants(options: HeaderFooterOptions): readonly HeaderFooterVariant[] {
  const out: HeaderFooterVariant[] = ["default"];
  if (options.differentFirstPage) out.push("first");
  if (options.differentOddEven) out.push("even");
  return out;
}

/** Marks a page-number field in rendered header/footer HTML. */
export const PAGE_FIELD_ATTR = "data-page-field";

export type PageFieldKind = "page" | "pages";

export const PAGE_FIELD_KINDS: readonly PageFieldKind[] = ["page", "pages"];

export function isPageFieldKind(value: unknown): value is PageFieldKind {
  return value === "page" || value === "pages";
}

/**
 * Fills `<span data-page-field="page">` / `"pages"` placeholders in static header/footer HTML with this page's
 * numbers. The HTML comes from our own serializer, so the only thing replaced is the placeholder's text content.
 */
export function substitutePageFields(html: string, pageNumber: number, pageCount: number): string {
  if (!html.includes(PAGE_FIELD_ATTR)) return html;
  return html.replace(
    new RegExp(`(<span[^>]*\\b${PAGE_FIELD_ATTR}="(page|pages)"[^>]*>)([^<]*)(</span>)`, "g"),
    (_all, open: string, kind: string, _text: string, close: string) =>
      `${open}${kind === "pages" ? pageCount : pageNumber}${close}`,
  );
}
