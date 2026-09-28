// Sheet content reducers (sheets.md §3.5–§3.7, §3.9) and the Docs-side sheet hooks
// (§3.8 G1, H1, H5, H6; DS §6.8 folder rules): pushes, compaction, reset, versions and
// the org sheet-byte budget. Real module code over the two-org fake database.

import { describe, expect, test } from "bun:test";
import { SHEET_LOG_MAX_BYTES, SHEET_LOG_MAX_ROWS, SHEET_ORG_MAX_BYTES } from "../../../../spacetimedb/src/drive/sheet-logic";
import { FakeTimestamp, FakeUuid, SERVICE_IDENTITY, documentWithFile, type FakeDb, type Row } from "../../drive/fake-db";
import {
  MODULE, R, acquire, asClient, countedSheetBytes, createSheetWorld, errorOf, gz, gzPadded, lease, newSheet, push,
  sheetBytes, sheetClient, type SheetClient,
} from "../helpers/sheet-server-harness";

const S = 1_000_000n;
const MIB = 1_048_576;

const logOf = (db: FakeDb, id: string): Row[] =>
  db.rows("documentUpdate").filter((r) => r.documentId === id).sort((a, b) => ((a.id as bigint) < (b.id as bigint) ? -1 : 1));
const newestId = (db: FakeDb, id: string): bigint => (logOf(db, id).at(-1)?.id as bigint | undefined) ?? 0n;

function compact(db: FakeDb, c: SheetClient, id: string, through: bigint, state = gz('{"compact":1}'), cells = 7): void {
  asClient(db, R.compactSheet, c, { documentId: id, leaseEpoch: lease(db, id).epoch, throughUpdateId: through, state, plainText: "A1  total", cellCount: cells });
}
function reset(db: FakeDb, c: SheetClient, id: string, state: Uint8Array, seq?: bigint): void {
  const row = lease(db, id);
  asClient(db, R.resetSheetContent, c, { documentId: id, leaseEpoch: row.epoch, seq: seq ?? (row.lastSeq as bigint) + 1n, state, plainText: "reset", cellCount: 1 });
}
function version(db: FakeDb, c: SheetClient, id: string, kind: string, o: { name?: string; state?: Uint8Array; through?: bigint; atMicros?: bigint } = {}): void {
  asClient(db, R.saveSheetVersion, c, {
    documentId: id, leaseEpoch: db.find("documentEditLease", id)?.epoch ?? 0n, kind, name: o.name, state: o.state ?? gz(`{"v":"${kind}"}`),
    throughUpdateId: o.through ?? newestId(db, id), cellCount: 3,
  }, { atMicros: o.atMicros });
}
/** A sheet held by the staff member, as a fresh world. */
function heldSheet() {
  const world = createSheetWorld();
  const id = newSheet(world.db, world.orgA.staff);
  const a = sheetClient(world.orgA.staff);
  acquire(world.db, a, id);
  return { ...world, id, a };
}
const expectBalanced = (db: FakeDb, org: string) => expect(sheetBytes(db, org)).toBe(countedSheetBytes(db, org));

