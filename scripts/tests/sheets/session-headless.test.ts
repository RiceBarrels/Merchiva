// Two (and three) SheetSyncSessions with the editor's real Univer model adapter over headless Univer, against the
// REAL sheet reducers (sheets.md §15 session-headless, SH3): edits typed as Univer commands on the holder converge
// on the viewer, a hand-over lets the other side write back, a fresh loader equals both, and a hostile op written
// straight into the log (an image on a third-party host) is neutralized on the viewer and on a fresh loader.

import { afterEach, describe, expect, test } from "bun:test";
import type { IWorkbookData } from "@univerjs/presets";
import { encodeSheetOps, encodeSheetSnapshot } from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { SheetSyncSession } from "@/lib/sheets/sync/session";
import type { SheetOp } from "@/lib/sheets/types";
import { acceptRemoteOp } from "@/lib/sheets/univer/mutation-filter";
import { CF_NUMBER_OP, CF_RULE_TYPE, CF_SUB_TYPE, IMAGE_SOURCE_TYPE } from "@/lib/sheets/univer-constants";
import { FAKE_EPOCH_MICROS, type FakeMember } from "../drive/fake-db";
import { FakeSheetServer, ManualClock, type FakeSheetClient } from "./helpers/fake-model-adapter";
import { createHeadlessUniver, disposeHeadlessUniverses } from "./helpers/headless";
import { createHeadlessSheet, stubRenderOnlyMutations, type HeadlessSheet } from "./helpers/headless-adapter";
import { lease, newSheet } from "./helpers/sheet-server-harness";

const U = SHEET_UNIT_ID;
const EVIL = "https://evil.example/pixel.png?who=viewer";

function seedWorkbook(): IWorkbookData {
  return JSON.parse(JSON.stringify({
    id: U, name: "Budget", appVersion: SHEET_APP_VERSION, locale: "enUS", styles: {}, sheetOrder: ["s1"], resources: [],
    sheets: { s1: { id: "s1", name: "Sheet1", rowCount: 40, columnCount: 12, cellData: { 0: { 0: { v: "Item", t: 1 }, 1: { v: 3, t: 2 } } } } },
  })) as IWorkbookData;
}

function world() {
  const clock = new ManualClock(Number(FAKE_EPOCH_MICROS / 1000n) + 60_000);
  const server = new FakeSheetServer(clock);
  const { orgA } = server.world;
  const documentId = newSheet(server.db, orgA.owner, { state: encodeSheetSnapshot(seedWorkbook()) });
  return { clock, server, orgA, documentId, lease: () => lease(server.db, documentId) };
}
type World = ReturnType<typeof world>;

interface Opened { client: FakeSheetClient; session: SheetSyncSession; sheet: HeadlessSheet }

async function open(w: World, member: FakeMember, auto = false): Promise<Opened> {
  const client = w.server.client(member);
  const session = new SheetSyncSession({
    documentId: w.documentId, organizationId: w.orgA.organizationId, memberId: member.memberId, actorMemberId: member.memberId,
    actingMemberId: "", user: { name: "U", color: "#123456" }, canEdit: true, autoAcquire: auto, transport: client.transport,
    acceptRemoteOp, now: w.clock.now, timers: w.clock.timers,
  });
  const sheet = await createHeadlessSheet();
  session.attach(client.conn);
  await session.bindModel(sheet.adapter);
  await w.clock.advance(0);
  stubRenderOnlyMutations(sheet.headless);
  return { client, session, sheet };
}

/** Commands typed on the holder's grid, then time for the debounced push and its delivery. */
async function type(w: World, o: Opened, ...commands: Array<[string, object]>): Promise<void> {
  for (const [id, params] of commands) expect(await o.sheet.run(id, params)).toBe(true);
  await w.clock.advance(1500);
}

const range = (startRow: number, startColumn: number, endRow = startRow, endColumn = startColumn) => ({ startRow, startColumn, endRow, endColumn });
const target = { unitId: U, subUnitId: "s1" };

/** An op exactly as Univer emits it, NOT sanitized: what a modified client could write into the log. */
async function rawOps(run: (s: HeadlessSheet) => Promise<unknown>): Promise<SheetOp[]> {
  const scratch = await createHeadlessSheet({ data: seedWorkbook() });
  scratch.adapter.setEditable(true);
  const ops: SheetOp[] = [];
  scratch.headless.commandService.onMutationExecutedForCollab((info, options) => {
    if (!options?.onlyLocal && info.id.includes(".mutation.") && (info.params as { unitId?: string } | undefined)?.unitId === U) {
      ops.push({ mutationId: info.id, params: JSON.parse(JSON.stringify(info.params)) as Record<string, unknown> });
    }
  });
  await run(scratch);
  scratch.dispose();
  return ops;
}

afterEach(() => {
  disposeHeadlessUniverses();
});

