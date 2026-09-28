// Drive reducers for folders, names, moves, stars and the management notice
// (DS §6.3). index.ts wires them: `export const { … } = defineDriveReducers(spacetimedb, driveDeps)`.
//
// Every row a reducer touches is bound to the actor's organization — the
// reducer's argument, or the row's own org when it takes none — and anything
// else is `[drive.not_found]`, so an id from another store reveals nothing.
// Multi-row writes validate everything first, then write.

import type { DocRole, DocumentRow, DriveCtx, DriveItemRow, DriveSchema } from './types';
import { driveAdminScopeOf, syncDriveAdminIndex, syncMemberDocReaders } from './access-index';
import { docFolderIdOf, setDocumentFile } from './document-file';
import {
  activeDriveMember, addDriveUsage, adminOf, assertDriveDocRole, assertDriveItemRole, callerDriveMember, driveError,
  driveNewRowOwner, driveParentLookup, driveSpaceOfDoc, driveSubtree, isDocManager, operatorSessionFresh,
  parseDriveEntryIds, resolveContainer, resolveDriveActor, type DriveActor, type DriveDeps,
} from './context';
import {
  DRIVE_MAX_DEPTH, DRIVE_MAX_ITEMS_PER_ORG, DRIVE_MAX_SUBTREE, DRIVE_NOTICE_IDS, DRIVE_SURFACES, cleanDriveName,
  depthOf, isAncestorOrSelf, isBlockedDriveFile, spaceMoveAllowed,
} from './logic';

/** Where moveDriveEntries / setDocumentFolder put things (resolveContainer's inputs). */
interface DriveMoveTarget { space: string; parentId: string; ownerMemberId: string }

/** Visibility of a document that changes space: → My files is private; → Store keeps org_view / org_edit, and private becomes org_edit. */
function visibilityInSpace(space: string, current: string): string {
  if (space === 'my') return 'private';
  return current === 'private' ? 'org_edit' : current;
}

/**
 * The body of moveDriveEntries and setDocumentFolder (DS §6.3 "Moves").
 * Same space (and owner, in My files): editor on each item; a document —
 * listed, or inside a moved folder — needs manager, or editor plus the Drive
 * edit power. Crossing spaces or owners: manager on each root and every
 * document, spaceMoveAllowed over every moved row, and the documents that
 * change space get the visibility of their new space. Owners never change:
 * Q3 already requires them to match the target.
 */
