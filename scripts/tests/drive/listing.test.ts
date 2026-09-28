// components/drive/model/listing.ts — sections, search, sorting, groups, empty states, members' files.
import { describe, expect, test } from "bun:test";
import { buildDriveEntries, buildDriveTree, type DriveTree } from "@/components/drive/model/entries";
import {
  FLAT_RESULT_LIMIT,
  RECENT_LIMIT,
  driveEmptyKind,
  entryRecentTime,
  groupDriveEntries,
  listDriveEntries,
  sortDriveEntries,
  summarizeMembers,
  type ListingActor,
  type ListingQuery,
} from "@/components/drive/model/listing";
import type { DriveEntry, VirtualEntry } from "@/components/drive/model/types";
import { resolveDocAccess, type DocsGatePermissions } from "@/lib/docs/access";
import type { DocAccessGrant, DocumentMeta } from "@/lib/docs/types";
import { driveAdminAccess, resolveDriveItemAccess } from "@/lib/drive/access";
import type { DriveItem } from "@/lib/drive/types";
import type { OrgRole } from "@/lib/types";

const ORG = "org-1";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
interface Member { id: string; role: OrgRole; permissions?: DocsGatePermissions }
const GATE: DocsGatePermissions = { dashboard: { view: true } };
const ANA: Member = { id: uuid(), role: "staff", permissions: GATE };
const BEN: Member = { id: uuid(), role: "staff", permissions: GATE };
const MANAGER: Member = { id: uuid(), role: "manager", permissions: GATE };

function item(patch: Partial<DriveItem> = {}): DriveItem {
  return {
    id: uuid(), organizationId: ORG, space: "my", parentId: "", kind: "file", name: "a.pdf", mimeType: "application/pdf",
    sizeBytes: 10, blobKey: "", thumbKey: "", thumbBytes: 0, etag: "e", ownerMemberId: ANA.id, createdByMemberId: ANA.id,
    uploaderIdentityHex: "aa", status: "ready", uploadExpiresAt: new Date(0), uploadAttempts: 1, trashed: false,
    trashRootId: "", trashedAt: null, trashedByMemberId: "", createdAt: new Date(1_000), updatedAt: new Date(2_000),
    lastEditorMemberId: ANA.id, ...patch,
  };
}
const folder = (patch: Partial<DriveItem> = {}) => item({ kind: "folder", name: "F", mimeType: "", sizeBytes: 0, ...patch });
const trashedRoot = (patch: Partial<DriveItem>, at: number) => {
  const row = item({ trashed: true, trashedAt: new Date(at), ...patch });
  return { ...row, trashRootId: row.id };
};
function doc(patch: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: uuid(), organizationId: ORG, ownerMemberId: ANA.id, title: "Doc", excerpt: "", icon: null, visibility: "private",
    templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(1_000), updatedAt: new Date(3_000),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType: "doc", folderId: "", ...patch,
  };
}

function treeFor(actor: Member, items: DriveItem[], docs: DocumentMeta[] = [], opts: { grants?: DocAccessGrant[]; opened?: [string, number][]; extra?: DriveEntry[] } = {}): DriveTree {
  const grants = opts.grants ?? [];
  const docAccess = (d: DocumentMeta) => resolveDocAccess({ doc: d, memberId: actor.id, orgRole: actor.role, permissions: actor.permissions, grants });
  const admin = driveAdminAccess(actor.role, actor.permissions);
  const entries = buildDriveEntries({
    drive: {
      items, itemsById: new Map(items.map((i) => [i.id, i])),
      documents: docs.filter((d) => !d.trashedAt && docAccess(d).canView),
      trashedDocuments: docs.filter((d) => d.trashedAt && docAccess(d).canManage),
      grants, starredItemIds: new Set(items.filter((i) => i.name.startsWith("*")).map((i) => i.id)), starredDocumentIds: new Set(),
      accessForItem: (i) => resolveDriveItemAccess(i, { organizationId: ORG, memberId: actor.id, role: actor.role, gate: true, canViewAll: admin.view, canEditAll: admin.edit }),
      accessForDocument: docAccess, admin,
    },
    ceiling: null,
    actor: { memberId: actor.id, surface: "manager", acting: false },
    memberNames: new Map([[ANA.id, "Ana"], [BEN.id, "Ben"]]),
    openedMap: new Map(opts.opened ?? []),
    localUploadIds: new Set(),
  });
  return buildDriveTree([...entries, ...(opts.extra ?? [])]);
}

