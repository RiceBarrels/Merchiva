/* eslint-disable @typescript-eslint/no-explicit-any */
// Row mappers: SpacetimeDB `document*` rows → lib/docs/types.
//
// Rows arrive either as generated shapes (after `spacetime generate`) or as
// untyped objects (before it, and inside connection.ts), so this is the one
// place `any` is allowed. Every field is coerced defensively: a malformed or
// older row degrades to safe defaults instead of throwing inside a render.

import { isDocGrantRole, isDocVisibility } from "./access";
import type {
  DocAccessGrant,
  DocComment,
  DocCommentThread,
  DocPageSetup,
  DocPresenceRow,
  DocSnapshotRow,
  DocStar,
  DocUpdateRow,
  DocVersion,
  DocumentMeta,
} from "./types";

/** Byte columns are Uint8Array in SDK 2.2; tolerate a plain number[] too. */
export function toBytes(value: Uint8Array | ArrayLike<number> | null | undefined): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value == null) return new Uint8Array(0);
  return Uint8Array.from(value);
}

/** SpacetimeDB Timestamp (or Date) → Date; missing → null. */
export function toDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return typeof value.toDate === "function" ? value.toDate() : null;
}

/** Uuid → canonical string, Identity/ConnectionId → hex, strings unchanged. */
export function idString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const toHex = (value as { toHexString?: unknown }).toHexString;
  if (typeof toHex === "function") return String(toHex.call(value));
  return String(value);
}

export function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return BigInt(0);
}

function str(value: any): string {
  return value == null ? "" : String(value);
}

function optStr(value: any): string | null {
  return value == null || value === "" ? null : String(value);
}

function optBytes(value: any): Uint8Array | null {
  if (value == null) return null;
  const bytes = toBytes(value);
  return bytes.byteLength > 0 ? bytes : null;
}

function u32(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 0xffffffff) : 0;
}

function dateOrEpoch(value: any): Date {
  return toDate(value) ?? new Date(0);
}

function nonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** `document.pageSetup` JSON → DocPageSetup; anything malformed → null (editor defaults). */
export function parseDocPageSetup(raw: unknown): DocPageSetup | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw) as { size?: unknown; orientation?: unknown; marginsIn?: unknown } | null;
    if (!value || typeof value !== "object") return null;
    const size = value.size === "letter" || value.size === "a4" ? value.size : null;
    const orientation = value.orientation === "portrait" || value.orientation === "landscape" ? value.orientation : null;
    const margins = value.marginsIn as { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown } | null | undefined;
    if (!size || !orientation || !margins || typeof margins !== "object") return null;
    const top = nonNegative(margins.top);
    const right = nonNegative(margins.right);
    const bottom = nonNegative(margins.bottom);
    const left = nonNegative(margins.left);
    if (top === null || right === null || bottom === null || left === null) return null;
    return { size, orientation, marginsIn: { top, right, bottom, left } };
  } catch {
    return null;
  }
}

function parseMentions(raw: any): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((x): x is string => typeof x === "string" && x.length > 0))];
  } catch {
    return [];
  }
}

export function mapDocument(row: any): DocumentMeta {
  return {
    id: str(row.id).toLowerCase(),
    organizationId: str(row.organizationId),
    ownerMemberId: str(row.ownerMemberId),
    title: str(row.title),
    excerpt: str(row.excerpt),
    icon: optStr(row.icon),
    // An unknown visibility gets the most restrictive treatment.
    visibility: isDocVisibility(row.visibility) ? row.visibility : "private",
    templateId: optStr(row.templateId),
    pageSetup: parseDocPageSetup(row.pageSetup),
    wordCount: u32(row.wordCount),
    createdAt: dateOrEpoch(row.createdAt),
    updatedAt: dateOrEpoch(row.updatedAt),
    lastEditorMemberId: optStr(row.lastEditorMemberId),
    trashedAt: toDate(row.trashedAt),
    trashedByMemberId: optStr(row.trashedByMemberId),
  };
}

export function mapUpdateRow(row: any): DocUpdateRow {
  const payload = toBytes(row.payload);
  return {
    id: toBigInt(row.id),
    documentId: str(row.documentId),
    organizationId: str(row.organizationId),
    payload,
    byteLength: u32(row.byteLength) || payload.byteLength,
    sessionId: str(row.sessionId),
    memberId: str(row.memberId),
    createdAt: dateOrEpoch(row.createdAt),
  };
}