describe("pushSheetOps", () => {
  test("fenced by epoch, session, connection and actor", () => {
    const { db, orgA, id, a } = heldSheet();
    expect(errorOf(() => push(db, a, id, { epoch: 2n }))).toContain("[sheet.lease]");
    expect(errorOf(() => push(db, { ...sheetClient(orgA.staff), connection: a.connection }, id))).toContain("[sheet.lease]");
    expect(errorOf(() => push(db, { ...a, connection: sheetClient(orgA.staff).connection }, id))).toContain("[sheet.lease]");
    const tablet = sheetClient(orgA.owner, { acting: orgA.staff });
    acquire(db, tablet, id); // same actor (staff) takes over from the owner tablet
    expect(errorOf(() => push(db, { ...tablet, acting: "" }, id))).toContain("[sheet.lease]");
    push(db, tablet, id);
    expect(logOf(db, id)).toHaveLength(1);
  });

  test("a retried (seq, payload) after a lost reply commits once; a gap is refused", () => {
    const { db, orgA, id, a } = heldSheet();
    const payload = gz('{"v":1,"ops":[1]}');
    push(db, a, id, { seq: 1n, payload });
    push(db, a, id, { seq: 1n, payload, base: 0n });
    expect(logOf(db, id)).toHaveLength(1);
    expect(lease(db, id).lastSeq).toBe(1n);
    expect(errorOf(() => push(db, a, id, { seq: 3n }))).toContain("[sheet.sequence]");
    push(db, a, id, { seq: 2n });
    expect(logOf(db, id).map((r) => r.memberId)).toEqual([orgA.staff.memberId, orgA.staff.memberId]);
    expect(db.find("document", id)?.lastEditorMemberId).toBe(orgA.staff.memberId);
    expectBalanced(db, orgA.organizationId);
  });

  test("stale when another session wrote after the base, or a snapshot passed it", () => {
    const { db, orgA, id, a } = heldSheet();
    push(db, a, id);
    const base = newestId(db, id);
    asClient(db, R.releaseSheetLease, a, { documentId: id });
    const b = sheetClient(orgA.colleague);
    acquire(db, b, id);
    push(db, b, id);
    asClient(db, R.releaseSheetLease, b, { documentId: id });
    acquire(db, a, id);
    expect(lease(db, id)).toMatchObject({ epoch: 3n, holderSessionId: a.sessionId });
    expect(errorOf(() => push(db, a, id, { base }))).toContain("[sheet.stale]");
    push(db, a, id); // with the colleague's row applied
    compact(db, a, id, newestId(db, id));
    expect(errorOf(() => push(db, a, id, { base }))).toContain("[sheet.stale]");
  });

  test("payload checks and the per-sheet log cap; pushes ignore the org budget", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    // An almost full log before the grant (the grant counts it; only the holder writes the log after).
    db.insert("documentUpdate", { id: 0n, documentId: id, organizationId: orgA.organizationId, payload: new Uint8Array(0),
      byteLength: SHEET_LOG_MAX_BYTES - 100, sessionId: a.sessionId, memberId: orgA.staff.memberId, createdAt: new FakeTimestamp(db.nowMicros) });
    acquire(db, a, id);
    expect(errorOf(() => push(db, a, id, { payload: new Uint8Array(0) }))).toContain("[sheet.invalid]");
    expect(errorOf(() => push(db, a, id, { payload: new Uint8Array(40).fill(7) }))).toContain("[sheet.invalid]");
    expect(errorOf(() => push(db, a, id, { payload: gzPadded(MIB + 1) }))).toContain("[sheet.too_large]");
    expect(errorOf(() => push(db, a, id, { payload: gzPadded(101) }))).toContain("[sheet.too_large]");
    push(db, a, id, { payload: gzPadded(100) });
    const other = newSheet(db, orgA.staff);
    acquire(db, a, other);
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: SHEET_ORG_MAX_BYTES });
    push(db, a, other, { payload: gzPadded(50) });
    expect(sheetBytes(db, orgA.organizationId)).toBe(SHEET_ORG_MAX_BYTES + 50n);
  });

  test("a push never walks the log; the lease keeps its totals; SHEET_LOG_MAX_ROWS bounds it (review r2)", () => {
    const { db, orgA, id, a } = heldSheet();
    const index = (db.db.documentUpdate as { byDocumentId: { filter(v: unknown): IterableIterator<Row> } }).byDocumentId;
    const original = index.filter;
    let walked = 0;
    index.filter = function* (v: unknown) {
      for (const r of original(v)) {
        walked++;
        yield r;
      }
    };
    try {
      for (let i = 0; i < 50; i++) push(db, a, id, { payload: gzPadded(18) });
    } finally {
      index.filter = original;
    }
    expect(walked).toBe(0);
    expect(logOf(db, id)).toHaveLength(50);
    expect(lease(db, id)).toMatchObject({ logRows: 50, logBytes: 900n, logOtherMaxId: 0n });
    // Compaction and reset keep the totals exact.
    compact(db, a, id, logOf(db, id)[29].id as bigint);
    expect(lease(db, id)).toMatchObject({ logRows: 20, logBytes: 360n });
    // Rows up to the cap (as fixtures: 2000 pushes are slow here), then the grant of a new tab recounts them.
    for (let i = 20; i < SHEET_LOG_MAX_ROWS; i++) {
      db.insert("documentUpdate", { id: 0n, documentId: id, organizationId: orgA.organizationId, payload: gzPadded(18),
        byteLength: 18, sessionId: a.sessionId, memberId: orgA.staff.memberId, createdAt: new FakeTimestamp(db.nowMicros) });
    }
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: sheetBytes(db, orgA.organizationId) + BigInt((SHEET_LOG_MAX_ROWS - 20) * 18) });
    const b = sheetClient(orgA.staff); // the same person in another tab: a fresh grant
    acquire(db, b, id);
    expect(lease(db, id)).toMatchObject({
      holderSessionId: b.sessionId, logRows: SHEET_LOG_MAX_ROWS, logBytes: BigInt(SHEET_LOG_MAX_ROWS * 18), logOtherMaxId: newestId(db, id),
    });
    expect(errorOf(() => push(db, b, id, { payload: gzPadded(18) }))).toContain("[sheet.too_large]");
    reset(db, b, id, gz('{"reset":1}'));
    expect(lease(db, id)).toMatchObject({ logRows: 0, logBytes: 0n, logOtherMaxId: 0n });
    push(db, b, id, { payload: gzPadded(18) });
    expect(lease(db, id)).toMatchObject({ logRows: 1, logBytes: 18n });
    expectBalanced(db, orgA.organizationId);
  });
});