const UNTITLED = { folder: "Untitled folder", doc: "Untitled document", sheet: "Untitled spreadsheet", slides: "Untitled presentation", file: "Untitled file" };
const query = (patch: Partial<ListingQuery>): ListingQuery => ({ section: "my", folderId: "", memberId: "", source: "", type: "all", q: "", untitled: UNTITLED, ...patch });
const actorOf = (m: Member, admin = false): ListingActor => ({ memberId: m.id, canViewAll: admin, canEditAll: admin });
const ids = (entries: readonly DriveEntry[]) => entries.map((e) => e.id).sort();

describe("listDriveEntries — sections", () => {
  const top = folder({ name: "Top" });
  const sub = folder({ name: "Sub", parentId: top.id });
  const deep = item({ name: "deep report.pdf", parentId: sub.id });
  const rootFile = item({ name: "root.png", mimeType: "image/png" });
  const storeFolder = folder({ space: "store", ownerMemberId: BEN.id, name: "Shared stuff" });
  const storeFile = item({ space: "store", ownerMemberId: BEN.id, name: "menu.pdf" });
  const bensPrivate = item({ ownerMemberId: BEN.id, name: "ben.pdf" });
  const myDoc = doc({ title: "Plan", excerpt: "quarterly numbers", folderId: top.id });
  const items = [top, sub, deep, rootFile, storeFolder, storeFile, bensPrivate];

  test("My files: children of the open folder, with crumbs and a create target", () => {
    const tree = treeFor(ANA, items, [myDoc]);
    const root = listDriveEntries(tree, query({}), actorOf(ANA));
    expect(ids(root.entries)).toEqual([top.id, rootFile.id].sort());
    expect([root.flat, root.folder, root.missingFolder]).toEqual([false, null, false]);
    expect(root.createTarget).toEqual({ space: "my", parentId: "", ownerMemberId: ANA.id });
    expect(root.crumbs.map((c) => c.labelKey)).toEqual(["drive.nav.my"]);
    expect(root.crumbs[0].dropTarget).toEqual({ space: "my", parentId: "", ownerMemberId: ANA.id });

    const inTop = listDriveEntries(tree, query({ folderId: top.id }), actorOf(ANA));
    expect(ids(inTop.entries)).toEqual([sub.id, myDoc.id].sort());
    expect(inTop.folder?.id).toBe(top.id);
    expect(inTop.createTarget).toEqual({ space: "my", parentId: top.id, ownerMemberId: ANA.id });
    const inSub = listDriveEntries(tree, query({ folderId: sub.id }), actorOf(ANA));
    expect(inSub.crumbs.map((c) => c.label ?? c.labelKey)).toEqual(["drive.nav.my", "Top", "Sub"]);
    expect(inSub.crumbs[2].params).toEqual({ space: "my", folder: sub.id });
    expect(inSub.crumbs[1].dropTarget).toEqual({ space: "my", parentId: top.id, ownerMemberId: ANA.id });
  });

  test("Store: everyone's store content; the root is always a create target", () => {
    const tree = treeFor(ANA, items);
    const store = listDriveEntries(tree, query({ section: "store" }), actorOf(ANA));
    expect(ids(store.entries)).toEqual([storeFolder.id, storeFile.id].sort());
    expect(store.createTarget).toEqual({ space: "store", parentId: "", ownerMemberId: "" });
    const inFolder = listDriveEntries(tree, query({ section: "store", folderId: storeFolder.id }), actorOf(ANA));
    expect(inFolder.createTarget).toEqual({ space: "store", parentId: storeFolder.id, ownerMemberId: "" });
  });

  test("Members' files: admins only, never a create target; crumbs name the member", () => {
    const managerTree = treeFor(MANAGER, items);
    expect(listDriveEntries(managerTree, query({ section: "members", memberId: BEN.id }), actorOf(MANAGER)).entries).toEqual([]);
    const listing = listDriveEntries(managerTree, query({ section: "members", memberId: BEN.id }), actorOf(MANAGER, true));
    expect(ids(listing.entries)).toEqual([bensPrivate.id]);
    expect(listing.createTarget).toBeNull();
    expect(listing.crumbs.map((c) => c.labelKey)).toEqual(["drive.nav.members", "drive.nav.memberFiles"]);
    expect(listing.crumbs[1].labelVars).toEqual({ name: "Ben" });
    const named = listDriveEntries(managerTree, query({ section: "members", memberId: MANAGER.id, memberName: "Mia" }), actorOf(MANAGER, true));
    expect(named.crumbs[1].labelVars).toEqual({ name: "Mia" });
    const gone = listDriveEntries(managerTree, query({ section: "members", memberId: uuid() }), actorOf(MANAGER, true));
    expect(gone.crumbs[1].labelKey).toBe("drive.list.formerMember");
    expect(listDriveEntries(managerTree, query({ section: "members" }), actorOf(MANAGER, true)).entries).toEqual([]);
  });

  test("Shared with me, Starred and Recent are flat and create in My files", () => {
    const shared = doc({ ownerMemberId: BEN.id, title: "Rota" });
    const grant: DocAccessGrant = { id: "g", documentId: shared.id, organizationId: ORG, memberId: ANA.id, role: "editor", grantedByMemberId: BEN.id, createdAt: new Date(0), updatedAt: new Date(0) };
    const starred = item({ name: "*star.pdf" });
    const opened = doc({ ownerMemberId: BEN.id, visibility: "org_view", updatedAt: new Date(1) });
    const tree = treeFor(ANA, [...items, starred], [myDoc, shared, opened], { grants: [grant], opened: [[opened.id, 50_000]] });
    const sharedList = listDriveEntries(tree, query({ section: "shared" }), actorOf(ANA));
    expect([ids(sharedList.entries), sharedList.flat, sharedList.createTarget?.space]).toEqual([[shared.id], true, "my"]);
    expect(ids(listDriveEntries(tree, query({ section: "starred" }), actorOf(ANA)).entries)).toEqual([starred.id]);
    const recent = listDriveEntries(tree, query({ section: "recent" }), actorOf(ANA)).entries;
    expect(recent[0].id).toBe(opened.id); // opened here most recently
    expect(recent.some((e) => e.type === "folder")).toBe(false);
    expect(recent.some((e) => e.id === bensPrivate.id)).toBe(false);
    expect(recent.map((e) => e.id)).toContain(storeFile.id);
  });

  test("Recent keeps the newest RECENT_LIMIT", () => {
    const many = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => item({ updatedAt: new Date(10_000 + i) }));
    const recent = listDriveEntries(treeFor(ANA, many), query({ section: "recent" }), actorOf(ANA)).entries;
    expect(recent.length).toBe(RECENT_LIMIT);
    expect(recent[0].id).toBe(many[many.length - 1].id);
  });

  test("Trash: trash roots only, cascaded documents come back with their folder", () => {
    const gone = trashedRoot({ kind: "folder", name: "Old", mimeType: "" }, 5_000);
    const inside = item({ parentId: gone.id, trashed: true, trashRootId: gone.id, trashedAt: new Date(5_000) });
    const cascaded = doc({ folderId: gone.id, trashedAt: new Date(5_000) });
    const alone = doc({ trashedAt: new Date(6_000) });
    const bensRoot = trashedRoot({ space: "store", ownerMemberId: BEN.id }, 7_000);
    const tree = treeFor(ANA, [gone, inside, bensRoot], [cascaded, alone]);
    const trash = listDriveEntries(tree, query({ section: "trash" }), actorOf(ANA));
    expect(ids(trash.entries)).toEqual([gone.id, alone.id].sort());
    expect(trash.createTarget).toBeNull();
    expect(sortDriveEntries(trash.entries, "name", "trash").map((e) => e.id)).toEqual([alone.id, gone.id]);
  });

  test("Stored in apps: one source's entries", () => {
    const v = (source: "bugs" | "chat", id: string): VirtualEntry => ({
      key: `v:${source}:${id}`, id, name: id, createdAt: 0, updatedAt: 0, ownerMemberId: "", ownerName: null, isMine: false,
      starred: false, trashedAt: null, openedAt: null, location: null,
      access: { canOpen: true, canDownload: true, canRename: false, canMove: false, canTrash: false, canRestore: false, canDeleteForever: false, canShare: false, canStar: false, canAddChildren: false },
      type: "virtual", source, url: "https://x.test/a.png", fileKind: "image", mimeType: "image/png", group: "", originRoute: null,
    });
    const tree = treeFor(ANA, [], [], { extra: [v("bugs", "b1"), v("chat", "c1")] });
    expect(listDriveEntries(tree, query({ section: "apps" }), actorOf(ANA)).entries).toEqual([]);
    const bugs = listDriveEntries(tree, query({ section: "apps", source: "bugs" }), actorOf(ANA));
    expect(bugs.entries.map((e) => e.id)).toEqual(["b1"]);
    expect(bugs.crumbs.map((c) => c.labelKey)).toEqual(["drive.nav.apps", "drive.apps.sources.bugs"]);
    expect(bugs.createTarget).toBeNull();
  });

  test("missing, trashed or foreign folders: missingFolder and no create target", () => {
    const trashed = trashedRoot({ kind: "folder", name: "T", mimeType: "" }, 1);
    const tree = treeFor(ANA, [...items, trashed]);
    for (const q of [query({ folderId: uuid() }), query({ folderId: trashed.id }), query({ folderId: storeFolder.id }), query({ section: "store", folderId: top.id })]) {
      const listing = listDriveEntries(tree, q, actorOf(ANA));
      expect([listing.missingFolder, listing.createTarget, listing.entries.length]).toEqual([true, null, 0]);
      expect(driveEmptyKind(q, listing)).toBe("missingFolder");
    }
  });

  test("search covers the whole container subtree, flat, by name, untitled label and excerpt", () => {
    const untitled = doc({ title: "" });
    const tree = treeFor(ANA, items, [myDoc, untitled]);
    const hit = listDriveEntries(tree, query({ q: "DEEP" }), actorOf(ANA));
    expect([hit.flat, ids(hit.entries)]).toEqual([true, [deep.id]]);
    expect(ids(listDriveEntries(tree, query({ q: "quarterly" }), actorOf(ANA)).entries)).toEqual([myDoc.id]);
    expect(ids(listDriveEntries(tree, query({ q: "untitled doc" }), actorOf(ANA)).entries)).toEqual([untitled.id]);
    // Inside a folder: only its subtree; other spaces never.
    expect(ids(listDriveEntries(tree, query({ folderId: sub.id, q: "pdf" }), actorOf(ANA)).entries)).toEqual([deep.id]);
    expect(ids(listDriveEntries(tree, query({ q: "menu" }), actorOf(ANA)).entries)).toEqual([]);
    expect(ids(listDriveEntries(tree, query({ section: "store", q: "menu" }), actorOf(ANA)).entries)).toEqual([storeFile.id]);
  });

  test("type filter", () => {
    const tree = treeFor(ANA, items, [myDoc, doc({ fileType: "sheet" })]);
    expect(ids(listDriveEntries(tree, query({ type: "folder" }), actorOf(ANA)).entries)).toEqual([top.id]);
    expect(ids(listDriveEntries(tree, query({ type: "image" }), actorOf(ANA)).entries)).toEqual([rootFile.id]);
    expect(listDriveEntries(tree, query({ type: "sheet" }), actorOf(ANA)).entries.map((e) => e.type)).toEqual(["sheet"]);
    expect(ids(listDriveEntries(tree, query({ type: "pdf", q: "report" }), actorOf(ANA)).entries)).toEqual([deep.id]);
    expect(listDriveEntries(tree, query({ type: "other" }), actorOf(ANA)).entries).toEqual([]);
  });

  test("flat lists are capped at FLAT_RESULT_LIMIT, newest kept", () => {
    const many = Array.from({ length: FLAT_RESULT_LIMIT + 3 }, (_, i) => item({ name: `x${i}.pdf`, updatedAt: new Date(i) }));
    const hits = listDriveEntries(treeFor(ANA, many), query({ q: "x" }), actorOf(ANA)).entries;
    expect(hits.length).toBe(FLAT_RESULT_LIMIT);
    expect(hits.some((e) => e.id === many[0].id)).toBe(false);
  });
});

