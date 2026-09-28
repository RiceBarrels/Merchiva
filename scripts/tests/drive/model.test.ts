// lib/drive/model.ts — where folders, files and documents are listed, the
// breadcrumb, trash roots, "shared with me" and everyone's My files.

import { describe, expect, test } from "bun:test";
import type { DocAccessGrant, DocumentMeta } from "@/lib/docs/types";
import {
  breadcrumb,
  docSpace,
  effectiveDocFolderId,
  effectiveItemParentId,
  everyonesFiles,
  listContainer,
  sharedWithMe,
  trashRoots,
} from "@/lib/drive/model";
import { DRIVE_MAX_DEPTH } from "@/lib/drive/rules";
import type { DriveItem } from "@/lib/drive/types";

const ORG = "org-1";
const ME = "m-me";
const YOU = "m-you";
const MY_IDENTITY = "c0ffee";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function item(patch: Partial<DriveItem> = {}): DriveItem {
  return {
    id: uuid(), organizationId: ORG, space: "my", parentId: "", kind: "file", name: "x", mimeType: "text/plain",
    sizeBytes: 1, blobKey: "", thumbKey: "", thumbBytes: 0, etag: "e", ownerMemberId: ME, createdByMemberId: ME,
    uploaderIdentityHex: MY_IDENTITY, status: "ready", uploadExpiresAt: new Date(0), uploadAttempts: 1, trashed: false,
    trashRootId: "", trashedAt: null, trashedByMemberId: "", createdAt: new Date(0), updatedAt: new Date(0),
    lastEditorMemberId: ME, ...patch,
  };
}
const folder = (patch: Partial<DriveItem> = {}) => item({ kind: "folder", mimeType: "", sizeBytes: 0, ...patch });

function doc(patch: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: uuid(), organizationId: ORG, ownerMemberId: ME, title: "", excerpt: "", icon: null, visibility: "private",
    templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(0), updatedAt: new Date(0),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType: "doc", folderId: "", ...patch,
  };
}

const byId = (items: DriveItem[]) => new Map(items.map((i) => [i.id, i]));
const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("docSpace", () => {
  test("private is My files, anything shared is Store", () => {
    expect(docSpace({ visibility: "private" })).toBe("my");
    expect(docSpace({ visibility: "org_view" })).toBe("store");
    expect(docSpace({ visibility: "org_edit" })).toBe("store");
  });
});

describe("effectiveDocFolderId / effectiveItemParentId", () => {
  const mine = folder();
  const yours = folder({ ownerMemberId: YOU });
  const store = folder({ space: "store" });
  const trashed = folder({ trashed: true, trashRootId: "x", trashedAt: new Date(5) });
  const pending = folder({ status: "pending" });
  const file = item();
  const foreign = folder({ organizationId: "org-2" });
  const items = byId([mine, yours, store, trashed, pending, file, foreign]);

  test("a document stays in a folder of its space and owner, else lands at the root", () => {
    expect(effectiveDocFolderId(doc({ folderId: mine.id }), items)).toBe(mine.id);
    expect(effectiveDocFolderId(doc({ folderId: "" }), items)).toBe("");
    expect(effectiveDocFolderId(doc({ folderId: uuid() }), items)).toBe(""); // missing / not visible
    expect(effectiveDocFolderId(doc({ folderId: yours.id }), items)).toBe(""); // someone else's My files
    expect(effectiveDocFolderId(doc({ folderId: store.id }), items)).toBe(""); // other space
    expect(effectiveDocFolderId(doc({ folderId: store.id, visibility: "org_edit", ownerMemberId: YOU }), items)).toBe(store.id);
    expect(effectiveDocFolderId(doc({ folderId: trashed.id }), items)).toBe("");
    expect(effectiveDocFolderId(doc({ folderId: pending.id }), items)).toBe("");
    expect(effectiveDocFolderId(doc({ folderId: file.id }), items)).toBe(""); // not a folder
    expect(effectiveDocFolderId(doc({ folderId: foreign.id }), items)).toBe(""); // other organization
  });

  test("items follow the same rule; a trashed item keeps its trashed parent", () => {
    expect(effectiveItemParentId(item({ parentId: mine.id }), items)).toBe(mine.id);
    expect(effectiveItemParentId(item({ parentId: yours.id }), items)).toBe("");
    expect(effectiveItemParentId(item({ parentId: store.id }), items)).toBe("");
    expect(effectiveItemParentId(item({ parentId: trashed.id }), items)).toBe("");
    expect(effectiveItemParentId(item({ parentId: trashed.id, trashed: true }), items)).toBe(trashed.id);
    const self = folder();
    expect(effectiveItemParentId({ ...self, parentId: self.id }, byId([self]))).toBe("");
  });
});

