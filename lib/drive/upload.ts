// One file into Drive: plan → thumbnail → begin → PUT → commit.
//
//   1. planDriveUpload (pure) cleans the name, resolves the type, checks size
//      and blocked types, and fixes the ids and blob keys the module will
//      recompute (lib/drive/rules.ts is its client twin).
//   2. A best-effort thumbnail (≤ 3 s).
//   3. beginDriveUpload reserves the pending row; quota, permission, type and
//      operator refusals surface here as `[drive.<code>]`. Before it, the
//      real transport checks GET /api/drive/status (cached a minute per tab),
//      so an unconfigured or paused store fails with `not_configured` and
//      reserves nothing.
//   4. The thumbnail, then the original, go straight to the private Blob store
//      with @vercel/blob's uploadPresigned; POST /api/drive/upload authorizes
//      each PUT for exactly that key, size and type.
//   5. POST /api/drive/commit: the server HEADs the blob and marks the row
//      ready with the size the store reports. The route refuses before it
//      reads the row while storage is not configured, so the real transport
//      fails with `not_configured` without the request while the tab's status
//      says so (paused is no reason: committing stays open then).
//
// A cancelled upload aborts its pending row, and so does any other failure
// after begin unless the caller will retry (`keepPendingOnFailure`, the
// queue). A retry (`resume`) commits first — the PUT may have landed, and keys
// never overwrite — and PUTs again only when the bytes are missing. A failure
// that reserved nothing (driveUploadReservedNothing) has no row to resume: its
// retry starts at begin again.
//
// The storage status the begin check reads is also what the screens read
// (useDriveStorageStatus): Upload is off, with the reason, while it is false.

import type { UploadOptions } from "@vercel/blob/client";
import { apiUrl } from "@/lib/api-client";
import { isDocumentId, newDocumentId } from "@/lib/docs/ids";
import {
  getDriveStorageStatus, getDriveToken, postDriveCommit, type DriveCommitInput, type DriveCommitResult,
} from "@/lib/drive/api";
import { driveErrorCode, DriveClientError } from "@/lib/drive/errors";
import {
  cleanDriveName, DRIVE_MAX_FILE_BYTES, DRIVE_MULTIPART_THRESHOLD_BYTES, driveBlobKey, driveThumbKeyFor,
  isBlockedDriveFile, parseDriveBlobKey, resolveDriveMime,
} from "@/lib/drive/rules";
import { createDriveThumbnail, type DriveThumbnail } from "@/lib/drive/thumbnail";
import type { DriveSpace } from "@/lib/drive/types";
import { abortDriveUpload, beginDriveUpload } from "@/lib/spacetimedb/actions/drive";

/** The browser says it has no network (an unknown state counts as online). */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Where a file goes and who adds it (`actingMemberId`: the PIN operator on /store, '' = the caller). */
export interface DriveUploadTarget {
  organizationId: string;
  space: DriveSpace;
  /** '' = the root of the space. */
  parentId: string;
  /** Whose My files a root target is ('' or absent = the actor's own). */
  ownerMemberId?: string;
  actingMemberId: string;
}
/** `name` defaults to the File's own name, `mimeType` to its type (or one from the extension). */
export interface DriveUploadSource { file: Blob; name?: string; mimeType?: string }
export interface DriveUploadPlan {
  itemId: string;
  blobId: string;
  /** The cleaned display name. */
  name: string;
  mimeType: string;
  sizeBytes: number;
  blobKey: string;
  thumbKey: string;
  multipart: boolean;
  target: DriveUploadTarget;
}
export interface DriveUploadProgress { phase: "preparing" | "uploading" | "finalizing"; loaded: number; total: number }
export interface DriveUploadResult { itemId: string; sizeBytes: number; mimeType: string }
export interface DriveUploadTransport {
  /**
   * Reserves the pending row (beginDriveUpload). A rejection carrying a Drive code means nothing stays reserved (the
   * store is off, there is no connection, the module refused, or the module's keys differ from the plan's and the
   * row it took was dropped again); any other rejection may have come after the module took the row.
   */
  begin(plan: DriveUploadPlan): Promise<void>;
  put(
    plan: DriveUploadPlan,
    which: "original" | "thumb",
    body: Blob,
    contentType: string,
    opts: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void },
  ): Promise<void>;
  /** POST /api/drive/commit. The real one rejects with `not_configured`, sending nothing, while the store is not configured. */
  commit(input: DriveCommitInput): Promise<DriveCommitResult>;
  /** Drops the pending row (abortDriveUpload); a no-op once it is ready or gone. */
  abort(itemId: string): Promise<void>;
  thumbnail(body: Blob, mimeType: string): Promise<DriveThumbnail | null>;
}
export interface DriveUploadOptions {
  transport?: DriveUploadTransport;
  signal?: AbortSignal;
  onProgress?: (progress: DriveUploadProgress) => void;
  /** A plan made earlier (the queue plans at enqueue, so the item id is known at once). */
  plan?: DriveUploadPlan;
  /** The pending row of `plan` exists already: commit first, PUT only when the bytes are missing. */
  resume?: boolean;
  /**
   * The caller retries failed uploads with `resume` (the queue), so a failure other than a cancel keeps the pending
   * row. Otherwise every failure after begin releases it, so a one-shot upload never holds the uploader's caps.
   */
  keepPendingOnFailure?: boolean;
}

