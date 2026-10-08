// Drive trash: trash, restore, delete forever and empty trash (DS §6.3).
// index.ts wires them: `export const { … } = defineDriveTrashReducers(spacetimedb, driveDeps)`.
//
// The trash-root model: trashing an item stamps its untrashed subtree with
// trashRootId = <the item the user trashed>. Descendants that were ALREADY in
// the trash are separate roots — never re-stamped, never restored with the
// parent. Documents have no root column: the ones a cascade trashed carry the
// root's trashedAt to the microsecond (only a cascade stamps many rows in one
// transaction), and restore / delete forever find them by it.
//
// Trashing needs manager on every row it moves: an item owner, an org
// owner/manager, or a doc manager. `drive.edit` (editor) is not enough.
// Deleting forever reaches no further: a root goes only for someone who
// manages every row stamped with it (an admin may have trashed a folder that
// holds a colleague's file).

import type { DocumentRow, DriveCtx, DriveItemRow, DriveSchema } from './types';
import {
  assertDriveDocRole, assertDriveItemRole, deleteItemRow, docRoleOf, driveError, driveFolderFits, driveParentLookup,
  driveSpaceOfDoc, driveSubtree, isDocManager, itemRoleOf, parseDriveEntryIds, resolveDriveActor, type DriveDeps,
} from './context';
import { docFolderIdOf, setDocumentFile } from './document-file';
import { DRIVE_MAX_DEPTH, DRIVE_MAX_SUBTREE, DRIVE_SWEEP_MAX, isAncestorOrSelf } from './logic';

/** An item of this organization, else `[drive.not_found]`. */
function trashItemInOrg(ctx: DriveCtx, deps: DriveDeps, organizationId: string, id: string): DriveItemRow {
  const item = ctx.db.driveItem.id.find(id);
  if (!item || item.organizationId !== organizationId) throw driveError(deps, 'not_found', 'Item not found');
  return item;
}

/** A document of this organization, else `[drive.not_found]`. */
function trashDocInOrg(ctx: DriveCtx, deps: DriveDeps, organizationId: string, id: string): DocumentRow {
  const doc = ctx.db.document.id.find(id);
  if (!doc || doc.organizationId !== organizationId) throw driveError(deps, 'not_found', 'Document not found');
  return doc;
}

/** Every row stamped with this trash root (the root included), in the root's organization. */
function trashRootRows(ctx: DriveCtx, root: DriveItemRow): DriveItemRow[] {
  return [...ctx.db.driveItem.byTrashRootId.filter(root.id)].filter((r) => r.organizationId === root.organizationId);
}

/** Whether `doc` was trashed by the same cascade as `root` (same transaction timestamp). */
function trashedWithRoot(deps: DriveDeps, doc: DocumentRow, root: DriveItemRow): boolean {
  return !!doc.trashedAt && !!root.trashedAt
    && deps.timestampMicros(doc.trashedAt) === deps.timestampMicros(root.trashedAt);
}

/** The current documents of an organization that sit in one of `folderIds`. */
export type DriveDocsInFolders = (organizationId: string, folderIds: ReadonlySet<string>) => DocumentRow[];

/**
 * DriveDocsInFolders for ONE reducer call: each organization's documents are
 * read once, on first use, into a folderId → ids map, so deleting many trash
 * roots walks the org's documents once rather than once per root. Rows are
 * re-read by id on every lookup: an earlier root of the same call may have
 * moved or purged them.
 */
export function driveDocsByFolder(ctx: DriveCtx): DriveDocsInFolders {
  const byOrg = new Map<string, Map<string, string[]>>();
  return (organizationId, folderIds) => {
    let byFolder = byOrg.get(organizationId);
    if (!byFolder) {
      byFolder = new Map();
      for (const doc of ctx.db.document.byOrganizationId.filter(organizationId)) {
        const folderId = docFolderIdOf(ctx, doc.id);
        if (folderId === '') continue;
        const ids = byFolder.get(folderId);
        if (ids) ids.push(doc.id);
        else byFolder.set(folderId, [doc.id]);
      }
      byOrg.set(organizationId, byFolder);
    }
    const docs: DocumentRow[] = [];
    for (const folderId of folderIds) {
      for (const id of byFolder.get(folderId) ?? []) {
        const doc = ctx.db.document.id.find(id);
        if (doc && doc.organizationId === organizationId && docFolderIdOf(ctx, id) === folderId) docs.push(doc);
      }
    }
    return docs;
  };
}

