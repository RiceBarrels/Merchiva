// Drive UI model: what one view of the Drive home lists — a section, a folder, a member's
// files, a search — plus sorting, date groups, the empty state and the members summary.
//
// Pure (no React). Every function reads the tree built by ./entries (the actor's access is
// already on each entry); trash roots and shared-with-me come from lib/drive/model.ts, search
// normalization and date groups from the docs list model (components/docs/home/doc-list-model.ts).

import { docDateGroup, normalizeSearchText, type DocDateGroup } from "@/components/docs/home/doc-list-model";
import type { DocumentMeta } from "@/lib/docs/types";
import { trashRoots } from "@/lib/drive/model";
import type { DriveItem } from "@/lib/drive/types";
import { entrySizeBytes } from "./entry-size";
import { docEntryKey, folderContainer, itemEntryKey, type DriveTree } from "./entries";
import type {
  DriveCrumb,
  DriveDocKind,
  DriveEntry,
  DriveMoveTarget,
  DriveSection,
  DriveSort,
  DriveTypeFilter,
  FolderEntry,
  VirtualSourceId,
} from "./types";

export interface ListingQuery {
  section: DriveSection;
  folderId: string;
  memberId: string;
  source: VirtualSourceId | "";
  type: DriveTypeFilter;
  q: string;
  locale?: string;
  /** Labels of nameless entries (drive.list.untitled.*): searching for one finds them. */
  untitled: Readonly<Record<"folder" | DriveDocKind | "file", string>>;
  /** Display name of `memberId` for its crumb; absent → the name on one of their entries, else "former member". */
  memberName?: string | null;
}

export interface ListingActor { memberId: string | null; canViewAll: boolean; canEditAll: boolean }

export interface DriveListing {
  entries: DriveEntry[];
  flat: boolean;
  folder: FolderEntry | null;
  /** The folder param names a folder this client can't see (here), or one that is trashed / has a trashed ancestor. */
  missingFolder: boolean;
  crumbs: DriveCrumb[];
  /** Where uploads and New land from this view; null = disabled (members, trash, apps, missing folder). */
  createTarget: DriveMoveTarget | null;
}

export const RECENT_LIMIT = 100;
export const FLAT_RESULT_LIMIT = 500;

const live = (entry: DriveEntry): boolean => entry.trashedAt === null;

/** Most recent of "changed" and "opened on this device" (Recent lists and groups by it). */
export function entryRecentTime(entry: DriveEntry): number {
  return Math.max(entry.updatedAt, entry.openedAt ?? 0);
}

function untitledLabel(entry: DriveEntry, query: ListingQuery): string {
  switch (entry.type) {
    case "folder":
    case "file":
    case "doc":
    case "sheet":
    case "slides":
      return query.untitled[entry.type];
    case "virtual":
      return query.untitled.file;
  }
}

function matchesType(entry: DriveEntry, type: DriveTypeFilter): boolean {
  switch (type) {
    case "all":
      return true;
    case "folder":
    case "doc":
    case "sheet":
    case "slides":
      return entry.type === type;
    case "image":
    case "pdf":
    case "video":
    case "audio":
      return (entry.type === "file" || entry.type === "virtual") && entry.fileKind === type;
    case "other":
      return (entry.type === "file" || entry.type === "virtual")
        && entry.fileKind !== "image" && entry.fileKind !== "pdf" && entry.fileKind !== "video" && entry.fileKind !== "audio";
  }
}

/** Search over the name (or the untitled label) and, for documents, the excerpt. */
function matcher(query: ListingQuery): (entry: DriveEntry) => boolean {
  const q = normalizeSearchText(query.q, query.locale);
  return (entry) => {
    if (!matchesType(entry, query.type)) return false;
    if (!q) return true;
    const name = entry.name.trim() ? entry.name : untitledLabel(entry, query);
    if (normalizeSearchText(name, query.locale).includes(q)) return true;
    return "doc" in entry && normalizeSearchText(entry.doc.excerpt, query.locale).includes(q);
  };
}

/** The newest FLAT_RESULT_LIMIT, so a cut list keeps what people most likely want. */
function capFlat(entries: DriveEntry[]): DriveEntry[] {
  if (entries.length <= FLAT_RESULT_LIMIT) return entries;
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt || compareKeys(a, b)).slice(0, FLAT_RESULT_LIMIT);
}

