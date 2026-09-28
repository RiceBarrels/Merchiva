// lib/sheets/univer/mutation-filter.ts — which mutations the op log carries, which received ops may run, and
// what capture does to the params (sheets.md §4.3; W1.2a's request: a sanitizer refusal is a snapshot).

import { describe, expect, test } from "bun:test";
import { decodeSheetOps, encodeSheetOps } from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_PREVIEW_UNIT_ID, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import {
  FORMULA_PERSISTED_MUTATION_IDS, PROTECTION_MUTATION_IDS, SHEET_IGNORED_MUTATION_IDS, acceptRemoteOp, captureMutation,
  classifyMutation,
} from "@/lib/sheets/univer/mutation-filter";
import { isEditingKey } from "@/lib/sheets/univer/view-only-guard";
import { IMAGE_SOURCE_TYPE } from "@/lib/sheets/univer-constants";

const U = SHEET_UNIT_ID;
const own = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ unitId: U, subUnitId: "s1", ...extra });
const classify = (id: string, params: unknown = own(), options?: Parameters<typeof classifyMutation>[1]) =>
  classifyMutation({ id, params }, options, U);

describe("classifyMutation (§4.3 rules, in order)", () => {
  test("rule 1: local-only, collaboration and changeset executions are ignored; syncOnly is synced", () => {
    expect(classify("sheet.mutation.set-range-values", own(), { onlyLocal: true })).toBe("ignore");
    expect(classify("sheet.mutation.set-range-values", own(), { fromCollab: true })).toBe("ignore");
    expect(classify("sheet.mutation.set-range-values", own(), { fromChangeset: true })).toBe("ignore");
    expect(classify("sheet.mutation.set-range-values", own({ __splitChunk__: true }), { syncOnly: true })).toBe("sync");
    expect(classify("sheet.mutation.set-range-values", own(), {})).toBe("sync");
  });

  test("rule 2: another unit's mutations are ignored (cell editor documents, the version preview)", () => {
    expect(classify("doc.mutation.rich-text-editing", { unitId: "__INTERNAL_EDITOR__DOCS_NORMAL" })).toBe("ignore");
    expect(classify("sheet.mutation.set-range-values", own({ unitId: SHEET_PREVIEW_UNIT_ID }))).toBe("ignore");
    expect(classifyMutation({ id: "sheet.mutation.set-range-values", params: own() }, undefined, SHEET_PREVIEW_UNIT_ID)).toBe("ignore");
  });

  test("rule 3: bookkeeping, protection and formula-engine traffic are ignored", () => {
    for (const id of SHEET_IGNORED_MUTATION_IDS) expect(classify(id)).toBe("ignore");
    for (const id of PROTECTION_MUTATION_IDS) expect(SHEET_IGNORED_MUTATION_IDS.has(id)).toBe(true);
    expect(PROTECTION_MUTATION_IDS.size).toBe(7);
    expect(classify("formula.mutation.set-formula-data", { formulaData: {} })).toBe("ignore");
    expect(classify("formula.mutation.set-formula-calculation-result", own())).toBe("ignore");
    // Registered as a mutation, but it only clears the local drawing frame (its params are [unitId]).
    expect(classify("sheet.operation.clear-drawing-transformer", [U])).toBe("ignore");
  });

  test("rule 4: persisted prefixes and the defined-name mutations sync when they address our unit", () => {
    for (const id of [
      "sheet.mutation.set-range-values", "sheet.mutation.insert-row", "sheets.mutation.add-hyper-link",
      "data-validation.mutation.addRule", "sheet.mutation.set-drawing-apply", "sheet.mutation.add-conditional-rule",
      // computed only on the originating client, absolute and idempotent: viewers need it
      "sheet.mutation.set-worksheet-row-auto-height",
      ...FORMULA_PERSISTED_MUTATION_IDS,
    ]) {
      expect(classify(id)).toBe("sync");
    }
    // A persisted mutation we cannot address safely waits for the next snapshot.
    expect(classify("sheet.mutation.set-range-values", { subUnitId: "s1" })).toBe("snapshot");
    expect(classifyMutation({ id: "sheet.mutation.set-range-values" }, undefined, U)).toBe("snapshot");
    expect(classify("formula.mutation.set-defined-name", { id: "dn", name: "x" })).toBe("snapshot");
  });

  test("rule 5: anything else is carried by a snapshot", () => {
    expect(classify("doc.mutation.rename-doc", {})).toBe("snapshot");
    expect(classify("some-plugin.mutation.custom", own())).toBe("snapshot");
  });
});

