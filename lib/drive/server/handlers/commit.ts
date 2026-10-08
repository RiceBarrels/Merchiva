// POST /api/drive/commit { itemId, blobKey, thumbKey? } — the uploader says its
// PUT finished. The size that counts is the one Blob reports, never the
// client's.
//
//   1. A verified caller (401), configured storage (503), a well-formed body (400/422).
//   2. The caller must SEE the row: a user-token SQL read, so strangers, other
//      organizations and ex-members get 404 before any billed HEAD.
//   3. A thumbnail not yet attached: HEAD it, then service_set_drive_thumb (never fatal).
//   4. Already ready under this key: 200, no HEAD (an idempotent retry).
//   5. HEAD the original: missing → 409 `not_uploaded`.
//   6. service_commit_drive_upload with the HEAD size and etag. Reducers return
//      nothing, so the route answers from its own read: an empty blob or one
//      larger than declared was rejected by the module (row deleted, bytes
//      queued for GC) → 413 `too_large` / `rejected_oversize`.
// A key the row does not own is 422 with no module call: beginDriveUpload fixes
// the key and authorize_drive_upload signs a PUT for that key only, so no bytes
// sit under another key of a live row, and a caller-chosen key must never queue
// GC rows (bytes orphaned some other way are the reconcile cron's). The row's own
// key, when the row vanished before the commit, is handed to
// service_discard_drive_blob → 404. The route never deletes blobs.
// Committing stays open while uploads are paused: the bytes are already stored.

import { driveThumbKeyFor, parseDriveBlobKey } from "@/lib/drive/rules";
import { isDocumentId } from "@/lib/docs/ids";
import { driveHttpError, errorResponse, isRecord, readJson, reducerFailure, requireCaller } from "@/lib/drive/server/http";
import { dedupeRowsBy, sqlNumber, sqlString, type SqlRow } from "@/lib/drive/server/sql-rows";
import type { DriveRouteHandler, DriveServerDeps } from "./types";

export interface DriveCommitBody { itemId: string; blobKey: string; thumbKey?: string }
export interface DriveCommitResponse { outcome: "committed" | "rejected_oversize"; sizeBytes: number }

const COMMIT_BODY_MAX_BYTES = 2 * 1024;
const NO_STORE = { "Cache-Control": "private, no-store" };

/** The body, with the keys checked against each other; null when malformed. */
function parseCommitBody(body: unknown): DriveCommitBody | null {
  if (!isRecord(body)) return null;
  const { itemId, blobKey, thumbKey } = body;
  if (typeof itemId !== "string" || itemId !== itemId.toLowerCase() || !isDocumentId(itemId)) return null;
  if (typeof blobKey !== "string") return null;
  const key = parseDriveBlobKey(blobKey);
  if (!key || key.isThumb || key.itemId !== itemId) return null;
  if (thumbKey === undefined || thumbKey === null || thumbKey === "") return { itemId, blobKey };
  if (typeof thumbKey !== "string" || thumbKey !== driveThumbKeyFor(blobKey)) return null;
  return { itemId, blobKey, thumbKey };
}

export function createCommitRouteHandler(deps: DriveServerDeps): DriveRouteHandler {
  /** Nothing references `blobKey` any more: let the module queue it for deletion if it is not live. */
  async function discard(itemId: string, blobKey: string): Promise<never> {
    try {
      await deps.call("discardBlob", { itemId, blobKey });
    } catch (err) {
      throw reducerFailure(err);
    }
    throw driveHttpError("not_found", "Upload not found");
  }

  /** The row as the caller's own RLS rules show it (the id is a validated uuid, so nothing needs escaping). */
  async function readVisibleRow(itemId: string, token: string): Promise<SqlRow | null> {
    try {
      const rows = await deps.sql(`SELECT id, status, blob_key, thumb_key, size_bytes FROM drive_item WHERE id = '${itemId}'`, token);
      return dedupeRowsBy(rows, "id")[0] ?? null;
    } catch (err) {
      throw reducerFailure(err);
    }
  }

  async function attachThumb(itemId: string, thumbKey: string): Promise<void> {
    try {
      const head = await deps.blob.head(thumbKey);
      if (head) await deps.call("setThumb", { itemId, thumbKey, observedBytes: head.size });
    } catch (err) {
      deps.log("warn", "drive.commit.thumb_failed", { itemId, code: reducerFailure(err).code });
    }
  }

  return async (req) => {
    try {
      const caller = await requireCaller(deps, req);
      if (!deps.config()) throw driveHttpError("not_configured", "File storage is not configured");
      const input = parseCommitBody(await readJson<unknown>(req, COMMIT_BODY_MAX_BYTES));
      if (!input) throw driveHttpError("invalid", "Invalid commit request");
      const { itemId, blobKey, thumbKey } = input;

      const row = await readVisibleRow(itemId, caller.token);
      if (!row) throw driveHttpError("not_found", "Upload not found");
      const ready = sqlString(row, "status") === "ready";
      const rowKey = sqlString(row, "blob_key");
      if (rowKey !== blobKey) throw driveHttpError("invalid", "That is not this upload's key");

      if (thumbKey && sqlString(row, "thumb_key") === "") await attachThumb(itemId, thumbKey);
      if (ready) {
        const done: DriveCommitResponse = { outcome: "committed", sizeBytes: sqlNumber(row, "size_bytes") };
        return deps.json(req, done, { headers: NO_STORE });
      }

      const head = await deps.blob.head(blobKey);
      if (!head) throw driveHttpError("not_uploaded", "The file has not finished uploading");
      try {
        await deps.call("commitUpload", { itemId, blobKey, observedBytes: head.size, etag: head.etag });
      } catch (err) {
        const failure = reducerFailure(err);
        if (failure.code === "not_found") await discard(itemId, blobKey);
        throw failure;
      }

      const declared = sqlNumber(row, "size_bytes");
      if (head.size === 0 || head.size > declared) {
        deps.log("warn", "drive.commit.rejected_oversize", { itemId, observed: head.size, declared });
        return deps.json(
          req,
          { error: "The stored file is empty or larger than declared", code: "too_large", outcome: "rejected_oversize", sizeBytes: head.size },
          { status: 413, headers: NO_STORE },
        );
      }
      const committed: DriveCommitResponse = { outcome: "committed", sizeBytes: head.size };
      return deps.json(req, committed, { headers: NO_STORE });
    } catch (err) {
      return errorResponse(deps, req, err);
    }
  };
}