const compareKeys = (a: DriveEntry, b: DriveEntry): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function inContainerSpace(entry: DriveEntry, container: DriveMoveTarget): boolean {
  const location = entry.location;
  return !!location && location.space === container.space
    && (container.space === "store" || location.ownerMemberId === container.ownerMemberId);
}

function sectionCrumb(section: DriveSection): DriveCrumb {
  return { key: `section:${section}`, label: null, labelKey: `drive.nav.${section}`, params: { space: section }, dropTarget: null };
}

function folderCrumbs(path: readonly FolderEntry[], section: DriveSection, memberId: string): DriveCrumb[] {
  return path.map((folder) => ({
    key: folder.key,
    label: folder.name,
    labelKey: null,
    params: section === "members" ? { space: section, member: memberId, folder: folder.id } : { space: section, folder: folder.id },
    dropTarget: folderContainer(folder),
  }));
}

function memberCrumb(tree: DriveTree, query: ListingQuery): DriveCrumb {
  const member = query.memberId;
  const name = query.memberName
    ?? tree.entries.find((entry) => entry.ownerMemberId === member && entry.ownerName !== null)?.ownerName
    ?? null;
  return {
    key: `member:${member}`,
    label: null,
    labelKey: name === null ? "drive.list.formerMember" : "drive.nav.memberFiles",
    ...(name === null ? {} : { labelVars: { name } }),
    params: { space: "members", member },
    dropTarget: { space: "my", parentId: "", ownerMemberId: member },
  };
}

/** A container section: My files, Store, or one member's My files. */
function listContainerSection(tree: DriveTree, query: ListingQuery, container: DriveMoveTarget, root: DriveCrumb[], canCreateAtRoot: boolean): DriveListing {
  const match = matcher(query);
  const searching = query.q.trim() !== "";
  let folder: FolderEntry | null = null;
  let missingFolder = false;
  if (query.folderId) {
    const found = tree.folders.get(query.folderId);
    if (found && inContainerSpace(found, container) && !tree.hasTrashedAncestor(found)) folder = found;
    else missingFolder = true;
  }
  const crumbs = [...root, ...(folder ? folderCrumbs([...tree.pathOf(folder), folder], query.section, query.memberId) : [])];
  if (missingFolder) return { entries: [], flat: false, folder: null, missingFolder, crumbs, createTarget: null };

  const here: DriveMoveTarget = folder ? folderContainer(folder) : container;
  const entries = searching
    ? capFlat((folder ? tree.descendantsOf(folder) : tree.entries.filter((e) => live(e) && inContainerSpace(e, container))).filter(match))
    : tree.childrenOf(here).filter(match);
  const createTarget = (folder ? folder.access.canAddChildren : canCreateAtRoot) ? here : null;
  return { entries, flat: searching, folder, missingFolder: false, crumbs, createTarget };
}

