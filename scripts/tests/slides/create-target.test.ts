// Deck creation (lib/slides/create.ts) and the image seam (lib/slides/images.ts). targetForNewFromDeck is pure;
// createSlidesDocument runs through the real write wrapper (lib/spacetimedb/actions/drive.ts) into the module's
// real createDriveDocument reducer over the two-org fake database, so the row it produces is the row the server
// would write: fileType, folder, the visibility the server derives from the space, the owner (the PIN operator on
// a store tablet) and a snapshot that opens as a deck.
import { afterEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { DriveClientError } from "@/lib/drive/errors";
import type { DriveDocTarget } from "@/lib/drive/types";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";
import { SLIDE_SIZE_PRESETS, SLIDES_SCHEMA_VERSION } from "@/lib/slides/constants";
import { blankDeckSnapshot, createDeckDocument, createSlidesDocument, targetForNewFromDeck } from "@/lib/slides/create";
import { uploadSlidesImage } from "@/lib/slides/images";
import { DeckStore } from "@/lib/slides/model/deck-store";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import type { DriveDeps } from "@/spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "@/spacetimedb/src/drive/documents";
import { defineDriveReducers } from "@/spacetimedb/src/drive/reducers";
import type { DriveSchema } from "@/spacetimedb/src/drive/types";
import { FakeTimestamp, createDriveWorld, documentWithFile, loadModule, moduleStubs, type FakeDb, type FakeMember, type Row } from "../drive/fake-db";
import { sampleDeck } from "./helpers/fixtures";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const R = { ...defineDriveReducers(moduleStubs().spacetimedb as unknown as DriveSchema, deps), ...defineDriveDocumentReducers(moduleStubs().spacetimedb as unknown as DriveSchema, deps) };

afterEach(() => clearConnection());

/** The app connection, as `caller`: every createDriveDocument call runs the module's reducer in `db`. */
function connectAs(db: FakeDb, caller: FakeMember): Array<Record<string, unknown>> {
  const calls: Array<Record<string, unknown>> = [];
  const createDriveDocument = async (args: Record<string, unknown>) => {
    calls.push(args);
    db.run(R.createDriveDocument, caller, args);
  };
  setConnection({ reducers: { createDriveDocument } } as never);
  setActiveOrgId(caller.organizationId);
  return calls;
}
function storeFolder(db: FakeDb, by: FakeMember): string {
  const itemId = crypto.randomUUID();
  db.run(R.createDriveFolder, by, { organizationId: by.organizationId, itemId, space: "store", parentId: "", ownerMemberId: "", name: "Menus", actingMemberId: "" });
  return itemId;
}
function rowOf(db: FakeDb, table: string, id: string): Row {
  const row = db.find(table, id);
  if (!row) throw new Error(`no ${table} ${id}`);
  return row;
}
function opened(state: unknown): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state as Uint8Array);
  return doc;
}

describe("targetForNewFromDeck", () => {
  const deck = (visibility: "org_edit" | "org_view" | "private", ownerMemberId = "0B6A-OWNER") =>
    ({ organizationId: "org-1", visibility, folderId: "f-1", ownerMemberId });

  test("a Store deck: the Store space, next to it", () => {
    for (const visibility of ["org_edit", "org_view"] as const) {
      expect(targetForNewFromDeck(deck(visibility), { memberId: "someone", actingMemberId: "" })).toEqual({ organizationId: "org-1", space: "store", folderId: "f-1", actingMemberId: "" });
    }
  });

  test("the actor's own private deck: their My files, next to it", () => {
    expect(targetForNewFromDeck(deck("private"), { memberId: "0b6a-owner", actingMemberId: "0b6a-owner" })).toEqual({ organizationId: "org-1", space: "my", folderId: "f-1", actingMemberId: "0b6a-owner" });
  });

  test("someone else's private deck (an admin viewing it): the actor's own My files root", () => {
    expect(targetForNewFromDeck(deck("private"), { memberId: "admin", actingMemberId: "" })).toEqual({ organizationId: "org-1", space: "my", folderId: "", actingMemberId: "" });
    expect(targetForNewFromDeck(deck("private"), { memberId: null, actingMemberId: "op" })).toEqual({ organizationId: "org-1", space: "my", folderId: "", actingMemberId: "op" });
  });
});

