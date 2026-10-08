// File and photo answers (design B.9): each file goes through the Drive upload
// pipeline (lib/drive/upload.ts: begin → PUT to the private Blob store → commit)
// into the respondent's own My files, and the answer stores only the Drive item
// ids. The files are real drive_item rows: sized, counted in the store's Drive
// quota, and visible to the respondent and Drive admins — never to colleagues.
// UploadThing is never used here (public URLs, no auth, no accounting).
//
// On /store the PIN operator is the respondent: `actingMemberId` names them, so
// the module files the upload under the operator's My files. A staff-account
// tablet has no My files (storeDeviceIsStoreOnly) and the reducer refuses file
// answers there (decision C6b), so uploads are refused before any request.
//
// Failures reject with `[forms.<code>]` (no files here, too many files, a type
// the question does not take) or with the Drive pipeline's own errors
// (DriveClientError / `[drive.<code>]`: too large, blocked type, quota, storage
// not configured, aborted). formsErrorKey turns either into copy.

import { storeDeviceIsStoreOnly } from "@/lib/drive/access";
import { resolveDriveMime } from "@/lib/drive/rules";
import { uploadDriveFile, type DriveUploadProgress, type DriveUploadTransport } from "@/lib/drive/upload";
import type { OrgRole } from "@/lib/types";
import { FORM_MAX_FILES_PER_RESPONSE } from "./limits";
import type { FileAnswer, FileQuestion } from "./types";

export type FormUploadSurface = "manager" | "store" | "personal";

/** Who answers, and where. */
export interface FormUploadContext {
  organizationId: string;
  surface: FormUploadSurface;
  /** The PIN operator on /store ('' or absent = the caller). */
  actingMemberId?: string | null;
  /** The role of the account signed in on this device: on /store the tablet's, not the operator's. */
  deviceAccountRole?: OrgRole | null;
  /**
   * The signed-in identity holds a device_operator_session in this org (a PIN or QR unlock happened on it and it was
   * not locked since). submitFormResponse then treats it as a store tablet whatever surface the request names.
   */
  holdsStoreSession?: boolean;
}

export interface FormUploadOptions {
  signal?: AbortSignal;
  /** Default: the shared Drive transport (tests pass a fake). */
  transport?: DriveUploadTransport;
  /** Per file: `index` in the list passed to uploadFormFiles (0 for uploadFormFile). */
  onProgress?: (index: number, progress: DriveUploadProgress) => void;
}

/**
 * Whether file and photo answers can be given here: everywhere but a staff-account store tablet. Mirrors
 * submitFormResponse, which also counts a staff identity holding a device_operator_session as a tablet on any
 * surface, so its phone never uploads into My files only to have the response refused.
 */
export function formFilesAllowed(
  ctx: Pick<FormUploadContext, "surface" | "deviceAccountRole" | "holdsStoreSession">,
): boolean {
  if (!storeDeviceIsStoreOnly(ctx.deviceAccountRole)) return true;
  return ctx.surface !== "store" && ctx.holdsStoreSession !== true;
}

/** The question's per-response file count (1..FORM_MAX_FILES_PER_RESPONSE; default 1). */
export function questionMaxFiles(question: Pick<FileQuestion, "maxFiles">): number {
  const n = Number.isInteger(question.maxFiles) ? Number(question.maxFiles) : 1;
  return Math.min(Math.max(n, 1), FORM_MAX_FILES_PER_RESPONSE);
}

/** `.pdf, image/*` style patterns: extensions, `type/*` and exact MIME types. Empty accepts everything. */
export function fileMatchesAccept(name: string, mimeType: string, accept: string | undefined): boolean {
  const patterns = String(accept ?? "").split(",").map((p) => p.trim().toLowerCase()).filter((p) => p !== "");
  if (patterns.length === 0) return true;
  const lowerName = name.toLowerCase();
  const mime = mimeType.toLowerCase();
  return patterns.some((p) => {
    if (p.startsWith(".")) return lowerName.endsWith(p);
    if (p.endsWith("/*")) return mime.startsWith(p.slice(0, -1));
    return mime === p;
  });
}

function blobName(file: Blob): string {
  const name = (file as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

/** Whether `file` fits the question's type: a photo takes images only, a file question its `accept` list. */
export function fileFitsQuestion(file: Blob, question: Pick<FileQuestion, "type" | "accept">): boolean {
  const name = blobName(file);
  const mime = resolveDriveMime(file, name);
  if (question.type === "photo") return mime.startsWith("image/");
  return fileMatchesAccept(name, mime, question.accept);
}

function refuse(code: "files_not_allowed" | "too_many_files" | "invalid_answer", message: string): Error {
  return new Error(`[forms.${code}] ${message}`);
}

/** Checks made before any request; throws `[forms.<code>]`. */
export function assertFormUploads(files: readonly Blob[], question: FileQuestion, ctx: FormUploadContext, already = 0): void {
  if (!formFilesAllowed(ctx)) throw refuse("files_not_allowed", "File answers are off on this device");
  if (already + files.length > questionMaxFiles(question)) throw refuse("too_many_files", "Too many files for this question");
  if (files.some((f) => !fileFitsQuestion(f, question))) throw refuse("invalid_answer", "This question does not take that file type");
}

/** Uploads one file into the respondent's My files; resolves with its Drive item id once it is ready. */
export async function uploadFormFile(
  file: Blob, question: FileQuestion, ctx: FormUploadContext, opts: FormUploadOptions = {},
): Promise<string> {
  assertFormUploads([file], question, ctx);
  return uploadOne(file, ctx, 0, opts);
}

/**
 * Uploads several files for one question, one after another (the Drive pipeline caps pending uploads per uploader),
 * and resolves with the answer. `already` = files the answer holds already, for the per-question cap.
 * On a failure the files uploaded so far stay in My files, like any Drive upload; the error is rethrown.
 */
export async function uploadFormFiles(
  files: readonly Blob[], question: FileQuestion, ctx: FormUploadContext, opts: FormUploadOptions = {}, already = 0,
): Promise<FileAnswer> {
  assertFormUploads(files, question, ctx, already);
  const driveItemIds: string[] = [];
  for (let i = 0; i < files.length; i++) driveItemIds.push(await uploadOne(files[i], ctx, i, opts));
  return { driveItemIds };
}

async function uploadOne(file: Blob, ctx: FormUploadContext, index: number, opts: FormUploadOptions): Promise<string> {
  const result = await uploadDriveFile(
    { file },
    {
      organizationId: ctx.organizationId,
      space: "my",
      parentId: "",
      // '' = the actor's own My files: the operator's on /store, the caller's elsewhere.
      ownerMemberId: "",
      actingMemberId: ctx.surface === "store" ? String(ctx.actingMemberId ?? "").trim() : "",
    },
    { transport: opts.transport, signal: opts.signal, onProgress: opts.onProgress ? (p) => opts.onProgress?.(index, p) : undefined },
  );
  return result.itemId.toLowerCase();
}
