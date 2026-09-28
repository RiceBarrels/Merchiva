// lib/sheets/sync/{compactor,session,session-cache,app-connection}.ts: what a holder does with changes the op log
// cannot carry, with an oversize or refused batch while no model is bound, with a parked session that holds
// unsent edits while no editor is mounted, with a page kept in the back/forward cache, and with a store tablet
// whose PIN operator changes. Over the REAL sheet reducers (helpers/session-world.ts).

import { afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { flushSheetEditsBeforeOperatorChange, publishSheetAppConnection } from "@/lib/sheets/sync/app-connection";
import {
  SHEET_SESSION_IDLE_MS, __sheetSessionStatsForTests, destroyAllSheetSessions, flushSheetSessions, hasUnsavedSheetSessions,
} from "@/lib/sheets/sync/session-cache";
import { SheetSessionStore } from "@/lib/sheets/use-sheet-session";
import { FakeTimestamp } from "../drive/fake-db";
import { FakeModelAdapter, acceptTestOp, setCellOp } from "./helpers/fake-model-adapter";
import { edit, named, open, snapshotSheetName, world, type World } from "./helpers/session-world";
import { operatorSession } from "./helpers/sheet-server-harness";

afterEach(async () => {
  await destroyAllSheetSessions();
  publishSheetAppConnection(null);
});

const sheetName = (model: FakeModelAdapter) => (model.save() as unknown as { sheets: { s1: { name: string } } }).sheets.s1.name;

describe("changes the op log cannot carry", () => {
  test("a snapshot-only change after log rows goes as a reset: readers reload, and the next holder keeps it", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    await edit(w, a, setCellOp(1, 0, "x")); // a log row since the snapshot: a compaction would reach b as nothing
    a.model.snapshotOnlyEdit("Renamed");
    await w.clock.advance(0);
    expect([snapshotSheetName(w), sheetName(b.model), b.model.cell(1, 0), named(b.events, "reloaded")]).toEqual(["Renamed", "Renamed", "x", ["reset"]]);
    await a.session.stopEditing();
    await b.session.requestEdit();
    await w.clock.advance(0);
    await edit(w, b, setCellOp(2, 0, "y"));
    expect(await b.session.compactNow()).toBe(true);
    expect([snapshotSheetName(w), b.model.cell(2, 0), w.rows().length]).toEqual(["Renamed", "y", 0]);
  });

  test("an edit captured while the holder's writes are held reaches the readers with the next snapshot", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true });
    const b = await open(w, w.orgA.staff);
    await edit(w, a, setCellOp(1, 0, "x"));
    const stopping = a.session.stopEditing(); // writes are held from here until the lease is released
    a.model.leak(setCellOp(2, 0, "typed while stopping")); // an adapter that missed the read-only switch
    await stopping;
    await w.clock.advance(0);
    expect([b.model.cell(2, 0), b.session.diverged, w.lease().holderMemberId]).toEqual(["typed while stopping", false, ""]);
  });
});

describe("folds while no model is bound", () => {
  test("an op too large for one row, cut while parked, folds into a reset once a model is bound again", async () => {
    const w = world();
    const a = await open(w, w.orgA.owner, { auto: true, tuning: { updateMaxBytes: 300 } });
    const b = await open(w, w.orgA.staff);
    const huge = randomBytes(3000).toString("base64");
    expect(a.model.edit(setCellOp(5, 5, huge))).toBe(true);
    a.session.parkModel(); // before the debounce: the queue meets the op with no model to fold
    await w.clock.advance(2000);
    const next = new FakeModelAdapter();
    await a.session.bindModel(next);
    await w.clock.advance(0);
    expect(next.edit(setCellOp(1, 0, "small"))).toBe(true);
    await w.clock.advance(60_000);
    expect([b.model.cell(5, 5) === huge, b.model.cell(1, 0), next.cell(5, 5) === huge]).toEqual([true, "small", true]);
    expect([a.session.hasUnsavedChanges, a.session.status, a.session.sizeWarning, next.editable]).toEqual([false, "saved", null, true]);
  });

  test("a batch the full log refuses while parked goes out inside one reset once a model is bound again", async () => {
    const w = world();
    const calls: string[] = [];
    let full = true;
    const a = await open(w, w.orgA.owner, { auto: true, transport: (base) => ({
      pushOps: async (i) => {
        calls.push(`push:${i.seq}`);
        if (full) throw new Error("[sheet.too_large] Spreadsheet needs compaction");
        return base.pushOps(i);
      },
      resetContent: async (i) => {
        calls.push(`reset:${i.seq}`);
        full = false;
        return base.resetContent(i);
      },
    }) });
    const b = await open(w, w.orgA.staff);
    expect(a.model.edit(setCellOp(1, 0, "one"))).toBe(true);
    a.session.parkModel();
    await w.clock.advance(2000); // refused with no model to fold
    expect([calls, a.session.sizeWarning]).toEqual([["push:1"], null]);
    await a.session.bindModel(new FakeModelAdapter());
    await w.clock.advance(2000);
    expect([calls, b.model.cell(1, 0), a.session.hasUnsavedChanges, a.session.sizeWarning]).toEqual([["push:1", "reset:1"], "one", false, null]);
  });
});

