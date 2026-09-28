// POST /api/drive/upload — the route @vercel/blob's `uploadPresigned` talks to.
//
// blob.generate-presigned-url (the uploader, with its WorkOS token):
//   1. storage configured and not paused, else 503 `not_configured`;
//   2. a verified caller, else 401;
//   3. clientPayload `{ v: 1, itemId, sizeBytes, contentType }` and a pathname
//      that is this item's blob key (or its thumbnail, never multipart), else
//      422 without calling the module;
//   4. authorize_drive_upload with the caller's token: the module checks that
//      the caller started this pending upload, is still an active member, and
//      asks for exactly the row's key, size and type; it counts the attempt and
//      extends the pending window;
//   5. a `put` delegation for exactly that pathname, size and type, valid no
//      longer than that window, never overwriting.
//
// blob.upload-completed (Vercel, Ed25519-signed; the SDK verifies it): a
// backstop for a tab closed right after its PUT. HEAD the blob, then attach the
// thumbnail or commit the original. A key no row owns any more is handed to
// service_discard_drive_blob; routes never delete client-supplied keys. Final
// outcomes answer 200; transient ones 500, so Vercel retries.

import { DRIVE_MAX_FILE_BYTES, normalizeDriveMime, parseDriveBlobKey } from "@/lib/drive/rules";
import { isDocumentId } from "@/lib/docs/ids";
import {
  DriveHttpError, driveHttpError, errorResponse, isCallbackSignatureError, isRecord, readJson, reducerFailure,
  requireCaller, routeOf,
} from "@/lib/drive/server/http";
import { DRIVE_PUT_TTL_MULTIPART_MS, DRIVE_PUT_TTL_SINGLE_MS } from "./config";
import type { DriveRouteHandler, DriveServerDeps } from "./types";

export interface DriveUploadClientPayload { v: 1; itemId: string; sizeBytes: number; contentType: string }
export interface DriveUploadTokenPayload { v: 1; itemId: string; thumb: boolean }

const UPLOAD_BODY_MAX_BYTES = 8 * 1024;
const PAYLOAD_MAX_CHARS = 2048;
const GENERATE_EVENT = "blob.generate-presigned-url";
const COMPLETED_EVENT = "blob.upload-completed";
/** Failures worth a Vercel retry of the callback. */
const TRANSIENT_CODES: ReadonlySet<string> = new Set(["upstream", "not_published", "unauthenticated", "not_configured"]);

function parsePayloadObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > PAYLOAD_MAX_CHARS) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value.v === 1 ? value : null;
  } catch {
    return null;
  }
}

function isItemId(value: unknown): value is string {
  return typeof value === "string" && value === value.toLowerCase() && isDocumentId(value);
}

/** The uploader's clientPayload: a lowercase item id, a size of 1..DRIVE_MAX_FILE_BYTES and an already normalized type. */
export function parseUploadClientPayload(raw: string | null | undefined): DriveUploadClientPayload | null {
  const value = parsePayloadObject(raw);
  if (!value) return null;
  const { itemId, sizeBytes, contentType } = value;
  if (!isItemId(itemId)) return null;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > DRIVE_MAX_FILE_BYTES) return null;
  if (typeof contentType !== "string" || contentType === "" || normalizeDriveMime(contentType) !== contentType) return null;
  return { v: 1, itemId, sizeBytes, contentType };
}

/** The tokenPayload this route put on the delegation, as Vercel echoes it in the callback. */
export function parseUploadTokenPayload(raw: string | null | undefined): DriveUploadTokenPayload | null {
  const value = parsePayloadObject(raw);
  if (!value || !isItemId(value.itemId) || typeof value.thumb !== "boolean") return null;
  return { v: 1, itemId: value.itemId, thumb: value.thumb };
}

function isGenerateBody(body: Record<string, unknown>): boolean {
  const payload = body.payload;
  return isRecord(payload) && typeof payload.pathname === "string" && typeof payload.multipart === "boolean"
    && (payload.clientPayload === null || typeof payload.clientPayload === "string");
}

