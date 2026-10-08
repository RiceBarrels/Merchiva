/**
 * Word (.docx) → HTML with inline styles (docs-editor-ui spec §6.4). Loaded on demand by `importFile`.
 *
 * This reads WordprocessingML directly instead of handing the file to a converter that keeps only the document's
 * outline. mammoth is explicit that it discards text colour, font, size, alignment, indentation, line spacing, cell
 * shading, section setup and headers/footers — which is most of what a business document looks like. Everything
 * here exists to keep those.
 *
 * The output is HTML, not editor JSON, because the pipeline that follows already knows what to do with HTML:
 * `prepareImportHtml` sanitizes it with DOMPurify and `htmlToDocJson` parses it with the editor's own schema. So
 * the job is narrow — OOXML in, rich HTML out — and every construct is written as markup the editor's `parseHTML`
 * rules recognise.
 *
 * Order of work: inflate the package, read the three lookup tables every part shares (styles, numbering, theme),
 * render the body, read the final `w:sectPr` for page setup and the header/footer parts it points at, then upload
 * the embedded images (three at a time) and swap them into the placeholders the walk left behind.
 *
 * Failure is expected and survivable: a part that won't parse, a relationship that points nowhere, a construct with
 * no equivalent — each degrades to nothing and adds to `warnings`. Only a file that isn't a readable zip rejects.
 */
import type { HeaderFooterVariant } from "@/lib/docs/header-footer";
import type { DocPageSetup } from "@/lib/docs/page-setup";

import { isQuotaExceededError, rethrowIfQuotaExceeded } from "@/lib/storage/quota-error";
import { createLimiter, IMPORT_SKIPPED_IMAGE_ATTR, toUploadableImage } from "../images";

import { renderBlocks } from "./blocks";
import { createTally, type DocxPackage, type ImageJob, type RenderContext, type RenderTally } from "./context";
import { attributes, replaceImageTokens } from "./emit";
import { renderHeaderFooterParts } from "./header-footer";
import { readNumbering } from "./numbering";
import { paragraphKind } from "./paragraph";
import { readContentTypes, readRels, relsPathFor, type PartRels } from "./parts";
import { inlineText } from "./run";
import { EMPTY_SECTION, lastSectionProperties, readEvenAndOddHeaders, readSection, type SectionInfo } from "./section";
import { readStyles } from "./styles";
import { readTheme } from "./theme";
import { child, children, descendant, parseXml, textOf, type XmlElement } from "./xml";
import { openDocxZip, type DocxZip } from "./zip";

export interface DocxHtmlResult {
  /** Body HTML with inline styles. Fed to `prepareImportHtml` by the caller. */
  html: string;
  /** Title-styled paragraph text, else `docProps/core.xml` dc:title, else null. */
  title: string | null;
  /** From the body's last `w:sectPr`. Null when absent or unreadable. */
  pageSetup: Partial<DocPageSetup> | null;
  /** HTML per variant, from `word/headerN.xml` referenced by the sectPr. Omit empty ones. */
  headers: Partial<Record<HeaderFooterVariant, string>>;
  footers: Partial<Record<HeaderFooterVariant, string>>;
  /** Count of constructs that could not be represented. */
  warnings: number;
  /** Embedded images that failed to upload and were left out. */
  skippedImages: number;
}

const UPLOAD_CONCURRENCY = 3;
const MAIN_DOCUMENT = "word/document.xml";

/** Runs `fn`, counting a throw as one lost construct rather than failing the import. */
function attempt<T>(tally: RenderTally, fallback: T, fn: () => T): T {
  try {
    return fn();
  } catch {
    tally.warnings += 1;
    return fallback;
  }
}

/** The package's `officeDocument` relationship, so a producer that doesn't use `word/document.xml` still works. */
function mainDocumentPath(zip: DocxZip): string {
  const rels = readRels(parseXml(zip.text(relsPathFor(""))), "");
  for (const rel of rels.byId.values()) {
    if (!rel.external && /\/officeDocument$/i.test(rel.type) && rel.target) return rel.target;
  }
  return MAIN_DOCUMENT;
}

/** First paragraph whose resolved style is `Title`, as plain text. */
function titleFromBody(body: XmlElement, ctx: RenderContext): string | null {
  for (const p of children(body, "w:p")) {
    if (paragraphKind(p, ctx) !== "title") continue;
    const text = inlineText(p);
    if (text) return text;
  }
  return null;
}

