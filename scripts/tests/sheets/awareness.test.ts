// lib/sheets/sync (sheets.md §6–§7.3), in this process: the awareness framing the Docs presence reducer accepts
// (checked against the REAL sanitizeDocAwareness and against y-protocols), presence rows → peers and selections, the
// SheetPresence announcer, and the connection adapter. The write wrappers, the transport against the real reducers
// and the read hooks need mock.module and the app-wide connection: they run in sync-data-layer.test.ts's children.

import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { sheetLiveQueries } from "@/lib/docs/queries";
import type { DocPresenceRow } from "@/lib/docs/types";
import type { SheetSelection } from "@/lib/sheets/types";
import {
  decodeSheetAwareness, encodeSheetAwareness, sameSheetSelection, selectionToAwareness, type SheetAwarenessState,
} from "@/lib/sheets/sync/awareness";
import { createSheetConnection } from "@/lib/sheets/sync/connection";
import { holderSelection, peerSelections, peersFromPresence, samePeers, SheetPresence } from "@/lib/sheets/sync/presence";
import type { SheetPresenceUpsert } from "@/lib/sheets/sync/transport";
import { loadServerDeclarations } from "../docs/server-source";

const DOC = "5b0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const T0 = Date.UTC(2026, 8, 27, 12);
const SEL_A: SheetSelection = { sheetId: "sheet-1", startRow: 2, startColumn: 1, endRow: 5, endColumn: 3 };
const SEL_B: SheetSelection = { ...SEL_A, sheetId: "sheet-2" };
const settle = () => new Promise((resolve) => setImmediate(resolve));

// ── Awareness framing ───────────────────────────────────────────────────────
const SERVER_USER = { name: "Sam Lee", color: "#336699", memberId: "member-sam" };
type Sanitize = (bytes: Uint8Array, yClientId: number, user: typeof SERVER_USER) => Uint8Array | null;
const decls = loadServerDeclarations(["sanitizeDocAwareness"]);
const sanitize: Sanitize = (bytes, id, user) => (decls?.sanitizeDocAwareness as Sanitize)(bytes, id, user);
const STATE: SheetAwarenessState = { user: { name: "spoof", color: "red", memberId: "other" }, sheet: { s: "sheet-1", r: [2, 1, 5, 3] } };

