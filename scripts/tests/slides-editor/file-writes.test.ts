// The Slides editor's writes on the deck row (lib/slides/editor/file-writes.ts), end to end through the module's
// Drive reducers over the fake database. On /store the SpacetimeDB sender is the tablet ACCOUNT and the PIN operator
// is `actingMemberId`: rename, trash and restore must be checked for both and attributed to the operator, which the
// plain Docs reducers (renameDocument, trashDocument, restoreDocument: sender only) never did. The fake connection
// only has the Drive reducers, so a regression back to a Docs reducer fails with `[doc.not_published]`.
import { afterEach, describe, expect, test } from "bun:test";

import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";
import { renameDeck, restoreDeck, slidesFileCommands, toggleDeckStar, trashDeck } from "@/lib/slides/editor/file-writes";
import type { DriveDeps } from "@/spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "@/spacetimedb/src/drive/documents";
import { defineDriveTrashReducers } from "@/spacetimedb/src/drive/trash";
import type { DriveSchema } from "@/spacetimedb/src/drive/types";
import { FakeTimestamp, createDriveWorld, loadModule, moduleStubs, type FakeDb, type FakeMember, type Row } from "../drive/fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = { ...defineDriveDocumentReducers(stdb, deps), ...defineDriveTrashReducers(stdb, deps) };
type DriveReducerName = "renameDriveDocument" | "trashDriveEntries" | "restoreDriveEntries";

afterEach(() => clearConnection());

/** A connection whose every reducer runs with `sender` as the caller identity, as the SDK does; `calls` logs names. */
function connectAs(db: FakeDb, sender: FakeMember): string[] {
  const calls: string[] = [];
  const run = (name: DriveReducerName) => async (args: Record<string, unknown>) => {
    calls.push(name);
    db.run(R[name], sender, args);
  };
  setConnection({
    reducers: {
      renameDriveDocument: run("renameDriveDocument"),
      trashDriveEntries: run("trashDriveEntries"),
      restoreDriveEntries: run("restoreDriveEntries"),
      toggleDocumentStar: async () => {
        calls.push("toggleDocumentStar");
      },
    },
  } as never);
  setActiveOrgId(sender.organizationId);
  return calls;
}

/** A deck: its `document` row plus the document_file row that makes it one. */
function addDeck(db: FakeDb, owner: FakeMember, visibility: string, lastEditor: FakeMember): Row {
  const row = db.insert("document", {
    id: crypto.randomUUID(), organizationId: owner.organizationId, ownerMemberId: owner.memberId, title: "Deck", excerpt: "",
    icon: undefined, visibility, templateId: undefined, pageSetup: undefined, wordCount: 0,
    createdAt: new FakeTimestamp(db.nowMicros), updatedAt: new FakeTimestamp(db.nowMicros),
    lastEditorMemberId: lastEditor.memberId, trashedAt: undefined, trashedByMemberId: undefined,
  });
  db.insert("documentFile", {
    documentId: row.id, organizationId: owner.organizationId, fileType: "slides", folderId: "", updatedAt: new FakeTimestamp(db.nowMicros),
  });
  return row;
}

function deckRow(db: FakeDb, id: string): Row {
  const row = db.find("document", id);
  if (!row) throw new Error(`no document ${id}`);
  return row;
}

function metaOf(row: Row): { id: string; organizationId: string } {
  return { id: String(row.id), organizationId: String(row.organizationId) };
}

describe("owner-account store tablet acting for a staff operator", () => {
  test("rename, trash and restore of the operator's Store deck go through the Drive reducers and name the operator", async () => {
    const { db, orgA } = createDriveWorld();
    const deck = metaOf(addDeck(db, orgA.staff, "org_edit", orgA.manager));
    const calls = connectAs(db, orgA.owner);
    const operator = { actingMemberId: orgA.staff.memberId };

    await renameDeck(deck, "Opening checklist", operator);
    expect(deckRow(db, deck.id)).toMatchObject({ title: "Opening checklist", lastEditorMemberId: orgA.staff.memberId });

    await trashDeck(deck, operator);
    expect(deckRow(db, deck.id).trashedAt).toBeDefined();
    expect(deckRow(db, deck.id).trashedByMemberId).toBe(orgA.staff.memberId);

    await restoreDeck(deck, operator);
    expect(deckRow(db, deck.id).trashedAt).toBeUndefined();
    expect(calls).toEqual(["renameDriveDocument", "trashDriveEntries", "restoreDriveEntries"]);
  });

  test("the operator's rights narrow the tablet's: a deck only the owner account may edit is refused", async () => {
    const { db, orgA } = createDriveWorld();
    // The owner account's own private deck: the tablet may edit it, the staff operator may not even open it.
    const deck = metaOf(addDeck(db, orgA.owner, "private", orgA.owner));
    connectAs(db, orgA.owner);
    const operator = { actingMemberId: orgA.staff.memberId };

    await expect(renameDeck(deck, "Renamed", operator)).rejects.toThrow("[drive.forbidden]");
    await expect(trashDeck(deck, operator)).rejects.toThrow("[drive.forbidden]");
    expect(deckRow(db, deck.id)).toMatchObject({ title: "Deck", trashedAt: undefined });
  });

  test("star, copy and share have no acting-aware reducer: not offered, and the star writes nothing", async () => {
    const { db, orgA } = createDriveWorld();
    const row = addDeck(db, orgA.staff, "org_edit", orgA.staff);
    const deck = { ...metaOf(row), trashedAt: null };
    const calls = connectAs(db, orgA.owner);

    expect(slidesFileCommands({ actingMemberId: orgA.staff.memberId })).toEqual({ share: false, makeCopy: false, star: false });
    await toggleDeckStar(deck, { actingMemberId: orgA.staff.memberId });
    expect(calls).toEqual([]);
  });
});

describe("no one acting (/manager, /personal)", () => {
  test("the same writes act as the signed-in member, and every command is offered", async () => {
    const { db, orgA } = createDriveWorld();
    const deck = metaOf(addDeck(db, orgA.staff, "private", orgA.manager));
    const calls = connectAs(db, orgA.staff);
    const self = { actingMemberId: "" };

    await renameDeck(deck, "Mine", self);
    expect(deckRow(db, deck.id)).toMatchObject({ title: "Mine", lastEditorMemberId: orgA.staff.memberId });
    await trashDeck(deck, self);
    expect(deckRow(db, deck.id).trashedByMemberId).toBe(orgA.staff.memberId);
    await restoreDeck(deck, self);
    expect(deckRow(db, deck.id).trashedAt).toBeUndefined();

    await toggleDeckStar({ ...deck, trashedAt: null }, self);
    await toggleDeckStar({ ...deck, trashedAt: new Date() }, self);
    expect(calls).toEqual(["renameDriveDocument", "trashDriveEntries", "restoreDriveEntries", "toggleDocumentStar"]);
    expect(slidesFileCommands(self)).toEqual({ share: true, makeCopy: true, star: true });
  });
});
