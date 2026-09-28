// The canonical Drive listing rules, pure (no React). The Drive UI composes these
// (components/drive/model/*) instead of re-deriving where things sit.
//
// Placement follows the module (spacetimedb/src/drive/{context,trash}.ts):
// - A document's space is derived from its visibility (private → its owner's My
//   files, otherwise Store) and never stored.
// - Content sits in its parent folder only while that folder is a ready,
//   untrashed folder of the same organization and space (and owner, in My
//   files) — driveFolderFits. Anything else lands at the root of its space, the
//   same rule restore applies, so a stale pointer never hides a row.
// - Trash roots: an item the user trashed carries trashRootId === id; its
//   subtree was stamped with that root. Documents have no root column: the ones
//   a folder's cascade trashed share the root's trashedAt and sit in a folder
//   stamped with it, and are restored with the folder instead of on their own.
//
// Documents of an unknown type (written by a newer client) are never listed.

import type { DocAccessGrant, DocumentMeta } from "@/lib/docs/types";
import { DRIVE_MAX_DEPTH } from "./rules";
import type { DriveItem, DriveSpace } from "./types";

type ItemPlace = Pick<DriveItem, "id" | "organizationId" | "space" | "parentId" | "ownerMemberId" | "trashed">;

/** private → "my" (its owner's My files); org_view / org_edit → "store". */
export function docSpace(doc: Pick<DocumentMeta, "visibility">): DriveSpace {
  return doc.visibility === "private" ? "my" : "store";
}

/** Whether `folder` may hold content of this organization, space and owner (the module's driveFolderFits). */
function folderFits(folder: DriveItem | undefined, organizationId: string, space: DriveSpace, ownerMemberId: string): folder is DriveItem {
  return !!folder && folder.kind === "folder" && folder.status === "ready" && !folder.trashed
    && folder.organizationId === organizationId && folder.space === space
    && (space !== "my" || folder.ownerMemberId === ownerMemberId);
}

/** The folder a document is listed in: its folderId while that folder fits, else '' (the root of its space). */
export function effectiveDocFolderId(doc: DocumentMeta, itemsById: ReadonlyMap<string, DriveItem>): string {
  if (!doc.folderId) return "";
  return folderFits(itemsById.get(doc.folderId), doc.organizationId, docSpace(doc), doc.ownerMemberId) ? doc.folderId : "";
}

/**
 * The folder an item is listed in: its parentId while that parent fits, else '' (the root of its space). A trashed
 * item keeps a trashed parent (the pair went to the trash together).
 */
export function effectiveItemParentId(item: ItemPlace, itemsById: ReadonlyMap<string, DriveItem>): string {
  if (!item.parentId || item.parentId === item.id) return "";
  const parent = itemsById.get(item.parentId);
  if (item.trashed && parent?.trashed) {
    return folderFits({ ...parent, trashed: false }, item.organizationId, item.space, item.ownerMemberId) ? parent.id : "";
  }
  return folderFits(parent, item.organizationId, item.space, item.ownerMemberId) ? item.parentId : "";
}

/** One folder of one space: `ownerMemberId` names whose My files ('' for Store). `parentId` '' = the space root. */
export interface DriveContainerRef { space: DriveSpace; parentId: string; ownerMemberId: string }

function inSpace(container: DriveContainerRef, space: DriveSpace, ownerMemberId: string): boolean {
  return space === container.space && (space !== "my" || ownerMemberId === container.ownerMemberId);
}

/**
 * The untrashed folders, files and documents directly inside `container`, in input order. A pending upload is shown
 * only to the identity uploading it (`viewerIdentityHex`); nobody else can open it yet.
 */
export function listContainer(input: {
  items: readonly DriveItem[];
  docs: readonly DocumentMeta[];
  container: DriveContainerRef;
  viewerIdentityHex: string | null;
}): { folders: DriveItem[]; files: DriveItem[]; docs: DocumentMeta[] } {
  const { items, docs, container } = input;
  const viewer = input.viewerIdentityHex ? input.viewerIdentityHex.toLowerCase() : null;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const folders: DriveItem[] = [];
  const files: DriveItem[] = [];
  for (const item of items) {
    if (item.trashed || !inSpace(container, item.space, item.ownerMemberId)) continue;
    if (effectiveItemParentId(item, itemsById) !== container.parentId) continue;
    if (item.kind === "folder") {
      if (item.status === "ready") folders.push(item);
    } else if (item.status === "ready" || (viewer !== null && item.uploaderIdentityHex.toLowerCase() === viewer)) {
      files.push(item);
    }
  }
  const listed = docs.filter((doc) =>
    !doc.trashedAt && doc.fileType !== "unknown" && inSpace(container, docSpace(doc), doc.ownerMemberId)
    && effectiveDocFolderId(doc, itemsById) === container.parentId);
  return { folders, files, docs: listed };
}

