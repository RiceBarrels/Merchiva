// The one client path for app uploads (UploadThing): every upload says which
// store it is for and where it came from, and carries the signed-in session's
// WorkOS token, because app/api/uploadthing checks membership and the store's
// storage quota before it signs anything (lib/storage/server/app-upload-auth.ts).
//
// - uploadAppFiles: the promise form (chat, docs images, settings photos, …).
// - appUploadHeaders + appUploadInput: for useUploadThing / UploadButton
//   (`headers` option, `input` prop or startUpload's second argument);
//   lib/storage/use-app-upload.ts wraps them for components.
// - appUploadErrorKey: the i18n key for any failure of the above.
//
// No React here.

import type { ClientUploadedFileData, inferEndpointOutput } from "uploadthing/types";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import { currentAuthToken } from "@/lib/auth/token-bridge";
import { uploadFiles } from "@/lib/uploadthing";
import type { AppFileSource } from "@/lib/storage/sources";

/** Every store endpoint; `platformImage` (the platform blog) is not an app upload. */
export type AppUploadEndpoint = Exclude<keyof OurFileRouter, "platformImage">;
export type AppUploadResult<E extends AppUploadEndpoint> = ClientUploadedFileData<inferEndpointOutput<OurFileRouter[E]>>;
export type AppUploadInputValue = { organizationId: string; source: AppFileSource };

export type AppUploadErrorKey = "appUpload.quotaExceeded" | "appUpload.signInRequired" | "appUpload.failed";

const UNAUTHENTICATED = "[drive.unauthenticated] Sign in to upload";

/** The `input` every store endpoint requires. */
export function appUploadInput(organizationId: string, source: AppFileSource): AppUploadInputValue {
  return { organizationId, source };
}

/**
 * `Authorization: Bearer <WorkOS token>` for the upload request, read fresh on every upload (tokens live ~5 min).
 * Signed out: no header, and the route refuses with `[drive.unauthenticated]`.
 */
export async function appUploadHeaders(): Promise<Record<string, string>> {
  const token = await currentAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UploadAppFilesOptions {
  files: File[];
  organizationId: string;
  source: AppFileSource;
  /** Whole-upload progress, 0..100. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads `files` to a store endpoint and resolves to UploadThing's results (`ufsUrl`, `serverData`, …), in order.
 * Rejects when signed out, when the store is out of room (`[drive.quota_exceeded]`), or on any upload failure;
 * `appUploadErrorKey(err)` names the copy.
 */
export async function uploadAppFiles<E extends AppUploadEndpoint>(
  endpoint: E,
  opts: UploadAppFilesOptions,
): Promise<AppUploadResult<E>[]> {
  if (!opts.organizationId) throw new Error("[drive.invalid] No store to upload to");
  // Checked first so a signed-out upload fails without a round trip.
  if (!(await currentAuthToken())) throw new Error(UNAUTHENTICATED);
  const { onProgress } = opts;
  // The generated uploadFiles is typed per endpoint; E is a union here, so its options are built for the union.
  const upload = uploadFiles as unknown as (
    slug: E,
    options: {
      files: File[];
      input: AppUploadInputValue;
      headers: () => Promise<Record<string, string>>;
      signal?: AbortSignal;
      onUploadProgress?: (p: { totalProgress: number }) => void;
    },
  ) => Promise<AppUploadResult<E>[]>;
  return upload(endpoint, {
    files: opts.files,
    input: appUploadInput(opts.organizationId, opts.source),
    headers: appUploadHeaders,
    signal: opts.signal,
    onUploadProgress: onProgress ? ({ totalProgress }) => onProgress(totalProgress) : undefined,
  });
}

/** Every message an error carries: its own, and its cause's (UploadThing keeps the server's text in both). */
function messagesOf(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current != null; depth++) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (typeof current !== "object") break;
    const { message, cause } = current as { message?: unknown; cause?: unknown };
    if (typeof message === "string") parts.push(message);
    current = cause;
  }
  return parts.join("\n");
}

/** The i18n key for an app-upload failure: out of room, signed out, or anything else. */
export function appUploadErrorKey(err: unknown): AppUploadErrorKey {
  const text = messagesOf(err);
  if (text.includes("[drive.quota_exceeded]")) return "appUpload.quotaExceeded";
  if (text.includes("[drive.unauthenticated]")) return "appUpload.signInRequired";
  return "appUpload.failed";
}

/** appUploadErrorKey, keeping a call site's own copy (`fallback`) for a failure that is neither of the named ones. */
export function appUploadErrorKeyOr(err: unknown, fallback: string): string {
  const key = appUploadErrorKey(err);
  return key === "appUpload.failed" ? fallback : key;
}