describe("awareness bytes vs the Docs presence reducer (sanitizeDocAwareness)", () => {
  test("the server's sanitizer is extracted", () => {
    expect(decls).not.toBeNull();
  });

  test("an encoded state is accepted; the server pins the user, the selection and clock survive", () => {
    const out = sanitize(encodeSheetAwareness(42, 7, STATE), 42, SERVER_USER);
    expect(out).not.toBeNull();
    expect(decodeSheetAwareness(out as Uint8Array)).toEqual({ clientId: 42, clock: 7, state: { user: SERVER_USER, sheet: STATE.sheet } });
  });

  test("byte-identical when the user already matches; a withdrawal, u32 max, a large clock, non-ASCII names", () => {
    const own = encodeSheetAwareness(9, 1, { user: SERVER_USER, sheet: STATE.sheet });
    expect([...(sanitize(own, 9, SERVER_USER) as Uint8Array)]).toEqual([...own]);
    const gone = sanitize(encodeSheetAwareness(9, 2, null), 9, SERVER_USER) as Uint8Array;
    expect(decodeSheetAwareness(gone)).toEqual({ clientId: 9, clock: 2, state: null });
    const user = { name: "Zoë 李 🙂", color: "#aa0000", memberId: "m" };
    const max = sanitize(encodeSheetAwareness(0xffff_ffff, 2 ** 40, { sheet: STATE.sheet }), 0xffff_ffff, user) as Uint8Array;
    expect(decodeSheetAwareness(max)).toEqual({ clientId: 0xffff_ffff, clock: 2 ** 40, state: { user, sheet: STATE.sheet } });
  });

  test("bytes for another client id are refused (no highlight hijacking)", () => {
    expect(sanitize(encodeSheetAwareness(7, 1, STATE), 42, SERVER_USER)).toBeNull();
  });

  test("y-protocols reads the encoding, and the decoder reads y-protocols' own updates", () => {
    const receiver = new Awareness(new Y.Doc());
    applyAwarenessUpdate(receiver, encodeSheetAwareness(42, 3, STATE), "remote");
    expect([receiver.getStates().get(42), receiver.meta.get(42)?.clock]).toEqual([STATE, 3]);
    const doc = new Y.Doc();
    doc.clientID = 77;
    const sender = new Awareness(doc);
    sender.setLocalState({ user: SERVER_USER, sheet: STATE.sheet, cursor: { x: 1 } });
    const decoded = decodeSheetAwareness(encodeAwarenessUpdate(sender, [77]));
    expect(decoded?.state).toEqual({ user: SERVER_USER, sheet: STATE.sheet });
    applyAwarenessUpdate(sender, encodeSheetAwareness(42, 3, STATE), "remote");
    expect(decodeSheetAwareness(encodeAwarenessUpdate(sender, [77, 42]))).toBeNull();
    receiver.destroy();
    sender.destroy();
  });

  test("malformed bytes decode to null", () => {
    const good = encodeSheetAwareness(42, 3, STATE);
    const json = (text: string) => new Uint8Array([1, 42, 3, text.length, ...new TextEncoder().encode(text)]);
    for (const bad of [
      new Uint8Array([...good, 0]), good.subarray(0, good.length - 1), new Uint8Array([2, 42, 3, 4, ...new TextEncoder().encode("null")]),
      json("{oops"), json("[1,2]"), json("7"), new Uint8Array([1, 42, 3, 2, 0xc3, 0x28]), new Uint8Array([]),
      new Uint8Array([1, 0x80, 0x80, 0x80, 0x80, 0x10, 3, 4, ...new TextEncoder().encode("null")]), // client id 2^32
    ]) {
      expect(decodeSheetAwareness(bad)).toBeNull();
    }
  });

  test("only well-formed fields are kept", () => {
    const decode = (state: unknown) => decodeSheetAwareness(encodeSheetAwareness(1, 1, state as SheetAwarenessState))?.state;
    expect(decode({ user: { name: 1, color: "c", memberId: "m" }, sheet: { s: "s", r: [3, 0, 1, 0] }, extra: true })).toEqual({});
    expect(decode({ sheet: { s: "s", r: [0, 0, 1] } })).toEqual({});
    expect(decode({ sheet: { s: "x".repeat(257), r: [0, 0, 0, 0] } })).toEqual({});
    expect(decode({ sheet: { s: "s", r: [0, -1, 0, 0] } })).toEqual({});
    expect(decode({ sheet: { s: "s", r: [0, 0, 1.5, 2] } })).toEqual({});
    expect(decode({ sheet: { s: "s", r: [0, 0, 0, 0] }, user: { name: "n", color: "c", memberId: "m", avatar: "x" } }))
      .toEqual({ sheet: { s: "s", r: [0, 0, 0, 0] }, user: { name: "n", color: "c", memberId: "m" } });
  });

  test("a peer's range outside the 1,048,576 × 16,384 grid is dropped (the server keeps it verbatim)", () => {
    const hostile = (r: number[]) => {
      const body = new TextEncoder().encode(JSON.stringify({ sheet: { s: "s", r } }));
      return new Uint8Array([1, 1, 1, body.length, ...body]);
    };
    const huge = hostile([0, 0, 2 ** 53 - 1, 2 ** 53 - 1]);
    expect(decodeSheetAwareness(sanitize(huge, 1, SERVER_USER) as Uint8Array)?.state).toEqual({ user: SERVER_USER });
    expect([huge, hostile([0, 0, 1_048_576, 0]), hostile([0, 0, 0, 16_384])].map((b) => decodeSheetAwareness(b)?.state)).toEqual([{}, {}, {}]);
    expect(decodeSheetAwareness(hostile([0, 0, 1_048_575, 16_383]))?.state).toEqual({ sheet: { s: "s", r: [0, 0, 1_048_575, 16_383] } });
    expect(selectionToAwareness({ ...SEL_A, endColumn: 16_384 })).toBeNull();
  });

  test("the encoder refuses a client id outside u32 and a bad clock; selection helpers", () => {
    for (const [id, clock] of [[-1, 0], [2 ** 32, 0], [1.5, 0], [1, -1], [1, 0.5]]) {
      expect(() => encodeSheetAwareness(id, clock, null)).toThrow(RangeError);
    }
    expect(selectionToAwareness(SEL_A)).toEqual({ s: "sheet-1", r: [2, 1, 5, 3] });
    expect(selectionToAwareness({ ...SEL_A, endRow: 1 })).toBeNull();
    expect([sameSheetSelection(SEL_A, { ...SEL_A }), sameSheetSelection(SEL_A, SEL_B), sameSheetSelection(null, null), sameSheetSelection(SEL_A, null)])
      .toEqual([true, false, true, false]);
  });
});

