// Merchiva Drive — client-side domain types.
//
// Mirrors the Drive tables (spacetimedb/src/drive/tables.ts) after row mapping
// (lib/drive/mappers.ts): ids and identities are strings, timestamps are Dates,
// u64 byte counts are numbers. Docs, Sheets and Slides stay `document` rows
// (lib/docs/types.ts DocumentMeta, with fileType and folderId from their
// `document_file` row); only folders and uploaded files are Drive items.
//
// Limits, blob keys and names live in lib/drive/rules.ts (the client twin of the
// module's drive/logic.ts), roles in lib/drive/access.ts.

import type { AppFileSource } from "@/lib/storage/sources";

export type DriveSpace = "my" | "store";
export type DriveItemKind = "folder" | "file";
export type DriveItemStatus = "pending" | "ready";
/** viewer: view, download, star · contributor: + add children · editor: + rename, same-space moves · manager: + trash, restore, delete forever, cross-space moves. */
export type DriveItemRole = "none" | "viewer" | "contributor" | "editor" | "manager";
export type DriveSurface = "manager" | "store" | "personal";

/** The Drive "everyone's files" power: view all My files, and with edit also change them (never trash or move them out). */
export interface DriveAdminAccess { view: boolean; edit: boolean }

/** One `drive_item` row: a folder or an uploaded file. The module's `adminScope` is never needed here and is not mapped. */
export interface DriveItem {
  id: string;
  organizationId: string;
  space: DriveSpace;
  /** '' = the root of the space. */
  parentId: string;
  kind: DriveItemKind;
  name: string;
  /** '' for folders. */
  mimeType: string;
  /** Declared while pending, observed once ready; 0 for folders. */
  sizeBytes: number;
  /** '' for folders. */
  blobKey: string;
  /** '' until a thumbnail is attached. */
  thumbKey: string;
  thumbBytes: number;
  etag: string;
  /** `my`: the space owner (always); `store`: who added it. */
  ownerMemberId: string;
  /** The effective actor (the PIN operator on /store). */
  createdByMemberId: string;
  /** Identity (hex) that began the upload; only it sees its own pending rows. */
  uploaderIdentityHex: string;
  status: DriveItemStatus;
  uploadExpiresAt: Date;
  uploadAttempts: number;
  trashed: boolean;
  /** The item the user trashed ('' when not trashed); equal to `id` for a trash root. */
  trashRootId: string;
  trashedAt: Date | null;
  /** '' when not trashed. */
  trashedByMemberId: string;
  createdAt: Date;
  updatedAt: Date;
  lastEditorMemberId: string;
}

export interface DriveItemAccess { role: DriveItemRole; canView: boolean; canAddChildren: boolean; canEdit: boolean; canManage: boolean }

/** The org's `drive_usage` row. */
export interface DriveUsage {
  organizationId: string;
  /** Ready files (trashed included) plus attached thumbnails. */
  bytesUsed: number;
  /** Declared sizes of uploads still pending. */
  bytesReserved: number;
  fileCount: number;
  itemCount: number;
  /** 0 = none: the org has DRIVE_DEFAULT_QUOTA_BYTES. */
  quotaBytesOverride: number;
  /** Spreadsheet storage; counts toward the quota with everything else (StorageBreakdown). */
  sheetBytes: number;
  measuredBytes: number;
  measuredCount: number;
  measuredAt: Date;
  updatedAt: Date;
}

/** The org's `org_storage_usage` row: what Docs, Slides and the other apps store (Drive files and Sheets are in `drive_usage`). */
export interface OrgStorageUsage {
  organizationId: string;
  /** Docs and Slides content plus their kept versions. */
  docBytes: number;
  docCount: number;
  /** Files uploaded from the other apps (chat, tasks, images in documents, …): the `app_file` rows. */
  appBytes: number;
  appFileCount: number;
  updatedAt: Date;
}

/** One `app_file` row: a file an app uploaded, keyed by the SHA-256 hex of its UploadThing key (lib/storage). */
export interface AppFileRecord {
  keyHash: string;
  organizationId: string;
  /** An APP_FILE_SOURCES value; unknown sources map to "other". */
  source: AppFileSource;
  sizeBytes: number;
  mimeType: string;
  createdAt: Date;
}

/** One `document_size` row (RLS: only documents the reader may open). */
export interface DocumentSize {
  documentId: string;
  organizationId: string;
  fileType: string;
  /** The document's current content plus its kept versions (the module writes `live + versionBytes`). */
  bytes: number;
  /** Its kept versions, a part of `bytes`. */
  versionBytes: number;
  updatedAt: Date;
}

/** Everything the store keeps, by kind; `total` is what counts against `quota`, as in the module. */
export interface StorageBreakdown {
  /** Drive files: stored plus reserved by pending uploads. */
  files: number;
  /** Docs, Slides and Forms (org_storage_usage.docBytes); null when not measured (a module without the table). */
  documents: number | null;
  sheets: number;
  /** Files stored by the other apps; null when not measured. */
  apps: number | null;
  /** The measured parts only. */
  total: number;
  quota: number;
}

/** What the storage meter shows. `usedBytes` / `reservedBytes` are Drive files only; `breakdown.total` is everything. */
export interface DriveUsageView {
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
  fileCount: number;
  sheetBytes: number;
  breakdown: StorageBreakdown;
}

export interface DriveStar { id: string; itemId: string; organizationId: string; memberId: string; createdAt: Date }

/** "Your management can see everything you store", acknowledged once per member, notice and surface. */
export interface DriveNoticeAck {
  id: string;
  organizationId: string;
  /** Who acknowledged (the operator on /store). */
  memberId: string;
  notice: string;
  surface: DriveSurface;
  acknowledgedAt: Date;
}

/** Where a new Doc, Sheet or Slides file goes, and who creates it (`actingMemberId`: the operator on /store, '' elsewhere). */
export interface DriveDocTarget {
  organizationId: string;
  space: DriveSpace;
  /** '' = the root of the space. */
  folderId: string;
  /** Whose My files a root target is ('' or absent = the actor's own). */
  ownerMemberId?: string;
  actingMemberId: string;
  title?: string;
}

/** The management notice every member acknowledges before storing files. MUST equal the module's DRIVE_NOTICE_ID. */
export const DRIVE_NOTICE_ID = "drive_management_v1";
