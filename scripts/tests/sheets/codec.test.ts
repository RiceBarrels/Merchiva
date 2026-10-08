// lib/sheets/codec.ts — the gzipped JSON snapshot / op-batch formats (sheets.md §4.1): round trips,
// the envelope and batch shape checks, deterministic bytes (mtime 0), the inflate caps, and the async
// decoder (sliced, yielding without timers). Also lib/sheets/blank.ts, the seed every new spreadsheet is created with.

import { describe, expect, test } from "bun:test";
import { gzipSync, strToU8 } from "fflate";
import type { IWorkbookData } from "@univerjs/presets";
import { BLANK_SHEET_COLUMNS, BLANK_SHEET_ROWS, blankWorkbookData, newSheetId } from "@/lib/sheets/blank";
import {
  OPS_MAX_INFLATED_BYTES, SHEET_ASYNC_DECODE_MIN_BYTES, SheetCodecError, decodeSheetEnvelope, decodeSheetEnvelopeAsync,
  decodeSheetOps, decodeSheetSnapshot, decodeSheetSnapshotAsync, encodeSheetOps, encodeSheetSnapshot, isGzip,
  type SheetCodecErrorReason, type SheetOpBatch,
} from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { UNIVER_LOCALE } from "@/lib/sheets/univer-constants";

const gzJson = (value: unknown) => gzipSync(strToU8(JSON.stringify(value)), { mtime: 0 });

function workbook(cells: Record<number, Record<number, { v: string | number }>> = { 0: { 0: { v: "A1" }, 1: { v: 2 } } }): IWorkbookData {
  const wb = blankWorkbookData({ name: "Budget", locale: UNIVER_LOCALE.EN_US, sheetName: "Sheet1" });
  wb.sheets[wb.sheetOrder[0]].cellData = cells;
  return wb;
}

function reasonOf(fn: () => unknown): SheetCodecErrorReason | "no error" | "other error" {
  try {
    fn();
    return "no error";
  } catch (err) {
    return err instanceof SheetCodecError ? err.reason : "other error";
  }
}

async function asyncReasonOf(fn: () => Promise<unknown>): Promise<SheetCodecErrorReason | "no error" | "other error"> {
  try {
    await fn();
    return "no error";
  } catch (err) {
    return err instanceof SheetCodecError ? err.reason : "other error";
  }
}

