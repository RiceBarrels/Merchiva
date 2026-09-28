// lib/sheets/sync/remote-apply.ts with the production receive policy (mutation-filter.ts acceptRemoteOp) and the real
// sanitizer (W1.2a#1, sheets.md §4.5): a received set-drawing-apply json1 op that moves or edits a drawing's `source`
// makes sanitizeOpParams throw SheetCodecError('bad_shape'). That op alone is "not accepted": it is skipped, the rest
// of its row applies, and the viewer is marked diverged (the sheets.editor.skippedChanges banner) — never an
// undecodable row, never a reload.

import { describe, expect, test } from "bun:test";
import type { DocSnapshotRow, DocUpdateRow } from "@/lib/docs/types";
import { SheetCodecError, encodeSheetOps, encodeSheetSnapshot } from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { sanitizeOpParams } from "@/lib/sheets/sanitize";
import { SheetModelSync, SheetPoisonTracker, applyRemoteRow, type SheetReloadReason } from "@/lib/sheets/sync/remote-apply";
import type { SheetOp } from "@/lib/sheets/types";
import { acceptRemoteOp } from "@/lib/sheets/univer/mutation-filter";
import { FakeModelAdapter, setCellOp, testWorkbook } from "./helpers/fake-model-adapter";

const DOC = "5b0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const DATA_PATH = [SHEET_UNIT_ID, "s1", "data"];
/** A json1 embedded edit of a drawing's source (sanitize.test.ts builds the same shapes with Univer's JSON1). */
const EDITED_SOURCE: SheetOp = {
  mutationId: "sheet.mutation.set-drawing-apply",
  params: { unitId: SHEET_UNIT_ID, subUnitId: "s1", type: 2, objects: [], op: [...DATA_PATH, "d1", "source", { e: ["evil"], et: "text-unicode" }] },
};

function updateRow(id: bigint, ops: SheetOp[], sessionId = "other-session"): DocUpdateRow {
  const payload = encodeSheetOps({ v: 1, app: SHEET_APP_VERSION, seq: Number(id), ops });
  return { id, documentId: DOC, organizationId: "org", payload, byteLength: payload.byteLength, sessionId, memberId: "m2", createdAt: new Date(0) };
}

describe("a received op the sanitizer refuses", () => {
  test("the policy accepts its shape, the sanitizer throws bad_shape for it", () => {
    expect(acceptRemoteOp(EDITED_SOURCE, SHEET_UNIT_ID)).toBe(true);
    let reason = "no error";
    try {
      sanitizeOpParams(EDITED_SOURCE.mutationId, structuredClone(EDITED_SOURCE.params));
    } catch (err) {
      reason = err instanceof SheetCodecError ? err.reason : String(err);
    }
    expect(reason).toBe("bad_shape");
  });

  test("applyRemoteRow skips that op only: the rest of the row applies and the row is not poisoned", () => {
    const model = new FakeModelAdapter();
    model.load(testWorkbook());
    const poison = new SheetPoisonTracker();
    const outcome = applyRemoteRow(updateRow(7n, [setCellOp(0, 0, "before"), EDITED_SOURCE, setCellOp(1, 0, "after")]), { model, acceptRemoteOp, poison });
    expect(outcome).toEqual({ kind: "applied", refusedOps: 1 });
    expect([model.applied.map((op) => op.mutationId), model.cell(0, 0), model.cell(1, 0), poison.isPoisoned(7n)])
      .toEqual([["sheet.mutation.set-range-values", "sheet.mutation.set-range-values"], "before", "after", false]);
  });

  test("the viewer is diverged (skipped ops counted), keeps its model and never reloads; a covering snapshot heals it", async () => {
    const state = encodeSheetSnapshot(testWorkbook({ "0:0": "hello" }));
    const snapshot: DocSnapshotRow = {
      documentId: DOC, organizationId: "org", state, throughUpdateId: 0n, byteLength: state.byteLength, html: "", plainText: "",
      compactedAt: new Date(0), compactedByMemberId: "m1",
    };
    const rows: DocUpdateRow[] = [];
    const calls: string[] = [];
    const loaded: Array<SheetReloadReason | null> = [];
    const sync = new SheetModelSync({
      sessionId: "my-session",
      acceptRemoteOp,
      host: {
        source: () => ({ snapshot: () => snapshot, rowsAfter: (id) => rows.filter((r) => r.id > id), lease: () => null }),
        isWriter: () => false,
        loaded: (reason) => void loaded.push(reason),
        loadFailed: () => void calls.push("loadFailed"),
        changed: () => {},
        undecodable: () => void calls.push("undecodable"),
        updateRequired: () => void calls.push("updateRequired"),
      },
    });
    const model = new FakeModelAdapter();
    sync.bind(model);
    await sync.load(null);
    expect([sync.loadState, sync.diverged, model.loads.length]).toEqual(["ready", false, 1]);

    const row = updateRow(1n, [EDITED_SOURCE, setCellOp(2, 0, "kept")]);
    rows.push(row);
    sync.onRow(row);
    await Promise.resolve();
    expect([sync.diverged, sync.skippedCounts, sync.appliedThrough, model.cell(2, 0)]).toEqual([true, { skippedOps: 1, skippedRows: 0 }, 1n, "kept"]);
    expect([model.loads.length, loaded, calls]).toEqual([1, [null], []]);

    // The holder's next snapshot covers the skipped row: the viewer reloads from it and is in step again.
    const healed = encodeSheetSnapshot(testWorkbook({ "0:0": "hello", "2:0": "kept" }));
    Object.assign(snapshot, { state: healed, byteLength: healed.byteLength, throughUpdateId: 1n, compactedAt: new Date(1) });
    rows.length = 0;
    sync.onSnapshot(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([sync.diverged, sync.skippedCounts, model.loads.length, loaded]).toEqual([false, { skippedOps: 0, skippedRows: 0 }, 2, [null, "diverged"]]);
  });
});
