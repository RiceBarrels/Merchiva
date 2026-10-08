// The SpacetimeDB reducers the Drive API routes and crons call over HTTP — the
// ONLY file that names them. Pure: no env, no fetch.
//
// `/v1/database/<db>/call/<name>` accepts only the snake_case name (a camelCase
// name answers 404 "No such procedure"), and its JSON body is a positional
// array in the reducer's declaration order. Both come from here;
// scripts/tests/drive/stdb-calls.test.ts checks every entry against the
// generated bindings (lib/spacetimedb/generated/<name>_reducer.ts).
//
// "user" calls run with the caller's WorkOS token (it is also their
// SpacetimeDB token), so the reducer's ctx.sender is the caller. "service"
// calls run with SPACETIMEDB_SERVICE_TOKEN; those reducers refuse anyone else.

export interface DriveStdbCallSpec {
  readonly name: string;
  readonly as: "user" | "service";
  readonly params: readonly string[];
}

export const DRIVE_STDB_CALLS = {
  authorizeUpload: { name: "authorize_drive_upload", as: "user", params: ["itemId", "variant", "pathname", "sizeBytes", "mimeType", "multipart"] },
  commitUpload: { name: "service_commit_drive_upload", as: "service", params: ["itemId", "blobKey", "observedBytes", "etag"] },
  failUpload: { name: "service_fail_drive_upload", as: "service", params: ["itemId", "blobKey", "reason"] },
  setThumb: { name: "service_set_drive_thumb", as: "service", params: ["itemId", "thumbKey", "observedBytes"] },
  discardBlob: { name: "service_discard_drive_blob", as: "service", params: ["itemId", "blobKey"] },
  ensureReader: { name: "service_ensure_drive_reader", as: "service", params: [] },
  sweep: { name: "service_drive_sweep", as: "service", params: ["maxItems"] },
  ackGc: { name: "service_ack_drive_blob_gc", as: "service", params: ["blobKeysJson"] },
  failGc: { name: "service_fail_drive_blob_gc", as: "service", params: ["blobKeysJson", "error"] },
  enqueueOrphans: { name: "service_enqueue_orphan_drive_blobs", as: "service", params: ["organizationId", "blobsJson"] },
  finishReconcile: { name: "service_finish_drive_reconcile", as: "service", params: ["organizationId", "measuredBytes", "measuredCount"] },
  // App files (UploadThing): the route's membership + quota check, then the recorded size; backfill and recompute.
  beginAppUpload: { name: "begin_app_upload", as: "user", params: ["organizationId", "source", "totalBytes", "fileCount"] },
  recordAppFile: { name: "service_record_app_file", as: "service", params: ["organizationId", "keyHash", "source", "sizeBytes", "mimeType"] },
  backfillAppFiles: { name: "service_backfill_app_files", as: "service", params: ["entries"] },
  recomputeStorage: { name: "service_recompute_storage", as: "service", params: ["organizationId"] },
} as const satisfies Record<string, DriveStdbCallSpec>;

export type DriveStdbCallKey = keyof typeof DRIVE_STDB_CALLS;

/**
 * Named arguments per call; `driveCallArgs` orders them. u64 / u32 values are JSON numbers: every value stays far
 * below 2^53 (sizes ≤ DRIVE_MAX_FILE_BYTES, counts ≤ DRIVE_MAX_ITEMS_PER_ORG).
 */
export interface DriveStdbArgs {
  authorizeUpload: {
    itemId: string; variant: "original" | "thumb"; pathname: string; sizeBytes: number; mimeType: string; multipart: boolean;
  };
  commitUpload: { itemId: string; blobKey: string; observedBytes: number; etag: string };
  /** Any other reason is recorded as 'rejected' by the module. */
  failUpload: { itemId: string; blobKey: string; reason: "upload_expired" | "rejected" };
  setThumb: { itemId: string; thumbKey: string; observedBytes: number };
  discardBlob: { itemId: string; blobKey: string };
  ensureReader: Record<never, never>;
  sweep: { maxItems: number };
  /** JSON `string[]`, at most 1000 keys. */
  ackGc: { blobKeysJson: string };
  failGc: { blobKeysJson: string; error: string };
  /** JSON `[{ k: key, s: size, u: uploadedAt ms }]`, at most 1000 entries. */
  enqueueOrphans: { organizationId: string; blobsJson: string };
  finishReconcile: { organizationId: string; measuredBytes: number; measuredCount: number };
  /** totalBytes: the sum of the files' declared sizes; fileCount 1..APP_UPLOAD_MAX_FILES (lib/storage/sources.ts). */
  beginAppUpload: { organizationId: string; source: string; totalBytes: number; fileCount: number };
  /** keyHash: appFileKeyHash (lib/storage/uploadthing-key.ts) of the UploadThing key, never the key itself. */
  recordAppFile: { organizationId: string; keyHash: string; source: string; sizeBytes: number; mimeType: string };
  /** JSON `[{ key, keyHash, sizeBytes, mimeType }]`, at most 2000 entries (APP_BACKFILL_MAX). */
  backfillAppFiles: { entries: string };
  /** '' recomputes every org. */
  recomputeStorage: { organizationId: string };
}

/** The positional JSON array for `/call/<name>`, in `DRIVE_STDB_CALLS[key].params` order. */
export function driveCallArgs<K extends DriveStdbCallKey>(key: K, args: DriveStdbArgs[K]): unknown[] {
  const named = args as Readonly<Record<string, unknown>>;
  return DRIVE_STDB_CALLS[key].params.map((param: string) => {
    if (!Object.prototype.hasOwnProperty.call(named, param)) {
      throw new Error(`Drive call ${key} is missing its "${param}" argument`);
    }
    return named[param];
  });
}