describe("sessions over headless Univer", () => {
  test("edits converge; a hand-over lets the viewer write back; a fresh loader equals both", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, true);
    const b = await open(w, w.orgA.staff);
    expect([a.session.lease.kind, b.session.lease.kind]).toEqual(["mine", "other"]);
    // B is read-only: Univer refuses its commands (permission), so nothing is captured.
    expect(await b.sheet.run("sheet.command.set-range-values", { ...target, range: range(9, 9), value: { v: "nope" } })).toBe(false);
    await type(w, a,
      ["sheet.command.set-range-values", { ...target, range: range(1, 0, 1, 1), value: [[{ v: "Rent" }, { v: 1200 }]] }],
      ["sheet.command.insert-row-by-range", { ...target, range: range(1, 0, 1, 11), direction: 0 }],
      ["sheet.command.add-worksheet-merge", { ...target, selections: [range(5, 0, 5, 2)], defaultMerge: true }],
      ["sheet.command.add-conditional-rule", { ...target, rule: { ranges: [range(0, 1, 9, 1)], cfId: "cf", stopIfTrue: false, rule: { type: CF_RULE_TYPE.highlightCell, subType: CF_SUB_TYPE.number, operator: CF_NUMBER_OP.greaterThan, value: 100, style: { bg: { rgb: "#ff0000" } } } } }],
    );
    expect(a.session.status).toBe("saved");
    expect(b.sheet.comparable()).toEqual(a.sheet.comparable());
    expect(b.sheet.workbook().getSheetBySheetId("s1")?.getCell(2, 0)?.v).toBe("Rent");

    await b.session.requestEdit();
    await w.clock.advance(0);
    await a.session.handOver();
    await w.clock.advance(3000);
    expect([a.session.lease.kind, b.session.lease.kind]).toEqual(["other", "mine"]);
    await type(w, b, ["sheet.command.set-range-values", { ...target, range: range(7, 3), value: { v: "from B" } }]);
    expect(a.sheet.workbook().getSheetBySheetId("s1")?.getCell(7, 3)?.v).toBe("from B");
    expect(a.sheet.comparable()).toEqual(b.sheet.comparable());

    const c = await open(w, w.orgA.manager);
    expect(c.session.loadState).toBe("ready");
    expect(c.sheet.comparable()).toEqual(b.sheet.comparable());
    expect([a.session.diverged, b.session.diverged, c.session.diverged]).toEqual([false, false, false]);
  });

  test("a hostile op written into the log is neutralized on the viewer and on a fresh loader", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, true);
    const b = await open(w, w.orgA.staff);
    const hostile = await rawOps(async (s) => {
      await s.run("sheet.command.insert-sheet-image", { unitId: U, drawings: [{
        unitId: U, subUnitId: "s1", drawingId: "px", drawingType: 0, imageSourceType: IMAGE_SOURCE_TYPE.URL, source: EVIL,
        transform: { left: 0, top: 0, width: 1, height: 1 },
        sheetTransform: { from: { column: 0, columnOffset: 0, row: 0, rowOffset: 0 }, to: { column: 0, columnOffset: 1, row: 0, rowOffset: 1 } },
        axisAlignSheetTransform: { from: { column: 0, columnOffset: 0, row: 0, rowOffset: 0 }, to: { column: 0, columnOffset: 1, row: 0, rowOffset: 1 } },
      }] });
      await s.run("sheet.command.set-worksheet-background-image", { ...target, backgroundImage: { source: EVIL, imageSourceType: IMAGE_SOURCE_TYPE.URL } });
    });
    expect(hostile.map((op) => op.mutationId)).toEqual(["sheet.mutation.set-drawing-apply", "sheet.mutation.set-worksheet-background-image"]);
    expect(JSON.stringify(hostile)).toContain(EVIL);
    // Written with the holder's credentials, bypassing its capture (a modified client).
    const row = w.lease();
    await a.client.transport.pushOps({
      documentId: w.documentId, sessionId: row.holderSessionId as string, leaseEpoch: row.epoch as bigint,
      seq: (row.lastSeq as bigint) + 1n, baseUpdateId: a.session.appliedThrough,
      payload: encodeSheetOps({ v: 1, app: SHEET_APP_VERSION, seq: Number(row.lastSeq) + 1, ops: hostile }),
    });
    await w.clock.advance(0);

    for (const viewer of [b, await open(w, w.orgA.manager)]) {
      const saved = viewer.sheet.adapter.save();
      expect(viewer.session.diverged).toBe(false);
      expect(JSON.stringify(saved)).not.toContain("evil.example");
      // The image and the background arrived (the ops were applied), with their sources emptied.
      expect(saved.sheets.s1.backgroundImage).toEqual({ source: "", imageSourceType: IMAGE_SOURCE_TYPE.URL });
      const drawings = JSON.parse(saved.resources?.find((r) => r.name === "SHEET_DRAWING_PLUGIN")?.data ?? "{}") as Record<string, { data: Record<string, { source: string }> }>;
      expect(drawings.s1.data.px.source).toBe("");
    }
  });

  test("headless helpers leave nothing running between tests", async () => {
    const h = await createHeadlessUniver();
    disposeHeadlessUniverses();
    expect(h.commandService.disposed()).toBe(true);
  });
});
