// Drive UI model: the one entry list every Drive screen renders, and the tree over it.
//
// Pure (no React). buildDriveEntries turns useDrive()'s rows into DriveEntry values carrying
// the ACTOR's access (the PIN operator on /store, never the signed-in tablet account);
// buildDriveTree indexes them by container. Placement is lib/drive/model.ts's (a stale folder
// pointer lands at the root of its space), roles are lib/drive/access.ts's and
// lib/docs/access.ts's through useDrive's accessFor* callbacks.
//
// The module decides every write; these flags only keep the UI from offering what it would
// refuse (CONTRACTS C21): rename and same-space moves need editor, trash, restore, delete
// forever and cross-space moves need manager, trashing a folder also needs manager on
// everything inside it that is not already in the trash, and deleting a folder forever needs
// manager on every item that went to the trash with it ([drive.subtree_forbidden]). Restore
// checks the root only. Rows this client cannot see are left for the module to decide.

import { DOC_ROLE_RANK } from "@/lib/docs/access";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import { DRIVE_ROLE_RANK } from "@/lib/drive/access";
import { fileKindOf } from "@/lib/drive/file-kinds";
import { docSpace, effectiveDocFolderId, effectiveItemParentId, sharedWithMe } from "@/lib/drive/model";
import { DRIVE_MAX_DEPTH } from "@/lib/drive/rules";
import type { DriveItem, DriveItemAccess, DriveSurface } from "@/lib/drive/types";
import type { UseDriveResult } from "@/lib/spacetimedb/hooks/useDrive";
import type {
  AccessCeiling,
  DocEntry,
  DriveEntry,
  DriveEntryAccess,
  DriveLocation,
  DriveMoveTarget,
  FileEntry,
  FolderEntry,
} from "./types";

export interface BuildDriveEntriesInput {
  /**
   * From useDrive({ actorMemberId }): access and stars are the ACTOR's. `admin` is the actor's effective
   * "everyone's files" power — on /store pass DriveActor's canViewAll / canEditAll, which already include the
   * tablet account's (the module ANDs both, drive/context.ts adminOf).
   */
  drive: Pick<UseDriveResult, "items" | "itemsById" | "documents" | "trashedDocuments" | "grants"
    | "starredItemIds" | "starredDocumentIds" | "accessForItem" | "accessForDocument" | "admin">
    /** Document sizes (`document_size`); without them every document's size is unknown. */
    & Partial<Pick<UseDriveResult, "documentSizes">>;
  /** DriveActor.ceiling: the tablet account's rights on a non-admin store tablet; null elsewhere. */
  ceiling: AccessCeiling | null;
  actor: { memberId: string | null; surface: DriveSurface; acting: boolean };
  /** org_member id → display name. */
  memberNames: ReadonlyMap<string, string>;
  /** Id → when this device last opened it (lib/docs/recent.ts; items and documents share the uuid space). */
  openedMap: ReadonlyMap<string, number>;
  /** Items this tab is uploading right now (the upload queue's entries with an item id and a non-final state). */
  localUploadIds: ReadonlySet<string>;
}

export interface DriveTree {
  readonly entries: readonly DriveEntry[];
  readonly byKey: ReadonlyMap<string, DriveEntry>;
  /** Folder entries by item id. */
  readonly folders: ReadonlyMap<string, FolderEntry>;
  /** The untrashed entries directly inside a container. */
  childrenOf(target: DriveMoveTarget): readonly DriveEntry[];
  /** Ancestors root→parent; cycle-safe (visited set, at most DRIVE_MAX_DEPTH). */
  pathOf(entry: DriveEntry): readonly FolderEntry[];
  /**
   * Every entry below a folder that this client can see, cycle-safe. An untrashed folder yields its untrashed
   * content and stops at anything already in the trash (a separate trash root, as the module's collectSubtree);
   * a trashed folder yields what went to the trash with it.
   */
  descendantsOf(folder: FolderEntry): readonly DriveEntry[];
  /** Itself or an ancestor is trashed. */
  hasTrashedAncestor(entry: DriveEntry): boolean;
}

