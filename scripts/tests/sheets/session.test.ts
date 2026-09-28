// lib/sheets/sync/{session,session-cache}.ts over the REAL sheet and presence reducers (helpers/sheet-server-harness.ts)
// with FakeModelAdapter models and a manual clock (sheets.md §4.4–§4.7, §5, §15 session.test.ts).

import { afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { encodeSheetOps, encodeSheetSnapshot } from "@/lib/sheets/codec";
import { SHEET_APP_VERSION } from "@/lib/sheets/constants";
import {
  SHEET_SESSION_IDLE_MS, __sheetSessionStatsForTests, acquireSheetSession, destroyAllSheetSessions, releaseSheetSession,
} from "@/lib/sheets/sync/session-cache";
import type { SheetOp } from "@/lib/sheets/types";
import { SheetSessionStore } from "@/lib/sheets/use-sheet-session";
import type { FakeTimestamp } from "../drive/fake-db";
import { FakeModelAdapter, acceptTestOp, insertRowOp, setCellOp, testWorkbook } from "./helpers/fake-model-adapter";
import { R } from "./helpers/sheet-server-harness";
import { edit, named, open, record, sessionFor, snapshotSheetName, world, type Opened, type World } from "./helpers/session-world";

afterEach(async () => {
  await destroyAllSheetSessions();
});

describe("SheetSyncSession", () => {
  test("load, auto-acquire, push; a viewer follows live and sees the holder's selection", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    expect([a.session.loadState, a.model.cell(0, 0), a.session.lease.kind, a.model.editable]).toEqual(["ready", "hello", "mine", true]);
    const b = await open(w, w.orgA.staff);
    expect([b.session.lease.kind, b.model.editable]).toEqual(["other", false]);
    expect(b.session.lease.kind === "other" && b.session.lease.holderName).toBe("Org A owner");
    await edit(w, a, setCellOp(1, 1, "x"), insertRowOp());
    expect([b.model.cell(1, 1), b.model.rowCount, a.session.status, b.session.appliedThrough]).toEqual(["x", 101, "saved", w.rows()[0].id]);
    a.model.select({ sheetId: "s1", startRow: 1, startColumn: 1, endRow: 2, endColumn: 2 });
    await w.clock.advance(1500);
    expect(b.model.highlighted?.selection).toEqual({ sheetId: "s1", startRow: 1, startColumn: 1, endRow: 2, endColumn: 2 });
    expect(b.session.peers.map((p) => [p.memberId, p.isSelf])).toEqual([[w.orgA.staff.memberId, true], [w.orgA.owner.memberId, false]]);
  });

  test("a compaction landing during an async decode restarts the load; no snapshot → load_failed, never blank", async () => {
    const w = world({ "0:0": randomBytes(330_000).toString("base64") }); // ≥ 256 KiB compressed: decoded asynchronously
    const h = await open(w, w.orgA.owner, { auto: true });
    await edit(w, h, setCellOp(3, 3, "compacted"));
    const v = w.server.client(w.orgA.staff);
    const session = sessionFor(w, v);
    session.attach(v.conn);
    await w.clock.advance(0);
    const model = new FakeModelAdapter();
    const loading = session.bindModel(model);
    // The holder compacts while the viewer awaits its decode. The new snapshot holds a cell no row carries.
    const state = encodeSheetSnapshot(testWorkbook({ "3:3": "compacted", "9:9": "only in the new snapshot" }));
    w.server.run(R.compactSheet, w.orgA.owner, {
      documentId: w.documentId, sessionId: h.session.id, leaseEpoch: w.lease().epoch, throughUpdateId: w.rows()[0].id,
      state, plainText: "", cellCount: 2, actingMemberId: "",
    }, h.client.connection);
    await loading;
    expect([model.loads.length, model.cell(9, 9), session.appliedThrough]).toEqual([1, "only in the new snapshot", w.snapshotThrough()]);

    const empty = world();
    empty.server.db.transact((db) => (db.documentSnapshot as { documentId: { delete(id: string): boolean } }).documentId.delete(empty.documentId));
    const x = await open(empty, empty.orgA.owner, { auto: true });
    expect([x.session.loadState, x.session.status, x.model.loads.length, x.session.lease.kind]).toEqual(["load_failed", "error", 0, "free"]);
  });

  test("a reset reloads every reader; compaction waits for the queue and for its own echo", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    a.client.held = true; // A's transactions stop reaching its cache
    await edit(w, a, setCellOp(2, 0, "y"));
    expect(w.rows().length).toBe(1);
    expect(await a.session.compactNow()).toBe(false); // lastSeq not echoed yet: the snapshot could miss a row
    a.client.held = false;
    a.client.deliver();
    expect(await a.session.compactNow()).toBe(true);
    expect([w.rows().length, w.snapshotThrough(), b.session.diverged]).toEqual([0, a.session.appliedThrough, false]);
    const replaced = testWorkbook({ "0:0": "replaced" });
    await a.session.replaceContent({ state: encodeSheetSnapshot(replaced), plainText: "replaced", cellCount: 1 }, "Before");
    await w.clock.advance(0);
    expect([a.model.cell(0, 0), b.model.cell(0, 0), b.model.cell(2, 0)]).toEqual(["replaced", "replaced", undefined]);
    expect(named(b.events, "reloaded")).toEqual(["reset"]);
    expect(w.server.db.rows("documentVersion").map((v) => [v.kind, v.name])).toEqual([["restore", "Before"]]);
    expect(a.model.editable).toBe(true);
  });

  test("an op too large for one row: edits pause, one reset carries the workbook, every reader reloads", async () => {
    const w = world();
    const calls: string[] = [];
    const a = await open(w, w.orgA.owner, { auto: true, tuning: { updateMaxBytes: 4096 }, transport: (base) => ({
      pushOps: (i) => (calls.push(`push:${i.seq}`), base.pushOps(i)),
      resetContent: (i) => (calls.push(`reset:${i.seq}`), base.resetContent(i)),
    }) });
    const b = await open(w, w.orgA.staff);
    const huge = randomBytes(9000).toString("base64");
    await edit(w, a, setCellOp(1, 0, "small"));
    expect(a.model.edit(setCellOp(5, 5, huge))).toBe(true);
    await w.clock.advance(200);
    expect([b.model.cell(1, 0), b.model.cell(5, 5) === huge, named(b.events, "reloaded")]).toEqual(["small", true, ["reset"]]);
    expect([a.model.editable, a.session.hasUnsavedChanges, w.rows().length, w.lease().lastSeq]).toEqual([true, false, 0, 2n]);
    expect(calls).toEqual(["push:1", "reset:2"]); // the reset went out once
  });

  test("a full log: the refused batch goes out inside one reset under its own seq; after that, one banner and no resends", async () => {
    const w = world();
    const calls: string[] = [];
    let log: "full_until_reset" | "ok" | "full" = "full_until_reset";
    const a = await open(w, w.orgA.owner, { auto: true, transport: (base) => ({
      pushOps: async (i) => {
        calls.push(`push:${i.seq}`);
        if (log !== "ok") throw new Error("[sheet.too_large] Spreadsheet needs compaction");
        return base.pushOps(i);
      },
      resetContent: async (i) => {
        calls.push(`reset:${i.seq}`);
        if (log === "full_until_reset") log = "ok";
        return base.resetContent(i);
      },
    }) });
    const b = await open(w, w.orgA.staff);
    await edit(w, a, setCellOp(1, 0, "one"));
    await w.clock.advance(60_000);
    expect([calls, b.model.cell(1, 0), w.lease().lastSeq, a.model.editable, a.session.hasUnsavedChanges])
      .toEqual([["push:1", "reset:1"], "one", 1n, true, false]);
    await edit(w, a, setCellOp(2, 0, "two"));
    expect([calls.at(-1), b.model.cell(2, 0)]).toEqual(["push:2", "two"]);
    log = "full"; // full again in the same grant: the size banner, once; heartbeats resend nothing
    expect(a.model.edit(setCellOp(3, 0, "three"))).toBe(true);
    await w.clock.advance(60_000);
    expect([calls.slice(3), named(a.events, "sizeWarning"), a.session.hasUnsavedChanges]).toEqual([["push:3"], ["log_full"], true]);
    a.client.disconnect(); // a re-bind tries once more; the banner is already up
    a.session.attach(null);
    a.session.attach(a.client.reconnect());
    await w.clock.advance(1000);
    expect([calls.slice(3), named(a.events, "sizeWarning")]).toEqual([["push:3", "push:3"], ["log_full"]]);
  });

  test("the React store keeps the editor's model bound when the same key re-opens; unbinding parks it", async () => {
    const w = world();
    const client = w.server.client(w.orgA.owner);
    const store = new SheetSessionStore();
    const model = new FakeModelAdapter();
    // The editor mounts first and binds through the first render's facade, before any session exists.
    const idle = store.getSnapshot();
    expect([idle.session, idle.bindModel === store.bindModel, store.getServerSnapshot().bindModel === store.bindModel]).toEqual([null, true, true]);
    idle.bindModel(model);
    store.setUser({ name: "Owner", color: "#123456" });
    store.setCanEdit(true);
    store.setOptions({ autoAcquire: true, acceptRemoteOp: acceptTestOp });
    store.setConnection(client.conn);
    const key = { organizationId: w.orgA.organizationId, memberId: client.member.memberId, actingMemberId: "", documentId: w.documentId };
    const init = { actorMemberId: client.member.memberId, transport: client.transport, now: w.clock.now, timers: w.clock.timers };
    store.open(key, init);
    await w.clock.advance(0);
    const first = store.getSnapshot();
    expect([first.session !== null, first.loadState, first.lease.kind, model.editable]).toEqual([true, "ready", "mine", true]);
    store.close();
    store.open(key, init);
    await w.clock.advance(0);
    expect([store.getSnapshot().session === first.session, model.loads.length, model.editable]).toEqual([true, 2, true]);
    store.bindModel(null);
    expect(first.session?.parked).toBe(true);
    store.close();
  });

  test("lease lost to the same person elsewhere: committed batches are found in its own rows, the rest is discarded", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    await edit(w, a, setCellOp(1, 0, "one"));
    a.client.dropNextReply = true;
    await edit(w, a, setCellOp(2, 0, "two")); // committed, but the socket closed before the reply
    a.session.attach(null);
    expect(a.model.edit(setCellOp(3, 0, "three"))).toBe(true); // offline: still the holder, kept pending
    const a2 = await open(w, w.orgA.owner); // the same person, another tab
    await a2.session.requestEdit();
    await w.clock.advance(0);
    expect(a2.session.lease.kind).toBe("mine");
    a.session.attach(a.client.reconnect());
    await w.clock.advance(0);
    expect(named(a.events, "leaseLost")).toEqual([{ byName: "Org A owner", discardedOps: 1 }]);
    expect(named(a.events, "reloaded")).toEqual(["lease_lost"]);
    expect([a.model.cell(2, 0), a.model.cell(3, 0), a.model.editable, a.session.hasUnsavedChanges]).toEqual(["two", undefined, false, false]);
    expect(a.session.lease.kind === "other" && a.session.lease.samePerson).toBe(true);
  });

  test("a reconnect within 10 s rebinds: epoch and seq kept, pending edits pushed", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    await edit(w, a, setCellOp(1, 0, "one"));
    const epoch = w.lease().epoch;
    a.client.disconnect();
    a.session.attach(null);
    expect(w.lease().holderConnectionId).toBe("");
    expect(a.model.edit(setCellOp(2, 0, "two"))).toBe(true);
    await w.clock.advance(3000);
    expect([a.session.status, a.session.hasUnsavedChanges]).toEqual(["offline", true]);
    a.session.attach(a.client.reconnect());
    await w.clock.advance(200);
    expect([w.lease().epoch, w.lease().lastSeq, w.lease().holderConnectionId]).toEqual([epoch, 2n, a.client.connection.toHexString()]);
    expect([a.session.status, a.session.hasUnsavedChanges, w.rows().length]).toEqual(["saved", false, 2]);
  });

  test("hand-over: the request prompts the holder, the lease stays reserved for the requester, others queue", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    const c = await open(w, w.orgA.manager);
    await b.session.requestEdit();
    await w.clock.advance(0);
    expect(b.session.lease.kind === "other" && b.session.lease.myRequest).toBe("pending");
    const requestedMs = Number((w.lease().requestedAt as FakeTimestamp).microsSinceUnixEpoch / 1000n);
    expect(named(a.events, "handOverRequested")).toEqual([{ name: "Org A staff", deadlineMs: requestedMs + 30_000 }]);
    await edit(w, a, setCellOp(4, 0, "last"));
    await a.session.handOver();
    await c.session.requestEdit();
    await w.clock.advance(3000);
    expect([b.session.lease.kind, b.model.editable, b.model.cell(4, 0), named(a.events, "released")]).toEqual(["mine", true, "last", ["hand_over"]]);
    // C asked while the lease was reserved for B (queued); once B holds it, C's standing wish becomes B's next request.
    expect(c.session.lease.kind === "other" && [c.session.lease.holderName, c.session.lease.myRequest]).toEqual(["Org A staff", "pending"]);
    expect(named(b.events, "handOverRequested").map((r) => (r as { name: string }).name)).toEqual(["Org A manager"]);
    expect(w.rows().length).toBe(0); // compacted before the release
  });

  test("Done, then Edit again before the release reaches the cache: the new grant is kept, not released", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const epoch = w.lease().epoch as bigint;
    a.client.held = true;
    await a.session.stopEditing();
    await a.session.requestEdit();
    a.client.held = false;
    a.client.deliver();
    await w.clock.advance(20_000);
    expect([a.session.lease.kind, w.lease().epoch, w.lease().holderSessionId, a.model.editable]).toEqual(["mine", epoch + 1n, a.session.id, true]);
  });

  test("idle for 5 min and hidden for 2 min release the lease", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    await edit(w, a, setCellOp(1, 0, "x"));
    await w.clock.advance(299_000);
    expect(a.session.lease.kind).toBe("mine");
    await w.clock.advance(1_000);
    expect([named(a.events, "released"), a.session.lease.kind, w.lease().holderMemberId, w.rows().length]).toEqual([["idle"], "free", "", 0]);
    await a.session.requestEdit();
    await w.clock.advance(0);
    a.session.setHidden(true);
    await w.clock.advance(120_000);
    expect([named(a.events, "released"), a.session.lease.kind]).toEqual([["idle", "hidden"], "free"]);
  });

  test("parked during an in-flight push: the echo arrives while parked, the rebind does not apply it twice", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    a.client.held = true;
    await edit(w, a, insertRowOp());
    expect(w.rows().length).toBe(1);
    a.session.parkModel();
    a.client.held = false;
    a.client.deliver(); // the echo reaches a parked session
    const next = new FakeModelAdapter();
    await a.session.bindModel(next);
    expect([next.loads.length, next.rowCount, next.applied.length, a.session.appliedThrough]).toEqual([1, 101, 0, w.rows()[0].id]);
    expect([a.session.lease.kind, next.editable]).toEqual(["mine", true]);
  });

  test("a parked holder hands over on a live request; a parked session is destroyed after 30 s without compacting", async () => {
    const w = world();
    const client = w.server.client(w.orgA.owner);
    const key = { organizationId: w.orgA.organizationId, memberId: client.member.memberId, actingMemberId: "", documentId: w.documentId };
    const init = {
      actorMemberId: client.member.memberId, user: { name: "U", color: "#123456" }, canEdit: true, autoAcquire: true,
      transport: client.transport, acceptRemoteOp: acceptTestOp, now: w.clock.now, timers: w.clock.timers,
    };
    const session = acquireSheetSession(key, init);
    const events = record(session);
    session.attach(client.conn);
    const model = new FakeModelAdapter();
    await session.bindModel(model);
    await w.clock.advance(0);
    await edit(w, { client, session, model, events }, setCellOp(1, 0, "x"));
    releaseSheetSession(session);
    expect([session.parked, __sheetSessionStatsForTests(), acquireSheetSession(key, init)]).toEqual([true, { total: 1, parked: 1 }, session]);
    releaseSheetSession(session);
    const b = await open(w, w.orgA.staff);
    await b.session.requestEdit();
    await w.clock.advance(3000);
    expect([named(events, "released"), b.session.lease.kind, w.rows().length]).toEqual([["parked"], "mine", 1]);
    await b.session.stopEditing();
    const again = acquireSheetSession(key, init);
    const model2 = new FakeModelAdapter();
    await again.bindModel(model2);
    await w.clock.advance(0);
    expect([again === session, again.lease.kind, model2.cell(1, 0)]).toEqual([true, "mine", "x"]); // auto-acquired on re-open
    await edit(w, { client, session: again, model: model2, events }, setCellOp(9, 9, "kept"));
    releaseSheetSession(again);
    const through = w.snapshotThrough();
    await w.clock.advance(SHEET_SESSION_IDLE_MS - 1);
    expect(__sheetSessionStatsForTests()).toEqual({ total: 1, parked: 1 });
    await w.clock.advance(1);
    expect(__sheetSessionStatsForTests()).toEqual({ total: 0, parked: 0 });
    const presence = w.server.db.rows("documentPresence").filter((p) => p.memberId === client.member.memberId);
    // Destroyed: released, no compaction (the edit stays in the log), presence gone.
    expect([w.lease().holderMemberId, w.snapshotThrough(), w.rows().length, presence.length]).toEqual(["", through, 1, 0]);
  });
});

