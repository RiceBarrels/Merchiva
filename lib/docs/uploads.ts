/**
 * Image uploads for Docs (plan D47, docs-editor-ui spec §2.7 and F5).
 *
 * Images go through the existing UploadThing `generalFile` route (8 MB images, app/api/uploadthing/core.ts)
 * by way of lib/storage/app-upload.ts, which posts to the hosted API on native builds and counts each image
 * toward the document's store's storage quota. Base64 images are never stored in documents.
 */
import { uploadAppFiles } from "@/lib/storage/app-upload";

export const DOC_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const DOC_IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const DOC_IMAGE_ACCEPT = DOC_IMAGE_TYPES.join(",");

export type DocImageProblem = "tooLarge" | "unsupported";

/** Pre-upload check; null when the file can be uploaded. */
export function validateDocImage(file: File): DocImageProblem | null {
  if (!DOC_IMAGE_TYPES.includes(file.type.toLowerCase())) return "unsupported";
  if (file.size > DOC_IMAGE_MAX_BYTES) return "tooLarge";
  return null;
}

/** i18n key for a validation problem. */
export function docImageProblemKey(problem: DocImageProblem): string {
  return problem === "tooLarge" ? "docs.image.tooLarge" : "docs.image.unsupported";
}

/** Which editor an image goes into (app_file.source). */
export type DocImageSource = "doc_image" | "sheet_image" | "slides_image";

/**
 * Uploads one image for a document of store `organizationId` and resolves to its hosted URL. Rejects on
 * validation or upload failure (appUploadErrorKey names the copy, e.g. the store is out of room).
 */
export async function uploadDocImage(
  file: File,
  organizationId: string,
  source: DocImageSource = "doc_image",
): Promise<string> {
  const problem = validateDocImage(file);
  if (problem) throw new Error(`[doc.image] ${problem}`);
  const res = await uploadAppFiles("generalFile", { files: [file], organizationId, source });
  const url = res[0]?.ufsUrl;
  if (!url) throw new Error("[doc.image] upload returned no URL");
  return url;
}

/** Only `http:` / `https:` URLs may be inserted as images (Insert ▸ Image ▸ By URL). */
export function normalizeImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Resolves true when the URL loads as an image (pre-flight for By URL inserts). */
export function probeImageUrl(url: string, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const img = new window.Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}
