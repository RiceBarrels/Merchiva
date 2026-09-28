// Client-made thumbnails for uploads: a small WebP (JPEG where the browser has
// no WebP encoder) of a photo, or of a video's first frame, stored next to the
// original as its `_thumb` blob. Grids then load kilobytes instead of the
// originals, and re-encoding drops EXIF data such as the GPS position.
//
// Best effort: resolves null on any failure, for types it does not handle
// (SVG, GIF, anything that is not an image or a video), outside a browser, and
// when it takes longer than the timeout. It never throws.

import { DRIVE_THUMB_EDGE_PX, DRIVE_THUMB_MAX_BYTES, normalizeDriveMime } from "@/lib/drive/rules";

export interface DriveThumbnail { blob: Blob; mimeType: "image/webp" | "image/jpeg" }
export interface DriveThumbnailOptions { edgePx?: number; timeoutMs?: number; maxBytes?: number }

type ThumbType = DriveThumbnail["mimeType"];

const DEFAULT_TIMEOUT_MS = 3_000;
/** Larger images are not decoded for a thumbnail (decoding holds the full bitmap in memory). */
const IMAGE_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
/** Vector art and animations: a still would misrepresent them, and they are small anyway. */
const SKIPPED_IMAGE_TYPES: ReadonlySet<string> = new Set(["image/svg+xml", "image/gif"]);
const VIDEO_POSTER_AT_S = 0.1;
const QUALITIES = [0.8, 0.6] as const;

interface Settings { edgePx: number; maxBytes: number }

function toBlob(canvas: HTMLCanvasElement, type: ThumbType, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Draws `source` with its long edge at most `edgePx` and encodes it within `maxBytes`. */
async function encode(source: CanvasImageSource, width: number, height: number, settings: Settings): Promise<DriveThumbnail | null> {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(1, settings.edgePx / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  let type: ThumbType = "image/webp";
  let blob = await toBlob(canvas, type, QUALITIES[0]);
  if (!blob || blob.type !== type) {
    // No WebP encoder (the browser fell back to PNG): JPEG, over white, since JPEG has no alpha.
    type = "image/jpeg";
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    blob = await toBlob(canvas, type, QUALITIES[0]);
  }
  if (blob && blob.size > settings.maxBytes) blob = await toBlob(canvas, type, QUALITIES[1]);
  if (!blob || blob.type !== type || blob.size === 0 || blob.size > settings.maxBytes) return null;
  return { blob, mimeType: type };
}

async function decodeImage(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    // Older WebKit rejects the options bag; it applies EXIF orientation by default.
    return createImageBitmap(source);
  }
}

async function imageThumbnail(source: Blob, settings: Settings): Promise<DriveThumbnail | null> {
  if (typeof createImageBitmap !== "function" || source.size > IMAGE_SOURCE_MAX_BYTES) return null;
  const bitmap = await decodeImage(source);
  try {
    return await encode(bitmap, bitmap.width, bitmap.height, settings);
  } finally {
    bitmap.close();
  }
}

/** Resolves on `ok`, rejects on `error` (listeners are removed either way). */
function once(target: HTMLVideoElement, ok: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener(ok, onOk);
      target.removeEventListener("error", onError);
    };
    const onOk = () => {
      done();
      resolve();
    };
    const onError = () => {
      done();
      reject(new Error("Video could not be decoded"));
    };
    target.addEventListener(ok, onOk);
    target.addEventListener("error", onError);
  });
}

async function videoThumbnail(source: Blob, settings: Settings, cleanups: Array<() => void>): Promise<DriveThumbnail | null> {
  const url = URL.createObjectURL(source);
  const video = document.createElement("video");
  cleanups.push(() => {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // Detached element; nothing to release.
    }
    URL.revokeObjectURL(url);
  });
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  const loaded = once(video, "loadeddata");
  video.src = url;
  await loaded;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const seeked = once(video, "seeked");
  video.currentTime = Math.min(VIDEO_POSTER_AT_S, duration > 0 ? duration / 2 : 0);
  await seeked;
  return encode(video, video.videoWidth, video.videoHeight, settings);
}

export async function createDriveThumbnail(
  source: Blob,
  mimeType: string,
  opts: DriveThumbnailOptions = {},
): Promise<DriveThumbnail | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const mime = normalizeDriveMime(mimeType);
  const isImage = mime.startsWith("image/") && !SKIPPED_IMAGE_TYPES.has(mime);
  const isVideo = mime.startsWith("video/");
  if (!isImage && !isVideo) return null;

  const settings: Settings = {
    edgePx: Math.max(1, opts.edgePx ?? DRIVE_THUMB_EDGE_PX),
    maxBytes: Math.max(1, Math.min(opts.maxBytes ?? DRIVE_THUMB_MAX_BYTES, DRIVE_THUMB_MAX_BYTES)),
  };
  const cleanups: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  });
  try {
    const work = isImage ? imageThumbnail(source, settings) : videoThumbnail(source, settings, cleanups);
    return await Promise.race([work.catch(() => null), timeout]);
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // Best effort.
      }
    }
  }
}
