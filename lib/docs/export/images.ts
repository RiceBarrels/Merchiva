/**
 * Image fetching for DOCX export (docs-editor-ui spec §6.2 "Images").
 *
 * `fetchImageForExport(src)`:
 * - fetches with `mode: "cors"` and no credentials (UploadThing CDN URLs allow this; other hosts may not);
 * - keeps PNG / JPEG / GIF / BMP bytes as they are (the formats `docx` embeds natively);
 * - re-encodes anything else the browser can decode (WebP, AVIF, SVG) to PNG through a canvas;
 * - reads dimensions from the decoded image.
 * Any failure resolves `null`; the DOCX builder then writes a linked "[image]" placeholder and counts it.
 */

export type DocxImageType = "png" | "jpg" | "gif" | "bmp";

export interface DocxImage {
  data: ArrayBuffer;
  type: DocxImageType;
  /** Intrinsic size in CSS pixels. */
  width: number;
  height: number;
}

const FETCH_TIMEOUT_MS = 15_000;
/** Longest edge after re-encoding; keeps canvases (and the .docx) a sane size. */
const MAX_REENCODE_EDGE = 2400;

/** Magic-number sniffing, so a wrong `Content-Type` header doesn't produce a broken .docx. */
export function sniffDocxImageType(bytes: Uint8Array): DocxImageType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "gif";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  return null;
}

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

async function decodeImage(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // SVG and some formats can't be decoded by createImageBitmap; fall back to <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return {
    source: img,
    width: img.naturalWidth || 300,
    height: img.naturalHeight || 150,
    release: () => URL.revokeObjectURL(url),
  };
}

async function drawToPng(image: Drawable): Promise<{ data: ArrayBuffer; width: number; height: number }> {
  const scale = Math.min(1, MAX_REENCODE_EDGE / Math.max(image.width, image.height, 1));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(image.source, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { data: await blob.arrayBuffer(), width: image.width, height: image.height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(image.source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  return { data: await blob.arrayBuffer(), width: image.width, height: image.height };
}

export async function fetchImageForExport(src: string): Promise<DocxImage | null> {
  if (typeof window === "undefined" || !/^(https?:|blob:)/i.test(src)) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let image: Drawable | null = null;
  try {
    const res = await fetch(src, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const nativeType = sniffDocxImageType(bytes);
    image = await decodeImage(blob);
    if (nativeType) {
      return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, type: nativeType, width: image.width, height: image.height };
    }
    const png = await drawToPng(image);
    return { data: png.data, type: "png", width: png.width, height: png.height };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    image?.release();
  }
}