describe("compactSheet and resetSheetContent", () => {
  test("compaction replaces the snapshot, drops covered rows and moves the byte count by the difference", () => {
    const { db, orgA, id, a } = heldSheet();
    push(db, a, id);
    push(db, a, id);
    const [first, second] = logOf(db, id);
    compact(db, a, id, first.id as bigint, gz('{"big":"' + "x".repeat(300) + '"}'), 11);
    expect(logOf(db, id).map((r) => r.id)).toEqual([second.id]);
    expect(db.find("documentSnapshot", id)).toMatchObject({ throughUpdateId: first.id, html: "", plainText: "A1  total", compactedByMemberId: orgA.staff.memberId });
    expect(db.find("document", id)).toMatchObject({ excerpt: "A1 total", wordCount: 11 });
    expectBalanced(db, orgA.organizationId);
    const settled = db.find("documentSnapshot", id);
    const settledBytes = sheetBytes(db, orgA.organizationId);
    compact(db, a, id, first.id as bigint); // not strictly ahead: no-op
    compact(db, a, id, 0n); // a stale compaction never overwrites a newer snapshot
    expect(db.find("documentSnapshot", id)).toEqual(settled);
    expect(sheetBytes(db, orgA.organizationId)).toBe(settledBytes);
    expect(db.find("document", id)).toMatchObject({ wordCount: 11 });
    expect(errorOf(() => compact(db, a, id, (second.id as bigint) + 5n))).toContain("[sheet.invalid]");
    expect(errorOf(() => compact(db, sheetClient(orgA.staff), id, second.id as bigint))).toContain("[sheet.lease]");
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: SHEET_ORG_MAX_BYTES });
    compact(db, a, id, second.id as bigint, gz('{"bigger":"' + "y".repeat(900) + '"}')); // never refused by the budget
    expect(logOf(db, id)).toHaveLength(0);
  });

  test("reset replaces everything past every client's base; retries are no-ops; growth is budgeted", () => {
    const { db, orgA, id, a } = heldSheet();
    push(db, a, id);
    const oldNewest = newestId(db, id);
    reset(db, a, id, gz('{"restored":true}'));
    expect(logOf(db, id)).toHaveLength(0);
    const snap = db.find("documentSnapshot", id);
    expect(snap?.throughUpdateId as bigint).toBeGreaterThan(oldNewest);
    expect(lease(db, id).lastSeq).toBe(2n);
    expectBalanced(db, orgA.organizationId);
    reset(db, a, id, gz('{"again":true}'), 2n); // same seq: already applied
    expect(db.find("documentSnapshot", id)?.throughUpdateId).toBe(snap?.throughUpdateId);
    expect(errorOf(() => reset(db, a, id, gz("{}"), 9n))).toContain("[sheet.sequence]");
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: SHEET_ORG_MAX_BYTES });
    expect(errorOf(() => reset(db, a, id, gzPadded(4096)))).toContain("[sheet.quota]");
    reset(db, a, id, gz("")); // shrinking always fits
  });
});