/**
 * Delete one trash root for good: every row stamped with it (bytes released,
 * blobs queued for GC). Documents its cascade trashed are purged when
 * `purgeDoc` says so; any other document left pointing into the deleted
 * folders moves to the root of its space (it stays wherever it was — trash or
 * not). Returns the number of rows removed. Used by delete forever, empty trash
 * and the retention sweep (which passes `() => false`: Docs never auto-delete).
 * A caller deleting several roots passes one `docsIn` (driveDocsByFolder) for all of them.
 */
export function deleteDriveTrashRoot(
  ctx: DriveCtx, deps: DriveDeps, root: DriveItemRow, reason: string, purgeDoc: (doc: DocumentRow) => boolean,
  docsIn: DriveDocsInFolders = driveDocsByFolder(ctx),
): number {
  const organizationId = root.organizationId;
  const rows = trashRootRows(ctx, root);
  const folderIds = new Set(rows.filter((r) => r.kind === 'folder').map((r) => r.id));
  for (const row of rows) deleteItemRow(ctx, deps, row, reason);
  let removed = rows.length;
  if (folderIds.size === 0) return removed;
  for (const doc of docsIn(organizationId, folderIds)) {
    if (trashedWithRoot(deps, doc, root) && purgeDoc(doc)) {
      deps.purgeDocumentRows(ctx, doc);
      removed++;
    } else {
      setDocumentFile(ctx, doc, { folderId: '' });
    }
  }
  return removed;
}

