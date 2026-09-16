/**
 * Rasterized PDF fallback (docs-editor-ui spec §6.1, plan A3-4) for platforms where `window.print()` does
 * nothing: Capacitor's iOS/Android WebViews and Tauri's macOS WKWebView. Loaded on demand by `printDocument`.
 *
 * The document HTML is rendered into a temporary off-screen `.doc-prose` article (the print portal itself is
 * `display: none` on screen, which html2canvas can't capture), paged by jsPDF, and removed again. Page size and
 * margins come from the document's own page setup, so the PDF matches what the sheets show.
 * Known limit: the output is an image per page, so its text isn't selectable.
 */
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import { PX_PER_INCH, pageSizeIn, type DocPageSetup } from "@/lib/docs/page-setup";

import { stripCommentSpans } from "./utils";

export interface PdfRenderInput {
  title: string;
  html: string;
  pageSetup: DocPageSetup;
}

const PT_PER_INCH = 72;
const IMAGE_WAIT_MS = 8_000;

/**
 * Paper colours for the rendered article. jsPDF clones only the element passed to `html()` into its own overlay on
 * `<body>`, so the clone inherits the app theme (near-white text in dark mode) unless the article carries the ink
 * itself. `.doc-page` normally defines these tokens; the article isn't inside one.
 */
export const PDF_PAPER_STYLE: Readonly<Record<string, string>> = {
  "--doc-ink": "#0a0a0a",
  "--doc-muted": "#525252",
  "--doc-rule": "#e5e5e5",
  "color-scheme": "light",
  color: "#0a0a0a",
  background: "#ffffff",
};

function paintPaper(element: HTMLElement): void {
  for (const [property, value] of Object.entries(PDF_PAPER_STYLE)) element.style.setProperty(property, value);
}

function waitForImages(root: HTMLElement): Promise<void> {
  const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let left = pending.length;
    const timer = window.setTimeout(resolve, IMAGE_WAIT_MS);
    const done = () => {
      left -= 1;
      if (left <= 0) {
        window.clearTimeout(timer);
        resolve();
      }
    };
    for (const img of pending) {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  });
}

export async function renderPdfBlob({ title, html, pageSetup }: PdfRenderInput): Promise<Blob> {
  const size = pageSizeIn(pageSetup);
  const margin = pageSetup.margins;
  // The article is laid out at the document's own text-column width so line breaks match the sheets.
  const renderWidthPx = Math.max(96, Math.round((size.width - margin.left - margin.right) * PX_PER_INCH));
  // jsPDF resolves html2canvas from the global first; set it so the bundler-provided copy is used.
  const scope = globalThis as typeof globalThis & { html2canvas?: typeof html2canvas };
  if (!scope.html2canvas) scope.html2canvas = html2canvas;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-doc-pdf-render", "");
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "-10000px",
    width: `${renderWidthPx}px`,
    background: "#ffffff",
    color: "#0a0a0a",
    pointerEvents: "none",
    zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>);
  const article = document.createElement("article");
  article.className = "doc-prose";
  article.setAttribute("dir", "auto");
  paintPaper(article);
  article.innerHTML = stripCommentSpans(html);
  // Images must be CORS-readable for the canvas; hosts without CORS headers render blank instead of tainting it.
  for (const img of Array.from(article.querySelectorAll("img"))) img.crossOrigin = "anonymous";
  host.appendChild(article);
  document.body.appendChild(host);

  try {
    await waitForImages(article);
    // `pageSizeIn` already swapped the dimensions for landscape, so jsPDF must not swap them again.
    const pdf = new jsPDF({
      unit: "pt",
      format: [size.width * PT_PER_INCH, size.height * PT_PER_INCH],
      orientation: "portrait",
      compress: true,
    });
    pdf.setProperties({ title, creator: "Merchiva" });
    await pdf.html(article, {
      margin: [margin.top * PT_PER_INCH, margin.right * PT_PER_INCH, margin.bottom * PT_PER_INCH, margin.left * PT_PER_INCH],
      autoPaging: "text",
      width: (size.width - margin.left - margin.right) * PT_PER_INCH,
      windowWidth: renderWidthPx,
      html2canvas: { useCORS: true, backgroundColor: "#ffffff", logging: false },
    });
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
