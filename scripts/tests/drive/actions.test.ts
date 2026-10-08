// components/drive/model/actions.ts — entry menus (manager and lite) and multi-selection actions.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { entryHref } from "@/components/drive/actions/entry-links";
import { isPreviewable } from "@/components/drive/preview/preview-mode";
import { LITE_ACTION_LABEL, driveActionGroups, driveBulkActions, type ActionContext } from "@/components/drive/model/actions";
import type { DocEntry, DriveEntry, DriveEntryAccess, FileEntry, FolderEntry, VirtualEntry } from "@/components/drive/model/types";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import type { DriveItem } from "@/lib/drive/types";

const NONE: DriveEntryAccess = {
  canOpen: false, canDownload: false, canRename: false, canMove: false, canTrash: false, canRestore: false,
  canDeleteForever: false, canShare: false, canStar: false, canAddChildren: false,
};
const FULL_ITEM: DriveEntryAccess = { ...NONE, canOpen: true, canDownload: true, canRename: true, canMove: true, canTrash: true, canStar: true };

function base(key: string, access: DriveEntryAccess, patch: { trashedAt?: number | null; parentId?: string; space?: "my" | "store"; starred?: boolean } = {}) {
  return {
    key, id: key, name: key, createdAt: 0, updatedAt: 0, ownerMemberId: "m", ownerName: null, isMine: true,
    starred: patch.starred ?? false, trashedAt: patch.trashedAt ?? null, openedAt: null,
    location: { space: patch.space ?? "my", ownerMemberId: patch.space === "store" ? "" : "m", parentId: patch.parentId ?? "" },
    access,
  };
}
const folderEntry = (access = { ...FULL_ITEM, canDownload: false, canAddChildren: true }, patch = {}): FolderEntry =>
  ({ ...base("f", access, patch), type: "folder", item: {} as DriveItem });
const fileEntry = (name: string, mimeType: string, access = FULL_ITEM, patch = {}): FileEntry =>
  ({ ...base(name, access, patch), name, type: "file", item: {} as DriveItem, fileKind: "other", mimeType, sizeBytes: 1, uploading: null });
const docEntry = (type: "doc" | "sheet" | "slides", access: Partial<DriveEntryAccess> = {}, patch = {}): DocEntry => ({
  ...base(type, { ...NONE, canOpen: true, canRename: true, canMove: true, canTrash: true, canShare: true, canStar: true, ...access }, patch),
  type, doc: {} as DocumentMeta, docAccess: {} as DocAccess, sharedWithMe: false, hasGrants: false,
});
const virtualEntry = (originRoute: string | null = "/manager/bugs"): VirtualEntry => ({
  ...base("v:bugs:1", { ...NONE, canOpen: true, canDownload: true }), location: null, type: "virtual", source: "bugs",
  url: "https://x.test/a.png", fileKind: "image", mimeType: "image/png", group: "", originRoute,
});

const MANAGER: ActionContext = { surface: "manager", section: "my", offline: false };
const STORE: ActionContext = { ...MANAGER, surface: "store" };
const NO_MOVE = { toStore: false, toMy: false };
const groups = (entry: DriveEntry, ctx: ActionContext = MANAGER, move = NO_MOVE) => driveActionGroups(entry, ctx, move);