/**
 * The folders from the space root down to `folderId` (included), following the same parent rule as the listing.
 * [] for the root ('') or a folder this client cannot see; cycle-safe and at most DRIVE_MAX_DEPTH long.
 */
export function breadcrumb(itemsById: ReadonlyMap<string, DriveItem>, folderId: string): DriveItem[] {
  const path: DriveItem[] = [];
  const seen = new Set<string>();
  let current = folderId ? itemsById.get(folderId) : undefined;
  while (current && current.kind === "folder" && !seen.has(current.id) && path.length < DRIVE_MAX_DEPTH) {
    seen.add(current.id);
    path.push(current);
    const parentId = effectiveItemParentId(current, itemsById);
    current = parentId ? itemsById.get(parentId) : undefined;
  }
  return path.reverse();
}

/**
 * What the trash lists: the items the user trashed (trashRootId === id) and the trashed documents that are not part
 * of such a root's cascade (one in a folder stamped with a listed root, with that root's trashedAt, comes back with it).
 */
export function trashRoots(input: { items: readonly DriveItem[]; docs: readonly DocumentMeta[] }): { items: DriveItem[]; docs: DocumentMeta[] } {
  const roots = input.items.filter((item) => item.trashed && item.trashRootId === item.id);
  const rootById = new Map(roots.map((root) => [root.id, root]));
  const rootOfFolder = new Map<string, DriveItem>();
  for (const item of input.items) {
    if (item.kind !== "folder" || !item.trashed) continue;
    const root = rootById.get(item.trashRootId);
    if (root) rootOfFolder.set(item.id, root);
  }
  const docs = input.docs.filter((doc) => {
    if (!doc.trashedAt || doc.fileType === "unknown") return false;
    const root = doc.folderId ? rootOfFolder.get(doc.folderId) : undefined;
    return !(root?.trashedAt && root.trashedAt.getTime() === doc.trashedAt.getTime());
  });
  return { items: roots, docs };
}

/**
 * Untrashed documents someone else owns that hold an explicit grant for `memberId`, in input order. [] while the
 * member is unknown.
 */
export function sharedWithMe(input: { docs: readonly DocumentMeta[]; grants: readonly DocAccessGrant[]; memberId: string | null }): DocumentMeta[] {
  const { memberId } = input;
  if (!memberId) return [];
  const granted = new Set(input.grants.filter((grant) => grant.memberId === memberId).map((grant) => grant.documentId));
  return input.docs.filter((doc) =>
    !doc.trashedAt && doc.fileType !== "unknown" && doc.ownerMemberId !== memberId && granted.has(doc.id));
}

/**
 * Everyone's My files for the "Members' files" view, by owner member id: ready, untrashed items and untrashed
 * private documents (at every depth). Owners with nothing listed have no entry.
 */
export function everyonesFiles(input: { items: readonly DriveItem[]; docs: readonly DocumentMeta[] }): Map<string, { items: DriveItem[]; docs: DocumentMeta[] }> {
  const byOwner = new Map<string, { items: DriveItem[]; docs: DocumentMeta[] }>();
  const bucket = (ownerMemberId: string) => {
    let entry = byOwner.get(ownerMemberId);
    if (!entry) {
      entry = { items: [], docs: [] };
      byOwner.set(ownerMemberId, entry);
    }
    return entry;
  };
  for (const item of input.items) {
    if (item.space !== "my" || item.trashed || item.status !== "ready" || !item.ownerMemberId) continue;
    bucket(item.ownerMemberId).items.push(item);
  }
  for (const doc of input.docs) {
    if (docSpace(doc) !== "my" || doc.trashedAt || doc.fileType === "unknown" || !doc.ownerMemberId) continue;
    bucket(doc.ownerMemberId).docs.push(doc);
  }
  return byOwner;
}