describe("saveSheetVersion and deleteDocumentVersion", () => {
  test("the state lives in document_version_state; the version row stays light", () => {
    const { db, orgA, id, a } = heldSheet();
    const state = gz('{"named":"Q3"}');
    version(db, sheetClient(orgA.colleague), id, "named", { name: "  Q3   close ", state });
    const v = db.rows("documentVersion").find((r) => r.documentId === id);
    expect(v).toMatchObject({ kind: "named", name: "Q3 close", byteLength: state.length, wordCount: 3, createdByMemberId: orgA.colleague.memberId });
    expect((v?.state as Uint8Array).length).toBe(0);
    expect(db.find("documentVersionState", (v?.id as FakeUuid).toString())).toMatchObject({ documentId: id, byteLength: state.length, state });
    expectBalanced(db, orgA.organizationId);
    expect(errorOf(() => version(db, a, id, "named"))).toContain("[sheet.invalid]");
    expect(errorOf(() => version(db, sheetClient(orgA.colleague), id, "auto"))).toContain("[sheet.lease]");
    expect(errorOf(() => version(db, a, id, "draft"))).toContain("[sheet.invalid]");
  });

  test("autos keep a 10-minute gap and skip an unchanged state; the 11th prunes the oldest", () => {
    const { db, orgA, id, a } = heldSheet();
    const tenMinutes = 600n * S;
    let at = db.nowMicros;
    const auto = (n: number) => {
      at += tenMinutes;
      asClient(db, R.heartbeatSheetLease, a, { documentId: id, leaseEpoch: lease(db, id).epoch }, { atMicros: at - 1n });
      version(db, a, id, "auto", { state: gz(`{"n":${n}}`), through: BigInt(n), atMicros: at });
    };
    for (let n = 1; n <= 10; n++) auto(n);
    const autosOf = () => db.rows("documentVersion").filter((r) => r.documentId === id && r.kind === "auto");
    expect(autosOf()).toHaveLength(10);
    version(db, a, id, "auto", { state: gz('{"n":99}'), through: 99n, atMicros: at + S }); // inside the gap
    expect(autosOf()).toHaveLength(10);
    const oldest = autosOf().sort((x, y) => ((x.createdAt as FakeTimestamp).microsSinceUnixEpoch < (y.createdAt as FakeTimestamp).microsSinceUnixEpoch ? -1 : 1))[0];
    auto(11);
    expect(autosOf()).toHaveLength(10);
    expect(db.find("documentVersion", oldest.id)).toBeNull();
    expect(db.find("documentVersionState", (oldest.id as FakeUuid).toString())).toBeNull();
    expectBalanced(db, orgA.organizationId);
  });

  test("named versions past 64 MiB are refused; autos are skipped; the org budget binds named ones only", () => {
    const { db, orgA, id, a } = heldSheet();
    const vid = new FakeUuid();
    db.insert("documentVersion", { id: vid, documentId: id, organizationId: orgA.organizationId, kind: "named", name: "big",
      state: new Uint8Array(0), throughUpdateId: 0n, byteLength: 60 * MIB, wordCount: 0, createdAt: new FakeTimestamp(db.nowMicros), createdByMemberId: orgA.staff.memberId });
    db.insert("documentVersionState", { versionId: vid.toString(), documentId: id, organizationId: orgA.organizationId, state: gzPadded(18), byteLength: 60 * MIB });
    expect(errorOf(() => version(db, a, id, "named", { name: "more", state: gzPadded(5 * MIB) }))).toContain("[sheet.versions_full]");
    version(db, a, id, "auto", { state: gzPadded(5 * MIB), atMicros: db.nowMicros + 700n * S });
    expect(db.rows("documentVersion").filter((r) => r.documentId === id)).toHaveLength(1);
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: SHEET_ORG_MAX_BYTES });
    expect(errorOf(() => version(db, a, id, "named", { name: "small" }))).toContain("[sheet.quota]");
    version(db, a, id, "auto", { atMicros: db.nowMicros + 1400n * S });
    expect(db.rows("documentVersion").filter((r) => r.documentId === id)).toHaveLength(1);
  });

  test("deleting a version releases its bytes", () => {
    const { db, orgA, id } = heldSheet();
    version(db, sheetClient(orgA.staff), id, "named", { name: "keep", state: gzPadded(2048) });
    const v = db.rows("documentVersion").find((r) => r.documentId === id) as Row;
    const before = sheetBytes(db, orgA.organizationId);
    db.run(MODULE.deleteDocumentVersion, orgA.staff, { documentId: id, versionId: (v.id as FakeUuid).toString() });
    expect(db.find("documentVersionState", (v.id as FakeUuid).toString())).toBeNull();
    expect(sheetBytes(db, orgA.organizationId)).toBe(before - 2048n);
    expectBalanced(db, orgA.organizationId);
  });
});