function moveDriveContent(
  ctx: DriveCtx, deps: DriveDeps, actor: DriveActor, itemIds: readonly string[], documentIds: readonly string[],
  target: DriveMoveTarget,
): void {
  const org = actor.organizationId;
  const container = resolveContainer(ctx, deps, actor, target.space, target.parentId, target.ownerMemberId);
  const parentOf = driveParentLookup(ctx, org);
  const targetDepth = depthOf(container.parentId, parentOf);
  const crosses = (space: string, owner: string): boolean =>
    space !== container.space || (container.space === 'my' && owner !== container.ownerMemberId);
  // Q3 names people, not roles, so the role intersection cannot narrow it: it
  // must hold for the caller AND the operator. Otherwise an owner/manager (who
  // may act without an operator session) could publish a member's My files
  // just by "acting" for that member.
  const allowed = (fromSpace: string, fromOwner: string, subtreeOwners: readonly string[]): boolean => {
    const fromOwnerActive = !!activeDriveMember(ctx, org, fromOwner);
    return [actor.caller, actor.operator].every((who) => spaceMoveAllowed({
      fromSpace, fromOwner, toSpace: container.space, toOwner: container.ownerMemberId, subtreeOwners,
      actorMemberId: who.memberId, actorOrgAdmin: who.orgAdmin, fromOwnerActive,
    }));
  };
  const adminEdit = adminOf(actor).edit;
  const sameSpaceDocOk = (role: DocRole): boolean => isDocManager(role) || (role === 'editor' && adminEdit);

  // Untrashed documents of the org by folder (their document_file rows), built on first use.
  let docsByFolder: Map<string, DocumentRow[]> | null = null;
  const docsIn = (folderIds: readonly string[]): DocumentRow[] => {
    if (folderIds.length === 0) return [];
    if (!docsByFolder) {
      docsByFolder = new Map();
      for (const doc of ctx.db.document.byOrganizationId.filter(org)) {
        const folderId = docFolderIdOf(ctx, doc.id);
        if (folderId === '' || doc.trashedAt) continue;
        docsByFolder.set(folderId, [...(docsByFolder.get(folderId) ?? []), doc]);
      }
    }
    const byFolder = docsByFolder;
    return folderIds.flatMap((id) => byFolder.get(id) ?? []);
  };
  const nextItems = new Map<string, DriveItemRow>();
  // A staged document: its row (visibility may change) and its folder (document_file).
  const nextDocs = new Map<string, { doc: DocumentRow; folderId: string }>();
  const stageItem = (row: DriveItemRow, patch: Partial<DriveItemRow>) =>
    nextItems.set(row.id, { ...(nextItems.get(row.id) ?? row), ...patch });
  const stageDoc = (doc: DocumentRow, patch: { visibility?: string; folderId?: string }) => {
    const staged = nextDocs.get(doc.id) ?? { doc, folderId: docFolderIdOf(ctx, doc.id) };
    nextDocs.set(doc.id, {
      doc: patch.visibility === undefined ? staged.doc : { ...staged.doc, visibility: patch.visibility },
      folderId: patch.folderId ?? staged.folderId,
    });
  };

  let budget = DRIVE_MAX_SUBTREE;
  for (const id of itemIds) {
    const item = ctx.db.driveItem.id.find(id);
    if (!item || item.organizationId !== org) throw driveError(deps, 'not_found', 'Item not found');
    if (item.trashed) throw driveError(deps, 'trashed', 'Item is in the trash');
    if (item.status !== 'ready') throw driveError(deps, 'invalid', 'The upload has not finished');
    const cross = crosses(item.space, item.ownerMemberId);
    assertDriveItemRole(deps, actor, item, cross ? 'manager' : 'editor');
    if (isAncestorOrSelf(item.id, container.parentId, parentOf, DRIVE_MAX_DEPTH)) {
      throw driveError(deps, 'cycle', 'A folder cannot move into itself');
    }
    const subtree = driveSubtree(ctx, org, item.id, budget);
    if (!subtree) throw driveError(deps, 'too_many_items', 'Too many items to move at once');
    budget -= subtree.rows.length;
    if (targetDepth + 1 + subtree.height > DRIVE_MAX_DEPTH) throw driveError(deps, 'too_deep', 'Folders cannot be nested this deep');
    const cascaded = docsIn(subtree.rows.filter((r) => r.kind === 'folder').map((r) => r.id));
    if (cross) {
      const owners = [...subtree.rows.map((r) => r.ownerMemberId), ...cascaded.map((d) => d.ownerMemberId)];
      if (!allowed(item.space, item.ownerMemberId, owners)) throw driveError(deps, 'space_mismatch', 'Those files cannot move there');
      for (const doc of cascaded) {
        assertDriveDocRole(ctx, deps, actor, doc, isDocManager);
        stageDoc(doc, { visibility: visibilityInSpace(container.space, doc.visibility) });
      }
      for (const row of subtree.rows) stageItem(row, { space: container.space });
    } else {
      // A document that moves along needs the same right as one moved on its own.
      for (const doc of cascaded) assertDriveDocRole(ctx, deps, actor, doc, sameSpaceDocOk);
    }
    stageItem(item, { parentId: container.parentId });
  }

  for (const id of documentIds) {
    const doc = ctx.db.document.id.find(id);
    if (!doc || doc.organizationId !== org) throw driveError(deps, 'not_found', 'Document not found');
    if (doc.trashedAt) throw driveError(deps, 'trashed', 'Document is in the trash');
    const fromSpace = driveSpaceOfDoc(doc);
    if (crosses(fromSpace, doc.ownerMemberId)) {
      assertDriveDocRole(ctx, deps, actor, doc, isDocManager);
      if (!allowed(fromSpace, doc.ownerMemberId, [doc.ownerMemberId])) {
        throw driveError(deps, 'space_mismatch', 'That file cannot move there');
      }
      stageDoc(doc, { folderId: container.parentId, visibility: visibilityInSpace(container.space, doc.visibility) });
    } else {
      assertDriveDocRole(ctx, deps, actor, doc, sameSpaceDocOk);
      stageDoc(doc, { folderId: container.parentId });
    }
  }

  for (const [id, next] of nextItems) {
    const current = ctx.db.driveItem.id.find(id);
    if (current && (current.parentId !== next.parentId || current.space !== next.space)) ctx.db.driveItem.id.update(next);
  }
  for (const [id, next] of nextDocs) {
    const current = ctx.db.document.id.find(id);
    if (!current) continue;
    setDocumentFile(ctx, current, { folderId: next.folderId });
    if (current.visibility === next.doc.visibility) continue;
    ctx.db.document.id.update(next.doc);
    deps.refreshDocReaders(ctx, next.doc);
    deps.pruneDocPresence(ctx, next.doc);
  }
}

