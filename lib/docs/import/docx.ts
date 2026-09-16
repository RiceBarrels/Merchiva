/**
 * Kept so `./docx` keeps resolving from `lib/docs/import/index.ts`; the reader itself lives in `./docx/`, split
 * across one module per OOXML concern (zip, xml, styles, numbering, runs, paragraphs, tables, sections, headers).
 */
export { docxToHtml, type DocxHtmlResult } from "./docx/index";