describe("the org sheet budget on create, copy and delete", () => {
  test("createDriveDocument: a sheet needs a gzip seed, gets no html, stores its cell count and is charged", () => {
    const { db, orgA } = createSheetWorld();
    expect(errorOf(() => newSheet(db, orgA.staff, { state: new Uint8Array([1, 2, 3]) }))).toContain("[sheet.invalid]");
    expect(errorOf(() => db.run(R.createDriveDocument, orgA.staff, {
      organizationId: orgA.organizationId, documentId: crypto.randomUUID(), fileType: "sheet", space: "store", folderId: "", ownerMemberId: "",
      visibility: "", title: "", templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: undefined, actingMemberId: "",
    }))).toContain("[sheet.invalid]");
    const id = newSheet(db, orgA.staff, { cells: 42 });
    expect(documentWithFile(db, id)).toMatchObject({ fileType: "sheet", wordCount: 42, excerpt: "Budget 2026" });
    expect(db.find("documentSnapshot", id)).toMatchObject({ html: "", plainText: "Budget  2026" });
    expectBalanced(db, orgA.organizationId);
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: SHEET_ORG_MAX_BYTES - 10n });
    expect(errorOf(() => newSheet(db, orgA.staff))).toContain("[sheet.quota]");
  });

  test("duplicateDocument charges the copy's live bytes, copies no versions or lease, and keeps only a fitting folder", () => {
    const { db, orgA } = createSheetWorld();
    const mine = crypto.randomUUID();
    db.run(R.createDriveFolder, orgA.staff, { organizationId: orgA.organizationId, itemId: mine, space: "my", parentId: "", ownerMemberId: "", name: "Mine", actingMemberId: "" });
    const id = newSheet(db, orgA.staff, { space: "my", folderId: mine });
    const a = sheetClient(orgA.staff);
    acquire(db, a, id);
    push(db, a, id);
    version(db, a, id, "named", { name: "v1" });
    const copyByOwner = crypto.randomUUID();
    db.run(MODULE.duplicateDocument, orgA.staff, { sourceDocumentId: id, documentId: copyByOwner, title: "Copy" });
    expect(documentWithFile(db, copyByOwner)).toMatchObject({ fileType: "sheet", folderId: mine, ownerMemberId: orgA.staff.memberId });
    const copyByAdmin = crypto.randomUUID();
    db.run(MODULE.duplicateDocument, orgA.manager, { sourceDocumentId: id, documentId: copyByAdmin, title: "Admin copy" });
    expect(documentWithFile(db, copyByAdmin)).toMatchObject({ fileType: "sheet", folderId: "", ownerMemberId: orgA.manager.memberId, visibility: "private" });
    expect(db.find("documentEditLease", copyByAdmin)).toBeNull();
    expect(db.rows("documentVersion").filter((r) => r.documentId === copyByAdmin)).toHaveLength(0);
    expect(logOf(db, copyByAdmin)).toHaveLength(1);
    expectBalanced(db, orgA.organizationId);
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: SHEET_ORG_MAX_BYTES - 1n });
    expect(errorOf(() => db.run(MODULE.duplicateDocument, orgA.staff, { sourceDocumentId: id, documentId: crypto.randomUUID(), title: "x" })))
      .toContain("[sheet.quota]");
  });

  test("deleting a sheet for good releases every byte and its lease and version rows (Docs and Drive paths)", () => {
    const { db, orgA } = createSheetWorld();
    const viaDocs = newSheet(db, orgA.staff);
    const viaDrive = newSheet(db, orgA.staff);
    for (const id of [viaDocs, viaDrive]) {
      const c = sheetClient(orgA.staff);
      acquire(db, c, id);
      push(db, c, id);
      version(db, c, id, "named", { name: "v" });
    }
    db.run(MODULE.trashDocument, orgA.staff, { documentId: viaDocs });
    db.run(MODULE.deleteDocumentForever, orgA.staff, { documentId: viaDocs });
    const entries = { organizationId: orgA.organizationId, itemIds: "[]", documentIds: JSON.stringify([viaDrive]), actingMemberId: "" };
    db.run(R.trashDriveEntries, orgA.staff, entries);
    db.run(R.deleteDriveEntriesForever, orgA.staff, entries);
    for (const table of ["document", "documentFile", "documentEditLease", "documentSnapshot"]) expect(db.rows(table)).toHaveLength(0);
    expect(db.rows("documentVersionState")).toHaveLength(0);
    expect(sheetBytes(db, orgA.organizationId)).toBe(0n);
  });

  test("the reconcile recomputes drifted sheet bytes from the rows", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    acquire(db, a, id);
    push(db, a, id);
    version(db, a, id, "named", { name: "v" });
    db.patch("driveUsage", orgA.organizationId, { sheetBytes: 12_345n });
    db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
    db.run(R.serviceFinishDriveReconcile, SERVICE_IDENTITY, { organizationId: orgA.organizationId, measuredBytes: 0n, measuredCount: 0 });
    expectBalanced(db, orgA.organizationId);
    expect(sheetBytes(db, orgA.organizationId)).toBeGreaterThan(0n);
  });
});

