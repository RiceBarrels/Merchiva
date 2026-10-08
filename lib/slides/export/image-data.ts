// Pictures for the .pptx export (slides.md §10.2): the Slides adapter over the Docs export fetcher
// (lib/docs/export/images.ts), which fetches with CORS, keeps PNG / JPEG / GIF / BMP bytes as they are and re-encodes
// anything else to PNG. The data URL's MIME comes from the sniffed type, so JPEG bytes are never labelled PNG
// (pptxgenjs names the media part after it).
import { fetchImageForExport, type DocxImageType } from "@/lib/docs/export/images";
import { safeImageSrc } from "@/lib/slides/model/safe-values";

export interface SlidesExportImage {
  dataUrl: string;
  /** Intrinsic size in CSS pixels. */
  width: number;
  height: number;
}

const CHUNK = 0x8000;

function base64Of(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** `data:image/<type>;base64,…`, with `jpg` written as the registered `image/jpeg`. */
export function exportImageDataUrl(img: { data: ArrayBuffer; type: DocxImageType }): string {
  const mime = img.type === "jpg" ? "image/jpeg" : `image/${img.type}`;
  return `data:${mime};base64,${base64Of(img.data)}`;
}

/** The picture at `src` as a data URL, or null when the URL is not allowed or the fetch fails. */
export async function fetchSlidesExportImage(src: string): Promise<SlidesExportImage | null> {
  const url = safeImageSrc(src);
  if (url === "") return null;
  const img = await fetchImageForExport(url);
  if (!img) return null;
  return { dataUrl: exportImageDataUrl(img), width: img.width, height: img.height };
}
