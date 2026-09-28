// Maintenance of the two rule-free RLS join targets that Drive and the Docs
// family read through:
//
//   drive_admin_index      (adminScope, identity) of every active member who
//                          passes the Docs gate and holds the Drive "everyone's
//                          files" power. The drive_item admin rule joins it on
//                          the org's opaque adminScope (private drive_org_state).
//   document_reader_index  (documentId, identity) of every active member whose
//                          docRoleFor is at least viewer. Every Docs-family rule
//                          (RLS_DOC_READER_SCOPED) joins it.
//
// Both are derived data, like org_membership_index: a missed write site means a
// user silently loses (or keeps) access. index.ts calls these through
// syncMemberAccessIndexes / dropMemberAccessIndexes / refreshDocReaders next to
// every write that changes a member's status, role, permissions or identity, or
// a document's visibility, grants or ownership.
//
// Rows are keyed by IDENTITY, not member id: the rules compare `userId =
// :sender`. One identity can hold several org_member rows in one org (a removed
// row next to a re-invited active one), so every decision looks at all of that
// identity's rows in the org, never only the row being written.
//
// Runtime imports: only the pure ./logic. The role and gate functions come from
// index.ts as parameters, so this file never imports the module entry.

import type { DocRole, DriveCtx, IdentityValue } from './types';
import { DRIVE_DOC_ROLE_RANK, driveAccessOf } from './logic';

/** A full org_member row (or a spread of one with the fields being written). */
export interface AccessMemberRow {
  id: { toString(): string };
  organizationId: string;
  userId: IdentityValue;
  status: string;
  role: string;
  permissions: string;
}

/** The document fields docRoleFor reads. */
export interface AccessDocument { id: string; organizationId: string; ownerMemberId: string; visibility: string }

/** index.ts docRoleFor. */
export type RoleFor = (ctx: DriveCtx, doc: AccessDocument, member: AccessMemberRow) => DocRole;
/** index.ts docMemberGate. */
export type GateFor = (member: { role: string; permissions: string }) => boolean;

/** A status no rule counts: how the drop functions express "this row no longer grants anything". */
const DROPPED_STATUS = 'removed';

/**
 * `member` (as given — the caller's post-write view of it) plus every OTHER
 * org_member row of the same identity in the same organization.
 */
function identityMembersInOrg(ctx: DriveCtx, member: AccessMemberRow): AccessMemberRow[] {
  const ownId = member.id.toString();
  const out: AccessMemberRow[] = [member];
  for (const other of ctx.db.orgMember.byUserId.filter(member.userId)) {
    if (other.organizationId === member.organizationId && other.id.toString() !== ownId) out.push(other);
  }
  return out;
}

function canRead(ctx: DriveCtx, doc: AccessDocument, member: AccessMemberRow, roleFor: RoleFor): boolean {
  return member.status === 'active' && DRIVE_DOC_ROLE_RANK[roleFor(ctx, doc, member)] >= DRIVE_DOC_ROLE_RANK.viewer;
}

function readerId(documentId: string, identityHex: string): string {
  return `${documentId}:${identityHex}`;
}

// ─── Drive admin index ───────────────────────────────────────────────────────

/** The org's existing admin scope, or undefined before anyone in it held the power. */
function existingAdminScope(ctx: DriveCtx, organizationId: string): string | undefined {
  return ctx.db.driveOrgState.organizationId.find(organizationId)?.adminScope;
}

/**
 * The org's opaque admin scope: a random uuid created on first use in the
 * private drive_org_state and never changed afterwards (drive_item rows copy it).
 */
export function driveAdminScopeOf(ctx: DriveCtx, organizationId: string): string {
  const existing = existingAdminScope(ctx, organizationId);
  if (existing !== undefined) return existing;
  const adminScope = ctx.newUuidV4().toString();
  ctx.db.driveOrgState.insert({ organizationId, adminScope, createdAt: ctx.timestamp });
  return adminScope;
}

/** The identity's drive_admin_index row exists exactly when one of its active rows in the org passes the gate and holds driveAccessOf().view. */
export function syncDriveAdminIndex(ctx: DriveCtx, member: AccessMemberRow, gate: GateFor): void {
  const want = identityMembersInOrg(ctx, member)
    .some((m) => m.status === 'active' && gate(m) && driveAccessOf(m).view);
  const scope = want ? driveAdminScopeOf(ctx, member.organizationId) : existingAdminScope(ctx, member.organizationId);
  if (scope === undefined) return; // no scope yet → no admin row of this org can exist
  const id = `${scope}:${member.userId.toHexString()}`;
  const row = ctx.db.driveAdminIndex.id.find(id);
  if (want && !row) ctx.db.driveAdminIndex.insert({ id, adminScope: scope, userId: member.userId });
  if (!want && row) ctx.db.driveAdminIndex.delete(row);
}