describe("driveActionGroups", () => {
  test("folder: open · edit · trash", () => {
    expect(groups(folderEntry())).toEqual([["open", "openNewTab"], ["rename", "move", "star", "details"], ["trash"]]);
  });

  test("files: preview, download and the editor that can open a copy", () => {
    expect(groups(fileEntry("a.pdf", "application/pdf"))[0]).toEqual(["preview", "download"]);
    expect(groups(fileEntry("b.xlsx", ""))[0]).toEqual(["preview", "download", "openAsSheet"]);
    expect(groups(fileEntry("c.pptx", ""))[0]).toEqual(["preview", "download", "openAsSlides"]);
    expect(groups(fileEntry("d.docx", ""))[0]).toEqual(["preview", "download", "openAsDoc"]);
  });

  test("documents: every kind offers open whatever is installed (the runner asks for a missing editor plugin)", () => {
    expect(groups(docEntry("doc"))).toEqual([["open", "openNewTab"], ["rename", "move", "share", "star", "details"], ["trash"]]);
    expect(groups(docEntry("sheet"))[0]).toEqual(["open", "openNewTab"]);
    expect(groups(docEntry("slides"))[0]).toEqual(["open", "openNewTab"]);
    expect(groups(docEntry("doc", { canOpen: false }))[0]).toEqual(["rename", "move", "share", "star", "details"]);
    expect(groups(docEntry("slides", {}, { starred: true }))[1]).toContain("unstar");
  });

  test("virtual: preview, download, open in the app it came from", () => {
    expect(groups(virtualEntry())).toEqual([["preview", "download", "openOriginal"], ["details"]]);
    expect(groups(virtualEntry(null))).toEqual([["preview", "download"], ["details"]]);
  });

  test("a record (a form): opens its page, never previews or downloads", () => {
    const record: VirtualEntry = {
      ...virtualEntry("/manager/forms"), key: "v:forms:1", source: "forms", url: "", fileKind: "other",
      mimeType: "application/octet-stream", access: { ...NONE, canOpen: true }, href: "/manager/forms/edit?id=1&view=responses",
    };
    expect(groups(record)).toEqual([["open", "openNewTab", "openOriginal"], ["details"]]);
    expect(isPreviewable(record)).toBe(false);
    expect(isPreviewable(virtualEntry())).toBe(true);
    expect(entryHref(record, { space: "apps", folder: "", member: "", source: "forms" }, null)).toBe(record.href ?? "");
  });

  test("access decides: a viewer gets open/download and details only", () => {
    const viewer = { ...NONE, canOpen: true, canDownload: true, canStar: true };
    expect(groups(fileEntry("a.pdf", "application/pdf", viewer))).toEqual([["preview", "download"], ["star", "details"]]);
    const contributor = { ...NONE, canOpen: true, canDownload: true };
    expect(groups(fileEntry("a.pdf", "application/pdf", contributor), STORE)).toEqual([["preview", "download"], ["details"]]);
  });

  test("C21: editor rights (rename, move) never bring trash", () => {
    const editor = { ...FULL_ITEM, canTrash: false };
    expect(groups(fileEntry("a.pdf", "application/pdf", editor)).flat()).not.toContain("trash");
  });

  test("lite surfaces drop new tabs, open-in-app, share, stars and select", () => {
    for (const surface of ["store", "personal"] as const) {
      const ctx = { ...MANAGER, surface, touch: true };
      expect(groups(folderEntry(), ctx)).toEqual([["open"], ["rename", "move", "details"], ["trash"]]);
      expect(groups(docEntry("sheet"), ctx)).toEqual([["open"], ["rename", "move", "details"], ["trash"]]);
      expect(groups(virtualEntry(), ctx)).toEqual([["preview", "download"], ["details"]]);
    }
    expect(groups(folderEntry(), { ...MANAGER, touch: true })[1]).toEqual(["rename", "move", "star", "details", "select"]);
  });

  test("offline drops every write, including creating a copy", () => {
    const ctx = { ...MANAGER, offline: true };
    expect(groups(fileEntry("b.xlsx", ""), ctx)).toEqual([["preview", "download"], ["details"]]);
    expect(groups(docEntry("doc"), ctx)).toEqual([["open", "openNewTab"], ["share", "details"]]);
  });

  test("space shortcuts: only from moveRoots, at the root of the other space", () => {
    const both = { toStore: true, toMy: true };
    expect(groups(fileEntry("a.pdf", "x/y"), MANAGER, both)[1]).toEqual(["rename", "move", "moveToStore", "star", "details"]);
    expect(groups(fileEntry("a.pdf", "x/y", FULL_ITEM, { space: "store" }), MANAGER, both)[1]).toContain("moveToMy");
    expect(groups(fileEntry("a.pdf", "x/y", FULL_ITEM, { parentId: "p" }), MANAGER, both)[1]).not.toContain("moveToStore");
    expect(groups(fileEntry("a.pdf", "x/y"), MANAGER, NO_MOVE)[1]).not.toContain("moveToStore");
    expect(groups(fileEntry("a.pdf", "x/y", { ...FULL_ITEM, canMove: false }), MANAGER, both)[1]).not.toContain("moveToStore");
    expect(groups(fileEntry("a.pdf", "x/y"), STORE, both)[1]).toContain("moveToStore");
  });

  test("trashed entries: a look, then restore / delete forever", () => {
    const trash = { ...NONE, canOpen: true, canDownload: true, canRestore: true, canDeleteForever: true };
    expect(groups(fileEntry("a.pdf", "application/pdf", trash, { trashedAt: 5 }))).toEqual([["preview"], ["restore", "deleteForever"]]);
    expect(groups(docEntry("doc", { canRestore: true, canDeleteForever: true }, { trashedAt: 5 }))).toEqual([["open"], ["restore", "deleteForever"]]);
    expect(groups(folderEntry({ ...NONE, canRestore: true }, { trashedAt: 5 }))).toEqual([["restore"]]);
    expect(groups(fileEntry("a.pdf", "application/pdf", trash, { trashedAt: 5 }), { ...MANAGER, offline: true })).toEqual([["preview"]]);
  });
});

describe("driveBulkActions", () => {
  test("each action only when every entry allows it", () => {
    const a = fileEntry("a.pdf", "application/pdf");
    const b = fileEntry("b.pdf", "application/pdf");
    expect(driveBulkActions([a, b], "my")).toEqual(["move", "download", "trash"]);
    expect(driveBulkActions([a, folderEntry()], "my")).toEqual(["move", "trash"]);
    expect(driveBulkActions([a, virtualEntry()], "apps")).toEqual(["download"]);
    expect(driveBulkActions([a, fileEntry("c.pdf", "application/pdf", { ...FULL_ITEM, canTrash: false })], "my")).toEqual(["move", "download"]);
    expect(driveBulkActions([], "my")).toEqual([]);
  });

  test("in the trash: restore and delete forever", () => {
    const t = (access: Partial<DriveEntryAccess>) => fileEntry("t", "x/y", { ...NONE, ...access }, { trashedAt: 1 });
    expect(driveBulkActions([t({ canRestore: true, canDeleteForever: true }), t({ canRestore: true, canDeleteForever: true })], "trash")).toEqual(["restore", "deleteForever"]);
    expect(driveBulkActions([t({ canRestore: true, canDeleteForever: true }), t({ canRestore: true })], "trash")).toEqual(["restore"]);
  });
});

describe("LITE_ACTION_LABEL", () => {
  test("trash reads Delete on the devices, and every label exists in the drive-ui copy", () => {
    expect(LITE_ACTION_LABEL.trash).toBe("device.lite.drive.trashItem");
    const en = JSON.parse(readFileSync("scripts/i18n/drive/drive-ui/en.json", "utf8")) as Record<string, unknown>;
    const lookup = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
    for (const key of Object.values(LITE_ACTION_LABEL)) expect(typeof lookup(key!)).toBe("string");
    // Nothing the lite menus drop has a lite label.
    for (const dropped of ["openNewTab", "openOriginal", "share", "star", "unstar", "select"] as const) expect(LITE_ACTION_LABEL[dropped]).toBeUndefined();
  });
});