/** An item addressed by id alone, with the actor resolved in the item's own organization (outsiders: not_found). */
function driveItemForActor(
  ctx: DriveCtx, deps: DriveDeps, itemId: string, actingMemberId: string,
): { item: DriveItemRow; actor: DriveActor } {
  const item = ctx.db.driveItem.id.find(String(itemId ?? '').toLowerCase());
  if (!item) throw driveError(deps, 'not_found', 'Item not found');
  const actor = resolveDriveActor(ctx, deps, item.organizationId, actingMemberId, { outsider: 'not_found' });
  return { item, actor };
}

export function defineDriveReducers(spacetimedb: DriveSchema, deps: DriveDeps) {
  const { t } = deps;

  /** The client generates the id (reducers can't return values). */
  const createDriveFolder = spacetimedb.reducer(
    {
      organizationId: t.string(), itemId: t.string(), space: t.string(), parentId: t.string(),
      ownerMemberId: t.string(), name: t.string(), actingMemberId: t.string(),
    },
    (ctx, args) => {
      const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
      const organizationId = actor.organizationId;
      const id = String(args.itemId ?? '').toLowerCase();
      if (!deps.docLimits.uuidRe.test(id)) throw driveError(deps, 'invalid', 'Invalid item id');
      if (ctx.db.driveItem.id.find(id)) throw driveError(deps, 'conflict', 'That id is already taken');
      const container = resolveContainer(ctx, deps, actor, args.space, args.parentId, args.ownerMemberId);
      const name = cleanDriveName(args.name);
      if (name === null) throw driveError(deps, 'invalid_name', 'Invalid folder name');
      if ((ctx.db.driveUsage.organizationId.find(organizationId)?.itemCount ?? 0) >= DRIVE_MAX_ITEMS_PER_ORG) {
        throw driveError(deps, 'too_many_items', 'This store has too many files and folders');
      }
      ctx.db.driveItem.insert({
        id, organizationId, adminScope: driveAdminScopeOf(ctx, organizationId), space: container.space,
        parentId: container.parentId, kind: 'folder', name, mimeType: '', sizeBytes: 0n, blobKey: '', thumbKey: '',
        thumbBytes: 0n, etag: '', ownerMemberId: driveNewRowOwner(container, actor), createdByMemberId: actor.memberId,
        uploaderIdentity: ctx.sender, status: 'ready', uploadExpiresAt: ctx.timestamp, uploadAttempts: 0,
        trashed: false, trashRootId: '', trashedAt: undefined, trashedByMemberId: '', createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp, lastEditorMemberId: actor.memberId, trashRootAt: 0n,
      });
      addDriveUsage(ctx, organizationId, { items: 1 });
    }
  );

  const renameDriveItem = spacetimedb.reducer(
    { itemId: t.string(), name: t.string(), actingMemberId: t.string() },
    (ctx, args) => {
      const { item, actor } = driveItemForActor(ctx, deps, args.itemId, args.actingMemberId);
      assertDriveItemRole(deps, actor, item, 'editor');
      if (item.trashed) throw driveError(deps, 'trashed', 'Item is in the trash');
      const name = cleanDriveName(args.name);
      if (name === null) throw driveError(deps, 'invalid_name', 'Invalid name');
      if (item.kind === 'file' && isBlockedDriveFile(name, item.mimeType)) {
        throw driveError(deps, 'blocked_type', 'Programs and installers cannot be stored in Drive');
      }
      if (name === item.name) return;
      ctx.db.driveItem.id.update({ ...item, name, updatedAt: ctx.timestamp, lastEditorMemberId: actor.memberId });
    }
  );

  const moveDriveEntries = spacetimedb.reducer(
    {
      organizationId: t.string(), itemIds: t.string(), documentIds: t.string(), targetSpace: t.string(),
      targetParentId: t.string(), targetOwnerMemberId: t.string(), actingMemberId: t.string(),
    },
    (ctx, args) => {
      const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
      const { itemIds, documentIds } = parseDriveEntryIds(deps, args.itemIds, args.documentIds);
      if (itemIds.length + documentIds.length === 0) return;
      moveDriveContent(ctx, deps, actor, itemIds, documentIds, {
        space: args.targetSpace, parentId: args.targetParentId, ownerMemberId: args.targetOwnerMemberId,
      });
    }
  );

  /** The single-document form of moveDriveEntries, resolved in the document's own organization. */
  const setDocumentFolder = spacetimedb.reducer(
    { documentId: t.string(), space: t.string(), folderId: t.string(), ownerMemberId: t.string(), actingMemberId: t.string() },
    (ctx, args) => {
      const doc = ctx.db.document.id.find(String(args.documentId ?? '').toLowerCase());
      if (!doc) throw driveError(deps, 'not_found', 'Document not found');
      const actor = resolveDriveActor(ctx, deps, doc.organizationId, args.actingMemberId, { outsider: 'not_found' });
      moveDriveContent(ctx, deps, actor, [], [doc.id], {
        space: args.space, parentId: args.folderId, ownerMemberId: args.ownerMemberId,
      });
    }
  );

  const toggleDriveStar = spacetimedb.reducer(
    { itemId: t.string(), actingMemberId: t.string() },
    (ctx, args) => {
      const { item, actor } = driveItemForActor(ctx, deps, args.itemId, args.actingMemberId);
      assertDriveItemRole(deps, actor, item, 'viewer');
      const id = `${item.id}:${actor.memberId}`;
      const existing = ctx.db.driveStar.id.find(id);
      if (existing) {
        ctx.db.driveStar.delete(existing);
        return;
      }
      ctx.db.driveStar.insert({
        id, itemId: item.id, organizationId: item.organizationId, memberId: actor.memberId, createdAt: ctx.timestamp,
      });
    }
  );

  /**
   * One acknowledgement per (member, notice, surface); the operator on /store.
   * Idempotent. A repeat from another identity moves the row to it, so the
   * device that just asked can see its own acknowledgement (the self rule).
   * Acting is refused on every other surface: nobody may acknowledge the
   * disclosure a member's own phone or back office has to show them. On the
   * store surface it needs ctx.sender's fresh device_operator_session for that
   * member (a PIN or QR unlock of this device) even for an owner/manager
   * caller: the people the notice is about never acknowledge it for someone.
   */
  const acknowledgeDriveNotice = spacetimedb.reducer(
    { organizationId: t.string(), notice: t.string(), surface: t.string(), actingMemberId: t.string() },
    (ctx, args) => {
      const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
      if (!(DRIVE_NOTICE_IDS as readonly string[]).includes(args.notice)) throw driveError(deps, 'invalid', 'Unknown notice');
      if (!(DRIVE_SURFACES as readonly string[]).includes(args.surface)) throw driveError(deps, 'invalid', 'Unknown surface');
      if (actor.acting && args.surface !== 'store') {
        throw driveError(deps, 'invalid', 'Only the store tablet acknowledges for its operator');
      }
      if (actor.acting && !operatorSessionFresh(ctx, deps, actor.organizationId, actor.memberId)) {
        throw driveError(deps, 'operator', 'Enter your PIN again to continue');
      }
      const id = `${actor.memberId}:${args.notice}:${args.surface}`;
      const existing = ctx.db.driveNoticeAck.id.find(id);
      if (existing) {
        if (!existing.userId.isEqual(ctx.sender)) {
          ctx.db.driveNoticeAck.id.update({ ...existing, userId: ctx.sender, acknowledgedAt: ctx.timestamp });
        }
        return;
      }
      ctx.db.driveNoticeAck.insert({
        id, organizationId: actor.organizationId, memberId: actor.memberId, userId: ctx.sender, notice: args.notice,
        surface: args.surface, acknowledgedAt: ctx.timestamp,
      });
    }
  );

  /**
   * Safety valve for a missed index write site: rebuild the CALLER's Drive admin
   * row and document reader rows in this org. Never grants more than docRoleFor
   * allows; a no-op for the service identity (its virtual owner gets no rows).
   */
  const refreshMyDriveAccess = spacetimedb.reducer(
    { organizationId: t.string() },
    (ctx, args) => {
      if (deps.isServiceCaller(ctx)) return;
      const member = callerDriveMember(ctx, args.organizationId);
      if (!member) throw driveError(deps, 'forbidden', 'Not an active member of this organization');
      syncDriveAdminIndex(ctx, member, deps.docMemberGate);
      syncMemberDocReaders(ctx, member, deps.docRoleFor);
    }
  );

  return {
    createDriveFolder, renameDriveItem, moveDriveEntries, setDocumentFolder, toggleDriveStar,
    acknowledgeDriveNotice, refreshMyDriveAccess,
  };
}