describe("listContainer", () => {
  const a = folder({ name: "A" });
  const b = folder({ name: "B", parentId: a.id });
  const inA = item({ parentId: a.id });
  const atRoot = item();
  const orphan = item({ parentId: uuid() });
  const trashedFile = item({ trashed: true, trashRootId: "t", trashedAt: new Date(1) });
  const myPending = item({ status: "pending" });
  const theirPending = item({ status: "pending", uploaderIdentityHex: "beef" });
  const yourFile = item({ ownerMemberId: YOU });
  const storeFolder = folder({ space: "store", ownerMemberId: YOU });
  const storeFile = item({ space: "store", ownerMemberId: YOU, parentId: storeFolder.id });
  const items = [a, b, inA, atRoot, orphan, trashedFile, myPending, theirPending, yourFile, storeFolder, storeFile];
  const docInA = doc({ folderId: a.id });
  const docAtRoot = doc();
  const docMisplaced = doc({ folderId: storeFolder.id });
  const docTrashed = doc({ trashedAt: new Date(1) });
  const docUnknown = doc({ fileType: "unknown" });
  const storeDoc = doc({ visibility: "org_view", ownerMemberId: YOU, folderId: storeFolder.id });
  const yourDoc = doc({ ownerMemberId: YOU });
  const docs = [docInA, docAtRoot, docMisplaced, docTrashed, docUnknown, storeDoc, yourDoc];

  test("my root: untrashed rows of this owner at the root; stale parents land here", () => {
    const listed = listContainer({ items, docs, container: { space: "my", parentId: "", ownerMemberId: ME }, viewerIdentityHex: MY_IDENTITY });
    expect(ids(listed.folders)).toEqual([a.id]);
    expect(ids(listed.files)).toEqual([atRoot.id, orphan.id, myPending.id]);
    expect(ids(listed.docs)).toEqual([docAtRoot.id, docMisplaced.id]);
  });

  test("a pending upload is shown only to the uploading identity", () => {
    const container = { space: "my" as const, parentId: "", ownerMemberId: ME };
    expect(ids(listContainer({ items, docs, container, viewerIdentityHex: "BEEF" }).files)).toEqual([atRoot.id, orphan.id, theirPending.id]);
    expect(ids(listContainer({ items, docs, container, viewerIdentityHex: null }).files)).toEqual([atRoot.id, orphan.id]);
  });

  test("a folder lists its direct children only", () => {
    const listed = listContainer({ items, docs, container: { space: "my", parentId: a.id, ownerMemberId: ME }, viewerIdentityHex: MY_IDENTITY });
    expect(ids(listed.folders)).toEqual([b.id]);
    expect(ids(listed.files)).toEqual([inA.id]);
    expect(ids(listed.docs)).toEqual([docInA.id]);
  });

  test("another member's My files and the Store space", () => {
    const yours = listContainer({ items, docs, container: { space: "my", parentId: "", ownerMemberId: YOU }, viewerIdentityHex: MY_IDENTITY });
    expect(ids(yours.files)).toEqual([yourFile.id]);
    expect(ids(yours.docs)).toEqual([yourDoc.id]);
    const storeRoot = listContainer({ items, docs, container: { space: "store", parentId: "", ownerMemberId: "" }, viewerIdentityHex: MY_IDENTITY });
    expect(ids(storeRoot.folders)).toEqual([storeFolder.id]);
    expect(storeRoot.files).toEqual([]);
    const storeIn = listContainer({ items, docs, container: { space: "store", parentId: storeFolder.id, ownerMemberId: "" }, viewerIdentityHex: null });
    expect(ids(storeIn.files)).toEqual([storeFile.id]);
    expect(ids(storeIn.docs)).toEqual([storeDoc.id]);
  });
});

describe("breadcrumb", () => {
  test("root → folder, [] for the root or an unknown folder", () => {
    const a = folder();
    const b = folder({ parentId: a.id });
    const c = folder({ parentId: b.id });
    const items = byId([a, b, c]);
    expect(ids(breadcrumb(items, c.id))).toEqual([a.id, b.id, c.id]);
    expect(ids(breadcrumb(items, a.id))).toEqual([a.id]);
    expect(breadcrumb(items, "")).toEqual([]);
    expect(breadcrumb(items, uuid())).toEqual([]);
  });

  test("stops at a parent that does not fit, survives a loop and caps the depth", () => {
    const yours = folder({ ownerMemberId: YOU });
    const mine = folder({ parentId: yours.id });
    expect(ids(breadcrumb(byId([yours, mine]), mine.id))).toEqual([mine.id]);

    const x = folder();
    const y = folder({ parentId: x.id });
    x.parentId = y.id;
    expect(ids(breadcrumb(byId([x, y]), y.id))).toEqual([x.id, y.id]);

    const chain: DriveItem[] = [];
    for (let i = 0; i < DRIVE_MAX_DEPTH + 5; i++) chain.push(folder({ parentId: chain[i - 1]?.id ?? "" }));
    expect(breadcrumb(byId(chain), chain[chain.length - 1].id)).toHaveLength(DRIVE_MAX_DEPTH);
  });
});

