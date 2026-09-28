// Drive (files, folders, uploads, storage accounting), the Docs-family reader
// index and the Sheets edit lease / version bytes.
//
// Definitions only: registered in schema({...}) and given RLS rules in
// ../index.ts. Every column a subscription WHERE, a join or an RLS rule touches
// is a plain, non-option type (see "DIALECT LIMITS" in ../index.ts). File bytes
// are never stored here — they live in the private Vercel Blob store under
// `blobKey`.
//
// scripts/check-rls-coverage.ts parses these definitions, so their layout does
// not matter to it; scripts/tests/drive/rls-shape.test.ts reads this file's text
// and expects `name: '<t>',` then `public: …` on the next line, and every column
// at four spaces of indent. These tables are new, so their column order is free
// until the first publish; after it, new columns go at the END.

import { t, table } from 'spacetimedb/server';

/** Folders and uploaded files. Docs, Sheets and Slides are `document` rows, not items. */
export const driveItemTable = table(
  {
    name: 'drive_item',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byOwnerMemberId', algorithm: 'btree', columns: ['ownerMemberId'] },
      { accessor: 'byAdminScope', algorithm: 'btree', columns: ['adminScope'] },
      { accessor: 'byParentId', algorithm: 'btree', columns: ['parentId'] },
      { accessor: 'byStatus', algorithm: 'btree', columns: ['status'] },
      { accessor: 'byTrashed', algorithm: 'btree', columns: ['trashed'] },
      { accessor: 'byTrashRootId', algorithm: 'btree', columns: ['trashRootId'] },
      { accessor: 'byUploaderIdentity', algorithm: 'btree', columns: ['uploaderIdentity'] },
      // The retention sweep range-scans (0, cutoff): it reads expired trash roots only, oldest first.
      { accessor: 'byTrashRootAt', algorithm: 'btree', columns: ['trashRootAt'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // client-generated lowercase UUID v4 (reducers can't return ids)
    organizationId: t.string(),
    adminScope: t.string(),             // the org's opaque admin scope (drive_org_state) — join key of the admin rule
    space: t.string(),                  // 'my' | 'store'
    parentId: t.string(),               // '' = root of the space; else a folder of the same org + space (+ owner in 'my')
    kind: t.string(),                   // 'folder' | 'file'
    name: t.string(),                   // display name (cleanDriveName: NFC, ≤ 255); may be non-ASCII
    mimeType: t.string(),               // normalizeDriveMime(); '' for folders
    sizeBytes: t.u64(),                 // declared while pending; observed (HEAD) once ready; 0 for folders
    blobKey: t.string(),                // 'org/<org>/<item>/<blobId>/<asciiLeaf>'; '' for folders
    thumbKey: t.string(),               // '' until serviceSetDriveThumb attaches '…/<blobId>/_thumb'
    thumbBytes: t.u64(),                // counted in drive_usage.bytesUsed
    etag: t.string(),                   // '' while pending
    ownerMemberId: t.string(),          // 'my': the space owner (always); 'store': who added it
    createdByMemberId: t.string(),      // effective actor that created it (the PIN operator on /store)
    uploaderIdentity: t.identity(),     // ctx.sender of the create/begin; binds authorizeDriveUpload + the pending self rule
    status: t.string(),                 // 'pending' (upload in flight) | 'ready' (folders are created 'ready')
    uploadExpiresAt: t.timestamp(),     // pending deadline, extended by every authorize; = createdAt for folders
    uploadAttempts: t.u32(),            // presign authorizations so far
    trashed: t.bool(),
    trashRootId: t.string(),            // id of the item the user trashed ('' when not trashed)
    trashedAt: t.option(t.timestamp()), // informational only (never filtered)
    trashedByMemberId: t.string(),      // '' when not trashed
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    lastEditorMemberId: t.string(),
    trashRootAt: t.u64().default(0n),   // µs of trashedAt on a trash root (trashRootId = id); 0 on every other row
  }
);

/**
 * Per-org Drive state that must never reach a client. PRIVATE: no rule needed.
 * `adminScope` is a random UUID created on first use and NEVER changed —
 * drive_item rows copy it, and the admin rule joins on it, so the public
 * drive_admin_index needs neither an organization id nor a member id.
 */
export const driveOrgStateTable = table(
  {
    name: 'drive_org_state',
    public: false,
  },
  {
    organizationId: t.string().primaryKey(),
    adminScope: t.string(),
    createdAt: t.timestamp(),
  }
);

/**
 * (adminScope, identity) of every member holding the Drive "everyone's files"
 * power — owners, managers, `drive.view` / `drive.edit` — who passes the Docs
 * gate. Join target of the drive_item admin rule, maintained next to every
 * org_member write. It must NEVER carry a rule of its own: a rule on a join
 * target makes every table that joins it unsubscribable. Holds no organization
 * id, member id or edit flag.
 */
export const driveAdminIndexTable = table(
  {
    name: 'drive_admin_index',
    public: true,
    indexes: [
      { accessor: 'byAdminScope', algorithm: 'btree', columns: ['adminScope'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${adminScope}:${identityHex}`
    adminScope: t.string(),
    userId: t.identity(),
  }
);

/**
 * One row per (document, identity that may open it) — the join target of every
 * Docs-family rule (document, document_update, …). Maintained from docRoleFor,
 * the same function every docs reducer authorizes with. Rule-free, like
 * org_membership_index, for the same reason.
 */
export const documentReaderIndexTable = table(
  {
    name: 'document_reader_index',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${documentId}:${identityHex}`
    documentId: t.string(),
    userId: t.identity(),
  }
);

/**
 * One row per org: storage accounting for the Blob store. Written only by
 * reducers. bytesReserved holds the declared sizes of pending uploads, so
 * parallel uploads cannot overshoot the quota. The quota is
 * quotaBytesOverride when set, else the flat default (DRIVE_DEFAULT_QUOTA_BYTES).
 */
export const driveUsageTable = table(
  {
    name: 'drive_usage',
    public: true,
    indexes: [
      { accessor: 'byScope', algorithm: 'btree', columns: ['scope'] },
    ],
  },
  {
    organizationId: t.string().primaryKey(),
    scope: t.string(),                  // always DRIVE_SERVICE_SCOPE ('service') — join key of the service rule
    bytesUsed: t.u64(),                 // Σ sizeBytes + thumbBytes of ready files (trashed included) + attached thumbs of pending rows
    bytesReserved: t.u64(),             // Σ declared sizeBytes of pending uploads
    fileCount: t.u32(),                 // ready files
    itemCount: t.u32(),                 // every drive_item row (folders + files, any status)
    quotaBytesOverride: t.u64(),        // 0 = none (support, serviceSetDriveQuota)
    sheetBytes: t.u64(),                // Σ sheet snapshot + log + version-state bytes; NOT part of bytesUsed
    measuredBytes: t.u64(),             // last blob listing (reconcile cron), for drift monitoring
    measuredCount: t.u32(),
    measuredAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

/** Per-member stars on drive items (documents keep using document_star). */
export const driveStarTable = table(
  {
    name: 'drive_star',
    public: true,
    indexes: [
      { accessor: 'byItemId', algorithm: 'btree', columns: ['itemId'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${itemId}:${memberId}`
    itemId: t.string(),
    organizationId: t.string(),
    memberId: t.string(),
    createdAt: t.timestamp(),
  }
);

/**
 * Proof that a member acknowledged "your management can see everything you
 * store". One row per (member, notice, surface): an acknowledgement on the
 * shared store tablet does not count for the member's own phone.
 */
export const driveNoticeAckTable = table(
  {
    name: 'drive_notice_ack',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${memberId}:${notice}:${surface}`
    organizationId: t.string(),
    memberId: t.string(),               // who acknowledged (the PIN operator on /store)
    userId: t.identity(),               // identity that recorded it (the tablet account on /store)
    notice: t.string(),                 // DRIVE_NOTICE_ID ('drive_management_v1')
    surface: t.string(),                // 'manager' | 'store' | 'personal'
    acknowledgedAt: t.timestamp(),
  }
);

/**
 * Identities allowed to read drive_blob_gc and drive_usage across orgs (the
 * cron / admin console service identity). Join target of the service rules;
 * carries NO rule (same reason as drive_admin_index). Written only by service
 * reducers, for ctx.sender.
 */
export const driveServiceReaderTable = table(
  {
    name: 'drive_service_reader',
    public: true,
    indexes: [
      { accessor: 'byScope', algorithm: 'btree', columns: ['scope'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    identityHex: t.string().primaryKey(),
    scope: t.string(),                  // always DRIVE_SERVICE_SCOPE ('service')
    userId: t.identity(),
    registeredAt: t.timestamp(),
  }
);

/**
 * Blob work the module cannot do itself (it holds no Blob credentials).
 * Reducers enqueue; /api/cron/drive-gc drains. One row per key: a later
 * 'delete' upgrades an earlier 'verify'; 'verify' never downgrades a 'delete'.
 */
export const driveBlobGcTable = table(
  {
    name: 'drive_blob_gc',
    public: true,
    indexes: [
      { accessor: 'byScope', algorithm: 'btree', columns: ['scope'] },
      { accessor: 'byItemId', algorithm: 'btree', columns: ['itemId'] },
      { accessor: 'byAction', algorithm: 'btree', columns: ['action'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    blobKey: t.string().primaryKey(),
    scope: t.string(),                  // DRIVE_SERVICE_SCOPE — RLS join key
    organizationId: t.string(),
    itemId: t.string(),
    action: t.string(),                 // 'delete' | 'verify' | 'dead'
    reason: t.string(),                 // 'purged' | 'trash_expired' | 'upload_expired' | 'cancelled' | 'rejected' | 'orphan' | 'discarded'
    declaredBytes: t.u64(),             // verify: the pending row's declared size
    holdUntil: t.timestamp(),           // 'delete': keep re-deleting (never ack) until now > holdUntil — a PUT may still land
    attempts: t.u32(),
    lastError: t.string(),              // ≤ 500 chars
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

/**
 * Single-writer edit lease of a spreadsheet (document_file.fileType = 'sheet'), one row per
 * sheet that was ever opened for editing. Only the holding session may push, compact,
 * reset or auto-version. `epoch` goes up on every grant and every write carries it
 * (fencing); `lastSeq` makes pushes idempotent per holder session. Releasing clears
 * the holder and keeps the row, so `epoch` stays monotonic; purgeDocumentRows deletes it.
 * Timing rules: ./sheet-logic.ts (mirrored by lib/sheets/lease.ts, parity-tested).
 */
export const documentEditLeaseTable = table(
  {
    name: 'document_edit_lease',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      // onDisconnect detaches leases held on, and withdraws requests made from, the closing connection.
      { accessor: 'byHolderConnectionId', algorithm: 'btree', columns: ['holderConnectionId'] },
      { accessor: 'byRequestedByConnectionId', algorithm: 'btree', columns: ['requestedByConnectionId'] },
    ],
  },
  {
    documentId: t.string().primaryKey(),        // lowercase document id
    organizationId: t.string(),
    epoch: t.u64(),                             // +1 on every grant
    holderMemberId: t.string(),                 // caller's org_member id (the tablet account on /store); '' = free
    holderActorMemberId: t.string(),            // validated actor (PIN operator on /store; else = holderMemberId)
    holderSessionId: t.string(),                // client SheetSyncSession id
    holderConnectionId: t.string(),             // '' = the holder's socket closed (detached)
    holderName: t.string(),                     // SERVER-derived: actor org_member.displayName
    acquiredAt: t.timestamp(),
    heartbeatAt: t.timestamp(),                 // heartbeat / push / compact / reset; = release time when free
    lastEditAt: t.timestamp(),                  // push / reset
    lastSeq: t.u64(),                           // highest committed write seq of the holder session; 0 after a grant
    requestedByMemberId: t.string(),            // '' = no request
    requestedByActorMemberId: t.string(),
    requestedBySessionId: t.string(),
    requestedByConnectionId: t.string(),        // cleared when that socket closes → request no longer live
    requestedByName: t.string(),                // SERVER-derived
    requestedAt: t.timestamp(),                 // first ask (the 30 s grace counts from here)
    // The sheet's update log as the holder session sees it, so pushSheetOps never walks the log. Only the
    // holder writes the log, so every grant recomputes these and push / compact / reset keep them.
    logBytes: t.u64().default(0n),              // Σ document_update.byteLength (SHEET_LOG_MAX_BYTES)
    logRows: t.u32().default(0),                // document_update rows (SHEET_LOG_MAX_ROWS)
    logOtherMaxId: t.u64().default(0n),         // highest update id written by ANOTHER session, as of the grant ([sheet.stale])
  }
);

/**
 * Bytes of one sheet version. document_version keeps the metadata row with an EMPTY
 * `state` for sheets, so the history list (subscribed as full rows) stays light; the
 * panel subscribes one of these rows at a time (by versionId).
 */
export const documentVersionStateTable = table(
  {
    name: 'document_version_state',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    versionId: t.string().primaryKey(),         // document_version.id (uuid) as a lowercase string
    documentId: t.string(),
    organizationId: t.string(),
    state: t.byteArray(),                       // encodeSheetSnapshot (gzip)
    byteLength: t.u32(),
  }
);

/**
 * The Drive type and folder of a document (./document-file.ts reads and writes
 * it). A side table, never `document` columns: old clients decode `document`
 * rows positionally, so its columns are frozen. No row = a text document at the
 * root of its space. It has exactly `document`'s rules (reader-scoped, plus the
 * org rule until phase B), so a client receives a document and its row together.
 */
export const documentFileTable = table(
  {
    name: 'document_file',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    documentId: t.string().primaryKey(),        // document.id (lowercase uuid) — the reader rule's join column
    organizationId: t.string(),
    fileType: t.string(),                       // 'doc' | 'sheet' | 'slides'
    folderId: t.string(),                       // drive_item folder id; '' = root of the document's space
    updatedAt: t.timestamp(),
  }
);
