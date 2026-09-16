/**
 * Image helpers for imports: embedded images are uploaded (plan D47), never stored as data URIs.
 * Browser only for `toUploadableImage` (canvas re-encoding); the rest is pure.
 */
import { DOC_IMAGE_MAX_BYTES, DOC_IMAGE_TYPES } from "@/lib/docs/uploads";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Marks an `<img>` a converter already dropped and counted (a .docx image that would not upload):
 * `prepareImportHtml` removes it without counting it again. The src of such an image is empty.
 */
export const IMPORT_SKIPPED_IMAGE_ATTR = "data-import-skipped";

export type ImportImageAction = "keep" | "upload" | "skip" | "dropCounted";

/**
 * What `prepareImportHtml` does with a sanitized image source:
 * - `keep` — http(s) images stay linked;
 * - `upload` — `data:image/…` is re-hosted;
 * - `dropCounted` — already counted by the converter (`IMPORT_SKIPPED_IMAGE_ATTR`);
 * - `skip` — anything else (relative, `file:`, `blob:`, or a src DOMPurify removed): dropped and counted.
 */
export function importImageAction(src: string, alreadyCounted: boolean): ImportImageAction {
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return "keep";
  if (/^data:image\//i.test(value)) return "upload";
  return alreadyCounted && !value ? "dropCounted" : "skip";
}

/** Longest edge when an image has to be re-encoded. */
const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.85;

/** Runs at most `max` tasks at once. */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

/** `data:image/png;base64,…` → Blob, or null when it isn't a well-formed data URL. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)((?:;[^;,]*)*?)(;base64)?,(.*)$/is.exec(dataUrl.trim());
  if (!match) return null;
  const type = match[1].toLowerCase();
  const payload = match[4];
  try {
    if (match[3]) {
      const binary = atob(payload.replace(/\s+/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(payload)], { type });
  } catch {
    return null;
  }
}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release(): void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to <img> (SVG and some formats).
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { source: img, width: img.naturalWidth || 1, height: img.naturalHeight || 1, release: () => URL.revokeObjectURL(url) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A File the `generalFile` upload route accepts (PNG / JPEG / GIF / WebP, ≤ 8 MB). Other decodable formats (BMP,
 * TIFF on Safari, SVG) and oversized images are re-encoded through a canvas. Null when the image can't be used.
 */
export async function toUploadableImage(blob: Blob, baseName: string): Promise<File | null> {
  const type = blob.type.toLowerCase();
  if (DOC_IMAGE_TYPES.includes(type) && blob.size > 0 && blob.size <= DOC_IMAGE_MAX_BYTES) {
    return new File([blob], `${baseName}.${EXTENSIONS[type] ?? "img"}`, { type });
  }
  if (typeof document === "undefined") return null;
  let image: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    image = await decode(blob);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    let out = await canvasToBlob(canvas, "image/png");
    if (!out || out.size > DOC_IMAGE_MAX_BYTES) out = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    if (!out || out.size > DOC_IMAGE_MAX_BYTES) return null;
    return new File([out], `${baseName}.${EXTENSIONS[out.type] ?? "png"}`, { type: out.type });
  } catch {
    return null;
  } finally {
    image?.release();
  }
}