/** `docProps/core.xml` `dc:title`. */
function titleFromCoreProperties(zip: DocxZip): string | null {
  const root = parseXml(zip.text("docProps/core.xml"));
  const text = textOf(descendant(root, "dc:title")).replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * Uploads what the walk collected, at most `UPLOAD_CONCURRENCY` at a time. Null means "left out". A store out of
 * storage is not a left-out image: the first refusal stops the rest and fails the import with `[drive.quota_exceeded]`.
 */
async function uploadImages(
  jobs: readonly ImageJob[],
  uploadImage: (file: File) => Promise<string>,
): Promise<{ urls: (string | null)[]; skipped: number }> {
  const limit = createLimiter(UPLOAD_CONCURRENCY);
  const urls: (string | null)[] = new Array<string | null>(jobs.length).fill(null);
  let skipped = 0;
  let outOfRoom: unknown = null;
  await Promise.all(
    jobs.map(async (job, index) => {
      try {
        const file = await toUploadableImage(new Blob([job.bytes], { type: job.contentType }), job.name);
        if (!file) throw new Error(`Unsupported image type ${job.contentType}`);
        urls[index] = await limit(() => (outOfRoom === null ? uploadImage(file) : Promise.reject(outOfRoom)));
      } catch (err) {
        if (isQuotaExceededError(err)) outOfRoom ??= err;
        else skipped += 1;
      }
    }),
  );
  rethrowIfQuotaExceeded(outOfRoom);
  return { urls, skipped };
}

/**
 * Builds the `<img>` a placeholder stands for. A failed upload keeps its place as an empty image marked
 * `IMPORT_SKIPPED_IMAGE_ATTR`, which is how `prepareImportHtml` knows to remove it without counting it twice.
 */
function imageRenderer(jobs: readonly ImageJob[], urls: readonly (string | null)[]): (index: number) => string {
  return (index) => {
    const job = jobs[index];
    const url = urls[index];
    if (!job || !url) return `<img${attributes({ src: "", [IMPORT_SKIPPED_IMAGE_ATTR]: "" })}>`;
    return `<img${attributes({
      src: url,
      width: job.widthPx !== null ? String(job.widthPx) : null,
      height: job.heightPx !== null ? String(job.heightPx) : null,
    })}>`;
  };
}

export async function docxToHtml(
  arrayBuffer: ArrayBuffer,
  uploadImage: (file: File) => Promise<string>,
): Promise<DocxHtmlResult> {
  // The one unrecoverable failure: a file that isn't a zip, or a zip over the inflation limits, isn't a document.
  const zip = await openDocxZip(arrayBuffer);
  const tally = createTally();

  const documentPath = attempt(tally, MAIN_DOCUMENT, () => mainDocumentPath(zip));
  const theme = readTheme(parseXml(zip.text("word/theme/theme1.xml")));
  const pkg: DocxPackage = {
    zip,
    contentTypes: readContentTypes(parseXml(zip.text("[Content_Types].xml"))),
    styles: readStyles(parseXml(zip.text("word/styles.xml")), theme),
    numbering: readNumbering(parseXml(zip.text("word/numbering.xml"))),
    theme,
  };

  const documentRoot = parseXml(zip.text(documentPath));
  const body = child(documentRoot, "w:body");
  const documentRels: PartRels = readRels(parseXml(zip.text(relsPathFor(documentPath))), documentPath);
  const ctx: RenderContext = { pkg, rels: documentRels, partPath: documentPath, zone: "body", tally };

  if (!body) {
    // The package opened but has no readable document part; everything past this point would be invented.
    tally.warnings += 1;
    return { html: "", title: titleFromCoreProperties(zip), pageSetup: null, headers: {}, footers: {}, warnings: tally.warnings, skippedImages: 0 };
  }

  let html = attempt(tally, "", () => renderBlocks(body, ctx));
  const section: SectionInfo = attempt(tally, EMPTY_SECTION, () =>
    readSection(lastSectionProperties(body), readEvenAndOddHeaders(parseXml(zip.text("word/settings.xml")))),
  );

  const headerFooterDeps = { pkg, documentRels, tally };
  let headers = attempt(tally, {}, () => renderHeaderFooterParts(section.headerRefs, "header", headerFooterDeps));
  let footers = attempt(tally, {}, () => renderHeaderFooterParts(section.footerRefs, "footer", headerFooterDeps));

  const jobs = tally.images;
  let skippedImages = 0;
  if (jobs.length > 0) {
    const uploaded = await uploadImages(jobs, uploadImage);
    skippedImages = uploaded.skipped;
    const render = imageRenderer(jobs, uploaded.urls);
    html = replaceImageTokens(html, render);
    headers = mapHtml(headers, (value) => replaceImageTokens(value, render));
    footers = mapHtml(footers, (value) => replaceImageTokens(value, render));
  }

  const title = attempt(tally, null, () => titleFromBody(body, ctx)) ?? titleFromCoreProperties(zip);

  return {
    html,
    title,
    pageSetup: section.pageSetup,
    headers,
    footers,
    warnings: tally.warnings,
    skippedImages,
  };
}

function mapHtml(
  source: Partial<Record<HeaderFooterVariant, string>>,
  fn: (value: string) => string,
): Partial<Record<HeaderFooterVariant, string>> {
  const out: Partial<Record<HeaderFooterVariant, string>> = {};
  for (const [variant, value] of Object.entries(source) as [HeaderFooterVariant, string][]) out[variant] = fn(value);
  return out;
}