describe("holder recovery", () => {
  test("a change only a snapshot carries, with no log row since the snapshot, goes as a reset; kept until it lands", async () => {
    const w = world();
    let refuse = 1;
    const a = await open(w, w.orgA.owner, { auto: true, transport: (base) => ({
      resetContent: async (i) => {
        if (refuse-- > 0) throw new Error("[sheet.quota] This store has no room for more spreadsheet data");
        return base.resetContent(i);
      },
    }) });
    const b = await open(w, w.orgA.staff);
    a.model.snapshotOnlyEdit("Renamed"); // the first thing after open: the log is empty, compactSheet would be a no-op
    await w.clock.advance(0);
    expect([snapshotSheetName(w), a.model.editable]).toEqual(["Sheet1", true]); // refused
    await w.clock.advance(30_000);
    expect([snapshotSheetName(w), b.model.loads.at(-1)?.sheets.s1.name, a.model.editable, w.rows().length]).toEqual(["Renamed", "Renamed", true, 0]);
    expect(await a.session.compactNow()).toBe(true);
    expect(w.lease().lastSeq).toBe(1n); // nothing more went out
  });

  test("a reload keeps the model read-only until it is done: nothing typed during an async decode goes out", async () => {
    const w = world({ "0:0": randomBytes(330_000).toString("base64") }); // decoded asynchronously
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    const reloading = a.session.reload();
    expect([a.model.editable, a.model.edit(setCellOp(7, 7, "typed"))]).toEqual([false, false]);
    a.model.leak(setCellOp(8, 8, "leaked")); // captured anyway: dropped, the load replaces this model
    await reloading;
    await w.clock.advance(2000);
    expect([a.model.editable, a.model.cell(8, 8), b.model.cell(8, 8), a.session.hasUnsavedChanges, w.rows().length])
      .toEqual([true, undefined, undefined, false, 0]);
  });

  test("a size refusal stops compaction only until the model is loaded from the server again", async () => {
    const w = world();
    let refuse = true;
    const a = await open(w, w.orgA.owner, { auto: true, transport: (base) => ({
      compact: async (i) => {
        if (refuse) throw new Error("[sheet.too_large] Spreadsheet is too large");
        return base.compact(i);
      },
    }) });
    await edit(w, a, setCellOp(1, 0, "one"));
    expect(await a.session.compactNow()).toBe(false);
    refuse = false;
    expect([await a.session.compactNow(), a.session.sizeWarning, a.model.editable]).toEqual([false, "too_large", false]);
    await a.session.discardChanges();
    expect([a.session.sizeWarning, a.model.editable, a.model.cell(1, 0), await a.session.compactNow()]).toEqual([null, true, "one", true]);
    expect([w.rows().length, named(a.events, "sizeWarning")]).toEqual([0, ["too_large"]]);
  });

  test("a divergence while parked drops the parked workbook with the discarded edits", async () => {
    const w = world();
    let stale = true;
    const a = await open(w, w.orgA.owner, { auto: true, transport: (base) => ({
      pushOps: async (i) => {
        if (stale) throw new Error("[sheet.stale] Spreadsheet changed");
        return base.pushOps(i);
      },
    }) });
    expect(a.model.edit(setCellOp(1, 0, "never saved"))).toBe(true);
    a.session.parkModel(); // the parked workbook holds the edit; its batch is still waiting
    await w.clock.advance(200);
    stale = false;
    const next = new FakeModelAdapter();
    await a.session.bindModel(next);
    expect([next.cell(1, 0), a.session.hasUnsavedChanges, w.rows().length]).toEqual([undefined, false, 0]);
    expect(named(a.events, "error").map((e) => (e as { code: string }).code)).toEqual(["stale"]);
  });

  test("an idle release that cannot flush (offline) is tried again when the idle clock runs out again", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    await edit(w, a, setCellOp(1, 0, "x"));
    a.client.disconnect();
    a.session.attach(null);
    expect(a.model.edit(setCellOp(2, 0, "y"))).toBe(true);
    await w.clock.advance(300_000);
    expect([named(a.events, "released"), a.session.hasUnsavedChanges]).toEqual([[], true]); // could not flush
    a.session.attach(a.client.reconnect());
    await w.clock.advance(1000);
    expect([a.session.hasUnsavedChanges, a.session.lease.kind]).toEqual([false, "mine"]);
    await w.clock.advance(300_000);
    expect([named(a.events, "released"), w.lease().holderMemberId, w.rows().length]).toEqual([["idle"], "", 0]);
  });
});