describe("snapshots", () => {
  test("round trip: the workbook comes back equal, inside a v1 envelope stamped with the app version", () => {
    const wb = workbook();
    const bytes = encodeSheetSnapshot(wb);
    expect(isGzip(bytes)).toBe(true);
    expect(decodeSheetSnapshot(bytes)).toEqual(JSON.parse(JSON.stringify(wb)));
    const envelope = decodeSheetEnvelope(bytes);
    expect(envelope.v).toBe(1);
    expect(envelope.app).toBe(SHEET_APP_VERSION);
  });

  test("equal content gives equal bytes: gzip mtime is 0", () => {
    const wb = workbook();
    const bytes = encodeSheetSnapshot(wb);
    expect([...bytes.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect(encodeSheetSnapshot(JSON.parse(JSON.stringify(wb)) as IWorkbookData)).toEqual(bytes);
    expect(encodeSheetOps({ v: 1, app: "1.0.2", seq: 1, ops: [] })).toEqual(encodeSheetOps({ v: 1, app: "1.0.2", seq: 1, ops: [] }));
  });

  test("a newer writer's app version is kept for the version gate", () => {
    const bytes = gzJson({ v: 1, app: "9.9.9", wb: workbook() });
    expect(decodeSheetEnvelope(bytes).app).toBe("9.9.9");
  });

  test("the unit id is pinned and missing top-level fields are filled", () => {
    const wb = { id: "someone-elses-unit", sheetOrder: ["s1"], sheets: { s1: { id: "s1", name: "One" } } };
    const decoded = decodeSheetSnapshot(gzJson({ v: 1, app: "1.0.2", wb }));
    expect(decoded.id).toBe(SHEET_UNIT_ID);
    expect(decoded.name).toBe("");
    expect(decoded.appVersion).toBe(SHEET_APP_VERSION);
    expect(decoded.locale).toBe(UNIVER_LOCALE.EN_US);
    expect(decoded.styles).toEqual({});
    expect(decoded.sheetOrder).toEqual(["s1"]);
  });

  test("shape checks: every malformed envelope is bad_shape", () => {
    const good = workbook();
    const bad: unknown[] = [
      null, [], "text", { v: 2, app: "1.0.2", wb: good }, { v: 1, wb: good }, { v: 1, app: 1, wb: good },
      { v: 1, app: "1.0.2" }, { v: 1, app: "1.0.2", wb: [] },
      { v: 1, app: "1.0.2", wb: { ...good, sheets: [] } }, { v: 1, app: "1.0.2", wb: { ...good, sheetOrder: "s1" } },
      { v: 1, app: "1.0.2", wb: { ...good, sheetOrder: [1] } }, { v: 1, app: "1.0.2", wb: { ...good, sheets: { s1: 5 } } },
      { v: 1, app: "1.0.2", wb: { ...good, resources: {} } },
    ];
    for (const value of bad) expect([JSON.stringify(value)?.slice(0, 60), reasonOf(() => decodeSheetEnvelope(gzJson(value)))]).toEqual([JSON.stringify(value)?.slice(0, 60), "bad_shape"]);
  });

  test("not gzip, truncated gzip, not JSON, not UTF-8", () => {
    expect(reasonOf(() => decodeSheetSnapshot(new Uint8Array(0)))).toBe("not_gzip");
    expect(reasonOf(() => decodeSheetSnapshot(strToU8(JSON.stringify({ v: 1 }))))).toBe("not_gzip");
    const bytes = encodeSheetSnapshot(workbook());
    expect(reasonOf(() => decodeSheetSnapshot(bytes.subarray(0, bytes.length - 12)))).toBe("not_gzip");
    expect(reasonOf(() => decodeSheetSnapshot(gzipSync(strToU8("{ not json"))))).toBe("bad_json");
    expect(reasonOf(() => decodeSheetSnapshot(gzipSync(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))))).toBe("bad_json");
  });
});

describe("op batches", () => {
  const batch: SheetOpBatch = {
    v: 1, app: SHEET_APP_VERSION, seq: 3,
    ops: [{ mutationId: "sheet.mutation.set-range-values", params: { unitId: SHEET_UNIT_ID, subUnitId: "s1", cellValue: { 0: { 0: { v: 1 } } } } }],
  };

  test("round trip keeps app, seq and the ops", () => {
    const bytes = encodeSheetOps(batch);
    expect(isGzip(bytes)).toBe(true);
    expect(decodeSheetOps(bytes)).toEqual(batch);
  });

  test("seq must be a positive safe integer; ops an array; v 1; app a string", () => {
    const bad: unknown[] = [
      { ...batch, seq: 0 }, { ...batch, seq: -1 }, { ...batch, seq: 1.5 }, { ...batch, seq: "3" }, { ...batch, seq: 2 ** 60 },
      { ...batch, ops: {} }, { ...batch, v: 2 }, { ...batch, app: null }, [batch],
    ];
    for (const value of bad) expect(reasonOf(() => decodeSheetOps(gzJson(value)))).toBe("bad_shape");
  });

  test("a malformed op does not fail the batch: acceptRemoteOp judges each op", () => {
    const decoded = decodeSheetOps(gzJson({ ...batch, ops: [42, { mutationId: 1 }, batch.ops[0]] }));
    expect(decoded.ops).toHaveLength(3);
  });

  test("decodeSheetOps throws on non-gzip input and never returns null", () => {
    expect(reasonOf(() => decodeSheetOps(new Uint8Array(40)))).toBe("not_gzip");
    expect(reasonOf(() => decodeSheetOps(strToU8("[sheet] plain text payload, not compressed")))).toBe("not_gzip");
  });

  test("the inflate cap stops a small payload that expands past 32 MiB", () => {
    const bomb = gzipSync(strToU8(JSON.stringify({ ...batch, pad: "a".repeat(OPS_MAX_INFLATED_BYTES) })), { level: 9 });
    expect(bomb.length).toBeLessThan(200_000);
    expect(reasonOf(() => decodeSheetOps(bomb))).toBe("too_big");
    // Just under the cap still decodes.
    const fits = gzipSync(strToU8(JSON.stringify({ ...batch, pad: "a".repeat(1024 * 1024) })));
    expect(decodeSheetOps(fits).seq).toBe(3);
  });
});

describe("async decode", () => {
  function largeWorkbook(): IWorkbookData {
    // Random hex cells, so the snapshot stays large after compression.
    const cells: Record<number, Record<number, { v: string }>> = {};
    for (let r = 0; r < 3000; r++) {
      cells[r] = {};
      for (let c = 0; c < 20; c++) cells[r][c] = { v: crypto.randomUUID().slice(0, 13) };
    }
    return workbook(cells);
  }

  test("a snapshot above the threshold decodes in slices to the same envelope", async () => {
    const bytes = encodeSheetSnapshot(largeWorkbook());
    expect(bytes.length).toBeGreaterThanOrEqual(SHEET_ASYNC_DECODE_MIN_BYTES);
    const sync = decodeSheetEnvelope(bytes);
    const envelope = await decodeSheetEnvelopeAsync(bytes);
    expect(envelope).toEqual(sync);
    expect(await decodeSheetSnapshotAsync(bytes)).toEqual(sync.wb);
  });

  test("the sliced path yields through MessageChannel, never a timer (hidden tabs clamp chained timers)", async () => {
    const bytes = encodeSheetSnapshot(largeWorkbook());
    const sync = decodeSheetEnvelope(bytes);
    const realSetTimeout = globalThis.setTimeout;
    const RealChannel = globalThis.MessageChannel;
    let timers = 0;
    let channels = 0;
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      timers++;
      return realSetTimeout(...args);
    }) as typeof setTimeout;
    globalThis.MessageChannel = class extends RealChannel {
      constructor() {
        super();
        channels++;
      }
    };
    try {
      expect(await decodeSheetEnvelopeAsync(bytes)).toEqual(sync);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.MessageChannel = RealChannel;
    }
    expect(timers).toBe(0);
    expect(channels).toBeGreaterThan(0);
  });

  test("a small snapshot takes the direct path and keeps the same checks", async () => {
    const small = encodeSheetSnapshot(workbook());
    expect(small.length).toBeLessThan(SHEET_ASYNC_DECODE_MIN_BYTES);
    expect((await decodeSheetEnvelopeAsync(small)).wb.id).toBe(SHEET_UNIT_ID);
    expect(await asyncReasonOf(() => decodeSheetEnvelopeAsync(new Uint8Array(10)))).toBe("not_gzip");
  });

  test("the sliced path rejects corrupt and malformed input like the sync one", async () => {
    const big = encodeSheetSnapshot(largeWorkbook());
    expect(await asyncReasonOf(() => decodeSheetEnvelopeAsync(big.subarray(0, big.length - 100)))).toBe("not_gzip");
    const randomTail = new Uint8Array(SHEET_ASYNC_DECODE_MIN_BYTES + 10);
    crypto.getRandomValues(randomTail);
    const notJson = gzipSync(randomTail, { level: 0 });
    expect(notJson.length).toBeGreaterThanOrEqual(SHEET_ASYNC_DECODE_MIN_BYTES);
    expect(await asyncReasonOf(() => decodeSheetEnvelopeAsync(notJson))).toBe("bad_json");
  });
});

describe("blank workbook", () => {
  test("one visible, empty sheet with Univer's default grid, under our unit id", () => {
    const wb = blankWorkbookData({ name: "New", locale: UNIVER_LOCALE.FR_FR, sheetName: "Feuille 1" });
    expect(wb.id).toBe(SHEET_UNIT_ID);
    expect(wb.appVersion).toBe(SHEET_APP_VERSION);
    expect(wb.locale).toBe(UNIVER_LOCALE.FR_FR);
    expect(wb.sheetOrder).toHaveLength(1);
    const sheet = wb.sheets[wb.sheetOrder[0]];
    expect(sheet).toMatchObject({ id: wb.sheetOrder[0], name: "Feuille 1", hidden: 0, rowCount: BLANK_SHEET_ROWS, columnCount: BLANK_SHEET_COLUMNS, cellData: {} });
    expect(decodeSheetSnapshot(encodeSheetSnapshot(wb))).toEqual(JSON.parse(JSON.stringify(wb)));
  });

  test("sheet ids are short, lowercase and unique", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newSheetId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^s[a-z0-9]{12}$/);
  });
});