/** "my:<owner>:<parent>" | "store::<parent>". */
export function containerKey(t: DriveMoveTarget): string {
  return t.space === "my" ? `my:${t.ownerMemberId}:${t.parentId}` : `store::${t.parentId}`;
}

/** The container a folder's content sits in. */
export function folderContainer(folder: FolderEntry): DriveMoveTarget {
  const location = folder.location ?? { space: folder.item.space, ownerMemberId: "", parentId: "" };
  return { space: location.space, ownerMemberId: location.space === "my" ? location.ownerMemberId : "", parentId: folder.id };
}

export const itemEntryKey = (itemId: string): string => `item:${itemId}`;
export const docEntryKey = (documentId: string): string => `doc:${documentId}`;

const isTrashed = (entry: DriveEntry): boolean => entry.trashedAt !== null;

// ── Access ───────────────────────────────────────────────────────────────────

/** The lower of two item accesses: what the module grants when the tablet acts for an operator (itemRoleOf). */
function minItemAccess(a: DriveItemAccess, b: DriveItemAccess): DriveItemAccess {
  return {
    role: DRIVE_ROLE_RANK[a.role] <= DRIVE_ROLE_RANK[b.role] ? a.role : b.role,
    canView: a.canView && b.canView,
    canAddChildren: a.canAddChildren && b.canAddChildren,
    canEdit: a.canEdit && b.canEdit,
    canManage: a.canManage && b.canManage,
  };
}

/** The lower of two document accesses (docRoleOf). */
function minDocAccess(a: DocAccess, b: DocAccess): DocAccess {
  return {
    role: DOC_ROLE_RANK[a.role] <= DOC_ROLE_RANK[b.role] ? a.role : b.role,
    canView: a.canView && b.canView,
    canComment: a.canComment && b.canComment,
    canEdit: a.canEdit && b.canEdit,
    canManage: a.canManage && b.canManage,
  };
}

/**
 * Folder and file flags. Pending uploads open nothing yet; only a trash root (the item the person trashed) is
 * restored or deleted forever — the rest of its subtree comes with it. A folder's canTrash, canDeleteForever and
 * canAddChildren are narrowed again once every row is known (buildDriveEntries, second pass).
 */
function itemEntryAccess(item: DriveItem, a: DriveItemAccess): DriveEntryAccess {
  const ready = item.status === "ready";
  const live = !item.trashed;
  const trashRoot = item.trashed && item.trashRootId === item.id;
  return {
    canOpen: a.canView && ready,
    canDownload: a.canView && ready && item.kind === "file",
    canRename: a.canEdit && live && ready,
    canMove: a.canEdit && live && ready,
    canTrash: a.canManage && live,
    canRestore: a.canManage && trashRoot,
    canDeleteForever: a.canManage && trashRoot,
    canShare: false,
    canStar: a.canView && live,
    canAddChildren: a.canAddChildren,
  };
}

/**
 * Docs, Sheets and Slides flags. Same-space moves need manager, or editor plus the Drive edit power (the
 * module's sameSpaceDocOk); a document star is written for the signed-in identity (toggleDocumentStar), so it is
 * not offered while acting for an operator. Exports happen in the editor, never as a download here.
 */
function docEntryAccess(doc: DocumentMeta, d: DocAccess, adminEdit: boolean, actor: BuildDriveEntriesInput["actor"]): DriveEntryAccess {
  const live = doc.trashedAt === null;
  return {
    canOpen: d.canView,
    canDownload: false,
    canRename: d.canEdit && live,
    canMove: live && (d.canManage || (d.canEdit && adminEdit)),
    canTrash: d.canManage && live,
    canRestore: d.canManage && !live,
    canDeleteForever: d.canManage && !live,
    canShare: d.canView && live && actor.surface === "manager",
    canStar: d.canView && live && !actor.acting,
    canAddChildren: false,
  };
}

// ── Entries ──────────────────────────────────────────────────────────────────

