// Deck → .pptx (slides.md §10.2), client-side with pptxgenjs, loaded on demand (its ES entry maps its Node-only
// imports away through the package "browser" field). Pictures are fetched first (a few at a time) and embedded as
// data URLs; nothing is read from a path. Each slide gets its background, then its decor flattened into ordinary
// shapes, then its own elements in z order, then its speaker notes; hidden slides stay hidden.
//
// pptxgenjs writes a <a:pPr> in front of EVERY run of a paragraph (pptxgen.es.js genXmlTextBody, step 6), which
// the DrawingML schema does not allow after the first run. normalizePptxParagraphs keeps only each paragraph's
// leading one, so the file is schema-valid and readers do not pick a later, wrong copy.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

import type { SlidesExportImage } from "@/lib/slides/export/image-data";
import { addElementToSlide, type PptxExportContext, type PptxSlideLike } from "@/lib/slides/export/pptx-elements";
import { pptxFontFace } from "@/lib/slides/export/pptx-text";
import { pptxHex, pptxTransparency, slideBackground } from "@/lib/slides/export/render-rules";
import { ReportCounter, type ExportReport } from "@/lib/slides/export/report";
import { collectImageSrcs } from "@/lib/slides/model/read";
import type { DeckSnapshot, MasterSnapshot, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";
import { themeDecorElements } from "@/lib/slides/themes/themes";
import { textJsonToPlain } from "@/lib/slides/text/plain";

export type { ExportIssueCode, ExportReport } from "@/lib/slides/export/report";
export type { PptxExportContext, PptxSlideLike } from "@/lib/slides/export/pptx-elements";
export { addElementToSlide } from "@/lib/slides/export/pptx-elements";
export { textJsonToRuns } from "@/lib/slides/export/pptx-text";

export interface PptxExportDeps {
  fetchImage(src: string): Promise<SlidesExportImage | null>;
  title: string;
}

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
/** Layout name of the deck's own slide size. */
const LAYOUT_NAME = "MERCHIVA";
const IMAGE_FETCH_CONCURRENCY = 4;

/** Fetches every src, a few at a time; a failed fetch is null (reported where the picture is used). */
export async function fetchDeckImages(
  srcs: readonly string[],
  fetchImage: PptxExportDeps["fetchImage"],
  concurrency = IMAGE_FETCH_CONCURRENCY,
): Promise<Map<string, SlidesExportImage | null>> {
  const out = new Map<string, SlidesExportImage | null>();
  let next = 0;
  const worker = async () => {
    while (next < srcs.length) {
      const src = srcs[next++];
      out.set(src, await fetchImage(src).catch(() => null));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, srcs.length)) }, worker));
  return out;
}

/** File extension of a `data:image/<type>;base64,…` URL ("png" when it names none). */
export function dataUrlExtension(dataUrl: string): string {
  return /^data:image\/([a-z0-9.+-]+);/i.exec(dataUrl)?.[1]?.toLowerCase().replace("svg+xml", "svg") ?? "png";
}

/** The decor behind a slide: the theme's code-drawn decor, or an imported master's elements. */
export function slideDecor(snap: DeckSnapshot, slide: SlideSnapshot, master: MasterSnapshot | null): readonly SlideElement[] {
  if (slide.masterId === "theme") return themeDecorElements(snap.meta.theme, snap.meta.size, slide.layout);
  return master?.elements ?? [];
}

