// Trashing a sheet through Drive (trashDriveEntries) drops its edit lease the way trashDocument does
// (sheets.md §3.8 H2): holder and request cleared, the row and its epoch kept. Without it the holder keeps the
// lease until the TTL and, after a quick restore, writes on without a new grant. Real drive/trash.ts and
// drive/sheets.ts factories with index.ts's real `sheetDeps` (driveDeps + the sheet helpers).

import { describe, expect, test } from "bun:test";
import type { FakeDb, FakeMember } from "../../drive/fake-db";
import {
  R, acquire, asClient, createSheetWorld, errorOf, lease, newSheet, push, sheetClient, sheetDeps,
} from "../helpers/sheet-server-harness";

function entries(by: FakeMember, o: { itemIds?: string[]; documentIds?: string[] }) {
  return {
    organizationId: by.organizationId, itemIds: JSON.stringify(o.itemIds ?? []),
    documentIds: JSON.stringify(o.documentIds ?? []), actingMemberId: "",
  };
}
function folder(db: FakeDb, by: FakeMember): string {
  const itemId = crypto.randomUUID();
  db.run(R.createDriveFolder, by, {
    organizationId: by.organizationId, itemId, space: "store", parentId: "", ownerMemberId: "", name: "F", actingMemberId: "",
  });
  return itemId;
}
const DROPPED = {
  holderMemberId: "", holderActorMemberId: "", holderSessionId: "", holderConnectionId: "", holderName: "",
  requestedByMemberId: "", requestedByActorMemberId: "", requestedBySessionId: "", requestedByConnectionId: "",
};

describe("trashDriveEntries drops the sheet edit lease (H2 on the Drive path)", () => {
  test("driveDeps carries index.ts's dropDocumentLease", () => {
    expect(typeof sheetDeps.dropDocumentLease).toBe("function");
  });

  test("a listed sheet: holder and request cleared, row and epoch kept, the old holder fenced", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const holder = sheetClient(orgA.colleague);
    const requester = sheetClient(orgA.manager);
    acquire(db, holder, id);
    push(db, holder, id);
    acquire(db, requester, id);
    expect(lease(db, id)).toMatchObject({ epoch: 1n, lastSeq: 1n, holderSessionId: holder.sessionId, requestedBySessionId: requester.sessionId });

    db.run(R.trashDriveEntries, orgA.staff, entries(orgA.staff, { documentIds: [id] }));
    expect(lease(db, id)).toMatchObject({ ...DROPPED, documentId: id, epoch: 1n, lastSeq: 1n });
    expect(lease(db, id).heartbeatAt).toMatchObject({ microsSinceUnixEpoch: db.nowMicros });
    expect(errorOf(() => acquire(db, holder, id))).toContain("[doc.trashed]");
  });

  test("restored straight away, the old holder has to take a new grant", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const holder = sheetClient(orgA.colleague);
    acquire(db, holder, id);
    push(db, holder, id);
    db.run(R.trashDriveEntries, orgA.staff, entries(orgA.staff, { documentIds: [id] }));
    db.run(R.restoreDriveEntries, orgA.staff, entries(orgA.staff, { documentIds: [id] }));
    // Same epoch, next seq: fenced, because the holder was cleared.
    expect(errorOf(() => push(db, holder, id, { epoch: 1n, seq: 2n }))).toContain("[sheet.lease]");
    expect(errorOf(() => asClient(db, R.heartbeatSheetLease, holder, { documentId: id, leaseEpoch: 1n }))).toContain("[sheet.lease]");
    acquire(db, holder, id);
    expect(lease(db, id)).toMatchObject({ epoch: 2n, lastSeq: 0n, holderSessionId: holder.sessionId });
    push(db, holder, id);
    expect(lease(db, id).lastSeq).toBe(1n);
  });

  test("a sheet trashed with its folder; other sheets and the other org keep their leases", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const folderId = folder(db, orgA.manager);
    const inFolder = newSheet(db, orgA.staff, { folderId });
    const outside = newSheet(db, orgA.staff);
    const otherOrg = newSheet(db, orgB.staff);
    const clients = [sheetClient(orgA.colleague), sheetClient(orgA.colleague), sheetClient(orgB.colleague)];
    for (const [i, id] of [inFolder, outside, otherOrg].entries()) acquire(db, clients[i], id);

    db.run(R.trashDriveEntries, orgA.manager, entries(orgA.manager, { itemIds: [folderId] }));
    expect(db.find("document", inFolder)?.trashedAt).toBeDefined();
    expect(lease(db, inFolder)).toMatchObject({ ...DROPPED, epoch: 1n });
    expect(lease(db, outside)).toMatchObject({ holderSessionId: clients[1].sessionId, epoch: 1n });
    expect(lease(db, otherOrg)).toMatchObject({ holderSessionId: clients[2].sessionId, epoch: 1n });
  });

  test("a refused trash leaves the lease alone (one transaction)", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const holder = sheetClient(orgA.staff);
    acquire(db, holder, id);
    // A colleague can edit the store sheet but not manage it.
    expect(errorOf(() => db.run(R.trashDriveEntries, orgA.colleague, entries(orgA.colleague, { documentIds: [id] })))).toContain("[drive.forbidden]");
    expect(db.find("document", id)?.trashedAt).toBeUndefined();
    expect(lease(db, id)).toMatchObject({ holderSessionId: holder.sessionId, epoch: 1n });
  });
});