/** The upload-completed callback: HEAD, then attach / commit; unowned keys go to service_discard_drive_blob. */
function createCompletionHandler(deps: DriveServerDeps) {
  return async ({ blob, tokenPayload }: { blob: { pathname: string }; tokenPayload?: string | null }): Promise<void> => {
    const payload = parseUploadTokenPayload(tokenPayload);
    const pathname = typeof blob?.pathname === "string" ? blob.pathname : "";
    const key = parseDriveBlobKey(pathname);
    if (!payload || !key || key.itemId !== payload.itemId || key.isThumb !== payload.thumb) {
      deps.log("warn", "drive.upload.callback_ignored", { itemId: payload?.itemId ?? "" });
      return;
    }
    const itemId = payload.itemId;
    const head = await deps.blob.head(pathname);
    if (!head) return;
    try {
      if (key.isThumb) await deps.call("setThumb", { itemId, thumbKey: pathname, observedBytes: head.size });
      else await deps.call("commitUpload", { itemId, blobKey: pathname, observedBytes: head.size, etag: head.etag });
      return;
    } catch (err) {
      const failure = reducerFailure(err);
      if (TRANSIENT_CODES.has(failure.code)) throw failure;
      if (failure.code !== "not_found" && failure.code !== "invalid") {
        deps.log("warn", "drive.upload.callback_final", { itemId, code: failure.code });
        return;
      }
    }
    // The row is gone, or the key is not its key: nothing references these bytes.
    try {
      await deps.call("discardBlob", { itemId, blobKey: pathname });
    } catch (err) {
      const failure = reducerFailure(err);
      if (TRANSIENT_CODES.has(failure.code)) throw failure;
      deps.log("warn", "drive.upload.discard_final", { itemId, code: failure.code });
    }
  };
}

export function createUploadRouteHandler(deps: DriveServerDeps): DriveRouteHandler {
  const onUploadCompleted = createCompletionHandler(deps);

  return async (req) => {
    try {
      const config = deps.config();
      if (!config) throw driveHttpError("not_configured", "File storage is not configured");
      const body = await readJson<unknown>(req, UPLOAD_BODY_MAX_BYTES);
      if (!isRecord(body)) throw new DriveHttpError("invalid", 400, "Unknown upload event");

      if (body.type === GENERATE_EVENT && isGenerateBody(body)) {
        if (config.uploadsPaused) throw driveHttpError("not_configured", "Uploads are paused");
        const caller = await requireCaller(deps, req);
        const result = await deps.handleUploadPresigned({
          body: body as unknown as Parameters<DriveServerDeps["handleUploadPresigned"]>[0]["body"],
          request: req,
          webhookPublicKey: config.webhookPublicKey,
          onUploadCompleted: config.callbacksEnabled ? onUploadCompleted : undefined,
          getSignedToken: async (pathname, clientPayload, multipart) => {
            const payload = parseUploadClientPayload(clientPayload);
            if (!payload) throw driveHttpError("invalid", "Invalid upload payload");
            const key = parseDriveBlobKey(pathname);
            if (!key || key.itemId !== payload.itemId || (key.isThumb && multipart)) {
              throw driveHttpError("invalid", "That storage key does not belong to this upload");
            }
            const { itemId, sizeBytes, contentType } = payload;
            // Taken before the module extends the window, so the delegation never outlives it.
            const startedAt = deps.now();
            try {
              await deps.call("authorizeUpload", {
                itemId, variant: key.isThumb ? "thumb" : "original", pathname, sizeBytes, mimeType: contentType, multipart,
              }, caller.token);
            } catch (err) {
              throw reducerFailure(err);
            }
            const validUntil = startedAt + (multipart ? DRIVE_PUT_TTL_MULTIPART_MS : DRIVE_PUT_TTL_SINGLE_MS);
            const constraints = { maximumSizeInBytes: sizeBytes, allowedContentTypes: [contentType], validUntil };
            const token = await deps.blob.issuePutToken(pathname, constraints);
            return {
              token,
              urlOptions: {
                ...constraints,
                allowOverwrite: false,
                addRandomSuffix: false,
                tokenPayload: JSON.stringify({ v: 1, itemId, thumb: key.isThumb } satisfies DriveUploadTokenPayload),
              },
            };
          },
        });
        return deps.json(req, result, { headers: { "Cache-Control": "private, no-store" } });
      }

      if (body.type === COMPLETED_EVENT && isRecord(body.payload)) {
        try {
          const result = await deps.handleUploadPresigned({
            body: body as unknown as Parameters<DriveServerDeps["handleUploadPresigned"]>[0]["body"],
            request: req,
            webhookPublicKey: config.webhookPublicKey,
            onUploadCompleted,
            getSignedToken: async () => {
              throw new DriveHttpError("invalid", 400, "Unexpected token request");
            },
          });
          return deps.json(req, result);
        } catch (err) {
          if (isCallbackSignatureError(err)) throw err;
          // Transient: answer 500 so Vercel delivers the callback again.
          const failure = reducerFailure(err);
          deps.log("error", "drive.upload.callback_retry", { route: routeOf(req), code: failure.code });
          return deps.json(req, { error: failure.message, code: failure.code }, { status: 500 });
        }
      }

      throw new DriveHttpError("invalid", 400, "Unknown upload event");
    } catch (err) {
      return errorResponse(deps, req, err);
    }
  };
}
