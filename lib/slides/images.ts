// The one place Slides uploads an image (slides.md §12.2): insert, paste, drop, the phone camera, and .pptx import
// assets all come through uploadSlidesImage. Phase 1 uses the Docs image route (UploadThing, public unguessable
// URLs; R10/Q2), so the context is not needed yet. A Drive-backed store would place the file by it and return a
// `drive:<itemId>` reference; only this file (and the two renderers that resolve such a src) would change.
import { uploadDocImage } from "@/lib/docs/uploads";
import type { DriveDocTarget } from "@/lib/drive/types";
import { safeImageSrc } from "@/lib/slides/model/safe-values";

/** `documentId` is null during an import (the deck does not exist yet). */
export interface SlidesImageContext { documentId: string | null; target: DriveDocTarget }

/**
 * Uploads one image and resolves to its https URL (the form every image src must take, safeImageSrc). Rejects with
 * `[doc.image] unsupported` / `[doc.image] tooLarge` before any upload (docImageProblemKey has the copy), or when the
 * upload fails or returns a URL a slide may not show.
 */
export async function uploadSlidesImage(file: File, ctx: SlidesImageContext): Promise<string> {
  void ctx; // Phase 1: the Docs route stores every image the same way (see the file comment)
  const url = safeImageSrc(await uploadDocImage(file));
  if (url === "") throw new Error("[doc.image] upload returned an unusable URL");
  return url;
}