describe("blankDeckSnapshot", () => {
  test("one title slide with empty title and subtitle placeholders, at the deck size", () => {
    const snap = blankDeckSnapshot("paper", SLIDE_SIZE_PRESETS["4:3"]);
    expect(snap.meta).toEqual({ schemaVersion: SLIDES_SCHEMA_VERSION, size: { w: 720, h: 540 }, theme: STARTER_THEMES.paper, source: null });
    expect(snap.slides).toHaveLength(1);
    const [slide] = snap.slides;
    expect(slide).toMatchObject({ layout: "title", masterId: "theme", hidden: false });
    expect(slide.elements.map((el) => el.placeholder)).toEqual(["title", "subtitle"]);
    expect(slide.elements[0]).toMatchObject({ x: 60, w: 600 }); // 80 and 800 pt at 960 wide, scaled by 0.75
  });
});

describe("createSlidesDocument", () => {
  test("Store folder: a slides row in that folder, org_edit by the server, with a snapshot that opens as a deck", async () => {
    const { db, orgA } = createDriveWorld();
    const folderId = storeFolder(db, orgA.staff);
    const calls = connectAs(db, orgA.staff);
    const target: DriveDocTarget = { organizationId: orgA.organizationId, space: "store", folderId, actingMemberId: "", title: "Spring menu" };
    const id = await createSlidesDocument(target, { themeId: "coastal" });
    expect(calls[0]).toMatchObject({ fileType: "slides", space: "store", visibility: "", templateId: "slides:coastal", ownerMemberId: "" });
    expect(documentWithFile(db, id)).toMatchObject({ fileType: "slides", folderId, visibility: "org_edit", title: "Spring menu", ownerMemberId: orgA.staff.memberId, templateId: "slides:coastal" });
    const snapshot = rowOf(db, "documentSnapshot", id);
    expect(snapshot).toMatchObject({ plainText: "", html: '<section data-slide="1"></section>' });
    const doc = opened(snapshot.state);
    expect(readDeckSnapshot(doc).meta.theme).toEqual(STARTER_THEMES.coastal);
    const store = new DeckStore(doc, { readOnly: true });
    expect(store.getSnapshot().slideIds).toHaveLength(1);
    store.destroy();
  });

  test("My files: private and owned by the actor; content becomes the snapshot text and the excerpt", async () => {
    const { db, orgA } = createDriveWorld();
    connectAs(db, orgA.manager);
    const id = await createDeckDocument(sampleDeck(), { organizationId: orgA.organizationId, space: "my", folderId: "", actingMemberId: "" }, { templateId: "import:pptx", title: "menu" });
    expect(documentWithFile(db, id)).toMatchObject({ fileType: "slides", folderId: "", visibility: "private", ownerMemberId: orgA.manager.memberId, title: "menu" });
    expect(String(rowOf(db, "documentSnapshot", id).plainText)).toStartWith("Bold colour\nlink2");
    expect(String(rowOf(db, "document", id).excerpt)).toStartWith("Bold colour link2");
    expect(readDeckSnapshot(opened(rowOf(db, "documentSnapshot", id).state))).toEqual(sampleDeck());
  });

  test("on an owner-account store tablet, the PIN operator owns the new deck", async () => {
    const { db, orgA } = createDriveWorld();
    const calls = connectAs(db, orgA.owner); // the tablet's account
    const id = await createSlidesDocument({ organizationId: orgA.organizationId, space: "my", folderId: "", actingMemberId: orgA.staff.memberId });
    expect(calls[0]).toMatchObject({ actingMemberId: orgA.staff.memberId });
    expect(rowOf(db, "document", id)).toMatchObject({ visibility: "private", ownerMemberId: orgA.staff.memberId, lastEditorMemberId: orgA.staff.memberId });
  });

  test("without a connection it rejects with not_connected and creates nothing", async () => {
    const { db, orgA } = createDriveWorld();
    const error = await createSlidesDocument({ organizationId: orgA.organizationId, space: "store", folderId: "", actingMemberId: "" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DriveClientError);
    expect((error as DriveClientError).code).toBe("not_connected");
    expect(db.rows("document")).toHaveLength(0);
  });
});

describe("uploadSlidesImage", () => {
  test("refuses a file the image route would refuse, before any upload", async () => {
    const ctx = { documentId: null, target: { organizationId: "org", space: "my" as const, folderId: "", actingMemberId: "" } };
    await expect(uploadSlidesImage(new File(["x"], "a.svg", { type: "image/svg+xml" }), ctx)).rejects.toThrow("[doc.image] unsupported");
    await expect(uploadSlidesImage(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }), ctx)).rejects.toThrow("[doc.image] tooLarge");
  });
});
