// Drive UI model: where a selection may move — the move dialog, drag and drop, and the
// "Move to Store" / "Move to My files" shortcuts all ask these functions.
//
// Pure (no React). Mirrors moveDriveContent in spacetimedb/src/drive/reducers.ts on the
// client's (possibly stale) rows; the module stays authoritative and its errors (cycle,
// space_mismatch, trashed, too_deep) map to drive.errors.*. Rules (DS §6.3, CONTRACTS C21/C22):
// - Same space (and owner, in My files): editor on each item; a document needs manager, or
//   editor plus the Drive edit power (the entry's canMove).
// - Crossing spaces or owners: manager on every moved root and document, and
//   spaceMoveAllowed over every moved row — for the tablet account AND the PIN operator on
//   /store, because the rule names people, not roles.
// - The target container needs contributor: a folder's canAddChildren; the Store root always;
//   a My-files root of an active member O when the actor is O, an org owner/manager, or holds
//   the Drive edit power.

import { spaceMoveAllowed } from "@/lib/drive/access";
import { DRIVE_MAX_DEPTH } from "@/lib/drive/rules";
import { folderContainer, type DriveTree } from "./entries";
import type { DocEntry, DriveEntry, DriveMoveTarget, FileEntry, FolderEntry } from "./types";

export type MoveBlockReason =
  | "virtual" | "noPermission" | "notReady" | "intoSelf" | "intoDescendant" | "mixedOwners" | "descendantOwners"
  | "spaceNotAllowed" | "targetNotWritable" | "targetTrashed" | "tooDeep" | "sameLocation";

export const MOVE_BLOCK_I18N: Readonly<Record<MoveBlockReason, string>> = {
  virtual: "drive.dialogs.blocked.virtual",
  noPermission: "drive.dialogs.blocked.noPermission",
  notReady: "drive.dialogs.blocked.notReady",
  intoSelf: "drive.dialogs.blocked.intoSelf",
  intoDescendant: "drive.dialogs.blocked.intoDescendant",
  mixedOwners: "drive.dialogs.blocked.mixedOwners",
  descendantOwners: "drive.dialogs.blocked.descendantOwners",
  spaceNotAllowed: "drive.dialogs.blocked.spaceNotAllowed",
  targetNotWritable: "drive.dialogs.blocked.targetNotWritable",
  targetTrashed: "drive.dialogs.blocked.targetTrashed",
  tooDeep: "drive.dialogs.blocked.tooDeep",
  sameLocation: "drive.dialogs.blocked.sameLocation",
};

/** One person the module checks a move for. */
export interface MoveActorIdentity {
  memberId: string | null;
  /** Org owner or manager (actorOrgAdmin). */
  orgAdmin: boolean;
}

export interface MoveActor extends MoveActorIdentity {
  /** The effective Drive edit power: same-owner moves inside another member's My files, and their root as a target. */
  canEditAll: boolean;
  /** /store: the account signed in on the tablet (the module checks it as well as the operator); absent elsewhere. */
  caller?: MoveActorIdentity | null;
  /** A store tablet that can't reach My files at all (UseDriveResult.storeOnly): no My-files target. */
  storeOnly?: boolean;
  isActiveMember(memberId: string): boolean;
}

export interface MovePlan {
  /** Selected folders and files; their content moves with them. */
  itemIds: string[];
  /** Selected Docs, Sheets and Slides files. */
  documentIds: string[];
  /** The target with its owner filled in (the actor's for a bare My-files root, the folder's for a folder). */
  target: DriveMoveTarget;
  changesSpace: "toStore" | "toMy" | null;
  /** Everything that moves, descendants included (for the space-change confirmation). */
  affected: { items: number; documents: number };
  blocked: MoveBlockReason | null;
}

type MovableEntry = FolderEntry | FileEntry | DocEntry;

interface Moved {
  entry: MovableEntry;
  /** Live content of a moved folder ([] for files and documents). */
  subtree: readonly DriveEntry[];
}