describe("trashRoots", () => {
  test("items the user trashed; cascaded documents come back with their root", () => {
    const at = new Date(1_000);
    const root = folder({ trashed: true, trashRootId: "", trashedAt: at });
    root.trashRootId = root.id;
    const sub = folder({ parentId: root.id, trashed: true, trashRootId: root.id, trashedAt: at });
    const subFile = item({ parentId: sub.id, trashed: true, trashRootId: root.id, trashedAt: at });
    const earlier = item({ parentId: root.id, trashed: true, trashedAt: new Date(500) });
    earlier.trashRootId = earlier.id;
    const live = item();

    const cascaded = doc({ folderId: sub.id, trashedAt: at });
    const trashedBefore = doc({ folderId: root.id, trashedAt: new Date(500) }); // its own root
    const loose = doc({ trashedAt: new Date(2_000) });
    const outsideFolder = doc({ folderId: uuid(), trashedAt: at }); // folder not visible: listed on its own
    const unknown = doc({ trashedAt: new Date(3_000), fileType: "unknown" });
    const untrashed = doc({ folderId: root.id });

    const out = trashRoots({ items: [root, sub, subFile, earlier, live], docs: [cascaded, trashedBefore, loose, outsideFolder, unknown, untrashed] });
    expect(ids(out.items)).toEqual([root.id, earlier.id]);
    expect(ids(out.docs)).toEqual([trashedBefore.id, loose.id, outsideFolder.id]);
  });
});

describe("sharedWithMe", () => {
  test("untrashed documents of others with a grant for me", () => {
    const granted = doc({ ownerMemberId: YOU });
    const grantedStore = doc({ ownerMemberId: YOU, visibility: "org_edit" });
    const mineGranted = doc(); // my own document, even with a grant row
    const notGranted = doc({ ownerMemberId: YOU });
    const grantedTrashed = doc({ ownerMemberId: YOU, trashedAt: new Date(1) });
    const grantedUnknown = doc({ ownerMemberId: YOU, fileType: "unknown" });
    const grant = (documentId: string, memberId = ME): DocAccessGrant => ({
      id: uuid(), documentId, organizationId: ORG, memberId, role: "viewer", grantedByMemberId: YOU,
      createdAt: new Date(0), updatedAt: new Date(0),
    });
    const docs = [granted, grantedStore, mineGranted, notGranted, grantedTrashed, grantedUnknown];
    const grants = [granted, grantedStore, mineGranted, grantedTrashed, grantedUnknown].map((d) => grant(d.id)).concat(grant(notGranted.id, "m-other"));
    expect(ids(sharedWithMe({ docs, grants, memberId: ME }))).toEqual([granted.id, grantedStore.id]);
    expect(sharedWithMe({ docs, grants, memberId: null })).toEqual([]);
  });
});

describe("everyonesFiles", () => {
  test("ready, untrashed My-files items and private documents, by owner", () => {
    const myFile = item();
    const myFolder = folder();
    const yourFile = item({ ownerMemberId: YOU, parentId: uuid() });
    const pending = item({ ownerMemberId: YOU, status: "pending" });
    const trashed = item({ ownerMemberId: YOU, trashed: true });
    const storeFile = item({ space: "store" });
    const myDoc = doc();
    const yourDoc = doc({ ownerMemberId: YOU });
    const storeDoc = doc({ visibility: "org_view" });
    const trashedDoc = doc({ ownerMemberId: YOU, trashedAt: new Date(1) });
    const out = everyonesFiles({
      items: [myFile, myFolder, yourFile, pending, trashed, storeFile],
      docs: [myDoc, yourDoc, storeDoc, trashedDoc, doc({ fileType: "unknown" })],
    });
    expect([...out.keys()]).toEqual([ME, YOU]);
    expect(ids(out.get(ME)?.items ?? [])).toEqual([myFile.id, myFolder.id]);
    expect(ids(out.get(ME)?.docs ?? [])).toEqual([myDoc.id]);
    expect(ids(out.get(YOU)?.items ?? [])).toEqual([yourFile.id]);
    expect(ids(out.get(YOU)?.docs ?? [])).toEqual([yourDoc.id]);
  });
});