/**
 * Every folder, file and document the actor can see, with the actor's access. Pending uploads are listed only
 * to the person uploading them; documents of an unknown type (written by a newer client) are left out; with a
 * ceiling, every right is the lower of the actor's and the tablet account's, as the module computes it.
 */
export function buildDriveEntries(input: BuildDriveEntriesInput): DriveEntry[] {
  const { drive, ceiling, actor } = input;
  const entries: DriveEntry[] = [];
  // Manager on the row itself: trashing a folder needs it on every live row inside.
  const manages = new Map<string, boolean>();
  // Trash roots with a visible item stamped with them that the actor does not manage: no delete forever.
  const unmanagedTrashRoots = new Set<string>();
  const common = (id: string, ownerMemberId: string) => ({
    id,
    ownerMemberId,
    ownerName: ownerMemberId ? (input.memberNames.get(ownerMemberId) ?? null) : null,
    isMine: !!actor.memberId && ownerMemberId === actor.memberId,
    openedAt: input.openedMap.get(id) ?? null,
  });

  for (const item of drive.items) {
    if (item.status === "pending" && (!actor.memberId || item.createdByMemberId !== actor.memberId)) continue;
    const own = drive.accessForItem(item);
    const a = ceiling ? minItemAccess(own, ceiling.item(item)) : own;
    if (!a.canView) continue;
    const key = itemEntryKey(item.id);
    manages.set(key, a.canManage);
    if (item.trashed && item.trashRootId && item.trashRootId !== item.id && !a.canManage) unmanagedTrashRoots.add(item.trashRootId);
    const location: DriveLocation = {
      space: item.space,
      ownerMemberId: item.space === "my" ? item.ownerMemberId : "",
      parentId: effectiveItemParentId(item, drive.itemsById),
    };
    const base = {
      ...common(item.id, item.ownerMemberId),
      key,
      name: item.name,
      createdAt: item.createdAt.getTime(),
      updatedAt: item.updatedAt.getTime(),
      starred: drive.starredItemIds.has(item.id),
      trashedAt: item.trashed ? (item.trashedAt ?? item.updatedAt).getTime() : null,
      location,
      access: itemEntryAccess(item, a),
    };
    if (item.kind === "folder") {
      entries.push({ ...base, type: "folder", item } satisfies FolderEntry);
    } else {
      entries.push({
        ...base,
        type: "file",
        item,
        fileKind: fileKindOf(item.mimeType, item.name),
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        uploading: item.status === "pending" ? (input.localUploadIds.has(item.id) ? "local" : "elsewhere") : null,
      } satisfies FileEntry);
    }
  }

  const shared = new Set(sharedWithMe({ docs: drive.documents, grants: drive.grants, memberId: actor.memberId }).map((doc) => doc.id));
  const granted = new Set(drive.grants.map((grant) => grant.documentId));
  const seen = new Set<string>();
  for (const doc of [...drive.documents, ...drive.trashedDocuments]) {
    if (doc.fileType === "unknown" || seen.has(doc.id)) continue;
    seen.add(doc.id);
    const own = drive.accessForDocument(doc);
    const d = ceiling ? minDocAccess(own, ceiling.doc(doc)) : own;
    if (!d.canView) continue;
    const key = docEntryKey(doc.id);
    manages.set(key, d.canManage);
    const space = docSpace(doc);
    entries.push({
      ...common(doc.id, doc.ownerMemberId),
      key,
      type: doc.fileType,
      name: doc.title,
      createdAt: doc.createdAt.getTime(),
      updatedAt: doc.updatedAt.getTime(),
      starred: drive.starredDocumentIds.has(doc.id),
      trashedAt: doc.trashedAt ? doc.trashedAt.getTime() : null,
      location: { space, ownerMemberId: space === "my" ? doc.ownerMemberId : "", parentId: effectiveDocFolderId(doc, drive.itemsById) },
      access: docEntryAccess(doc, d, drive.admin.edit, actor),
      doc,
      docAccess: d,
      sharedWithMe: shared.has(doc.id),
      hasGrants: granted.has(doc.id),
      sizeBytes: drive.documentSizes?.get(doc.id.toLowerCase()) ?? null,
    } satisfies DocEntry);
  }

  // Second pass: folder flags that depend on what is inside, above, or trashed with the folder.
  const tree = buildDriveTree(entries);
  const subtreeManaged = new Map<string, boolean>();
  const managedBelow = (folder: FolderEntry, visiting: Set<string>): boolean => {
    const cached = subtreeManaged.get(folder.id);
    if (cached !== undefined) return cached;
    visiting.add(folder.id);
    let ok = true;
    for (const child of tree.childrenOf(folderContainer(folder))) {
      if (manages.get(child.key) !== true) ok = false;
      else if (child.type === "folder" && !visiting.has(child.id)) ok = managedBelow(child, visiting);
      if (!ok) break;
    }
    visiting.delete(folder.id);
    subtreeManaged.set(folder.id, ok);
    return ok;
  };
  return entries.map((entry) => {
    if (entry.type !== "folder") return entry;
    const canTrash = entry.access.canTrash && managedBelow(entry, new Set());
    const canAddChildren = entry.access.canAddChildren && !tree.hasTrashedAncestor(entry);
    const canDeleteForever = entry.access.canDeleteForever && !unmanagedTrashRoots.has(entry.id);
    if (canTrash === entry.access.canTrash && canAddChildren === entry.access.canAddChildren
      && canDeleteForever === entry.access.canDeleteForever) return entry;
    return { ...entry, access: { ...entry.access, canTrash, canAddChildren, canDeleteForever } };
  });
}