export function defineDriveTrashReducers(spacetimedb: DriveSchema, deps: DriveDeps) {
  const { t } = deps;
  const entries = () => ({
    organizationId: t.string(), itemIds: t.string(), documentIds: t.string(), actingMemberId: t.string(),
  });

  const trashDriveEntries = spacetimedb.reducer(entries(), (ctx, args) => {
    const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
    const { itemIds, documentIds } = parseDriveEntryIds(deps, args.itemIds, args.documentIds);
    const org = actor.organizationId;
    const listed: DriveItemRow[] = [];
    for (const id of itemIds) {
      const item = trashItemInOrg(ctx, deps, org, id);
      if (item.trashed) continue; // already trashed: idempotent
      assertDriveItemRole(deps, actor, item, 'manager');
      listed.push(item);
    }
    // A listed item inside another listed item is part of that one's cascade.
    const parentOf = driveParentLookup(ctx, org);
    const roots = listed.filter((item) => !listed.some((other) =>
      other.id !== item.id && isAncestorOrSelf(other.id, item.parentId, parentOf, DRIVE_MAX_DEPTH)));

    const plans: Array<{ root: DriveItemRow; rows: DriveItemRow[] }> = [];
    const folderIds = new Set<string>();
    let budget = DRIVE_MAX_SUBTREE;
    for (const root of roots) {
      const subtree = driveSubtree(ctx, org, root.id, budget);
      if (!subtree) throw driveError(deps, 'too_many_items', 'Too many items to move to the trash at once');
      budget -= subtree.rows.length;
      for (const row of subtree.rows) {
        if (row.id !== root.id) assertDriveItemRole(deps, actor, row, 'manager', 'subtree_forbidden');
        if (row.kind === 'folder') folderIds.add(row.id);
      }
      plans.push({ root, rows: subtree.rows });
    }
    const docs = new Map<string, DocumentRow>();
    if (folderIds.size > 0) {
      for (const doc of ctx.db.document.byOrganizationId.filter(org)) {
        if (doc.trashedAt || !folderIds.has(docFolderIdOf(ctx, doc.id))) continue;
        assertDriveDocRole(ctx, deps, actor, doc, isDocManager, 'subtree_forbidden');
        docs.set(doc.id, doc);
      }
    }
    for (const id of documentIds) {
      const doc = trashDocInOrg(ctx, deps, org, id);
      if (doc.trashedAt) continue;
      assertDriveDocRole(ctx, deps, actor, doc, isDocManager);
      docs.set(doc.id, doc);
    }

    const nowMicros = deps.timestampMicros(ctx.timestamp);
    for (const { root, rows } of plans) {
      for (const row of rows) {
        // An upload still in flight is cancelled, not trashed.
        if (row.status !== 'ready') deleteItemRow(ctx, deps, row, 'cancelled');
        else ctx.db.driveItem.id.update({
          ...row, trashed: true, trashRootId: root.id, trashedAt: ctx.timestamp, trashedByMemberId: actor.memberId,
          trashRootAt: row.id === root.id ? nowMicros : 0n,
        });
      }
    }
    for (const doc of docs.values()) {
      ctx.db.document.id.update({ ...doc, trashedAt: ctx.timestamp, trashedByMemberId: actor.memberId });
      for (const p of [...ctx.db.documentPresence.byDocumentId.filter(doc.id)]) ctx.db.documentPresence.delete(p);
      deps.dropDocumentLease(ctx, doc.id);
    }
  });

  /**
   * Restores whole trash roots. A root keeps its parent only while that parent
   * is a live folder of the same space (and owner, in My files); otherwise it
   * lands at the root of its space, so trees never mix spaces or owners.
   */
  const restoreDriveEntries = spacetimedb.reducer(entries(), (ctx, args) => {
    const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
    const { itemIds, documentIds } = parseDriveEntryIds(deps, args.itemIds, args.documentIds);
    const org = actor.organizationId;
    const roots: DriveItemRow[] = [];
    for (const id of itemIds) {
      const item = trashItemInOrg(ctx, deps, org, id);
      if (!item.trashed) continue; // already restored: idempotent
      if (item.trashRootId !== item.id) throw driveError(deps, 'invalid', 'Restore the folder it was deleted with');
      assertDriveItemRole(deps, actor, item, 'manager');
      roots.push(item);
    }
    const listedDocs: DocumentRow[] = [];
    for (const id of documentIds) {
      const doc = trashDocInOrg(ctx, deps, org, id);
      if (!doc.trashedAt) continue;
      assertDriveDocRole(ctx, deps, actor, doc, isDocManager);
      listedDocs.push(doc);
    }

    const rootOfFolder = new Map<string, DriveItemRow>();
    for (const root of roots) {
      for (const row of [...ctx.db.driveItem.byTrashRootId.filter(root.id)]) {
        if (row.organizationId !== org) continue;
        if (row.kind === 'folder') rootOfFolder.set(row.id, root);
        ctx.db.driveItem.id.update({
          ...row, trashed: false, trashRootId: '', trashedAt: undefined, trashedByMemberId: '', trashRootAt: 0n,
        });
      }
    }
    for (const root of roots) {
      const current = ctx.db.driveItem.id.find(root.id);
      if (current && current.parentId !== ''
          && !driveFolderFits(ctx, org, current.parentId, current.space, current.ownerMemberId)) {
        ctx.db.driveItem.id.update({ ...current, parentId: '' });
      }
    }
    // Documents the cascade trashed come back with it — the ones this actor manages.
    if (rootOfFolder.size > 0) {
      for (const doc of [...ctx.db.document.byOrganizationId.filter(org)]) {
        const root = rootOfFolder.get(docFolderIdOf(ctx, doc.id));
        if (!root || !trashedWithRoot(deps, doc, root) || !isDocManager(docRoleOf(ctx, deps, doc, actor))) continue;
        ctx.db.document.id.update({ ...doc, trashedAt: undefined, trashedByMemberId: undefined });
      }
    }
    for (const listed of listedDocs) {
      const doc = ctx.db.document.id.find(listed.id);
      if (!doc || !doc.trashedAt) continue;
      ctx.db.document.id.update({ ...doc, trashedAt: undefined, trashedByMemberId: undefined });
      if (!driveFolderFits(ctx, org, docFolderIdOf(ctx, doc.id), driveSpaceOfDoc(doc), doc.ownerMemberId)) {
        setDocumentFile(ctx, doc, { folderId: '' });
      }
    }
  });

  /**
   * Only trash roots and trashed documents. A root needs manager on every row
   * stamped with it (subtree_forbidden); the documents its cascade trashed go
   * with it where the actor manages them. Several roots together may hold at
   * most DRIVE_MAX_SUBTREE rows (batch_too_large); one root always fits, as
   * trashing it did.
   */
  const deleteDriveEntriesForever = spacetimedb.reducer(entries(), (ctx, args) => {
    const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
    const { itemIds, documentIds } = parseDriveEntryIds(deps, args.itemIds, args.documentIds);
    const org = actor.organizationId;
    const roots: DriveItemRow[] = [];
    let rowCount = 0;
    for (const id of itemIds) {
      const item = trashItemInOrg(ctx, deps, org, id);
      if (!item.trashed || item.trashRootId !== item.id) throw driveError(deps, 'invalid', 'Move it to the trash first');
      assertDriveItemRole(deps, actor, item, 'manager');
      for (const row of trashRootRows(ctx, item)) {
        if (row.id !== item.id) assertDriveItemRole(deps, actor, row, 'manager', 'subtree_forbidden');
        rowCount++;
      }
      roots.push(item);
      if (roots.length > 1 && rowCount > DRIVE_MAX_SUBTREE) {
        throw driveError(deps, 'batch_too_large', 'Too many items to delete at once');
      }
    }
    const docs: DocumentRow[] = [];
    for (const id of documentIds) {
      const doc = trashDocInOrg(ctx, deps, org, id);
      if (!doc.trashedAt) throw driveError(deps, 'invalid', 'Move the document to the trash first');
      assertDriveDocRole(ctx, deps, actor, doc, isDocManager);
      docs.push(doc);
    }
    const purgeIfManager = (doc: DocumentRow) => isDocManager(docRoleOf(ctx, deps, doc, actor));
    const docsIn = driveDocsByFolder(ctx);
    for (const root of roots) deleteDriveTrashRoot(ctx, deps, root, 'purged', purgeIfManager, docsIn);
    for (const listed of docs) {
      const doc = ctx.db.document.id.find(listed.id); // gone when a root's cascade purged it
      if (doc) deps.purgeDocumentRows(ctx, doc);
    }
  });

  /**
   * Everything in the trash the actor manages, roots first: a root only when
   * the actor manages every row stamped with it (others are left for someone
   * who does). Stops starting new work once DRIVE_SWEEP_MAX rows are gone; the
   * client wrapper repeats while any remain.
   */
  const emptyDriveTrash = spacetimedb.reducer(
    { organizationId: t.string(), actingMemberId: t.string() },
    (ctx, args) => {
      const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
      const org = actor.organizationId;
      const purgeIfManager = (doc: DocumentRow) => isDocManager(docRoleOf(ctx, deps, doc, actor));
      const manages = (row: DriveItemRow) => itemRoleOf(row, actor) === 'manager';
      const docsIn = driveDocsByFolder(ctx);
      let removed = 0;
      // A root's own rows are checked only when its turn comes, so a call stops early instead of walking every root first.
      const candidates = [...ctx.db.driveItem.byOrganizationId.filter(org)]
        .filter((r) => r.trashed && r.trashRootId === r.id && manages(r));
      for (const root of candidates) {
        if (removed >= DRIVE_SWEEP_MAX) return;
        if (!ctx.db.driveItem.id.find(root.id) || !trashRootRows(ctx, root).every(manages)) continue;
        removed += deleteDriveTrashRoot(ctx, deps, root, 'purged', purgeIfManager, docsIn);
      }
      for (const doc of [...ctx.db.document.byOrganizationId.filter(org)]) {
        if (removed >= DRIVE_SWEEP_MAX) return;
        if (!doc.trashedAt || !purgeIfManager(doc)) continue;
        deps.purgeDocumentRows(ctx, doc);
        removed++;
      }
    }
  );

  return { trashDriveEntries, restoreDriveEntries, deleteDriveEntriesForever, emptyDriveTrash };
}