describe("acceptRemoteOp (receive side)", () => {
  test("a plain op for our unit with a persisted mutation id is accepted, also after the wire format", () => {
    const op = { mutationId: "sheet.mutation.set-range-values", params: own({ cellValue: { 0: { 0: { v: 1 } } } }) };
    expect(acceptRemoteOp(op, U)).toBe(true);
    const [decoded] = decodeSheetOps(encodeSheetOps({ v: 1, app: SHEET_APP_VERSION, seq: 1, ops: [op] })).ops;
    expect(acceptRemoteOp(decoded, U)).toBe(true);
  });

  test("operations and commands are never executed from the log", () => {
    for (const mutationId of [
      "sheet.operation.open-hyper-link-edit-panel", "sheet.command.set-range-values", "ui.operation.open-feature-search",
      "sheet.operation.set-worksheet-active", "sheet.command.add-range-protection",
    ]) {
      expect(acceptRemoteOp({ mutationId, params: own() }, U)).toBe(false);
    }
  });

  test("protection mutations, foreign units and malformed ops are refused", () => {
    for (const mutationId of PROTECTION_MUTATION_IDS) expect(acceptRemoteOp({ mutationId, params: own() }, U)).toBe(false);
    const id = "sheet.mutation.set-range-values";
    expect(acceptRemoteOp({ mutationId: id, params: own({ unitId: "someone-else" }) }, U)).toBe(false);
    expect(acceptRemoteOp({ mutationId: id, params: own({ unitId: SHEET_PREVIEW_UNIT_ID }) }, U)).toBe(false);
    expect(acceptRemoteOp({ mutationId: id, params: { subUnitId: "s1" } }, U)).toBe(false);
    expect(acceptRemoteOp({ mutationId: id, params: [own()] }, U)).toBe(false);
    expect(acceptRemoteOp({ mutationId: id, params: null }, U)).toBe(false);
    expect(acceptRemoteOp({ mutationId: id, params: Object.assign(new (class Params {})(), own()) }, U)).toBe(false);
    expect(acceptRemoteOp({ mutationId: 42, params: own() }, U)).toBe(false);
    expect(acceptRemoteOp({ params: own() }, U)).toBe(false);
    expect(acceptRemoteOp([id, own()], U)).toBe(false);
    expect(acceptRemoteOp(null, U)).toBe(false);
    expect(acceptRemoteOp("sheet.mutation.set-range-values", U)).toBe(false);
  });
});