// ── Tree ─────────────────────────────────────────────────────────────────────

/** Indexes entries by container. Virtual entries (no location) are kept in `entries` and `byKey` only. */
export function buildDriveTree(entries: readonly DriveEntry[]): DriveTree {
  const byKey = new Map<string, DriveEntry>();
  const folders = new Map<string, FolderEntry>();
  const all = new Map<string, DriveEntry[]>();
  const live = new Map<string, DriveEntry[]>();
  const push = (map: Map<string, DriveEntry[]>, key: string, entry: DriveEntry) => {
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  };
  for (const entry of entries) {
    byKey.set(entry.key, entry);
    if (entry.type === "folder") folders.set(entry.id, entry);
    if (!entry.location) continue;
    const key = containerKey(entry.location);
    push(all, key, entry);
    if (!isTrashed(entry)) push(live, key, entry);
  }

  const pathOf = (entry: DriveEntry): FolderEntry[] => {
    const path: FolderEntry[] = [];
    const seen = new Set<string>(entry.type === "folder" ? [entry.id] : []);
    let parentId = entry.location?.parentId ?? "";
    while (parentId && path.length < DRIVE_MAX_DEPTH) {
      const folder = folders.get(parentId);
      if (!folder || seen.has(folder.id)) break;
      seen.add(folder.id);
      path.push(folder);
      parentId = folder.location?.parentId ?? "";
    }
    return path.reverse();
  };

  const descendantsOf = (folder: FolderEntry): DriveEntry[] => {
    const trashed = isTrashed(folder);
    const out: DriveEntry[] = [];
    const seen = new Set<string>([folder.key]);
    const queue: FolderEntry[] = [folder];
    for (let next = queue.shift(); next; next = queue.shift()) {
      for (const child of all.get(containerKey(folderContainer(next))) ?? []) {
        if (seen.has(child.key) || isTrashed(child) !== trashed) continue;
        seen.add(child.key);
        out.push(child);
        if (child.type === "folder") queue.push(child);
      }
    }
    return out;
  };

  return {
    entries,
    byKey,
    folders,
    childrenOf: (target) => live.get(containerKey(target)) ?? [],
    pathOf,
    descendantsOf,
    hasTrashedAncestor: (entry) => isTrashed(entry) || pathOf(entry).some(isTrashed),
  };
}