/** A folder target takes its space and owner from the folder; a bare My-files root is the actor's own. */
function resolveTarget(raw: DriveMoveTarget, tree: DriveTree, actor: MoveActor): { target: DriveMoveTarget; folder: FolderEntry | null; valid: boolean } {
  if (raw.parentId === "") {
    const ownerMemberId = raw.space === "my" ? raw.ownerMemberId || actor.memberId || "" : "";
    return { target: { space: raw.space, parentId: "", ownerMemberId }, folder: null, valid: raw.space === "store" || ownerMemberId !== "" };
  }
  const folder = tree.folders.get(raw.parentId) ?? null;
  if (!folder) return { target: raw, folder: null, valid: false };
  const target = folderContainer(folder);
  const valid = raw.space === target.space && (target.space === "store" || !raw.ownerMemberId || raw.ownerMemberId === target.ownerMemberId);
  return { target, folder, valid };
}

/** Height of an item's live subtree in items (a file or an empty folder is 0), as the module's driveSubtree. */
function itemHeight(folder: FolderEntry, tree: DriveTree, seen: Set<string>): number {
  let height = 0;
  for (const child of tree.childrenOf(folderContainer(folder))) {
    if (child.type !== "folder" && child.type !== "file") continue;
    if (seen.has(child.id)) continue;
    seen.add(child.id);
    height = Math.max(height, 1 + (child.type === "folder" ? itemHeight(child, tree, seen) : 0));
  }
  return height;
}

function firstBlock(moved: readonly Moved[], target: DriveMoveTarget, folder: FolderEntry | null, valid: boolean, tree: DriveTree, actor: MoveActor): MoveBlockReason | null {
  const crosses = (e: MovableEntry): boolean => {
    const from = e.location;
    return !from || from.space !== target.space || (target.space === "my" && from.ownerMemberId !== target.ownerMemberId);
  };
  const itemManagedBy = (owner: string, who: MoveActorIdentity) => who.orgAdmin || (!!who.memberId && owner === who.memberId);
  const manages = (e: MovableEntry): boolean => e.type === "folder" || e.type === "file"
    ? itemManagedBy(e.item.ownerMemberId, actor) && (!actor.caller || itemManagedBy(e.item.ownerMemberId, actor.caller))
    : e.docAccess.canManage;

  // Before the rights check: an unfinished upload has no move right yet, and "wait" is the useful answer.
  const pending = (e: DriveEntry) => e.type === "file" && e.item.status !== "ready";
  if (moved.some(({ entry, subtree }) => pending(entry) || subtree.some(pending))) return "notReady";
  for (const { entry, subtree } of moved) {
    if (!entry.access.canMove || (crosses(entry) && !manages(entry))) return "noPermission";
    // A document inside a moved folder needs what a document moved on its own needs.
    for (const inner of subtree) {
      if ("doc" in inner && !(crosses(entry) ? inner.docAccess.canManage : inner.access.canMove)) return "noPermission";
    }
  }

  const movedFolders = new Set(moved.flatMap(({ entry }) => (entry.type === "folder" ? [entry.id] : [])));
  if (folder) {
    if (movedFolders.has(folder.id)) return "intoSelf";
    if (tree.pathOf(folder).some((f) => movedFolders.has(f.id))) return "intoDescendant";
    if (tree.hasTrashedAncestor(folder)) return "targetTrashed";
  }

  if (!valid) return "targetNotWritable";
  if (folder) {
    if (!folder.access.canAddChildren) return "targetNotWritable";
  } else if (target.space === "my") {
    const owner = target.ownerMemberId;
    const writable = !actor.storeOnly && actor.isActiveMember(owner)
      && (owner === actor.memberId || actor.orgAdmin || actor.canEditAll);
    if (!writable) return "targetNotWritable";
  }

  if (target.space === "my") {
    if (moved.some(({ entry }) => entry.ownerMemberId !== target.ownerMemberId)) return "mixedOwners";
    if (moved.some(({ subtree }) => subtree.some((e) => e.ownerMemberId !== target.ownerMemberId))) return "descendantOwners";
  }

  for (const { entry, subtree } of moved) {
    if (!crosses(entry) || !entry.location) continue;
    const input = {
      fromSpace: entry.location.space,
      fromOwner: entry.ownerMemberId,
      toSpace: target.space,
      toOwner: target.ownerMemberId,
      subtreeOwners: [entry.ownerMemberId, ...subtree.map((e) => e.ownerMemberId)],
      fromOwnerActive: actor.isActiveMember(entry.ownerMemberId),
    };
    const allowedFor = (who: MoveActorIdentity) => spaceMoveAllowed({ ...input, actorMemberId: who.memberId ?? "", actorOrgAdmin: who.orgAdmin });
    if (!allowedFor(actor) || (actor.caller && !allowedFor(actor.caller))) return "spaceNotAllowed";
  }

  const targetDepth = folder ? tree.pathOf(folder).length + 1 : 0;
  for (const { entry } of moved) {
    if (entry.type !== "folder" && entry.type !== "file") continue;
    const height = entry.type === "folder" ? itemHeight(entry, tree, new Set([entry.id])) : 0;
    if (targetDepth + 1 + height > DRIVE_MAX_DEPTH) return "tooDeep";
  }

  const here = (e: MovableEntry) => !!e.location && e.location.space === target.space && e.location.parentId === target.parentId
    && (target.space === "store" || e.location.ownerMemberId === target.ownerMemberId);
  if (moved.every(({ entry }) => here(entry))) return "sameLocation";
  return null;
}