/** One view of the Drive home. Sort it with sortDriveEntries. */
export function listDriveEntries(tree: DriveTree, query: ListingQuery, actor: ListingActor): DriveListing {
  const me = actor.memberId;
  const myRoot: DriveMoveTarget | null = me ? { space: "my", parentId: "", ownerMemberId: me } : null;
  const flat = (entries: DriveEntry[], createTarget: DriveMoveTarget | null, crumbs: DriveCrumb[] = [sectionCrumb(query.section)]): DriveListing =>
    ({ entries, flat: true, folder: null, missingFolder: false, crumbs, createTarget });
  const match = matcher(query);

  switch (query.section) {
    case "my": {
      const root = { ...sectionCrumb("my"), dropTarget: myRoot };
      // The member isn't known yet (still loading): nothing to list, and no "folder not found" flash.
      if (!myRoot) return { entries: [], flat: false, folder: null, missingFolder: false, crumbs: [root], createTarget: null };
      return listContainerSection(tree, query, myRoot, [root], true);
    }
    case "store": {
      const storeRoot: DriveMoveTarget = { space: "store", parentId: "", ownerMemberId: "" };
      return listContainerSection(tree, query, storeRoot, [{ ...sectionCrumb("store"), dropTarget: storeRoot }], true);
    }
    case "members": {
      const root = sectionCrumb("members");
      if (!actor.canViewAll || !query.memberId) return { entries: [], flat: false, folder: null, missingFolder: false, crumbs: [root], createTarget: null };
      const container: DriveMoveTarget = { space: "my", parentId: "", ownerMemberId: query.memberId };
      // Admins look at a member's files; nothing is created there from this view.
      return { ...listContainerSection(tree, query, container, [root, memberCrumb(tree, query)], false), createTarget: null };
    }
    case "shared":
      return flat(capFlat(tree.entries.filter((e) => live(e) && "doc" in e && e.sharedWithMe && match(e))), myRoot);
    case "starred":
      return flat(capFlat(tree.entries.filter((e) => live(e) && e.starred && e.access.canOpen && match(e))), myRoot);
    case "recent": {
      const recent = tree.entries
        .filter((e) => live(e) && e.type !== "folder" && e.type !== "virtual"
          && (e.isMine || e.location?.space === "store" || ("doc" in e && e.sharedWithMe) || e.openedAt !== null) && match(e))
        .sort((a, b) => entryRecentTime(b) - entryRecentTime(a) || compareKeys(a, b))
        .slice(0, RECENT_LIMIT);
      return flat(recent, myRoot);
    }
    case "trash": {
      const items: DriveItem[] = [];
      const docs: DocumentMeta[] = [];
      for (const entry of tree.entries) {
        if (entry.type === "folder" || entry.type === "file") items.push(entry.item);
        else if (entry.type !== "virtual") docs.push(entry.doc);
      }
      const roots = trashRoots({ items, docs });
      const keys = [...roots.items.map((item) => itemEntryKey(item.id)), ...roots.docs.map((doc) => docEntryKey(doc.id))];
      const entries = keys.flatMap((key) => {
        const entry = tree.byKey.get(key);
        return entry && entry.access.canRestore && match(entry) ? [entry] : [];
      });
      return flat(capFlat(entries), null);
    }
    case "apps": {
      const crumbs = [sectionCrumb("apps")];
      if (!query.source) return flat([], null, crumbs);
      crumbs.push({ key: `source:${query.source}`, label: null, labelKey: `drive.apps.sources.${query.source}`, params: { space: "apps", source: query.source }, dropTarget: null });
      const entries = tree.entries.filter((e) => e.type === "virtual" && e.source === query.source && match(e));
      return flat(capFlat(entries), null, crumbs);
    }
  }
}

// ── Sorting and groups ───────────────────────────────────────────────────────

const collators = new Map<string, Intl.Collator>();

function collatorFor(locale?: string): Intl.Collator {
  const key = locale ?? "";
  let collator = collators.get(key);
  if (!collator) {
    try {
      collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    } catch {
      collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    }
    collators.set(key, collator);
  }
  return collator;
}

/**
 * Folders first (except in Recent and Trash). Name: A→Z (numeric, accent- and case-blind), nameless last.
 * Modified / created: newest first (Recent uses the later of changed and opened). Size: files, documents and app files
 * with a known size largest first, then everything without one by name. Trash is always newest-trashed first. Ties break on the key.
 */
export function sortDriveEntries(entries: readonly DriveEntry[], sort: DriveSort, section: DriveSection, locale?: string): DriveEntry[] {
  const collator = collatorFor(locale);
  const byName = (a: DriveEntry, b: DriveEntry): number => {
    const an = a.name.trim();
    const bn = b.name.trim();
    if (!an !== !bn) return an ? -1 : 1;
    return collator.compare(an, bn);
  };
  const size = entrySizeBytes;
  const compare = (a: DriveEntry, b: DriveEntry): number => {
    if (section === "trash") return (b.trashedAt ?? 0) - (a.trashedAt ?? 0);
    switch (sort) {
      case "name":
        return byName(a, b);
      case "modified":
        return section === "recent" ? entryRecentTime(b) - entryRecentTime(a) : b.updatedAt - a.updatedAt;
      case "created":
        return b.createdAt - a.createdAt;
      case "size": {
        const as = size(a);
        const bs = size(b);
        if (as !== null && bs !== null) return bs - as;
        if (as !== null || bs !== null) return as !== null ? -1 : 1;
        return byName(a, b);
      }
    }
  };
  const foldersFirst = section !== "recent" && section !== "trash";
  return [...entries].sort((a, b) => {
    if (foldersFirst && (a.type === "folder") !== (b.type === "folder")) return a.type === "folder" ? -1 : 1;
    return compare(a, b) || compareKeys(a, b);
  });
}