describe("a parked session with unsent edits and no editor mounted", () => {
  test("follows the app's reconnect, saves, then leaves; the unload guard asks meanwhile", async () => {
    const listeners = new Map<string, (event: { preventDefault(): void; returnValue: unknown }) => void>();
    const fakeWindow = {
      addEventListener: (type: string, fn: (event: { preventDefault(): void; returnValue: unknown }) => void) => void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    const globals = globalThis as { window?: unknown };
    globals.window = fakeWindow;
    try {
      const w = world();
      const client = w.server.client(w.orgA.owner);
      const store = new SheetSessionStore();
      store.setUser({ name: "Owner", color: "#123456" });
      store.setCanEdit(true);
      store.setOptions({ autoAcquire: true, acceptRemoteOp: acceptTestOp });
      store.setConnection(client.conn);
      publishSheetAppConnection(client.conn); // the keeper the app layout mounts
      const key = { organizationId: w.orgA.organizationId, memberId: client.member.memberId, actingMemberId: "", documentId: w.documentId };
      store.open(key, { actorMemberId: client.member.memberId, transport: client.transport, now: w.clock.now, timers: w.clock.timers });
      const model = new FakeModelAdapter();
      store.bindModel(model);
      await w.clock.advance(0);
      expect(store.getSnapshot().lease.kind).toBe("mine");
      client.disconnect();
      store.setConnection(null);
      publishSheetAppConnection(null);
      expect(model.edit(setCellOp(1, 0, "typed offline"))).toBe(true);
      store.bindModel(null); // the user leaves the sheet: parked, the edit unsent
      store.close();
      expect([hasUnsavedSheetSessions(), __sheetSessionStatsForTests()]).toEqual([true, { total: 1, parked: 1 }]);
      const unload = { prevented: false, returnValue: null as unknown, preventDefault() { this.prevented = true; } };
      listeners.get("beforeunload")?.(unload);
      expect(unload.prevented).toBe(true);
      publishSheetAppConnection(client.reconnect()); // the app reconnects with no sheet editor mounted
      await w.clock.advance(3000); // the re-bind waits out the 2 s between acquires
      expect([w.rows().length, hasUnsavedSheetSessions(), w.lease().holderMemberId]).toEqual([1, false, client.member.memberId]);
      await w.clock.advance(SHEET_SESSION_IDLE_MS);
      expect([__sheetSessionStatsForTests(), w.lease().holderMemberId, listeners.has("beforeunload")]).toEqual([{ total: 0, parked: 0 }, "", false]);
    } finally {
      delete globals.window;
    }
  });
});

type PageEvent = { persisted?: boolean };

/** A window whose pagehide / pageshow the test fires (sessions register on it when they are built). */
function withFakeWindow(): { fire(type: string, event?: PageEvent): void; restore(): void } {
  const listeners = new Map<string, Array<(event: PageEvent) => void>>();
  const globals = globalThis as { window?: unknown };
  globals.window = {
    addEventListener: (type: string, fn: (event: PageEvent) => void) => void listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: (event: PageEvent) => void) => void listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
  };
  return {
    fire: (type, event = {}) => {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    restore: () => void delete globals.window,
  };
}

describe("the page leaves and the back/forward cache restores it", () => {
  test("pagehide gives the lease up and makes the grid read-only; the restored page takes the lease again and saves", async () => {
    const page = withFakeWindow();
    try {
      const w = world();
      const a = await open(w, w.orgA.owner, { auto: true });
      const b = await open(w, w.orgA.staff);
      await edit(w, a, setCellOp(1, 0, "saved"));
      expect([a.session.lease.kind, a.model.editable, w.rows().length]).toEqual(["mine", true, 1]);
      page.fire("pagehide", { persisted: true });
      await w.clock.advance(100);
      // Nothing can be typed into a lease this page no longer holds (it used to look "Saved" and never be sent).
      expect([w.lease().holderMemberId, a.model.editable, a.model.edit(setCellOp(2, 0, "lost"))]).toEqual(["", false, false]);
      page.fire("pageshow", { persisted: true });
      await w.clock.advance(3000); // the auto-acquire waits out the 2 s between acquires
      expect([a.session.lease.kind, a.model.editable]).toEqual(["mine", true]);
      await edit(w, a, setCellOp(2, 0, "after restore"));
      expect([w.rows().length, b.model.cell(2, 0), a.session.status, a.session.diverged]).toEqual([2, "after restore", "saved", false]);
    } finally {
      page.restore();
    }
  });
});

describe("a store tablet whose PIN operator changes", () => {
  const tablet = (w: World) => w.orgA.staff;

  test("once another person signs in, the previous operator's unsent edit is dropped and its lease given back", async () => {
    const w = world();
    operatorSession(w.server.db, tablet(w), w.orgA.colleague);
    const a = await open(w, tablet(w), { auto: true, acting: w.orgA.colleague });
    expect(a.session.lease.kind).toBe("mine");
    expect(a.model.edit(setCellOp(1, 0, "typed"))).toBe(true);
    w.server.db.patch("deviceOperatorSession", tablet(w).identity, { memberId: w.orgA.manager.memberId }); // before the debounce
    await w.clock.advance(10 * 60_000);
    // It used to stay "saving" with the lease "mine" (retried forever), holding the unload guard and the cache entry.
    expect([a.session.status, a.session.hasUnsavedChanges, a.session.holdsSaveableEdits, a.session.operatorChanged, a.model.editable])
      .toEqual(["error", false, false, true, false]);
    expect([w.rows().length, w.lease().holderMemberId]).toEqual([0, ""]);
    expect(named(a.events, "error")).toHaveLength(1);
  });

  test("a stale PIN of the same operator keeps the edit: it is saved once the PIN is entered again", async () => {
    const w = world();
    operatorSession(w.server.db, tablet(w), w.orgA.colleague);
    const a = await open(w, tablet(w), { auto: true, acting: w.orgA.colleague });
    w.server.db.patch("deviceOperatorSession", tablet(w).identity, { resolvedAt: new FakeTimestamp(0n) }); // past the TTL
    expect(a.model.edit(setCellOp(1, 0, "typed"))).toBe(true);
    await w.clock.advance(5000);
    expect([a.session.hasUnsavedChanges, a.session.operatorChanged, w.rows().length]).toEqual([true, false, 0]);
    w.server.db.patch("deviceOperatorSession", tablet(w).identity, { resolvedAt: new FakeTimestamp(BigInt(Math.floor(w.clock.nowMs)) * 1000n) }); // the PIN again
    await w.clock.advance(40_000);
    expect([a.session.hasUnsavedChanges, w.rows().length, a.session.lease.kind]).toEqual([false, 1, "mine"]);
  });

  test("flushSheetSessions gets a parked session's edit out before the switch (the /store flows reach it lightly)", async () => {
    const w = world();
    operatorSession(w.server.db, tablet(w), w.orgA.colleague);
    const client = w.server.client(tablet(w));
    const store = new SheetSessionStore();
    store.setUser({ name: "Tablet", color: "#123456" });
    store.setCanEdit(true);
    store.setOptions({ autoAcquire: true, acceptRemoteOp: acceptTestOp });
    store.setConnection(client.conn);
    const key = { organizationId: w.orgA.organizationId, memberId: tablet(w).memberId, actingMemberId: w.orgA.colleague.memberId, documentId: w.documentId };
    store.open(key, { actorMemberId: w.orgA.colleague.memberId, transport: client.transport, now: w.clock.now, timers: w.clock.timers });
    const model = new FakeModelAdapter();
    store.bindModel(model);
    await w.clock.advance(0);
    expect(model.edit(setCellOp(1, 0, "typed just before the switch"))).toBe(true);
    store.bindModel(null);
    store.close(); // the operator's panel closes while the edit waits for its debounce
    expect(hasUnsavedSheetSessions()).toBe(true);
    const flushed = flushSheetSessions(5000, w.clock.timers);
    await w.clock.advance(0);
    expect([await flushed, hasUnsavedSheetSessions(), w.rows().length]).toEqual([true, false, 1]);
    expect(await flushSheetEditsBeforeOperatorChange()).toBe(true); // nothing left: at once
  });
});
