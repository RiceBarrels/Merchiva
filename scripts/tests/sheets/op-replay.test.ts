// Op replay (sheets.md §15 op-replay, SH3): headless A → capture (lib/sheets/univer/model-adapter.ts) → codec →
// acceptRemoteOp + sanitizeOpParams → headless B. After every edit B must equal A semantically (the saved
// workbooks, resources parsed, compared key-sorted), and nothing the editor's own commands produce may fall
// back to a snapshot.

import { afterEach, describe, expect, test } from "bun:test";
import type { DependencyIdentifier, IWorkbookData } from "@univerjs/presets";
import { decodeSheetOps, encodeSheetOps } from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_PREVIEW_UNIT_ID, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { sanitizeOpParams } from "@/lib/sheets/sanitize";
import type { SheetOp } from "@/lib/sheets/types";
import { acceptRemoteOp } from "@/lib/sheets/univer/mutation-filter";
import { BOOL, CF_NUMBER_OP, CF_RULE_TYPE, CF_SUB_TYPE, DV_TYPE, IMAGE_SOURCE_TYPE, RESOURCE, WRAP } from "@/lib/sheets/univer-constants";
import { disposeHeadlessUniverses } from "./helpers/headless";
import { createHeadlessSheet, type HeadlessSheet } from "./helpers/headless-adapter";

const U = SHEET_UNIT_ID;
const IMG = "https://abc123.ufs.sh/f/picture.png";

function baseWorkbook(bigSheet = false): IWorkbookData {
  const cellData: Record<number, Record<number, Record<string, unknown>>> = {};
  const rows = bigSheet ? 700 : 30;
  for (let r = 0; r < rows; r++) {
    cellData[r] = {};
    for (let c = 0; c < 10; c++) cellData[r][c] = { v: r * 10 + c, t: 2 };
  }
  return JSON.parse(JSON.stringify({
    id: U, name: "Replay", appVersion: SHEET_APP_VERSION, locale: "enUS", styles: {}, sheetOrder: ["s1", "s2"], resources: [],
    sheets: {
      s1: { id: "s1", name: "Sheet1", rowCount: rows + 20, columnCount: 15, cellData },
      s2: { id: "s2", name: "Sheet2", rowCount: 20, columnCount: 10, cellData: { 0: { 0: { v: "two", t: 1 } } } },
    },
  })) as IWorkbookData;
}

async function pair(bigSheet = false): Promise<[HeadlessSheet, HeadlessSheet]> {
  const a = await createHeadlessSheet({ data: baseWorkbook(bigSheet) });
  const b = await createHeadlessSheet({ data: baseWorkbook(bigSheet) });
  a.adapter.setEditable(true);
  return [a, b];
}

/** Everything A captured since the last call, through the wire format and the receive checks, applied to B. */
function replay(a: HeadlessSheet, b: HeadlessSheet): SheetOp[] {
  const ops = a.captured.splice(0);
  const batch = decodeSheetOps(encodeSheetOps({ v: 1, app: SHEET_APP_VERSION, seq: 1, ops }));
  const accepted = batch.ops.filter((op) => acceptRemoteOp(op, U));
  expect(accepted.map((op) => op.mutationId)).toEqual(ops.map((op) => op.mutationId));
  for (const op of accepted) sanitizeOpParams(op.mutationId, op.params);
  expect(b.adapter.applyRemote(accepted)).toEqual({ applied: accepted.length, failedAt: -1 });
  return accepted;
}

async function expectConverged(a: HeadlessSheet, b: HeadlessSheet): Promise<SheetOp[]> {
  const ops = replay(a, b);
  expect(a.snapshots).toEqual([]);
  expect(b.comparable()).toEqual(a.comparable());
  expect(b.captured).toEqual([]); // applying never captures
  return ops;
}

