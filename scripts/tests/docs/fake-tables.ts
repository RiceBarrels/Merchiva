// The tables of the docs fake server (./fake-server.ts), mirroring their
// definitions in spacetimedb/src/index.ts and the module files it wires.

import { NOTIFY_FAKE_TABLES, frozenColumns } from "../drive/fake-db";

/** `notificationDelivery` → `notification_delivery`. */
function sqlNameOf(accessor: string): string {
  return accessor.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export interface TableDef {
  readonly accessor: string;
  readonly sqlName: string;
  readonly primaryKey: string;
  readonly autoInc?: boolean;
  /** index accessor → column */
  readonly indexes: Readonly<Record<string, string>>;
  /** When set, the only columns a row may carry (a table frozen for older clients): writing any other throws. */
  readonly columns?: readonly string[];
}

/** Mirrors the table definitions in spacetimedb/src/index.ts. */
export const TABLE_DEFS: readonly TableDef[] = [
  { accessor: "document", sqlName: "document", primaryKey: "id", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "documentUpdate", sqlName: "document_update", primaryKey: "id", autoInc: true, indexes: { byDocumentId: "documentId" } },
  { accessor: "documentSnapshot", sqlName: "document_snapshot", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  {
    accessor: "documentPresence",
    sqlName: "document_presence",
    primaryKey: "id",
    indexes: { byDocumentId: "documentId", byConnectionId: "connectionId" },
  },
  { accessor: "documentComment", sqlName: "document_comment", primaryKey: "id", indexes: { byDocumentId: "documentId", byThreadId: "threadId" } },
  { accessor: "documentVersion", sqlName: "document_version", primaryKey: "id", indexes: { byDocumentId: "documentId" } },
  { accessor: "documentStar", sqlName: "document_star", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "documentAccess", sqlName: "document_access", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "orgMember", sqlName: "org_member", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  {
    accessor: "notification",
    sqlName: "notification",
    primaryKey: "id",
    indexes: { byOrganizationId: "organizationId", byTargetId: "targetId" },
    columns: frozenColumns("notification"),
  },
  // What deliver() reads and writes beside the notification row (spacetimedb/src/notify/deliver.ts).
  { accessor: "organization", sqlName: "organization", primaryKey: "id", indexes: { byOrgIdText: "orgIdText" } },
  { accessor: "pushSubscription", sqlName: "push_subscription", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byTargetId: "targetId" } },
  ...NOTIFY_FAKE_TABLES.map((def) => ({ ...def, sqlName: sqlNameOf(def.accessor) })),
  // spacetimedb/src/drive/tables.ts: docs reducers keep the reader index current; sheets touch the other two.
  { accessor: "documentReaderIndex", sqlName: "document_reader_index", primaryKey: "id", indexes: { byDocumentId: "documentId", byUserId: "userId" } },
  {
    accessor: "documentEditLease",
    sqlName: "document_edit_lease",
    primaryKey: "documentId",
    indexes: { byOrganizationId: "organizationId", byHolderConnectionId: "holderConnectionId", byRequestedByConnectionId: "requestedByConnectionId" },
  },
  {
    accessor: "documentVersionState",
    sqlName: "document_version_state",
    primaryKey: "versionId",
    indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" },
  },
  // A document's Drive type and folder (drive/document-file.ts): restoreDocument and setDocumentVisibility read it.
  { accessor: "documentFile", sqlName: "document_file", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  // Storage accounting (drive/storage.ts): new documents check the org's quota and keep a document_size row.
  { accessor: "driveUsage", sqlName: "drive_usage", primaryKey: "organizationId", indexes: { byScope: "scope" } },
  { accessor: "orgStorageUsage", sqlName: "org_storage_usage", primaryKey: "organizationId", indexes: {} },
  { accessor: "documentSize", sqlName: "document_size", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  // Allowed, not yet recorded app uploads count toward the same quota (orgStorageTotal).
  { accessor: "appUploadHold", sqlName: "app_upload_hold", primaryKey: "id", autoInc: true, indexes: { byOrganizationId: "organizationId" } },
];