/**
 * What moving `entries` to `target` would do, or why it can't happen (the first reason, in the order above).
 * Folders expand to their live content, which moves with them.
 */
export function planMove(entries: readonly DriveEntry[], target: DriveMoveTarget, tree: DriveTree, actor: MoveActor): MovePlan {
  const resolved = resolveTarget(target, tree, actor);
  const moved: Moved[] = [];
  const itemIds: string[] = [];
  const documentIds: string[] = [];
  const counted = new Set<string>();
  const affected = { items: 0, documents: 0 };
  const count = (e: DriveEntry) => {
    if (e.type === "virtual" || counted.has(e.key)) return;
    counted.add(e.key);
    if (e.type === "folder" || e.type === "file") affected.items += 1;
    else affected.documents += 1;
  };
  let hasVirtual = false;
  for (const entry of entries) {
    if (entry.type === "virtual") {
      hasVirtual = true;
      continue;
    }
    const subtree = entry.type === "folder" ? tree.descendantsOf(entry) : [];
    moved.push({ entry, subtree });
    if (entry.type === "folder" || entry.type === "file") itemIds.push(entry.id);
    else documentIds.push(entry.id);
    count(entry);
    subtree.forEach(count);
  }
  const changes = moved.some(({ entry }) => entry.location?.space !== resolved.target.space);
  const changesSpace = changes ? (resolved.target.space === "store" ? "toStore" : "toMy") : null;
  const blocked: MoveBlockReason | null = entries.length === 0
    ? "sameLocation"
    : hasVirtual
      ? "virtual"
      : firstBlock(moved, resolved.target, resolved.folder, resolved.valid, tree, actor);
  return { itemIds, documentIds, target: resolved.target, changesSpace, affected, blocked };
}

/**
 * The roots the move dialog offers: the Store root, and the My-files root of the one member who owns every
 * entry and everything inside. A root is offered when a move there is allowed or the entries are already there;
 * an admin moving someone else's private content keeps it inside that member's My files.
 */
export function moveRoots(entries: readonly DriveEntry[], tree: DriveTree, actor: MoveActor): { my: DriveMoveTarget | null; store: DriveMoveTarget | null } {
  if (entries.length === 0 || entries.some((e) => e.type === "virtual")) return { my: null, store: null };
  const offered = (target: DriveMoveTarget): DriveMoveTarget | null => {
    const blocked = planMove(entries, target, tree, actor).blocked;
    return blocked === null || blocked === "sameLocation" ? target : null;
  };
  const owners = new Set<string>();
  for (const entry of entries) {
    owners.add(entry.ownerMemberId);
    if (entry.type === "folder") for (const inner of tree.descendantsOf(entry)) owners.add(inner.ownerMemberId);
  }
  const [owner] = owners;
  const my = owners.size === 1 && owner ? offered({ space: "my", parentId: "", ownerMemberId: owner }) : null;
  return { my, store: offered({ space: "store", parentId: "", ownerMemberId: "" }) };
}

/** Whether a drag of `dragged` may drop on `target` (a move that would change nothing is not a drop). */
export function canDropOn(dragged: readonly DriveEntry[], target: DriveMoveTarget, tree: DriveTree, actor: MoveActor): boolean {
  return planMove(dragged, target, tree, actor).blocked === null;
}