describe("sortDriveEntries / groupDriveEntries", () => {
  const f2 = folder({ name: "b folder", updatedAt: new Date(1) });
  const f10 = folder({ name: "B folder 10", updatedAt: new Date(2) });
  const small = item({ name: "file 2.pdf", sizeBytes: 5, createdAt: new Date(30), updatedAt: new Date(300) });
  const big = item({ name: "file 10.pdf", sizeBytes: 50, createdAt: new Date(10), updatedAt: new Date(100) });
  const nameless = doc({ title: "", updatedAt: new Date(200), createdAt: new Date(20) });
  const named = doc({ title: "A doc", updatedAt: new Date(50), createdAt: new Date(40) });
  const tree = treeFor(ANA, [f2, f10, small, big], [nameless, named]);
  const all = tree.entries;
  const order = (sort: "name" | "modified" | "created" | "size", section: "my" | "recent" = "my") => sortDriveEntries(all, sort, section, "en").map((e) => e.id);

  test("folders first; name is numeric and case-blind with untitled last", () => {
    expect(order("name")).toEqual([f2.id, f10.id, named.id, small.id, big.id, nameless.id]);
  });
  test("modified / created newest first; size largest file first then by name", () => {
    expect(order("modified")).toEqual([f10.id, f2.id, small.id, nameless.id, big.id, named.id]);
    expect(order("created")).toEqual([f2.id, f10.id, named.id, small.id, nameless.id, big.id]);
    expect(order("size")).toEqual([f2.id, f10.id, big.id, small.id, named.id, nameless.id]);
  });
  test("Recent: no folders-first, the later of changed and opened", () => {
    const opened = { ...all.find((e) => e.id === big.id)!, openedAt: 10_000 };
    const list = sortDriveEntries([...all.filter((e) => e.id !== big.id), opened], "modified", "recent");
    expect(list[0].id).toBe(big.id);
    expect(entryRecentTime(opened)).toBe(10_000);
  });
  test("groups only for Recent sorted by modified", () => {
    const now = new Date(2026, 8, 27, 12).getTime();
    const today = { ...all[2], updatedAt: now - 1_000, openedAt: null };
    const old = { ...all[3], updatedAt: new Date(2026, 5, 1).getTime(), openedAt: null };
    const groups = groupDriveEntries([today, old], "recent", "modified", now);
    expect(groups?.map((g) => [g.id, g.entries.length])).toEqual([["today", 1], ["earlier", 1]]);
    expect(groupDriveEntries([today], "my", "modified", now)).toBeNull();
    expect(groupDriveEntries([today], "recent", "name", now)).toBeNull();
  });
});