function fileName(file: Blob): string {
  const name = (file as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

function lowerId(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Everything the upload needs, decided before any request. Rejects with DriveClientError: `invalid` (empty file,
 * malformed ids or store), `too_large`, `invalid_name`, `blocked_type`.
 */
export function planDriveUpload(
  source: DriveUploadSource,
  target: DriveUploadTarget,
  ids?: { itemId: string; blobId: string },
): DriveUploadPlan {
  const sizeBytes = Number(source.file?.size);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new DriveClientError("invalid", "[drive.invalid] Empty files cannot be uploaded");
  if (sizeBytes > DRIVE_MAX_FILE_BYTES) throw new DriveClientError("too_large");
  const name = cleanDriveName(String(source.name ?? fileName(source.file)).normalize("NFC"));
  if (name === null) throw new DriveClientError("invalid_name");
  const mimeType = resolveDriveMime({ type: source.mimeType ?? source.file.type }, name);
  if (isBlockedDriveFile(name, mimeType)) throw new DriveClientError("blocked_type");

  const itemId = lowerId(ids?.itemId ?? newDocumentId());
  const blobId = lowerId(ids?.blobId ?? newDocumentId());
  if (!isDocumentId(itemId) || !isDocumentId(blobId)) throw new DriveClientError("invalid", "[drive.invalid] Malformed upload id");
  const organizationId = lowerId(target.organizationId);
  const blobKey = driveBlobKey(organizationId, itemId, blobId, name);
  if (!parseDriveBlobKey(blobKey)) throw new DriveClientError("invalid", "[drive.invalid] Malformed store id");

  return {
    itemId,
    blobId,
    name,
    mimeType,
    sizeBytes,
    blobKey,
    thumbKey: driveThumbKeyFor(blobKey),
    multipart: sizeBytes >= DRIVE_MULTIPART_THRESHOLD_BYTES,
    target: {
      organizationId,
      space: target.space,
      parentId: lowerId(target.parentId),
      ownerMemberId: target.ownerMemberId ? target.ownerMemberId.trim() : undefined,
      actingMemberId: String(target.actingMemberId ?? "").trim(),
    },
  };
}

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/**
 * @vercel/blob's client entry exports no error classes, so its errors are mapped by message:
 *   an aborted signal or "The request was aborted." → aborted; "Failed to retrieve the presigned URL" (our upload
 *   route refused, its reason is lost) → upload_start_failed; "File is too large" → too_large; "Content type mismatch"
 *   → invalid; "Client token has expired" → expired; offline or a fetch TypeError → network.
 * Anything else comes back as it was (wrapped in an Error when it is not one), which the UI shows as generic.
 */
export function mapBlobSdkError(err: unknown, signal?: AbortSignal): Error {
  if (err instanceof DriveClientError) return err;
  const message = messageOf(err);
  const name = (err as { name?: unknown } | null)?.name;
  if (signal?.aborted || name === "AbortError" || message.includes("The request was aborted.")) return new DriveClientError("aborted");
  if (message.includes("Failed to retrieve the presigned URL")) return new DriveClientError("upload_start_failed");
  if (message.includes("File is too large")) return new DriveClientError("too_large");
  if (message.includes("Content type mismatch")) return new DriveClientError("invalid", "[drive.invalid] Content type mismatch");
  if (message.includes("Client token has expired")) return new DriveClientError("expired");
  if (isOffline() || err instanceof TypeError) return new DriveClientError("network");
  return err instanceof Error ? err : new Error(message || "Upload failed");
}

/** The upload route as an absolute URL (the SDK resolves a relative one against `location`, which may be absent). */
function uploadRouteUrl(): string {
  const url = apiUrl("/api/drive/upload");
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || typeof window === "undefined" || !window.location) return url;
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

/** How long a storage status read is trusted: the Blob env and the pause switch change rarely. */
export const DRIVE_STORAGE_STATUS_TTL_MS = 60_000;
/** What GET /api/drive/status said; null when it could not be read. */
type DriveStorageRead = { configured: boolean; paused: boolean } | null;
let storageStatus: { at: number; read: Promise<DriveStorageRead> } | null = null;

/**
 * The tab's last storage answer, for screens: `checking` until a read settles, `ready`, `unavailable` (not configured
 * or paused: Upload is off and says why) or `unknown` (the status could not be read: uploads stay on).
 */
export type DriveStorageAvailability = "checking" | "ready" | "unavailable" | "unknown";
let storageAvailability: DriveStorageAvailability = "checking";
const storageListeners = new Set<() => void>();

function readyOf(read: DriveStorageRead): boolean | null {
  return read === null ? null : read.configured && !read.paused;
}

function publishStorage(ready: boolean | null): void {
  const next: DriveStorageAvailability = ready === null ? "unknown" : ready ? "ready" : "unavailable";
  if (next === storageAvailability) return;
  storageAvailability = next;
  for (const listener of [...storageListeners]) listener();
}

/** The last settled storage answer (useDriveStorageStatus reads it with useSyncExternalStore). */
export function getDriveStorageAvailability(): DriveStorageAvailability {
  return storageAvailability;
}

/** Called whenever the tab's storage answer changes, whoever read it (a screen, or an upload). Returns the unsubscribe. */
export function subscribeDriveStorageAvailability(listener: () => void): () => void {
  storageListeners.add(listener);
  return () => {
    storageListeners.delete(listener);
  };
}

/**
 * Whether the store takes uploads (GET /api/drive/status, shared by the tab for a minute): false when it is not
 * configured or paused, null when the status could not be read — the upload then goes ahead and fails on its own.
 * An unknown answer is not kept. `fresh` reads it again. Never rejects. Every answer that settles while it is the
 * tab's latest read becomes getDriveStorageAvailability().
 */
export function driveStorageReady(fresh = false): Promise<boolean | null> {
  return readDriveStorage(fresh).then(readyOf);
}

/** The status read behind driveStorageReady (same cache, same publishing), with `configured` and `paused` apart. */
function readDriveStorage(fresh: boolean): Promise<DriveStorageRead> {
  const now = Date.now();
  if (!fresh && storageStatus && now - storageStatus.at < DRIVE_STORAGE_STATUS_TTL_MS) return storageStatus.read;
  const entry = {
    at: now,
    read: getDriveStorageStatus().then(
      ({ configured, paused }): DriveStorageRead => ({ configured, paused }),
      (err: unknown): DriveStorageRead => (driveErrorCode(err) === "not_configured" ? { configured: false, paused: false } : null),
    ),
  };
  storageStatus = entry;
  void entry.read.then((read) => {
    // A read started after this one answers instead.
    if (storageStatus !== entry) return;
    publishStorage(readyOf(read));
    if (read === null) storageStatus = null;
  });
  return entry.read;
}

/** Forgets the cached storage status and the last answer (tests). */
export function __resetDriveStorageStatusForTests(): void {
  storageStatus = null;
  storageAvailability = "checking";
}

/** The real transport: the Drive reducers over the live connection, the Blob SDK (loaded on first PUT), the API routes. */
export function createDriveUploadTransport(): DriveUploadTransport {
  return {
    async begin(plan) {
      // Without a Blob store the SDK would only report "Failed to retrieve the presigned URL": say so up front, before
      // a pending row counts against the uploader's caps.
      if ((await driveStorageReady()) === false) throw new DriveClientError("not_configured");
      const { target } = plan;
      const began = await beginDriveUpload({
        organizationId: target.organizationId,
        space: target.space,
        parentId: target.parentId,
        ownerMemberId: target.ownerMemberId,
        actingMemberId: target.actingMemberId,
        name: plan.name,
        file: { type: plan.mimeType, size: plan.sizeBytes },
        itemId: plan.itemId,
        blobId: plan.blobId,
      });
      if (began.blobKey !== plan.blobKey || began.mimeType !== plan.mimeType) {
        // The module took the row under its own key, which this plan would never PUT or commit: drop it, so a begin
        // that rejects with a Drive code never leaves a row behind.
        await abortDriveUpload(plan.itemId).catch(() => undefined);
        throw new DriveClientError("invalid", "[drive.invalid] The upload key does not match the plan");
      }
    },

    async put(plan, which, body, contentType, opts) {
      const token = await getDriveToken();
      if (!token) throw new DriveClientError("unauthenticated", "[drive.unauthenticated] Sign in again");
      const options: UploadOptions = {
        access: "private",
        handleUploadUrl: uploadRouteUrl(),
        headers: { Authorization: `Bearer ${token}` },
        clientPayload: JSON.stringify({ v: 1, itemId: plan.itemId, sizeBytes: body.size, contentType }),
        contentType,
        multipart: which === "original" && plan.multipart,
        abortSignal: opts.signal,
        onUploadProgress: opts.onProgress ? (event) => opts.onProgress?.(event.loaded, event.total) : undefined,
      };
      try {
        const { uploadPresigned } = await import("@vercel/blob/client");
        await uploadPresigned(which === "thumb" ? plan.thumbKey : plan.blobKey, body, options);
      } catch (err) {
        const mapped = mapBlobSdkError(err, opts.signal);
        // The SDK drops the upload route's reason. A store that went away since the last status read is one we can name.
        if (driveErrorCode(mapped) === "upload_start_failed" && (await driveStorageReady(true)) === false) {
          throw new DriveClientError("not_configured");
        }
        throw mapped;
      }
    },

    async commit(input) {
      // The route answers 503 `not_configured` before it reads the row, so a Retry would only repeat that refusal.
      // Paused is not enough to skip it: committing stays open while uploads are paused.
      if ((await readDriveStorage(false))?.configured === false) throw new DriveClientError("not_configured");
      return postDriveCommit(input);
    },
    abort: (itemId) => abortDriveUpload(itemId),
    thumbnail: (body, mimeType) => createDriveThumbnail(body, mimeType),
  };
}

let sharedTransport: DriveUploadTransport | null = null;

/** The tab's transport (the default of uploadDriveFile, the upload queue and startDriveUpload). */
export function sharedDriveUploadTransport(): DriveUploadTransport {
  if (!sharedTransport) sharedTransport = createDriveUploadTransport();
  return sharedTransport;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DriveClientError("aborted");
}

function committed(plan: DriveUploadPlan, result: DriveCommitResult): DriveUploadResult {
  if (result.outcome === "rejected_oversize") throw new DriveClientError("too_large", "[drive.too_large] The stored file did not match its size");
  return { itemId: plan.itemId, sizeBytes: result.sizeBytes, mimeType: plan.mimeType };
}

/** Failures of uploadDriveFile calls that reserved nothing (driveUploadReservedNothing). */
const reservedNothing = new WeakSet<object>();

/**
 * The failed uploadDriveFile call reserved nothing, so no pending row exists for its plan: it stopped before begin,
 * or begin rejected with a Drive code (DriveUploadTransport.begin: storage off, no connection, a refusal of the
 * module). Its retry starts at begin again, and there is nothing to commit or release. False for a resume, for any
 * failure after begin, and for a begin that failed without a Drive code (a dropped connection): that row may exist.
 */
export function driveUploadReservedNothing(err: unknown): boolean {
  return typeof err === "object" && err !== null && reservedNothing.has(err);
}

/** A begin that rejected with a Drive code reserved nothing; `network` is any other failure while offline. */
function beginRefused(err: unknown): boolean {
  const code = driveErrorCode(err);
  return code !== null && code !== "network";
}

/** Uploads one file and resolves once its row is ready. See the file comment for the steps. */
export async function uploadDriveFile(
  source: DriveUploadSource,
  target: DriveUploadTarget,
  opts: DriveUploadOptions = {},
): Promise<DriveUploadResult> {
  const plan = opts.plan ?? planDriveUpload(source, target);
  const transport = opts.transport ?? sharedDriveUploadTransport();
  const { signal } = opts;
  const total = plan.sizeBytes;
  // The SDK throttles progress on a timer it never clears, so a call can land after the PUT, or this upload, settled.
  let live = true;
  const report = (phase: DriveUploadProgress["phase"], loaded: number) => {
    if (live) opts.onProgress?.({ phase, loaded, total });
  };
  let begun = opts.resume === true;
  let beginCalled = false;

  try {
    throwIfAborted(signal);
    report("preparing", 0);
    let thumbSent = false;
    if (opts.resume) {
      // The PUT may have landed before the failure: committing first never re-uploads bytes that are stored.
      try {
        return committed(plan, await transport.commit({ itemId: plan.itemId, blobKey: plan.blobKey, thumbKey: plan.thumbKey }));
      } catch (err) {
        if (driveErrorCode(err) !== "not_uploaded") throw err;
      }
    } else {
      const thumb = await transport.thumbnail(source.file, plan.mimeType).catch(() => null);
      throwIfAborted(signal);
      beginCalled = true;
      await transport.begin(plan);
      begun = true;
      if (thumb) {
        try {
          await transport.put(plan, "thumb", thumb.blob, thumb.mimeType, { signal });
          thumbSent = true;
        } catch (err) {
          // A missing thumbnail only costs the grid a preview; a cancel still cancels, and a store that is gone stays gone.
          const code = driveErrorCode(err);
          if (signal?.aborted || code === "aborted" || code === "not_configured") throw err;
        }
      }
    }

    throwIfAborted(signal);
    report("uploading", 0);
    let putOpen = true;
    try {
      await transport.put(plan, "original", source.file, plan.mimeType, {
        signal,
        onProgress: (loaded) => {
          if (putOpen) report("uploading", Math.min(Math.max(0, loaded), total));
        },
      });
    } finally {
      putOpen = false;
    }
    report("finalizing", total);
    // On a resume the thumbnail may have landed earlier; the route attaches it only if it exists.
    const thumbKey = thumbSent || opts.resume ? plan.thumbKey : undefined;
    return committed(plan, await transport.commit({ itemId: plan.itemId, blobKey: plan.blobKey, thumbKey }));
  } catch (err) {
    const cancelled = signal?.aborted || driveErrorCode(err) === "aborted";
    // A no-op on a row that is ready or gone (the commit may have landed; an oversize row is dropped already).
    if (begun && (cancelled || !opts.keepPendingOnFailure)) await transport.abort(plan.itemId).catch(() => undefined);
    if (cancelled) throw err instanceof DriveClientError && err.code === "aborted" ? err : new DriveClientError("aborted");
    if (!begun && (!beginCalled || beginRefused(err)) && typeof err === "object" && err !== null) reservedNothing.add(err);
    throw err;
  } finally {
    live = false;
  }
}
