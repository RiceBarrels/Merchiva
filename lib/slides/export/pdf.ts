// A thin jsPDF wrapper for the slide PDF export (slides.md §10.3): one page per slide, each a full-bleed JPEG at the
// slide's size in pt. It holds no canvases; the raster export hands it one encoded page at a time and releases its
// canvas before rendering the next slide. jsPDF is loaded on first use.
import type { Pt } from "@/lib/slides/model/types";

/** An export with nothing to show (no slides left once hidden ones are out, or an unknown slide id). */
export class EmptyExportError extends Error {
  constructor() {
    super("The export has no slides.");
    this.name = "EmptyExportError";
  }
}

export interface PdfPageWriter {
  /** Adds a page showing `dataUrl` (a `data:image/jpeg;base64,…` URL) edge to edge. */
  addJpegPage(dataUrl: string): void;
  readonly pageCount: number;
  /** The PDF; throws EmptyExportError before the first page (jsPDF would write one blank page). */
  toBlob(): Blob;
}

export async function openPdfWriter(size: { w: Pt; h: Pt }, opts: { title?: string } = {}): Promise<PdfPageWriter> {
  const { jsPDF } = await import("jspdf");
  const w = Math.max(1, size.w);
  const h = Math.max(1, size.h);
  const orientation = w >= h ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [w, h], compress: true });
  pdf.setProperties({ title: opts.title ?? "", creator: "Merchiva" });
  let pages = 0;
  return {
    addJpegPage(dataUrl: string) {
      // jsPDF opens with one blank page; every later slide gets a new one.
      if (pages > 0) pdf.addPage([w, h], orientation);
      pdf.addImage(dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
      pages += 1;
    },
    get pageCount() {
      return pages;
    },
    toBlob() {
      if (pages === 0) throw new EmptyExportError();
      return pdf.output("blob");
    },
  };
}
