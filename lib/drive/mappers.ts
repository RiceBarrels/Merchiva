/* eslint-disable @typescript-eslint/no-explicit-any */
// Row mappers: SpacetimeDB Drive rows → lib/drive/types.
//
// Rows arrive as generated shapes (after `spacetime generate`) or as untyped
// objects (before it), so this is the one Drive file where `any` is allowed.
// Every field is coerced defensively, like lib/docs/mappers.ts: a malformed or
// newer row degrades to the most restrictive reading instead of throwing inside
// a render.

import { idString, toDate } from "@/lib/docs/mappers";
import { isAppFileSource } from "@/lib/storage/sources";
import { effectiveQuotaBytes } from "./rules";
import type {
  AppFileRecord,
  DocumentSize,
  DriveItem,
  DriveNoticeAck,
  DriveStar,
  DriveSurface,
  DriveUsage,
  DriveUsageView,
  OrgStorageUsage,
  StorageBreakdown,
} from "./types";

function str(value: any): string {
  return value == null ? "" : String(value);
}

/** Lowercased id-like string ('' when missing). */
function lowerId(value: any): string {
  return idString(value).toLowerCase();
}

/** u64 / u32 column → a non-negative safe integer; anything else → 0. */
function count(value: any): number {
  const n = typeof value === "bigint" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), Number.MAX_SAFE_INTEGER) : 0;
}

function dateOrEpoch(value: any): Date {
  return toDate(value) ?? new Date(0);
}

/** Unknown space → "my" (its owner only, the most restrictive); unknown status → "pending"; unknown kind → "file" (no children). */
export function mapDriveItem(row: any): DriveItem {
  return {
    id: lowerId(row.id),
    organizationId: str(row.organizationId),
    space: row.space === "store" ? "store" : "my",
    parentId: lowerId(row.parentId),
    kind: row.kind === "folder" ? "folder" : "file",
    name: str(row.name),
    mimeType: str(row.mimeType),
    sizeBytes: count(row.sizeBytes),
    blobKey: str(row.blobKey),
    thumbKey: str(row.thumbKey),
    thumbBytes: count(row.thumbBytes),
    etag: str(row.etag),
    ownerMemberId: str(row.ownerMemberId),
    createdByMemberId: str(row.createdByMemberId),
    uploaderIdentityHex: lowerId(row.uploaderIdentity),
    status: row.status === "ready" ? "ready" : "pending",
    uploadExpiresAt: dateOrEpoch(row.uploadExpiresAt),
    uploadAttempts: count(row.uploadAttempts),
    trashed: row.trashed === true,
    trashRootId: lowerId(row.trashRootId),
    trashedAt: toDate(row.trashedAt),
    trashedByMemberId: str(row.trashedByMemberId),
    createdAt: dateOrEpoch(row.createdAt),
    updatedAt: dateOrEpoch(row.updatedAt),
    lastEditorMemberId: str(row.lastEditorMemberId),
  };
}

export function mapDriveUsage(row: any): DriveUsage {
  return {
    organizationId: str(row.organizationId),
    bytesUsed: count(row.bytesUsed),
    bytesReserved: count(row.bytesReserved),
    fileCount: count(row.fileCount),
    itemCount: count(row.itemCount),
    quotaBytesOverride: count(row.quotaBytesOverride),
    sheetBytes: count(row.sheetBytes),
    measuredBytes: count(row.measuredBytes),
    measuredCount: count(row.measuredCount),
    measuredAt: dateOrEpoch(row.measuredAt),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

export function mapOrgStorageUsage(row: any): OrgStorageUsage {
  return {
    organizationId: str(row.organizationId),
    docBytes: count(row.docBytes),
    docCount: count(row.docCount),
    appBytes: count(row.appBytes),
    appFileCount: count(row.appFileCount),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

/** Unknown source → "other" (the store still pays for the bytes). */
export function mapAppFile(row: any): AppFileRecord {
  return {
    keyHash: str(row.keyHash).toLowerCase(),
    organizationId: str(row.organizationId),
    source: isAppFileSource(row.source) ? row.source : "other",
    sizeBytes: count(row.sizeBytes),
    mimeType: str(row.mimeType),
    createdAt: dateOrEpoch(row.createdAt),
  };
}

export function mapDocumentSize(row: any): DocumentSize {
  return {
    documentId: lowerId(row.documentId),
    organizationId: str(row.organizationId),
    fileType: str(row.fileType),
    bytes: count(row.bytes),
    versionBytes: count(row.versionBytes),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

/**
 * Everything the store keeps against its quota, as the module adds it up: Drive files (stored + reserved), Docs,
 * Slides and Forms, Sheets, app files. A missing row counts 0 (a store with no uploads), except that documents and
 * apps are unknown (null) when `measured` is false: a module without org_storage_usage.
 */
export function storageBreakdown(u: DriveUsage | null, org: OrgStorageUsage | null, measured = true): StorageBreakdown {
  const files = (u?.bytesUsed ?? 0) + (u?.bytesReserved ?? 0);
  const documents = measured ? (org?.docBytes ?? 0) : null;
  const sheets = u?.sheetBytes ?? 0;
  const apps = measured ? (org?.appBytes ?? 0) : null;
  const total = files + (documents ?? 0) + sheets + (apps ?? 0);
  return { files, documents, sheets, apps, total, quota: effectiveQuotaBytes(u) };
}

/**
 * The storage meter's figures; null before either usage row exists (displayUsage then shows zero of the default).
 * The quota is never 0 (effectiveQuotaBytes).
 */
export function toDriveUsageView(u: DriveUsage | null, org: OrgStorageUsage | null = null, measured = true): DriveUsageView | null {
  if (!u && !org) return null;
  return {
    usedBytes: u?.bytesUsed ?? 0,
    reservedBytes: u?.bytesReserved ?? 0,
    quotaBytes: effectiveQuotaBytes(u),
    fileCount: u?.fileCount ?? 0,
    sheetBytes: u?.sheetBytes ?? 0,
    breakdown: storageBreakdown(u, org, measured),
  };
}

export function mapDriveStar(row: any): DriveStar {
  return {
    id: str(row.id),
    itemId: lowerId(row.itemId),
    organizationId: str(row.organizationId),
    memberId: str(row.memberId),
    createdAt: dateOrEpoch(row.createdAt),
  };
}

function isDriveSurface(value: unknown): value is DriveSurface {
  return value === "manager" || value === "store" || value === "personal";
}

/**
 * Acknowledgements on a surface the module never writes are ignored (null), like lib/docs/mappers.ts mapGrant:
 * counting one as any real surface would skip a notice that was never shown there.
 */
export function mapDriveNoticeAck(row: any): DriveNoticeAck | null {
  if (!isDriveSurface(row.surface)) return null;
  return {
    id: str(row.id),
    organizationId: str(row.organizationId),
    memberId: str(row.memberId),
    notice: str(row.notice),
    surface: row.surface,
    acknowledgedAt: dateOrEpoch(row.acknowledgedAt),
  };
}
