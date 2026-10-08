// Images of an imported deck (slides.md §10.1 step 6). Each image arrives once, as bytes, from the worker. Its type is
// sniffed from the magic bytes (the declared MIME is never trusted): PNG, JPEG, GIF and WebP upload as they are; SVG
// and BMP are rasterised to PNG on a canvas (longest edge 2400 px; over 8 MB → JPEG 0.85); EMF, WMF, TIFF and anything
// else cannot be shown. Uploads go through uploadSlidesImage (the one image seam) three at a time with one retry;
// every writer registered for an image puts its URL into the snapshot before the deck is built, and each image's
// bytes are released after its upload, so peak memory is about three images.
import { createLimiter, toUploadableImage } from "@/lib/docs/import/images";
import { DOC_IMAGE_MAX_BYTES } from "@/lib/docs/uploads";
import { isQuotaExceededError, rethrowIfQuotaExceeded } from "@/lib/storage/quota-error";

import { assetKeyOf, type ExtractedAsset } from "./dedupe-assets";
import { isAbortError, throwIfAborted } from "./errors";

export type ImageKind = "png" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "emf" | "wmf" | "tiff" | "unknown";

const MIME: Readonly<Partial<Record<ImageKind, string>>> = {
  png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
};
const EXTENSION: Readonly<Partial<Record<ImageKind, string>>> = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp" };
/** Uploaded as they are (when small enough). */
const PASS_THROUGH: ReadonlySet<ImageKind> = new Set<ImageKind>(["png", "jpeg", "gif", "webp"]);
/** Kinds a browser can decode and re-encode on a canvas. */
const DECODABLE: ReadonlySet<ImageKind> = new Set<ImageKind>(["png", "jpeg", "gif", "webp", "bmp", "svg"]);

function startsWith(b: Uint8Array, at: number, sig: readonly number[]): boolean {
  return b.length >= at + sig.length && sig.every((byte, i) => b[at + i] === byte);
}

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
}

/** The image type the bytes are, by their signature. */
export function sniffImageKind(bytes: ArrayBuffer | Uint8Array): ImageKind {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (startsWith(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, 0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return "gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (startsWith(b, 0, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, 0, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (startsWith(b, 0, [0x01, 0x00, 0x00, 0x00]) && ascii(b, 40, 44) === " EMF") return "emf";
  if (startsWith(b, 0, [0xd7, 0xcd, 0xc6, 0x9a]) || startsWith(b, 0, [0x01, 0x00, 0x09, 0x00]) || startsWith(b, 0, [0x02, 0x00, 0x09, 0x00])) return "wmf";
  if (ascii(b, 0, 2) === "BM" && b.length > 26) return "bmp";
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(head)) return "svg";
  return "unknown";
}

/** Whether an image of this kind can end up on a slide. */
export function isUsableImageKind(kind: ImageKind): boolean {
  return DECODABLE.has(kind);
}

export interface PendingAsset {
  key: string;
  /** The sniffed MIME type. */
  mime: string;
  /** Released (emptied) once the image is uploaded or has failed. */
  bytes: ArrayBuffer;
  /** Writers that put the uploaded URL into the snapshot. */
  uses: Array<(url: string) => void>;
}

/** Resolves the mapper's "asset:<key>" references to the worker's images and collects their writers. */
export interface AssetRegistry {
  /** The asset a reference names, with its sniffed kind; null for anything else (no image data). */
  lookup(ref: unknown): { key: string; kind: ImageKind } | null;
  /** Registers a writer for a usable asset (after lookup). */
  use(key: string, write: (url: string) => void): void;
  /** True the first time it is called for `key` (so an image is reported once however often it is used). */
  firstReport(key: string): boolean;
  /** The assets with at least one writer, in first-use order. */
  pending(): PendingAsset[];
}

export function createAssetRegistry(assets: readonly ExtractedAsset[]): AssetRegistry {
  const byKey = new Map(assets.map((asset) => [asset.key, asset]));
  const kinds = new Map<string, ImageKind>();
  const pending = new Map<string, PendingAsset>();
  const reported = new Set<string>();
  return {
    lookup(ref) {
      const key = assetKeyOf(ref);
      const asset = key === null ? undefined : byKey.get(key);
      if (!asset || key === null) return null;
      let kind = kinds.get(key);
      if (kind === undefined) {
        kind = sniffImageKind(asset.bytes);
        kinds.set(key, kind);
      }
      return { key, kind };
    },
    use(key, write) {
      const asset = byKey.get(key);
      const kind = kinds.get(key);
      if (!asset || kind === undefined || !isUsableImageKind(kind)) return;
      const entry = pending.get(key) ?? { key, mime: MIME[kind] ?? "", bytes: asset.bytes, uses: [] };
      entry.uses.push(write);
      pending.set(key, entry);
    },
    firstReport(key) {
      if (reported.has(key)) return false;
      reported.add(key);
      return true;
    },
    pending() {
      return [...pending.values()];
    },
  };
}

export type AssetFailure = "imageUnsupported" | "imageTooLarge" | "imageUploadFailed";

const EMPTY = new ArrayBuffer(0);
const CONCURRENCY = 3;

/** A File the image route accepts, or the reason there is none. Browser only for the canvas conversion. */
export async function uploadableImage(asset: PendingAsset): Promise<File | AssetFailure> {
  const kind = sniffImageKind(asset.bytes);
  const name = `image-${asset.key}`;
  if (PASS_THROUGH.has(kind) && asset.bytes.byteLength > 0 && asset.bytes.byteLength <= DOC_IMAGE_MAX_BYTES) {
    return new File([asset.bytes], `${name}.${EXTENSION[kind]}`, { type: MIME[kind] });
  }
  if (!DECODABLE.has(kind)) return "imageUnsupported";
  const file = await toUploadableImage(new Blob([asset.bytes], { type: MIME[kind] }), name);
  if (file) return file;
  return asset.bytes.byteLength > DOC_IMAGE_MAX_BYTES ? "imageTooLarge" : "imageUnsupported";
}

/**
 * Uploads every asset (three at a time, one retry each) through `upload`, calls each asset's writers with its URL,
 * and resolves to the failures by asset key. Rejects only with an AbortError.
 */
export async function uploadAssets(
  assets: readonly PendingAsset[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal | undefined,
  upload: (file: File) => Promise<string>,
): Promise<Map<string, AssetFailure>> {
  const failures = new Map<string, AssetFailure>();
  const limit = createLimiter(CONCURRENCY);
  let done = 0;
  let outOfRoom: unknown = null;
  onProgress(0, assets.length);
  await Promise.all(
    assets.map((asset) =>
      limit(async () => {
        throwIfAborted(signal);
        try {
          const file = await uploadableImage(asset);
          if (typeof file === "string") {
            failures.set(asset.key, file);
            return;
          }
          let url: string | null = null;
          for (let attempt = 0; attempt < 2 && url === null; attempt++) {
            throwIfAborted(signal);
            rethrowIfQuotaExceeded(outOfRoom);
            try {
              url = await upload(file);
            } catch (err) {
              if (isAbortError(err)) throw err;
              // A full store fails the import with [drive.quota_exceeded] rather than leave the image out,
              // and the images still queued are not tried.
              if (isQuotaExceededError(err)) outOfRoom ??= err;
              rethrowIfQuotaExceeded(err);
            }
          }
          if (url === null) failures.set(asset.key, "imageUploadFailed");
          else for (const write of asset.uses) write(url);
        } finally {
          asset.bytes = EMPTY;
          done += 1;
          onProgress(done, assets.length);
        }
      }),
    ),
  );
  return failures;
}
