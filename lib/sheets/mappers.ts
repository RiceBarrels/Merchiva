/* eslint-disable @typescript-eslint/no-explicit-any */
// Row mappers: the two sheet tables → lib/sheets types. Rows arrive as generated shapes or as untyped
// objects (inside lib/sheets/sync/connection.ts), so this is the one Sheets file where `any` is allowed.
// Every field is coerced defensively, like lib/docs/mappers.ts: a malformed or older row degrades to safe
// defaults (a free lease, an empty state) instead of throwing inside a render.

import { idString, toBigInt, toBytes, toDate } from "@/lib/docs/mappers";
import type { SheetLeaseRow } from "./lease";
import type { SheetVersionStateRow } from "./types";

function str(value: any): string {
  return value == null ? "" : String(value);
}

function dateOrEpoch(value: any): Date {
  return toDate(value) ?? new Date(0);
}

function u32(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 0xffffffff) : 0;
}

/** `document_edit_lease` → SheetLeaseRow. Ids are lowercased like every document reference. */
export function mapLeaseRow(row: any): SheetLeaseRow {
  return {
    documentId: str(row.documentId).toLowerCase(),
    organizationId: str(row.organizationId),
    epoch: toBigInt(row.epoch),
    holderMemberId: str(row.holderMemberId),
    holderActorMemberId: str(row.holderActorMemberId),
    holderSessionId: str(row.holderSessionId),
    holderConnectionId: idString(row.holderConnectionId),
    holderName: str(row.holderName),
    acquiredAt: dateOrEpoch(row.acquiredAt),
    heartbeatAt: dateOrEpoch(row.heartbeatAt),
    lastEditAt: dateOrEpoch(row.lastEditAt),
    lastSeq: toBigInt(row.lastSeq),
    requestedByMemberId: str(row.requestedByMemberId),
    requestedByActorMemberId: str(row.requestedByActorMemberId),
    requestedBySessionId: str(row.requestedBySessionId),
    requestedByConnectionId: idString(row.requestedByConnectionId),
    requestedByName: str(row.requestedByName),
    requestedAt: dateOrEpoch(row.requestedAt),
  };
}

/** `document_version_state` → SheetVersionStateRow. */
export function mapVersionState(row: any): SheetVersionStateRow {
  const state = toBytes(row.state);
  return {
    versionId: str(row.versionId).toLowerCase(),
    documentId: str(row.documentId).toLowerCase(),
    organizationId: str(row.organizationId),
    state,
    byteLength: u32(row.byteLength) || state.byteLength,
  };
}