/** Background, decor, elements, notes and visibility of one slide. */
export function fillPptxSlide(target: PptxSlideLike, snap: DeckSnapshot, slide: SlideSnapshot, ctx: PptxExportContext): void {
  const { theme } = snap.meta;
  const master = slide.masterId !== "" && slide.masterId !== "theme" ? (snap.masters.find((m) => m.id === slide.masterId) ?? null) : null;
  const bg = slideBackground(slide, master, theme);
  if (bg.t === "solid") {
    target.background = { color: pptxHex(bg.color, theme), transparency: pptxTransparency(bg.alpha) };
  } else if (bg.t === "linear" && bg.stops.length > 0) {
    ctx.report.add("gradientSolid");
    target.background = { color: pptxHex(bg.stops[0].color, theme) };
  } else if (bg.t === "image") {
    const data = ctx.images.get(bg.src) ?? null;
    // pptxgenjs names a background's media part after `path` (default "preencoded.png") even when `data` is given,
    // so the path carries the real type; with `data` set nothing is fetched from it.
    if (data) target.background = { data: data.dataUrl, path: `preencoded.${dataUrlExtension(data.dataUrl)}` };
    else {
      ctx.report.add("imageMissing");
      target.background = { color: pptxHex("theme:bg", theme) };
    }
  }
  if (slide.hidden) target.hidden = true;
  const decor = slideDecor(snap, slide, master);
  for (const el of decor) addElementToSlide(target, el, ctx);
  if (decor.length > 0) ctx.report.add("decorFlattened");
  for (const el of slide.elements) addElementToSlide(target, el, ctx);
  const notes = textJsonToPlain(slide.notes).trim();
  if (notes !== "") target.addNotes(notes);
}

const PARAGRAPH_RE = /<a:p>([\s\S]*?)<\/a:p>/g;
const PPR_RE = /<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g;

/** Keeps only the leading <a:pPr> of every <a:p> in one part's XML. */
export function dedupeParagraphProps(xml: string): string {
  return xml.replace(PARAGRAPH_RE, (_whole, body: string) => {
    // A <a:pPr> is valid only as the paragraph's first child.
    const cleaned = body.replace(PPR_RE, (ppr: string, offset: number) => (offset === 0 ? ppr : ""));
    return `<a:p>${cleaned}</a:p>`;
  });
}

const SLIDE_PART_RE = /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/;
const STORED_PART_RE = /^ppt\/media\//;

/** Rewrites the slide parts of a pptxgenjs file with dedupeParagraphProps; other parts are copied unchanged. */
export function normalizePptxParagraphs(file: Uint8Array): Uint8Array {
  const parts = unzipSync(file);
  const out: Zippable = {};
  for (const [name, data] of Object.entries(parts)) {
    const content = SLIDE_PART_RE.test(name) ? strToU8(dedupeParagraphProps(strFromU8(data))) : data;
    // Pictures are already compressed; deflating them again only costs time.
    out[name] = [content, { level: STORED_PART_RE.test(name) ? 0 : 6 }];
  }
  return zipSync(out);
}

export async function buildPptx(snap: DeckSnapshot, deps: PptxExportDeps): Promise<{ blob: Blob; report: ExportReport }> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  const { size, theme } = snap.meta;
  pptx.defineLayout({ name: LAYOUT_NAME, width: size.w / 72, height: size.h / 72 });
  pptx.layout = LAYOUT_NAME;
  pptx.theme = { headFontFace: pptxFontFace(theme.fonts.heading), bodyFontFace: pptxFontFace(theme.fonts.body) };
  pptx.title = deps.title;
  const report = new ReportCounter();
  const ctx: PptxExportContext = {
    theme,
    images: await fetchDeckImages(collectImageSrcs(snap), deps.fetchImage),
    shapeNames: new Set<string>(Object.values(pptx.ShapeType)),
    report,
  };
  for (const slide of snap.slides) fillPptxSlide(pptx.addSlide(), snap, slide, ctx);
  const written = await pptx.write({ outputType: "uint8array", compression: true });
  if (!(written instanceof Uint8Array) && !(written instanceof ArrayBuffer)) throw new Error("pptx: unexpected output type");
  const normalized = normalizePptxParagraphs(written instanceof Uint8Array ? written : new Uint8Array(written));
  return { blob: new Blob([normalized as BlobPart], { type: PPTX_MIME }), report: report.toReport() };
}