export type DriveGroupId = DocDateGroup;
const GROUP_ORDER: readonly DriveGroupId[] = ["today", "week", "month", "earlier"];

/** Date groups of already-sorted entries: Recent with the modified sort only; else null. */
export function groupDriveEntries(
  sorted: readonly DriveEntry[],
  section: DriveSection,
  sort: DriveSort,
  now: number,
): { id: DriveGroupId; entries: DriveEntry[] }[] | null {
  if (section !== "recent" || sort !== "modified") return null;
  const buckets = new Map<DriveGroupId, DriveEntry[]>();
  for (const entry of sorted) {
    const id = docDateGroup(entryRecentTime(entry), now);
    const list = buckets.get(id);
    if (list) list.push(entry);
    else buckets.set(id, [entry]);
  }
  return GROUP_ORDER.flatMap((id) => {
    const entries = buckets.get(id);
    return entries ? [{ id, entries }] : [];
  });
}

// ── Empty states ─────────────────────────────────────────────────────────────

export type DriveEmptyKind =
  | "my" | "store" | "folder" | "shared" | "recent" | "starred" | "trash" | "member" | "apps" | "search" | "missingFolder";

/** Which empty state an empty listing shows. */
export function driveEmptyKind(query: ListingQuery, listing: DriveListing): DriveEmptyKind {
  if (listing.missingFolder) return "missingFolder";
  if (query.q.trim() !== "" || query.type !== "all") return "search";
  switch (query.section) {
    case "my":
    case "store":
      return query.folderId ? "folder" : query.section;
    case "members":
      return query.folderId ? "folder" : "member";
    case "shared":
    case "recent":
    case "starred":
    case "trash":
    case "apps":
      return query.section;
  }
}

// ── Members' files ───────────────────────────────────────────────────────────

export interface DriveMemberSummary {
  memberId: string; name: string | null; role: string; active: boolean; former: boolean; fileCount: number;
  /** Sum of the known sizes; null when the member has files but none with a recorded size (unknown, not 0 B). */
  bytes: number | null;
}

/**
 * One row per org member (active first, then disabled, each by name), then one "former member" row per owner of
 * My files who has no member row any more (leaveOrg deletes it) — their files stay reachable to admins. Counts
 * are live files and documents in that person's My files; bytes are their known sizes (files, and documents
 * with a recorded size), or null when none of them has one.
 */
export function summarizeMembers(
  tree: DriveTree,
  members: readonly { id: string; name: string; role: string; active: boolean }[],
): DriveMemberSummary[] {
  const stats = new Map<string, { fileCount: number; sized: number; bytes: number }>();
  for (const entry of tree.entries) {
    const owner = entry.location?.space === "my" ? entry.location.ownerMemberId : "";
    if (!owner || !live(entry)) continue;
    const s = stats.get(owner) ?? { fileCount: 0, sized: 0, bytes: 0 };
    stats.set(owner, s);
    if (entry.type === "folder" || (entry.type === "file" && entry.uploading !== null)) continue;
    s.fileCount += 1;
    const bytes = entrySizeBytes(entry);
    if (bytes === null) continue;
    s.sized += 1;
    s.bytes += bytes;
  }
  const collator = collatorFor();
  const statsOf = (id: string): Pick<DriveMemberSummary, "fileCount" | "bytes"> => {
    const s = stats.get(id);
    if (!s) return { fileCount: 0, bytes: 0 };
    return { fileCount: s.fileCount, bytes: s.fileCount > 0 && s.sized === 0 ? null : s.bytes };
  };
  const rows = [...members]
    .sort((a, b) => Number(b.active) - Number(a.active) || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m): DriveMemberSummary => ({ memberId: m.id, name: m.name, role: m.role, active: m.active, former: false, ...statsOf(m.id) }));
  const known = new Set(members.map((m) => m.id));
  const former = [...stats.keys()]
    .filter((id) => !known.has(id))
    .sort()
    .map((id): DriveMemberSummary => ({ memberId: id, name: null, role: "", active: false, former: true, ...statsOf(id) }));
  return [...rows, ...former];
}