/** `member` stops counting (it is leaving); another active row of the same identity may still keep the row. */
export function dropDriveAdminIndex(ctx: DriveCtx, member: AccessMemberRow, gate: GateFor): void {
  syncDriveAdminIndex(ctx, { ...member, status: DROPPED_STATUS }, gate);
}

// ─── Document reader index ───────────────────────────────────────────────────

/** Rebuild one document's reader set: every identity with an active member of its org at ≥ viewer. */
export function syncDocumentReaders(ctx: DriveCtx, doc: AccessDocument, roleFor: RoleFor): void {
  const want = new Map<string, IdentityValue>();
  for (const m of ctx.db.orgMember.byOrganizationId.filter(doc.organizationId)) {
    const hex = m.userId.toHexString();
    if (!want.has(hex) && canRead(ctx, doc, m, roleFor)) want.set(hex, m.userId);
  }
  for (const row of [...ctx.db.documentReaderIndex.byDocumentId.filter(doc.id)]) {
    const hex = row.userId.toHexString();
    if (want.has(hex)) want.delete(hex);
    else ctx.db.documentReaderIndex.delete(row);
  }
  for (const [hex, userId] of want) {
    ctx.db.documentReaderIndex.insert({ id: readerId(doc.id, hex), documentId: doc.id, userId });
  }
}

/** The document is being deleted: every reader row goes. */
export function dropDocumentReaders(ctx: DriveCtx, documentId: string): void {
  for (const row of [...ctx.db.documentReaderIndex.byDocumentId.filter(documentId)]) {
    ctx.db.documentReaderIndex.delete(row);
  }
}

/** Rebuild one identity's reader rows over every document of `member`'s org (one pass over the org's documents). */
export function syncMemberDocReaders(ctx: DriveCtx, member: AccessMemberRow, roleFor: RoleFor): void {
  const members = identityMembersInOrg(ctx, member);
  const hex = member.userId.toHexString();
  for (const doc of ctx.db.document.byOrganizationId.filter(member.organizationId)) {
    const want = members.some((m) => canRead(ctx, doc, m, roleFor));
    const id = readerId(doc.id, hex);
    const row = ctx.db.documentReaderIndex.id.find(id);
    if (want && !row) ctx.db.documentReaderIndex.insert({ id, documentId: doc.id, userId: member.userId });
    if (!want && row) ctx.db.documentReaderIndex.delete(row);
  }
}

/** `member` stops counting (it is leaving); another active row of the same identity may still keep reader rows. */
export function dropMemberDocReaders(ctx: DriveCtx, member: AccessMemberRow, roleFor: RoleFor): void {
  syncMemberDocReaders(ctx, { ...member, status: DROPPED_STATUS }, roleFor);
}

// ─── Identity migration ──────────────────────────────────────────────────────

/**
 * loginWithPassword moved a user to a new identity: re-key every identity-keyed
 * Drive / Docs row — drive_admin_index and document_reader_index (their ids
 * embed the identity hex, so delete + insert), drive_item.uploaderIdentity and
 * drive_notice_ack.userId (updates). A row the new identity already has wins.
 */
export function rekeyAccessIdentity(ctx: DriveCtx, oldIdentity: IdentityValue, newIdentity: IdentityValue): void {
  const newHex = newIdentity.toHexString();
  if (oldIdentity.toHexString() === newHex) return;
  for (const row of [...ctx.db.driveAdminIndex.byUserId.filter(oldIdentity)]) {
    ctx.db.driveAdminIndex.delete(row);
    const id = `${row.adminScope}:${newHex}`;
    if (!ctx.db.driveAdminIndex.id.find(id)) {
      ctx.db.driveAdminIndex.insert({ id, adminScope: row.adminScope, userId: newIdentity });
    }
  }
  for (const row of [...ctx.db.documentReaderIndex.byUserId.filter(oldIdentity)]) {
    ctx.db.documentReaderIndex.delete(row);
    const id = readerId(row.documentId, newHex);
    if (!ctx.db.documentReaderIndex.id.find(id)) {
      ctx.db.documentReaderIndex.insert({ id, documentId: row.documentId, userId: newIdentity });
    }
  }
  for (const item of [...ctx.db.driveItem.byUploaderIdentity.filter(oldIdentity)]) {
    ctx.db.driveItem.id.update({ ...item, uploaderIdentity: newIdentity });
  }
  for (const ack of [...ctx.db.driveNoticeAck.byUserId.filter(oldIdentity)]) {
    ctx.db.driveNoticeAck.id.update({ ...ack, userId: newIdentity });
  }
}
