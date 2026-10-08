"use client";

// PDF and PNG export (slides.md §10.3). One off-screen host and one bare React root, reused for every slide: each
// slide is rendered synchronously (flushSync; root.render alone commits later), its pictures are decoded and the
// fonts settled, then html2canvas rasterizes it. The PDF path streams: render → encode one JPEG page → zero that
// canvas → next slide, so there is never more than one live canvas (iPad Safari has a small canvas-memory budget).
// SlideView in export mode reads no context, so the bare root needs no providers; every string comes in `labels`.
//
// Pictures: <img> elements are decoded in place; a picture that fails is drawn again, synchronously, as the missing
// box (unavailableImages), because its own error event re-renders at default priority and may land after the
// capture. Pictures painted as CSS backgrounds (slide backgrounds, image fills in export mode) are loaded the way
// html2canvas loads them (CORS), once per src per export, so the ones it would silently drop are counted too.
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { SlideView, type SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { EmptyExportError, openPdfWriter } from "@/lib/slides/export/pdf";
import { slideBackground } from "@/lib/slides/export/render-rules";
import { ReportCounter, type ExportReport } from "@/lib/slides/export/report";
import { safeImageSrc } from "@/lib/slides/model/safe-values";
import type { DeckMeta, DeckSnapshot, MasterSnapshot, Pt, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";
import { themeDecorElements } from "@/lib/slides/themes/themes";

export interface RasterOptions {
  /** Canvas pixels per pt (rasterScaleForDevice() is the usual value). */
  scale: number;
  labels: SlideViewLabels;
  onProgress?(done: number, total: number): void;
  signal?: AbortSignal;
}

/** Longest wait for one picture to decode before the slide is captured without it. */
const IMAGE_WAIT_MS = 8_000;

/** 1.5 on touch-first and Apple mobile devices (incl. the Capacitor iOS app), else 2. */
export function rasterScaleForDevice(): number {
  if (typeof window === "undefined" || typeof navigator === "undefined") return 2;
  let coarse = false;
  try {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    coarse = false;
  }
  const ua = navigator.userAgent;
  const appleMobile = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return coarse || appleMobile ? 1.5 : 2;
}

/** JPEG quality of PDF pages: a little lower at the reduced mobile scale. */
export function pdfJpegQuality(scale: number): number {
  return scale < 2 ? 0.85 : 0.92;
}

function abortError(): DOMException {
  return new DOMException("The export was cancelled.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Presets an export-mode image fill draws exactly (a plain box, or border-radius: shape-view.tsx layerRadius). */
const EXACT_FILL_PRESETS: ReadonlySet<string> = new Set(["rect", "ellipse", "roundRect"]);

/**
 * What rasterizing a slide simplifies: vertical text comes out horizontal (html2canvas has no writing-mode), charts
 * are placeholders, an image fill on any other geometry is drawn as its box (html2canvas has no clip-path), and a
 * picture with an unusable src is the missing box.
 */
export function countSimplified(elements: readonly SlideElement[], report: ReportCounter): void {
  for (const el of elements) {
    if (el.type === "text" || el.type === "shape") {
      if (el.box.vertical) report.add("verticalTextFlattened");
      if (el.fill.t === "image" && (el.geom.kind !== "preset" || !EXACT_FILL_PRESETS.has(el.geom.preset))) report.add("maskApprox");
    }
    if (el.type === "chart") report.add("chartSkipped");
    if (el.type === "image" && safeImageSrc(el.src) === "") report.add("imageMissing");
  }
}

/** The decor behind a slide, as SlideView draws it: the theme's code-drawn decor or a stored master's elements. */
function decorOf(snap: DeckSnapshot, slide: SlideSnapshot): readonly SlideElement[] {
  if (slide.masterId === "theme") return themeDecorElements(snap.meta.theme, snap.meta.size, slide.layout);
  return masterOf(snap, slide)?.elements ?? [];
}

function masterOf(snap: DeckSnapshot, slide: SlideSnapshot): MasterSnapshot | null {
  if (slide.masterId === "" || slide.masterId === "theme") return null;
  return snap.masters.find((m) => m.id === slide.masterId) ?? null;
}

/** Every picture a slide paints as a CSS background, once per use: its background and its image fills. */
export function cssImageUses(snap: DeckSnapshot, slide: SlideSnapshot): string[] {
  const uses: string[] = [];
  const background = slideBackground(slide, masterOf(snap, slide), snap.meta.theme);
  if (background.t === "image") uses.push(background.src);
  for (const el of [...decorOf(snap, slide), ...slide.elements]) {
    if ((el.type === "text" || el.type === "shape") && el.fill.t === "image") uses.push(el.fill.src);
  }
  return uses;
}

const NO_UNAVAILABLE: ReadonlySet<string> = new Set();

class RasterHost {
  private readonly el: HTMLDivElement;
  private readonly root: Root;
  private readonly deck: { meta: DeckMeta; masters: ReadonlyMap<string, MasterSnapshot> };
  /** CSS-background pictures loaded so far in this export: src → whether html2canvas can draw it. */
  private readonly cssImages = new Map<string, Promise<boolean>>();

  constructor(snap: DeckSnapshot, private readonly labels: SlideViewLabels) {
    const { w, h } = snap.meta.size;
    this.deck = { meta: snap.meta, masters: new Map(snap.masters.map((m) => [m.id, m])) };
    this.el = document.createElement("div");
    this.el.setAttribute("aria-hidden", "true");
    this.el.setAttribute("data-slides-raster-host", "");
    Object.assign(this.el.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      width: `${w}px`,
      height: `${h}px`,
      pointerEvents: "none",
      zIndex: "-1",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
    this.root = createRoot(this.el);
  }

  private render(slide: SlideSnapshot, unavailable: ReadonlySet<string>): void {
    flushSync(() => {
      this.root.render(
        <SlideView deck={this.deck} slide={slide} scale={1} mode="export" labels={this.labels} unavailableImages={unavailable} />,
      );
    });
  }

  /** Loads a CSS-background picture the way html2canvas does (useCORS); false when it would be dropped. */
  private cssImageLoads(src: string): Promise<boolean> {
    let pending = this.cssImages.get(src);
    if (!pending) {
      const safe = safeImageSrc(src);
      if (safe === "") pending = Promise.resolve(false);
      else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = safe;
        pending = withTimeout(img.decode(), IMAGE_WAIT_MS).then(() => true, () => false);
      }
      this.cssImages.set(src, pending);
    }
    return pending;
  }

  /**
   * Renders `slide` and waits for its pictures and fonts; resolves the number of pictures that will not show.
   * `cssImages` are the srcs the slide paints as CSS backgrounds (cssImageUses).
   */
  async show(slide: SlideSnapshot, cssImages: readonly string[]): Promise<number> {
    this.render(slide, NO_UNAVAILABLE);
    const images = Array.from(this.el.querySelectorAll("img"));
    const [failedSrcs, cssLoaded] = await Promise.all([
      Promise.all(images.map((img) => withTimeout(img.decode(), IMAGE_WAIT_MS).then(() => null, () => img.getAttribute("src") ?? ""))),
      Promise.all(cssImages.map((src) => this.cssImageLoads(src))),
    ]);
    const failed = failedSrcs.filter((src): src is string => src !== null);
    // The missing boxes are in the DOM before the capture, whatever the images' own error events do.
    if (failed.length > 0) this.render(slide, new Set(failed));
    try {
      await document.fonts?.ready;
    } catch {
      // Font loading errors leave the fallback fonts in place; the capture goes on.
    }
    return failed.length + cssLoaded.filter((ok) => !ok).length;
  }

  /** The rendered slide as a canvas; the caller releases it (width = height = 0) when done. */
  async capture(scale: number, background: string | null): Promise<HTMLCanvasElement> {
    const target = this.el.firstElementChild;
    if (!(target instanceof HTMLElement)) throw new Error("raster: nothing rendered");
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(target, { scale, useCORS: true, backgroundColor: background, logging: false });
  }

  dispose(): void {
    this.root.unmount();
    this.el.remove();
  }
}

function slidesById(snap: DeckSnapshot, ids: readonly string[]): SlideSnapshot[] {
  const byId = new Map(snap.slides.map((s) => [s.id, s]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Rasterizes one slide into `report`'s counts; the caller releases the canvas. */
async function rasterize(host: RasterHost, snap: DeckSnapshot, slide: SlideSnapshot, scale: number, background: string | null, report: ReportCounter) {
  report.add("imageMissing", await host.show(slide, cssImageUses(snap, slide)));
  countSimplified([...decorOf(snap, slide), ...slide.elements], report);
  return host.capture(scale, background);
}

/**
 * Every listed slide, in order, as one PDF page each (the caller leaves hidden slides out). Throws EmptyExportError
 * when no listed id is a slide of the deck, rather than writing a blank page.
 */
export async function renderSlidesToPdf(
  snap: DeckSnapshot,
  slideIds: readonly string[],
  opts: RasterOptions,
): Promise<{ blob: Blob; report: ExportReport }> {
  const slides = slidesById(snap, slideIds);
  if (slides.length === 0) throw new EmptyExportError();
  const size: { w: Pt; h: Pt } = snap.meta.size;
  const report = new ReportCounter();
  const writer = await openPdfWriter(size);
  const quality = pdfJpegQuality(opts.scale);
  throwIfAborted(opts.signal);
  const host = new RasterHost(snap, opts.labels);
  try {
    for (let i = 0; i < slides.length; i++) {
      throwIfAborted(opts.signal);
      // JPEG has no alpha: paint transparent areas white rather than black.
      const canvas = await rasterize(host, snap, slides[i], opts.scale, "#ffffff", report);
      try {
        writer.addJpegPage(canvas.toDataURL("image/jpeg", quality));
      } finally {
        release(canvas);
      }
      opts.onProgress?.(i + 1, slides.length);
    }
  } finally {
    host.dispose();
  }
  throwIfAborted(opts.signal);
  return { blob: writer.toBlob(), report: report.toReport() };
}

/** One slide as a PNG. Throws EmptyExportError when `slideId` is not a slide of the deck. */
export async function renderSlideToPng(snap: DeckSnapshot, slideId: string, opts: RasterOptions): Promise<{ blob: Blob; report: ExportReport }> {
  const [slide] = slidesById(snap, [slideId]);
  if (!slide) throw new EmptyExportError();
  const report = new ReportCounter();
  throwIfAborted(opts.signal);
  const host = new RasterHost(snap, opts.labels);
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await rasterize(host, snap, slide, opts.scale, null, report);
    const shot = canvas;
    const blob = await new Promise<Blob | null>((resolve) => shot.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("raster: PNG encoding failed");
    opts.onProgress?.(1, 1);
    return { blob, report: report.toReport() };
  } finally {
    if (canvas) release(canvas);
    host.dispose();
  }
}