describe("remote rows", () => {
  async function pushRaw(w: World, h: Opened, ops: unknown[], app = SHEET_APP_VERSION): Promise<void> {
    const row = w.lease();
    await h.client.transport.pushOps({
      documentId: w.documentId, sessionId: row.holderSessionId as string, leaseEpoch: row.epoch as bigint,
      seq: (row.lastSeq as bigint) + 1n, baseUpdateId: h.session.appliedThrough,
      payload: encodeSheetOps({ v: 1, app, seq: Number(row.lastSeq) + 1, ops: ops as SheetOp[] }),
    });
    await w.clock.advance(0);
  }

  test("a poisoned row reloads once, then is skipped for good; later rows still apply", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    b.model.failOn.add("sheet.mutation.boom");
    await edit(w, a, { mutationId: "sheet.mutation.boom", params: { unitId: "merchiva-sheet" } });
    await w.clock.advance(0);
    expect([b.model.loads.length, b.session.diverged, named(b.events, "integrity")]).toEqual([2, true, [{ skippedOps: 0, skippedRows: 1 }]]);
    await edit(w, a, setCellOp(5, 0, "after"));
    await w.clock.advance(60_000);
    expect([b.model.loads.length, b.model.cell(5, 0), named(b.events, "reloaded")]).toEqual([2, "after", ["diverged"]]);
  });

  test("refused ops mark the viewer diverged; it reloads before acquiring; a covering snapshot heals it", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    await pushRaw(w, a, [{ mutationId: "sheet.operation.open-hyper-link-edit-panel", params: { unitId: "merchiva-sheet" } }, setCellOp(1, 0, "ok")]);
    expect([b.model.cell(1, 0), b.session.diverged, named(b.events, "integrity")]).toEqual(["ok", true, [{ skippedOps: 1, skippedRows: 0 }]]);
    a.client.disconnect();
    a.session.attach(null);
    await w.clock.advance(11_000);
    await b.session.requestEdit();
    await w.clock.advance(0);
    expect([b.model.loads.length, named(b.events, "reloaded"), b.session.lease.kind]).toEqual([2, ["diverged"], "mine"]);
    expect(await b.session.compactNow()).toBe(true);
    expect([b.session.diverged, b.model.loads.length]).toEqual([false, 2]); // the holder heals without a reload
    const c = await open(w, w.orgA.manager);
    expect([c.session.diverged, c.model.cell(1, 0)]).toEqual([false, "ok"]);
  });

  test("a batch from a newer app stops the viewer: update required, nothing after it applies, no editing", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    await pushRaw(w, a, [setCellOp(1, 0, "future")], "9.0.0");
    await pushRaw(w, a, [setCellOp(2, 0, "later")]);
    expect([named(b.events, "updateRequired"), b.session.updateRequired, b.model.cell(1, 0), b.model.cell(2, 0)])
      .toEqual([[{ app: "9.0.0" }], true, undefined, undefined]);
    await b.session.requestEdit();
    expect([b.session.lease.kind, w.lease().requestedByMemberId]).toEqual(["cannot_edit", ""]);
    expect(R.pushSheetOps).toBeDefined();
  });
});