export function mapSnapshotRow(row: any): DocSnapshotRow {
  const state = toBytes(row.state);
  return {
    documentId: str(row.documentId),
    organizationId: str(row.organizationId),
    state,
    throughUpdateId: toBigInt(row.throughUpdateId),
    byteLength: u32(row.byteLength) || state.byteLength,
    html: str(row.html),
    plainText: str(row.plainText),
    compactedAt: dateOrEpoch(row.compactedAt),
    compactedByMemberId: str(row.compactedByMemberId),
  };
}

export function mapPresenceRow(row: any): DocPresenceRow {
  return {
    id: idString(row.id),
    documentId: str(row.documentId),
    organizationId: str(row.organizationId),
    connectionId: idString(row.connectionId),
    memberId: str(row.memberId),
    yClientId: u32(row.yClientId),
    name: str(row.name),
    color: str(row.color),
    canEdit: row.canEdit === true,
    awareness: toBytes(row.awareness),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

export function mapComment(row: any): DocComment {
  return {
    id: idString(row.id),
    documentId: str(row.documentId),
    organizationId: str(row.organizationId),
    threadId: str(row.threadId),
    parentId: optStr(row.parentId),
    authorMemberId: str(row.authorMemberId),
    body: str(row.body),
    quotedText: optStr(row.quotedText),
    mentions: parseMentions(row.mentions),
    status: row.status === "resolved" ? "resolved" : "open",
    resolvedAt: toDate(row.resolvedAt),
    resolvedByMemberId: optStr(row.resolvedByMemberId),
    createdAt: dateOrEpoch(row.createdAt),
    editedAt: toDate(row.editedAt),
    anchor: optBytes(row.anchor),
  };
}

export function mapVersion(row: any): DocVersion {
  const state = toBytes(row.state);
  return {
    id: idString(row.id),
    documentId: str(row.documentId),
    kind: row.kind === "named" || row.kind === "restore" ? row.kind : "auto",
    name: optStr(row.name),
    state,
    throughUpdateId: toBigInt(row.throughUpdateId),
    byteLength: u32(row.byteLength) || state.byteLength,
    wordCount: u32(row.wordCount),
    createdAt: dateOrEpoch(row.createdAt),
    createdByMemberId: str(row.createdByMemberId),
  };
}

export function mapStar(row: any): DocStar {
  return {
    id: idString(row.id),
    documentId: str(row.documentId),
    organizationId: str(row.organizationId),
    memberId: str(row.memberId),
    createdAt: dateOrEpoch(row.createdAt),
  };
}

/** Grants with a role the reducers never write are ignored (null). */
export function mapGrant(row: any): DocAccessGrant | null {
  if (!isDocGrantRole(row.role)) return null;
  return {
    id: idString(row.id),
    documentId: str(row.documentId),
    organizationId: str(row.organizationId),
    memberId: str(row.memberId),
    role: row.role,
    grantedByMemberId: str(row.grantedByMemberId),
    createdAt: dateOrEpoch(row.createdAt),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

const byCreatedAt = (a: DocComment, b: DocComment): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Comments → threads (root + replies, oldest first), threads ordered by the
 * root's creation time. Replies whose root is gone are dropped — deleting a
 * root deletes the whole thread on the server.
 */
export function groupDocCommentThreads(comments: readonly DocComment[]): DocCommentThread[] {
  const roots = new Map<string, DocComment>();
  const replies = new Map<string, DocComment[]>();
  for (const comment of comments) {
    if (comment.parentId === null) {
      roots.set(comment.threadId, comment);
    } else {
      const list = replies.get(comment.threadId);
      if (list) list.push(comment);
      else replies.set(comment.threadId, [comment]);
    }
  }
  const threads: DocCommentThread[] = [];
  for (const root of roots.values()) {
    const threadReplies = (replies.get(root.threadId) ?? []).filter((reply) => reply.parentId === root.id);
    threadReplies.sort(byCreatedAt);
    threads.push({ threadId: root.threadId, root, replies: threadReplies });
  }
  threads.sort((a, b) => byCreatedAt(a.root, b.root));
  return threads;
}