const range = (startRow: number, startColumn: number, endRow = startRow, endColumn = startColumn) => ({ startRow, startColumn, endRow, endColumn });
const target = (subUnitId = "s1") => ({ unitId: U, subUnitId });
const cell = (s: HeadlessSheet, row: number, col: number, sheet = "s1") => s.workbook().getSheetBySheetId(sheet)?.getCell(row, col) ?? null;
const resource = (wb: IWorkbookData, name: string): unknown => {
  const data = wb.resources?.find((r) => r.name === name)?.data;
  return data ? JSON.parse(data) : null;
};
const UNDO = "univer.command.undo";
const REDO = "univer.command.redo";
const service = <T>(s: HeadlessSheet, token: DependencyIdentifier<T>): T => s.headless.univer.__getInjector().get(token);
/** Undo acts on the focused unit; the UI focuses the grid on render and click, headless nothing does. */
const focus = (s: HeadlessSheet) => service(s, s.headless.modules.presets.IUniverInstanceService).focusUnit(s.unitId);
const history = (s: HeadlessSheet) => service(s, s.headless.modules.presets.IUndoRedoService).getUndoRedoStatus(s.unitId);

afterEach(() => {
  disposeHeadlessUniverses();
});

describe("op replay: A → capture → codec → accept + sanitize → B", () => {
  test("values with styles, number formats and rich text", async () => {
    const [a, b] = await pair();
    const rich = { id: "d", body: { dataStream: "Hello bold\r\n", textRuns: [{ st: 6, ed: 10, ts: { bl: BOOL.TRUE } }] }, documentStyle: {} };
    expect(await a.run("sheet.command.set-range-values", { ...target(), range: range(1, 1, 1, 3), value: [[{ v: 1.5, s: { bl: BOOL.TRUE, fs: 14 } }, { v: "text" }, { p: rich }]] })).toBe(true);
    expect(await a.run("sheet.command.set-style", { ...target(), range: range(2, 2, 3, 3), style: { type: "it", value: BOOL.TRUE } })).toBe(true);
    expect(await a.run("sheet.command.numfmt.set.numfmt", { values: [{ row: 4, col: 1, pattern: "0.00%" }] })).toBe(true);
    const ops = await expectConverged(a, b);
    expect(ops.map((op) => op.mutationId)).toContain("sheet.mutation.set-range-values");
    expect(cell(b, 1, 3)?.p?.body?.dataStream).toBe("Hello bold\r\n");
    expect(cell(b, 4, 1)?.s).toBeTruthy();
  });

  test("insert, remove and move rows and columns", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.insert-row-by-range", { ...target(), range: range(3, 0, 4, 14), direction: 0 })).toBe(true);
    expect(await a.run("sheet.command.remove-row-by-range", { ...target(), range: range(10, 0, 10, 14) })).toBe(true);
    expect(await a.run("sheet.command.insert-col-by-range", { ...target(), range: range(0, 2, 49, 2), direction: 3 })).toBe(true);
    expect(await a.run("sheet.command.remove-col-by-range", { ...target(), range: range(0, 5, 49, 5) })).toBe(true);
    const rowRange = { ...range(12, 0, 12, 14), rangeType: 1 };
    expect(await a.run("sheet.command.move-rows", { ...target(), range: rowRange, fromRange: rowRange, toRange: { ...range(2, 0, 2, 14), rangeType: 1 } })).toBe(true);
    const colRange = { ...range(0, 7, 49, 7), rangeType: 2 };
    expect(await a.run("sheet.command.move-cols", { ...target(), range: colRange, fromRange: colRange, toRange: { ...range(0, 1, 49, 1), rangeType: 2 } })).toBe(true);
    await expectConverged(a, b);
  });

  test("merge and unmerge", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.add-worksheet-merge", { ...target(), selections: [range(20, 1, 21, 3)], defaultMerge: true })).toBe(true);
    await expectConverged(a, b);
    expect(b.workbook().getSheetBySheetId("s1")?.getMergeData().length).toBe(1);
    expect(await a.run("sheet.command.remove-worksheet-merge", { ...target(), ranges: [range(20, 1, 21, 3)] })).toBe(true);
    await expectConverged(a, b);
    expect(b.workbook().getSheetBySheetId("s1")?.getMergeData().length).toBe(0);
  });

  test("insert, rename, reorder, hide and remove sheets", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.insert-sheet", { unitId: U, index: 2, sheet: { id: "s3", name: "Third" } })).toBe(true);
    expect(await a.run("sheet.command.set-worksheet-name", { ...target("s3"), name: "Renamed" })).toBe(true);
    expect(await a.run("sheet.command.set-worksheet-order", { ...target("s3"), order: 0 })).toBe(true);
    expect(await a.run("sheet.command.set-worksheet-hidden", { ...target("s2") })).toBe(true);
    await expectConverged(a, b);
    expect(b.adapter.save().sheetOrder).toEqual(["s3", "s1", "s2"]);
    expect(await a.run("sheet.command.remove-sheet", { ...target("s3") })).toBe(true);
    await expectConverged(a, b);
    expect(b.adapter.save().sheetOrder).toEqual(["s1", "s2"]);
  });

  test("a large copy-sheet arrives in split chunks and converges", async () => {
    const [a, b] = await pair(true);
    expect(await a.run("sheet.command.copy-sheet", { ...target() })).toBe(true);
    const chunks = a.captured.filter((op) => op.params.__splitChunk__ === true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(a.captured.map((op) => op.mutationId)).toContain("sheet.mutation.copy-worksheet-end");
    // A applies the scheduled chunks to its own model later (idle time); B gets them from the log right away.
    for (let i = 0; i < 200 && !copyComplete(a); i++) await new Promise((r) => setTimeout(r, 10));
    expect(copyComplete(a)).toBe(true);
    await expectConverged(a, b);
    const copy = b.adapter.save().sheetOrder[1];
    expect(Object.keys(b.adapter.save().sheets[copy].cellData ?? {}).length).toBe(700);
  });

  test("freeze, column width, row height and hidden rows", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.set-frozen", { ...target(), startRow: 2, startColumn: 1, xSplit: 1, ySplit: 2 })).toBe(true);
    expect(await a.run("sheet.command.set-worksheet-col-width", { ...target(), ranges: [range(0, 2, 0, 3)], value: 140 })).toBe(true);
    expect(await a.run("sheet.command.set-row-height", { ...target(), ranges: [range(5, 0, 6, 0)], value: 48 })).toBe(true);
    expect(await a.run("sheet.command.set-rows-hidden", { ...target(), ranges: [{ ...range(8, 0, 9, 14), rangeType: 1 }] })).toBe(true);
    await expectConverged(a, b);
    const s1 = b.adapter.save().sheets.s1;
    expect([s1.freeze?.ySplit, s1.columnData?.[2]?.w, s1.rowData?.[5]?.h, s1.rowData?.[8]?.hd]).toEqual([2, 140, 48, BOOL.TRUE]);
  });

  test("wrap text: the originating client's auto-height ops reach B and the heights match", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.set-range-values", { ...target(), range: range(3, 0), value: { v: "A long line that wraps onto several lines" } })).toBe(true);
    expect(await a.run("sheet.command.set-text-wrap", { ...target(), range: range(3, 0), value: WRAP.WRAP })).toBe(true);
    // The heights are measured by the UI (sheets-ui) on the originating client and executed as this mutation.
    expect(a.mutate("sheet.mutation.set-worksheet-row-auto-height", { ...target(), rowsAutoHeightInfo: [{ row: 3, autoHeight: 64 }] })).toBe(true);
    const ops = await expectConverged(a, b);
    expect(ops.map((op) => op.mutationId)).toContain("sheet.mutation.set-worksheet-row-auto-height");
    expect(b.workbook().getSheetBySheetId("s1")?.getRowHeight(3)).toBe(a.workbook().getSheetBySheetId("s1")?.getRowHeight(3));
    expect(b.adapter.save().sheets.s1.rowData?.[3]?.ah).toBe(64);
  });

  test("conditional formatting add, update and delete", async () => {
    const [a, b] = await pair();
    const rule = { ranges: [range(0, 0, 9, 0)], cfId: "cf1", stopIfTrue: false, rule: { type: CF_RULE_TYPE.highlightCell, subType: CF_SUB_TYPE.number, operator: CF_NUMBER_OP.greaterThan, value: 5, style: { bg: { rgb: "#ff0000" } } } };
    expect(await a.run("sheet.command.add-conditional-rule", { ...target(), rule })).toBe(true);
    await expectConverged(a, b);
    const cfId = (resource(a.adapter.save(), RESOURCE.CONDITIONAL_FORMATTING) as Record<string, Array<{ cfId: string }>>).s1[0].cfId;
    expect(await a.run("sheet.command.set-conditional-rule", { ...target(), cfId, rule: { ...rule, cfId, ranges: [range(0, 0, 19, 1)] } })).toBe(true);
    await expectConverged(a, b);
    expect(await a.run("sheet.command.delete-conditional-rule", { ...target(), cfId })).toBe(true);
    await expectConverged(a, b);
  });

  test("data validation add, update and remove", async () => {
    const [a, b] = await pair();
    const rule = { uid: "dv1", type: DV_TYPE.LIST, ranges: [range(0, 4, 9, 4)], formula1: "a,b,c" };
    expect(await a.run("sheet.command.addDataValidation", { ...target(), rule })).toBe(true);
    await expectConverged(a, b);
    expect(await a.run("sheets.command.update-data-validation-setting", { ...target(), ruleId: "dv1", setting: { type: DV_TYPE.LIST, formula1: "x,y", allowBlank: true } })).toBe(true);
    await expectConverged(a, b);
    expect(await a.run("sheet.command.remove-data-validation-rule", { ...target(), ruleId: "dv1" })).toBe(true);
    await expectConverged(a, b);
  });

  test("hyperlinks: add, update and remove (rich text), and the hyperlink-model mutations", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheets.command.add-hyper-link", { ...target(), link: { id: "l1", row: 2, column: 2, payload: "https://example.com/a", display: "Example" } })).toBe(true);
    await expectConverged(a, b);
    const linked = cell(b, 2, 2)?.p?.body?.customRanges?.[0];
    expect(linked?.properties?.url).toBe("https://example.com/a");
    const rangeId = linked?.rangeId as string;
    expect(await a.run("sheets.command.update-hyper-link", { ...target(), id: rangeId, row: 2, column: 2, payload: { payload: "https://example.com/b", display: "Updated" } })).toBe(true);
    await expectConverged(a, b);
    expect(await a.run("sheets.command.cancel-hyper-link", { ...target(), id: cell(a, 2, 2)?.p?.body?.customRanges?.[0]?.rangeId, row: 2, column: 2 })).toBe(true);
    await expectConverged(a, b);
    // The hyperlink-model mutations (no command of 1.0.2 emits them; Univer keeps these links in memory only,
    // no resource saves them) still reach B, and B's model follows A's.
    const links = (s: HeadlessSheet) => {
      const { HyperLinkModel } = s.headless.modules.hyperLink;
      return s.headless.univer.__getInjector().get(HyperLinkModel).getSubUnit(U, "s1");
    };
    expect(a.mutate("sheets.mutation.add-hyper-link", { ...target(), link: { id: "m1", row: 6, column: 1, payload: "https://example.com/m", display: "" } })).toBe(true);
    expect(a.mutate("sheets.mutation.update-hyper-link", { ...target(), id: "m1", payload: { payload: "https://example.com/n", display: "" } })).toBe(true);
    await expectConverged(a, b);
    expect(links(b)).toEqual(links(a));
    expect(links(b).map((link) => link.payload)).toEqual(["https://example.com/n"]);
    expect(a.mutate("sheets.mutation.remove-hyper-link", { ...target(), id: "m1" })).toBe(true);
    await expectConverged(a, b);
    expect(links(b)).toEqual([]);
  });

  test("notes add and remove", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.update-note", { unitId: U, sheetId: "s1", subUnitId: "s1", row: 1, col: 1, note: { id: "n1", row: 1, col: 1, width: 160, height: 72, note: "Check this" } })).toBe(true);
    await expectConverged(a, b);
    expect(JSON.stringify(resource(b.adapter.save(), RESOURCE.NOTE))).toContain("Check this");
    expect(a.mutate("sheet.mutation.remove-note", { unitId: U, sheetId: "s1", noteId: "n1", row: 1, col: 1 })).toBe(true);
    await expectConverged(a, b);
  });

  test("defined names set and remove", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.insert-defined-name", { unitId: U, id: "dn1", name: "Totals", formulaOrRefString: "Sheet1!$A$1:$B$4" })).toBe(true);
    await expectConverged(a, b);
    expect(JSON.stringify(b.adapter.save().resources)).toContain("Totals");
    expect(await a.run("sheet.command.remove-defined-name", { unitId: U, id: "dn1", name: "Totals", formulaOrRefString: "Sheet1!$A$1:$B$4" })).toBe(true);
    await expectConverged(a, b);
  });

  test("filter range", async () => {
    const [a, b] = await pair();
    expect(await a.run("sheet.command.set-filter-range", { ...target(), range: range(0, 0, 20, 5) })).toBe(true);
    await expectConverged(a, b);
    expect(resource(b.adapter.save(), RESOURCE.FILTER)).toEqual(resource(a.adapter.save(), RESOURCE.FILTER));
  });

  test("a drawing with an allowed image URL and a sheet background image", async () => {
    const [a, b] = await pair();
    const drawing = {
      unitId: U, subUnitId: "s1", drawingId: "img1", drawingType: 0, imageSourceType: IMAGE_SOURCE_TYPE.URL, source: IMG,
      transform: { left: 10, top: 10, width: 80, height: 60 },
      sheetTransform: { from: { column: 1, columnOffset: 0, row: 1, rowOffset: 0 }, to: { column: 2, columnOffset: 0, row: 3, rowOffset: 0 } },
      axisAlignSheetTransform: { from: { column: 1, columnOffset: 0, row: 1, rowOffset: 0 }, to: { column: 2, columnOffset: 0, row: 3, rowOffset: 0 } },
    };
    expect(await a.run("sheet.command.insert-sheet-image", { unitId: U, drawings: [drawing] })).toBe(true);
    expect(await a.run("sheet.command.set-worksheet-background-image", { ...target(), backgroundImage: { source: IMG, imageSourceType: IMAGE_SOURCE_TYPE.URL } })).toBe(true);
    await expectConverged(a, b);
    expect(JSON.stringify(resource(b.adapter.save(), RESOURCE.DRAWING))).toContain(IMG);
    expect(b.adapter.save().sheets.s1.backgroundImage?.source).toBe(IMG);
  });
});