// ── Presence rows → peers ───────────────────────────────────────────────────
type RowInput = Partial<DocPresenceRow> & { state?: SheetAwarenessState | null; encodedFor?: number };
const row = ({ state, encodedFor, ...patch }: RowInput = {}): DocPresenceRow => {
  const yClientId = patch.yClientId ?? 1;
  const awareness = encodeSheetAwareness(encodedFor ?? yClientId, 1, state === undefined ? { sheet: selectionToAwareness(SEL_A) ?? undefined } : state);
  return {
    id: `${patch.connectionId ?? "c1"}-${yClientId}`, documentId: DOC, organizationId: "org", connectionId: "c1", memberId: "m1",
    yClientId, name: "Name", color: "#112233", canEdit: true, awareness, updatedAt: new Date(T0), ...patch,
  };
};
const self = { connectionId: "c1", clientId: 1 };

describe("peersFromPresence / peerSelections / holderSelection", () => {
  const rows = [
    row({ connectionId: "c2", yClientId: 5, name: "Old", updatedAt: new Date(T0 - 20_000) }),
    row({ updatedAt: new Date(T0 - 100_000) }), // this session: never stale
    row({ connectionId: "c2", yClientId: 5, memberId: "m2", name: "Bo", color: "#445566", canEdit: false, state: {} }),
    row({ connectionId: "c0", yClientId: 9, updatedAt: new Date(T0 - 46_000) }), // stale
    row({ connectionId: "c3", yClientId: 2, state: null }), // withdrawn
    row({ connectionId: "c4", yClientId: 3, awareness: new Uint8Array([1, 2, 3]) }), // undecodable
    row({ connectionId: "c5", yClientId: 6, encodedFor: 8 }), // bytes for another client
    row({ connectionId: "c6", yClientId: 4, memberId: "m6", name: "Cy" }),
  ];

  test("self first, then one entry per (connection, client), newest wins; columns give names and flags", () => {
    expect(peersFromPresence(rows, self, T0)).toEqual([
      { yClientId: 1, memberId: "m1", name: "Name", color: "#112233", canEdit: true, isSelf: true },
      { yClientId: 5, memberId: "m2", name: "Bo", color: "#445566", canEdit: false, isSelf: false },
      { yClientId: 4, memberId: "m6", name: "Cy", color: "#112233", canEdit: true, isSelf: false },
    ]);
    const peers = peersFromPresence(rows, self, T0);
    expect(samePeers(peers, peersFromPresence([...rows].reverse(), self, T0))).toBe(true); // input order does not matter
    expect([samePeers(peers, peers.slice(1)), samePeers(peers, [peers[0], { ...peers[1], name: "Bob" }, peers[2]])]).toEqual([false, false]);
  });

  test("selections leave out this session and peers without one; the holder's newest selection", () => {
    expect(peerSelections(rows, self, T0).map((p) => [p.connectionId, p.memberId, p.selection])).toEqual([["c6", "m6", SEL_A]]);
    const two = [...rows, row({ connectionId: "c6", yClientId: 7, updatedAt: new Date(T0 + 5), state: { sheet: selectionToAwareness(SEL_B) ?? undefined } })];
    expect(holderSelection(two, "c6", self, T0)?.selection).toEqual(SEL_B);
    expect([holderSelection(two, "", self, T0), holderSelection(two, "c1", self, T0), holderSelection(two, "c2", self, T0)]).toEqual([null, null, null]);
  });
});