describe("captureMutation (holder side)", () => {
  test("a synced mutation becomes a JSON copy of its params", () => {
    const params = own({ cellValue: { 1: { 1: { v: "x" } } }, trigger: "sheet.command.set-range-values" });
    const captured = captureMutation({ id: "sheet.mutation.set-range-values", params }, {}, U);
    expect(captured).toEqual({ kind: "op", op: { mutationId: "sheet.mutation.set-range-values", params } });
    (params.cellValue as Record<number, Record<number, { v: string }>>)[1][1].v = "changed after execution";
    expect(captured.kind === "op" && JSON.stringify(captured.op.params)).toContain("\"x\"");
  });

  test("ignored and snapshot dispositions pass through", () => {
    expect(captureMutation({ id: "formula.mutation.set-formula-data", params: {} }, { onlyLocal: true }, U)).toEqual({ kind: "ignore" });
    expect(captureMutation({ id: "sheet.mutation.set-range-values", params: {} }, {}, U)).toEqual({ kind: "snapshot", mutationId: "sheet.mutation.set-range-values" });
  });

  test("unsafe URLs typed by the holder are saved neutralized", () => {
    const link = captureMutation({
      id: "sheet.mutation.set-range-values",
      params: own({ cellValue: { 0: { 0: { p: { body: { dataStream: "x\r\n", customRanges: [{ rangeType: 0, startIndex: 0, endIndex: 0, properties: { url: "javascript:alert(1)" } }] } } } } } }),
    }, {}, U);
    expect(link.kind === "op" && JSON.stringify(link.op.params)).toContain("\"url\":\"\"");
    const drawing = captureMutation({
      id: "sheet.mutation.set-drawing-apply",
      params: own({ op: null, objects: [{ drawingId: "d", source: "https://evil.example/?leak=1", imageSourceType: IMAGE_SOURCE_TYPE.URL }], type: 0 }),
    }, {}, U);
    expect(drawing.kind === "op" && (drawing.op.params.objects as Array<{ source: string }>)[0].source).toBe("");
  });

  test("params JSON cannot carry faithfully become a snapshot; non-finite numbers become null as in a snapshot", () => {
    const id = "sheet.mutation.set-range-values";
    expect(captureMutation({ id, params: own({ at: new Date(0) }) }, {}, U).kind).toBe("snapshot");
    expect(captureMutation({ id, params: own({ fn: () => 1 }) }, {}, U).kind).toBe("snapshot");
    expect(captureMutation({ id, params: own({ big: 1n }) }, {}, U).kind).toBe("snapshot");
    expect(captureMutation({ id, params: own({ nested: [new Map()] }) }, {}, U).kind).toBe("snapshot");
    const rich = captureMutation({ id, params: own({ pageSize: { width: Infinity, height: Number.POSITIVE_INFINITY } }) }, {}, U);
    expect(rich.kind === "op" && rich.op.params.pageSize).toEqual({ width: null, height: null });
  });

  test("a mutation the sanitizer refuses is not queued: the next compaction carries it (bad_shape)", () => {
    // json1: a pick (`p`) at a drawing's source would move an unchecked value into place.
    const params = own({ op: ["drawing1", "source", { p: 0 }], objects: [], type: 0 });
    expect(captureMutation({ id: "sheet.mutation.set-drawing-apply", params }, {}, U)).toEqual({ kind: "snapshot", mutationId: "sheet.mutation.set-drawing-apply" });
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 80; i++) deep = (deep.next = {}) as Record<string, unknown>;
    expect(captureMutation({ id: "sheet.mutation.set-range-values", params: own({ deep: root }) }, {}, U).kind).toBe("snapshot");
  });
});

describe("view-only guard (viewers never start an edit; §9.8)", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey", boolean>> = {}) =>
    isEditingKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  test("typing, Enter, F2, Delete, Backspace, IME input and paste/cut/undo/redo shortcuts are editing keys", () => {
    for (const k of ["a", "Z", "7", " ", "=", "Enter", "F2", "Delete", "Backspace", "Process"]) expect([k, key(k)]).toEqual([k, true]);
    for (const k of ["v", "x", "z", "y", "V"]) expect([k, key(k, { metaKey: true }), key(k, { ctrlKey: true })]).toEqual([k, true, true]);
  });
  test("moving, selecting, copying and finding are not", () => {
    for (const k of ["ArrowDown", "Tab", "Escape", "PageDown", "Home", "Shift"]) expect([k, key(k)]).toEqual([k, false]);
    for (const k of ["c", "f", "a"]) expect([k, key(k, { metaKey: true }), key(k, { ctrlKey: true })]).toEqual([k, false, false]);
    expect(key("a", { altKey: true })).toBe(false);
  });
});