describe("the Docs side of a sheet", () => {
  test("the Yjs reducers refuse a sheet (G1)", () => {
    const { db, orgA, id } = heldSheet();
    const calls: Array<[unknown, Record<string, unknown>]> = [
      [MODULE.pushDocumentUpdate, { documentId: id, sessionId: "s", payload: new Uint8Array([1]) }],
      [MODULE.compactDocument, { documentId: id, throughUpdateId: 1n, state: new Uint8Array([1]), html: "", plainText: "", wordCount: 0 }],
      [MODULE.saveDocumentVersion, { documentId: id, kind: "named", name: "x", state: new Uint8Array([1]), throughUpdateId: 0n, wordCount: 0 }],
    ];
    for (const [fn, args] of calls) expect(errorOf(() => db.run(fn, orgA.staff, args))).toContain("[doc.invalid]");
  });

  test("sharing a sheet notifies with its own title and editor link", () => {
    const { db, orgA, id } = heldSheet();
    db.run(MODULE.grantDocumentAccess, orgA.staff, { documentId: id, memberId: orgA.colleague.memberId, role: "editor" });
    expect(db.rows("notification").at(-1)).toMatchObject({ title: "Spreadsheet shared with you", link: `/manager/drive/sheet?id=${id}`, type: "doc_share" });
    const docLink = MODULE.docLink as (id: string, thread?: string, fileType?: string) => string;
    expect([docLink("d", "t"), docLink("d", undefined, "slides"), docLink("d", "t", "doc"), docLink("d", undefined, "form")])
      .toEqual(["/manager/docs/edit?id=d&comment=t", "/manager/drive/slides?id=d", "/manager/docs/edit?id=d&comment=t", "/manager/docs/edit?id=d"]);
  });

  test("a space change leaves the folder; a restore into a gone folder lands at the root", () => {
    const { db, orgA } = createSheetWorld();
    const folderId = crypto.randomUUID();
    db.run(R.createDriveFolder, orgA.staff, { organizationId: orgA.organizationId, itemId: folderId, space: "store", parentId: "", ownerMemberId: "", name: "F", actingMemberId: "" });
    const id = newSheet(db, orgA.staff, { folderId });
    db.run(MODULE.setDocumentVisibility, orgA.staff, { documentId: id, visibility: "org_view" });
    expect(documentWithFile(db, id)?.folderId).toBe(folderId); // same space
    db.run(MODULE.setDocumentVisibility, orgA.staff, { documentId: id, visibility: "private" });
    expect(documentWithFile(db, id)).toMatchObject({ fileType: "sheet", folderId: "" });
    const other = newSheet(db, orgA.staff, { folderId });
    db.run(MODULE.trashDocument, orgA.staff, { documentId: other });
    db.run(MODULE.restoreDocument, orgA.staff, { documentId: other });
    expect(documentWithFile(db, other)?.folderId).toBe(folderId);
    db.run(MODULE.trashDocument, orgA.staff, { documentId: other });
    db.run(R.trashDriveEntries, orgA.staff, { organizationId: orgA.organizationId, itemIds: JSON.stringify([folderId]), documentIds: "[]", actingMemberId: "" });
    db.run(MODULE.restoreDocument, orgA.staff, { documentId: other });
    expect(documentWithFile(db, other)).toMatchObject({ fileType: "sheet", folderId: "", trashedAt: undefined });
  });
});