describe("the model adapter itself", () => {
  test("a holder's unsafe image URL is saved neutralized; its own grid keeps what it typed until a reload", async () => {
    const [a, b] = await pair();
    const evil = "https://evil.example/track.png";
    expect(await a.run("sheet.command.set-worksheet-background-image", { ...target(), backgroundImage: { source: evil, imageSourceType: IMAGE_SOURCE_TYPE.URL } })).toBe(true);
    const [op] = replay(a, b);
    expect((op.params.backgroundImage as { source: string }).source).toBe("");
    expect(b.adapter.save().sheets.s1.backgroundImage?.source).toBe("");
    expect(a.adapter.save().sheets.s1.backgroundImage?.source).toBe(evil);
  });

  test("read-only: Univer refuses edit commands and nothing is captured; remote ops still apply", async () => {
    const [a] = await pair();
    a.adapter.setEditable(false);
    expect(await a.run("sheet.command.set-range-values", { ...target(), range: range(0, 0), value: { v: "blocked" } })).toBe(false);
    expect([a.captured, a.snapshots]).toEqual([[], []]);
    const op = { mutationId: "sheet.mutation.set-range-values", params: { ...target(), cellValue: { 0: { 0: { v: "remote", t: 1 } } } } };
    expect(a.adapter.applyRemote([op])).toEqual({ applied: 1, failedAt: -1 });
    expect([cell(a, 0, 0)?.v, a.captured.length]).toEqual(["remote", 0]);
  });

  test("applyRemote stops at the first op Univer does not know or rejects", async () => {
    const [, b] = await pair();
    const good = { mutationId: "sheet.mutation.set-range-values", params: { ...target(), cellValue: { 1: { 1: { v: 1, t: 2 } } } } };
    expect(b.adapter.applyRemote([good, { mutationId: "sheet.mutation.not-registered", params: target() }, good])).toEqual({ applied: 1, failedAt: 1 });
    expect(b.adapter.applyRemote([{ mutationId: "sheet.mutation.remove-sheet", params: { ...target("missing"), subUnitId: "missing" } }])).toEqual({ applied: 0, failedAt: 0 });
  });

  test("load replaces the unit under the same id, keeps the active sheet, and forgets the old content", async () => {
    const [a] = await pair();
    expect(await a.run("sheet.command.set-worksheet-activate", { unitId: U, subUnitId: "s2" })).toBe(true);
    a.captured.length = 0;
    const next = baseWorkbook();
    (next as { id: string }).id = "some-other-id";
    next.sheets.s1.cellData = { 0: { 0: { v: "fresh", t: 1 } } };
    a.adapter.load(next);
    expect([a.workbook().getUnitId(), a.workbook().getActiveSheet().getSheetId(), cell(a, 0, 0)?.v, cell(a, 1, 1)]).toEqual([U, "s2", "fresh", null]);
    expect([a.captured, a.snapshots]).toEqual([[], []]); // loading is never captured
    expect(a.adapter.save().id).toBe(U);
  });

  test("read-only also refuses Undo and Redo, which Univer does not gate on the editable permission", async () => {
    const [a] = await pair();
    expect(await a.run("sheet.command.set-range-values", { ...target(), range: range(0, 0), value: { v: "typed" } })).toBe(true);
    focus(a);
    a.captured.length = 0;
    a.adapter.setEditable(false);
    expect(await a.run(UNDO)).toBe(false);
    expect([cell(a, 0, 0)?.v, a.captured, history(a)]).toEqual(["typed", [], { undos: 1, redos: 0 }]);
    a.adapter.setEditable(true); // the same holder again with nothing applied in between: its Undo is still valid
    expect(await a.run(UNDO)).toBe(true);
    a.adapter.setEditable(false);
    expect(await a.run(REDO)).toBe(false);
    expect([cell(a, 0, 0)?.v, history(a)]).toEqual([0, { undos: 0, redos: 1 }]);
  });

  test("a reload clears Undo and Redo: nothing typed before it replays against the reloaded content", async () => {
    const [a] = await pair();
    expect(await a.run("sheet.command.insert-row-by-range", { ...target(), range: range(2, 0, 2, 14), direction: 0 })).toBe(true);
    expect(await a.run("sheet.command.set-range-values", { ...target(), range: range(0, 0), value: { v: "typed" } })).toBe(true);
    focus(a);
    expect(await a.run(UNDO)).toBe(true); // control: Undo works before the reload, and fills Redo
    expect(history(a)).toEqual({ undos: 1, redos: 1 });
    a.adapter.load(baseWorkbook()); // e.g. the lease was lost and the pending insert discarded
    focus(a);
    a.captured.length = 0;
    const reloaded = a.comparable();
    expect(history(a)).toEqual({ undos: 0, redos: 0 });
    expect([await a.run(UNDO), await a.run(REDO)]).toEqual([false, false]);
    expect([a.comparable(), a.captured]).toEqual([reloaded, []]);
  });

  test("applied remote ops clear Undo: after a hand-back, Undo never replays a stale local edit", async () => {
    const [a] = await pair();
    expect(await a.run("sheet.command.insert-row-by-range", { ...target(), range: range(2, 0, 2, 14), direction: 0 })).toBe(true);
    a.adapter.setEditable(false); // handed over: A now views
    expect(a.adapter.applyRemote([{ mutationId: "sheet.mutation.remove-sheet", params: target("missing") }])).toEqual({ applied: 0, failedAt: 0 });
    expect(history(a).undos).toBe(1); // nothing applied, nothing to invalidate
    const insertTop = { mutationId: "sheet.mutation.insert-row", params: { ...target(), range: { ...range(0, 0, 0, 14), rangeType: 1 } } };
    expect(a.adapter.applyRemote([insertTop])).toEqual({ applied: 1, failedAt: -1 });
    a.adapter.setEditable(true); // A holds again, with no reload in between
    focus(a);
    a.captured.length = 0;
    const current = a.comparable();
    expect(history(a)).toEqual({ undos: 0, redos: 0 });
    expect(await a.run(UNDO)).toBe(false);
    expect([a.comparable(), a.captured]).toEqual([current, []]);
  });

  test("a preview adapter shows its own unit, outlives a reload of the sheet, and hands the sheet back on dispose", async () => {
    const [a] = await pair();
    const { presets: P } = a.headless.modules;
    const instances = service(a, P.IUniverInstanceService);
    const current = () => instances.getCurrentUnitOfType(P.UniverInstanceType.UNIVER_SHEET)?.getUnitId() ?? null;
    const { createUniverModelAdapter } = await import("@/lib/sheets/univer/model-adapter");
    const preview = createUniverModelAdapter({ univer: a.headless.univer, univerAPI: null }, { unitId: SHEET_PREVIEW_UNIT_ID });
    const version = baseWorkbook();
    version.sheets.s1.cellData = { 0: { 0: { v: "version", t: 1 } } };
    expect(current()).toBe(U);
    preview.load(version);
    expect([current(), preview.save().id, preview.save().sheets.s1.cellData?.[0]?.[0]?.v]).toEqual([SHEET_PREVIEW_UNIT_ID, SHEET_PREVIEW_UNIT_ID, "version"]);
    a.adapter.load(baseWorkbook()); // the sheet reloads while the preview is open
    expect(current()).toBe(SHEET_PREVIEW_UNIT_ID);
    preview.dispose();
    expect([current(), instances.getUnit(SHEET_PREVIEW_UNIT_ID) ?? null, cell(a, 1, 1)?.v]).toEqual([U, null, 11]);
    expect([a.captured, a.snapshots]).toEqual([[], []]);
  });

  test("saveForExport gives every formula cell its own formula and drops shared-formula ids", async () => {
    const wb = baseWorkbook();
    wb.sheets.s1.cellData = { 0: { 0: { v: 1, t: 2 }, 1: { f: "=A1*2", si: "sf" } }, 1: { 0: { v: 5, t: 2 }, 1: { si: "sf", v: 10, t: 2 } } };
    const sheet = await createHeadlessSheet({ data: wb });
    const exported = sheet.adapter.saveForExport().sheets.s1.cellData ?? {};
    expect([exported[0]?.[1]?.f, exported[1]?.[1]?.f, exported[1]?.[1]?.v]).toEqual(["=A1*2", "=A2*2", 10]);
    expect([exported[0]?.[1]?.si, exported[1]?.[1]?.si]).toEqual([undefined, undefined]);
    expect(sheet.adapter.save().sheets.s1.cellData?.[1]?.[1]?.si).toBe("sf"); // save() itself is untouched
  });
});

function copyComplete(a: HeadlessSheet): boolean {
  const wb = a.adapter.save();
  const copy = wb.sheetOrder[1];
  return Object.keys(wb.sheets[copy]?.cellData ?? {}).length === 700;
}
