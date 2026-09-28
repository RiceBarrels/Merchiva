"use client";

// File ▸ Download (slides.md §10.2, §10.3): reads the live deck once, builds the file in the chosen format and
// hands it to saveBlob, which downloads on the web and opens the share sheet in the native apps. The builders load
// on demand (pptxgenjs for .pptx; html2canvas + jsPDF through the raster host for PDF and PNG), so the editor
// chunk carries none of them.
//
// A PDF holds every slide that is not skipped; a PNG is the current slide (or the first). With nothing to export
// (every slide skipped, an unknown slide) the builders throw EmptyExportError (err.name === "EmptyExportError"),
// which the caller shows as `slides.present.noSlides`. Cancelling through `signal` rejects with an AbortError.
import type * as Y from "yjs";

import type { SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { saveBlob, type SaveBlobResult } from "@/lib/docs/download";
import { exportFilename } from "@/lib/docs/export/utils";
import { EmptyExportError } from "@/lib/slides/export/pdf";
import type { ExportReport } from "@/lib/slides/export/report";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { DeckSnapshot } from "@/lib/slides/model/types";

export type SlidesExportFormat = "pptx" | "pdf" | "png";

export const SLIDES_EXPORT_FORMATS: readonly SlidesExportFormat[] = ["pptx", "pdf", "png"];

export interface ExportDeckArgs {
  format: SlidesExportFormat;
  ydoc: Y.Doc;
  title: string;
  /** Fallback file name for an untitled deck (t("slides.untitled")). */
  untitled: string;
  /** The PNG's slide; null or unknown → the first slide. */
  currentSlideId: string | null;
  labels: SlideViewLabels;
  onProgress?(done: number, total: number): void;
  signal?: AbortSignal;
}

export interface SlidesExportPlan {
  /** The slides that go into the file, in deck order. */
  slideIds: readonly string[];
  fileName: string;
}

/** Which slides a format exports and what the file is called. Pure (exported for tests). */
export function planSlidesExport(
  snap: Pick<DeckSnapshot, "slides">,
  format: SlidesExportFormat,
  opts: { title: string; untitled: string; currentSlideId: string | null },
): SlidesExportPlan {
  const fileName = exportFilename(opts.title, format, opts.untitled);
  switch (format) {
    case "pptx":
      // Hidden slides stay in the file, marked hidden.
      return { slideIds: snap.slides.map((s) => s.id), fileName };
    case "pdf":
      return { slideIds: snap.slides.filter((s) => !s.hidden).map((s) => s.id), fileName };
    case "png": {
      const current = opts.currentSlideId ? snap.slides.find((s) => s.id === opts.currentSlideId) : undefined;
      const slide = current ?? snap.slides[0];
      return { slideIds: slide ? [slide.id] : [], fileName };
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("The export was cancelled.", "AbortError");
}

/** True for the error a cancelled export rejects with. */
export function isExportAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === "AbortError" : (err as { name?: unknown } | null)?.name === "AbortError";
}

/** True for EmptyExportError (nothing to export). */
export function isEmptyExport(err: unknown): boolean {
  return err instanceof EmptyExportError || (err as { name?: unknown } | null)?.name === "EmptyExportError";
}

export async function exportDeck(args: ExportDeckArgs): Promise<{ result: SaveBlobResult; report: ExportReport | null }> {
  const snap = readDeckSnapshot(args.ydoc);
  const plan = planSlidesExport(snap, args.format, args);
  if (plan.slideIds.length === 0) throw new EmptyExportError();
  let built: { blob: Blob; report: ExportReport };
  if (args.format === "pptx") {
    const [{ buildPptx }, { fetchSlidesExportImage }] = await Promise.all([
      import("@/lib/slides/export/pptx"),
      import("@/lib/slides/export/image-data"),
    ]);
    throwIfAborted(args.signal);
    args.onProgress?.(0, 1);
    built = await buildPptx(snap, { fetchImage: fetchSlidesExportImage, title: args.title.trim() || args.untitled });
    args.onProgress?.(1, 1);
  } else {
    const raster = await import("@/components/slides/export/raster");
    throwIfAborted(args.signal);
    const opts = { scale: raster.rasterScaleForDevice(), labels: args.labels, onProgress: args.onProgress, signal: args.signal };
    built = args.format === "pdf"
      ? await raster.renderSlidesToPdf(snap, plan.slideIds, opts)
      : await raster.renderSlideToPng(snap, plan.slideIds[0], opts);
  }
  throwIfAborted(args.signal);
  const result = await saveBlob(built.blob, plan.fileName);
  return { result, report: built.report };
}