// ── SheetPresence ───────────────────────────────────────────────────────────
const USER = { name: "Ana", color: "#aa0000", memberId: "m1" };
function harness(opts: { throttleMs?: number } = {}) {
  let now = T0;
  let seq = 0;
  const queue: Array<{ at: number; id: number; fn: () => void; off: boolean }> = [];
  const timers = {
    setTimeout: ((fn: () => void, ms = 0) => {
      const timer = { at: now + ms, id: ++seq, fn, off: false };
      queue.push(timer);
      return timer;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((timer: { off: boolean } | null) => void (timer && (timer.off = true))) as unknown as typeof clearTimeout,
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      await settle();
      const next = queue.filter((t) => !t.off && t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      next.off = true;
      now = next.at;
      next.fn();
    }
    now = end;
    await settle();
  };
  const upserts: SheetPresenceUpsert[] = [];
  const removes: Array<[string, number]> = [];
  const outcomes: Array<() => Promise<void>> = [];
  const errors: unknown[] = [];
  const presence = new SheetPresence({
    documentId: DOC.toUpperCase(), user: USER, clientId: 42, now: () => now, timers, onError: (err) => errors.push(err), ...opts,
    transport: {
      upsertPresence: (input) => (upserts.push(input), (outcomes.shift() ?? (() => Promise.resolve()))()),
      removePresence: async (documentId, yClientId) => void removes.push([documentId, yClientId]),
    },
  });
  const last = () => decodeSheetAwareness(upserts[upserts.length - 1].awareness);
  const deferred = () => {
    let resolve = () => {};
    outcomes.push(() => new Promise<void>((r) => (resolve = r)));
    return () => resolve();
  };
  return { presence, advance, upserts, removes, outcomes, errors, last, deferred, now: () => now, live: () => queue.filter((t) => !t.off).length };
}

describe("SheetPresence", () => {
  test("announces at once, one selection change per second at most, a heartbeat every 15 s", async () => {
    const h = harness();
    h.presence.start("c1");
    await h.advance(0);
    expect(h.upserts.map((u) => [u.documentId, u.yClientId, u.name, u.color])).toEqual([[DOC, 42, "Ana", "#aa0000"]]);
    expect(h.last()).toEqual({ clientId: 42, clock: 1, state: { user: USER } });
    h.presence.setSelection(SEL_A);
    await h.advance(999);
    expect(h.upserts.length).toBe(1);
    await h.advance(1);
    expect([h.upserts.length, h.last()?.state?.sheet, h.last()?.clock]).toEqual([2, { s: "sheet-1", r: [2, 1, 5, 3] }, 2]);
    h.presence.setSelection({ ...SEL_A }); // unchanged
    h.presence.setSelection(SEL_B);
    h.presence.setUser({ ...USER, name: "Ana B" });
    await h.advance(1000);
    expect([h.upserts.length, h.last()?.state?.sheet?.s, h.upserts[2].name]).toEqual([3, "sheet-2", "Ana B"]);
    await h.advance(14_999);
    expect(h.upserts.length).toBe(3);
    await h.advance(1);
    expect([h.upserts.length, h.last()?.clock]).toEqual([4, 4]);
    h.presence.start("c1"); // already announcing on this socket
    await h.advance(0);
    expect(h.upserts.length).toBe(4);
    h.presence.start("c9"); // reconnected: announce again
    await h.advance(1000);
    expect(h.upserts.length).toBe(5);
    h.presence.dispose();
    expect(h.live()).toBe(0);
  });

  test("its own echo calibrates serverNow: a device clock that runs ahead does not hide peers", async () => {
    const h = harness();
    h.presence.start("c1");
    await h.advance(0);
    const sent = h.upserts[0];
    const peer = row({ connectionId: "c2", yClientId: 5, updatedAt: new Date(T0 - 70_000) }); // 10 s old on the server clock
    const other = { ...peer, documentId: "another-doc" };
    expect(h.presence.peers([peer]).length).toBe(0);
    h.presence.observe(row({ yClientId: 42, awareness: sent.awareness, updatedAt: new Date(T0 - 60_000), documentId: "x" })); // other doc
    expect(h.presence.clockOffsetMs).toBe(0);
    h.presence.observe(row({ yClientId: 42, awareness: sent.awareness, updatedAt: new Date(T0 - 60_000) }));
    expect([h.presence.clockOffsetMs, h.presence.serverNow()]).toEqual([-60_000, T0 - 60_000]);
    expect(h.presence.peers([peer, other]).map((p) => p.yClientId)).toEqual([5]);
    expect(peersFromPresence([peer], h.presence.self, h.now()).length).toBe(0);
    h.presence.dispose();
  });

  test("access lost stops for good; trashed backs off; other failures wait for the heartbeat", async () => {
    const offline = harness({ throttleMs: 0 });
    offline.outcomes.push(() => Promise.reject(new Error("[sheet.offline] Not connected")));
    offline.presence.start("c1");
    await offline.advance(14_999);
    expect([offline.upserts.length, offline.errors.length]).toEqual([1, 1]);
    await offline.advance(1);
    expect(offline.upserts.length).toBe(2);
    offline.presence.dispose();

    const trashed = harness({ throttleMs: 0 });
    trashed.outcomes.push(() => Promise.reject(new Error("[doc.trashed] Document is in the trash")));
    trashed.presence.start("c1");
    await trashed.advance(0);
    trashed.presence.setSelection(SEL_A);
    await trashed.advance(700);
    expect(trashed.upserts.length).toBe(1);
    await trashed.advance(600);
    expect(trashed.upserts.length).toBe(2);
    trashed.presence.dispose();

    const lost = harness({ throttleMs: 0 });
    lost.outcomes.push(() => Promise.reject(new Error("[doc.forbidden] No access")));
    lost.presence.start("c1");
    await lost.advance(0);
    lost.presence.setSelection(SEL_A);
    lost.presence.start("c2");
    await lost.advance(60_000);
    expect([lost.upserts.length, lost.errors.length, lost.presence.lostAccess, lost.presence.active, lost.live()]).toEqual([1, 1, true, false, 0]);
  });

  test("stop withdraws after the upsert in flight; a restart meanwhile keeps the new announcement", async () => {
    const idle = harness();
    await idle.presence.stop();
    expect(idle.removes).toEqual([]);

    const h = harness();
    const release = h.deferred();
    h.presence.start("c1");
    await h.advance(0);
    const stopping = h.presence.stop();
    await settle();
    expect(h.removes).toEqual([]);
    release();
    await stopping;
    expect([h.removes, h.live()]).toEqual([[[DOC, 42]], 0]);

    const again = h.deferred();
    h.presence.start("c1");
    await h.advance(1000);
    const second = h.presence.stop();
    h.presence.start("c1");
    again();
    await second;
    await h.advance(1000);
    expect([h.removes.length, h.upserts.length, h.presence.active]).toEqual([1, 3, true]);
    h.presence.dispose();
  });

  test("overlapping stops (park, then destroy) remove the row once, also across a restart that never sent", async () => {
    const h = harness();
    const release = h.deferred();
    h.presence.start("c1");
    await h.advance(0);
    const park = h.presence.stop();
    const destroy = h.presence.stop();
    release();
    await Promise.all([park, destroy]);
    expect(h.removes).toEqual([[DOC, 42]]);

    const again = h.deferred();
    h.presence.start("c1");
    await h.advance(1000);
    const first = h.presence.stop();
    h.presence.start("c1"); // restarted, then stopped before the new announcement went out
    const second = h.presence.stop();
    again();
    await Promise.all([first, second]);
    await h.advance(1000);
    expect([h.removes.length, h.upserts.length, h.presence.active, h.live()]).toEqual([2, 2, false, 0]);

    const third = h.deferred(); // dispose() sends nothing itself, but a stop() under way still withdraws
    h.presence.start("c1");
    await h.advance(1000);
    const stopping = h.presence.stop();
    h.presence.dispose();
    third();
    await stopping;
    expect([h.removes.length, h.upserts.length]).toEqual([3, 3]);
  });
});

// ── createSheetConnection ───────────────────────────────────────────────────
describe("createSheetConnection", () => {
  type Cb = (...args: unknown[]) => void;
  const fakeTable = (rows: unknown[]) => {
    const inserts = new Set<Cb>();
    return {
      inserts, iter: () => rows[Symbol.iterator](),
      onInsert: (cb: Cb) => inserts.add(cb), removeOnInsert: (cb: Cb) => inserts.delete(cb),
      onDelete: () => {}, removeOnDelete: () => {}, onUpdate: () => {}, removeOnUpdate: () => {},
    };
  };
  const leaseRaw = {
    documentId: DOC.toUpperCase(), organizationId: "org", epoch: 3n, holderMemberId: "m1", holderActorMemberId: "m1",
    holderSessionId: "s1", holderConnectionId: { toHexString: () => "c0ffee" }, holderName: "Ana", lastSeq: 2n,
    heartbeatAt: { toDate: () => new Date(T0) },
  };

  test("null without a connection or without the lease / Docs tables", () => {
    const docs = { documentUpdate: fakeTable([]), documentSnapshot: fakeTable([]), documentPresence: fakeTable([]) };
    const builder = () => ({});
    expect(createSheetConnection(null)).toBeNull();
    expect(createSheetConnection({})).toBeNull();
    expect(createSheetConnection({ db: docs, subscriptionBuilder: builder })).toBeNull();
    expect(createSheetConnection({ db: { documentEditLease: fakeTable([]) }, subscriptionBuilder: builder })).toBeNull();
  });

  test("maps lease rows, reads the connection id live, subscribes through the Docs adapter, one adapter per raw", () => {
    const leases = fakeTable([leaseRaw]);
    let hex = "";
    let queries: string[] = [];
    const raw = {
      get connectionId() { return { toHexString: () => hex }; },
      db: { documentUpdate: fakeTable([]), documentSnapshot: fakeTable([]), documentPresence: fakeTable([]), documentEditLease: leases },
      subscriptionBuilder: () => {
        const b = {
          onApplied: () => b, onError: () => b,
          subscribe: (q: string[]) => ((queries = q), { unsubscribe() {}, isActive: () => true, isEnded: () => false }),
        };
        return b;
      },
    };
    const conn = createSheetConnection(raw);
    if (!conn) throw new Error("no adapter");
    expect(createSheetConnection(raw)).toBe(conn);
    const [mapped] = [...conn.leases.iter()];
    expect([mapped.documentId, mapped.epoch, mapped.holderConnectionId, mapped.lastSeq, mapped.heartbeatAt.getTime(), mapped.requestedByMemberId])
      .toEqual([DOC, 3n, "c0ffee", 2n, T0, ""]);
    const seen: string[] = [];
    const onInsert = (_ctx: unknown, lease: { documentId: string }) => seen.push(lease.documentId);
    conn.leases.onInsert(onInsert);
    for (const cb of leases.inserts) cb({}, leaseRaw);
    conn.leases.removeOnInsert(onInsert);
    expect([seen, leases.inserts.size]).toEqual([[DOC], 0]);
    expect(conn.connectionIdHex).toBe("");
    hex = "abc123";
    expect(conn.connectionIdHex).toBe("abc123");
    conn.subscriptionBuilder().onApplied(() => {}).subscribe(sheetLiveQueries(DOC));
    expect(queries).toEqual(sheetLiveQueries(DOC));
  });
});