describe("driveEmptyKind", () => {
  const listing = { entries: [], flat: false, folder: null, missingFolder: false, crumbs: [], createTarget: null };
  test("per section, search wins over the section", () => {
    expect(driveEmptyKind(query({}), listing)).toBe("my");
    expect(driveEmptyKind(query({ folderId: "f" }), listing)).toBe("folder");
    expect(driveEmptyKind(query({ section: "store" }), listing)).toBe("store");
    expect(driveEmptyKind(query({ section: "members", memberId: "m" }), listing)).toBe("member");
    for (const section of ["shared", "recent", "starred", "trash", "apps"] as const) expect(driveEmptyKind(query({ section }), listing)).toBe(section);
    expect(driveEmptyKind(query({ q: " x " }), listing)).toBe("search");
    expect(driveEmptyKind(query({ section: "trash", type: "pdf" }), listing)).toBe("search");
    expect(driveEmptyKind(query({ q: "x" }), { ...listing, missingFolder: true })).toBe("missingFolder");
  });
});

describe("summarizeMembers", () => {
  test("active first, then disabled, then former owners with no member row", () => {
    const formerId = uuid();
    const tree = treeFor(MANAGER, [
      item({ ownerMemberId: ANA.id, sizeBytes: 100 }),
      item({ ownerMemberId: ANA.id, sizeBytes: 23 }),
      folder({ ownerMemberId: ANA.id }),
      item({ ownerMemberId: ANA.id, trashed: true, trashRootId: "x", trashedAt: new Date(1) }),
      item({ ownerMemberId: formerId, sizeBytes: 7 }),
      item({ space: "store", ownerMemberId: BEN.id, sizeBytes: 999 }),
    ], [doc({ ownerMemberId: BEN.id })]);
    const rows = summarizeMembers(tree, [
      { id: BEN.id, name: "Ben", role: "staff", active: false },
      { id: ANA.id, name: "Ana", role: "staff", active: true },
      { id: MANAGER.id, name: "Zed", role: "manager", active: true },
    ]);
    expect(rows.map((r) => [r.name, r.active, r.former, r.fileCount, r.bytes])).toEqual([
      ["Ana", true, false, 2, 123],
      ["Zed", true, false, 0, 0],
      ["Ben", false, false, 1, 0],
      [null, false, true, 1, 7],
    ]);
    expect(rows[3]).toMatchObject({ memberId: formerId, role: "" });
  });
});
