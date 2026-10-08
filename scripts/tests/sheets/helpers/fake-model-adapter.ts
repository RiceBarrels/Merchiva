// Doubles for the spreadsheet sync-engine tests (sheets.md §15, SH2):
// - FakeModelAdapter: a SheetModelAdapter over a plain workbook, with local edits that emit ops like Univer's capture;
// - ManualClock: `now` and timers the test advances (lease clocks run in minutes);
// - FakeSheetServer: the REAL sheet + Docs presence reducers (helpers/sheet-server-harness.ts) behind clients whose
//   SheetConnection replays every committed transaction into a per-client table cache, the way the SDK does
//   (cache first, then row callbacks; the initial rows re-announced as inserts after onApplied).

import type { IWorkbookData } from "@univerjs/presets";
import { mapPresenceRow, mapSnapshotRow, mapUpdateRow } from "@/lib/docs/mappers";
import type { DocSubscriptionBuilder, DocTableHandle } from "@/lib/docs/sync-types";
import { SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { SheetOfflineError } from "@/lib/sheets/errors";
import { mapLeaseRow } from "@/lib/sheets/mappers";
import type { SheetConnection } from "@/lib/sheets/sync/connection";
import type { SheetTimers } from "@/lib/sheets/sync/push-queue";
import type { SheetOpAcceptor } from "@/lib/sheets/sync/remote-apply";
import type { SheetTransport } from "@/lib/sheets/sync/transport";
import type { SheetModelAdapter, SheetOp, SheetSelection } from "@/lib/sheets/types";
import { FakeIdentity, FakeTimestamp, keyOf, loadModule, type FakeMember, type Row } from "../../drive/fake-db";
import { MODULE, R, createSheetWorld, type SheetWorld } from "./sheet-server-harness";

type Json = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isPlain = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** A one-sheet workbook (`s1`), optionally with cells: { "r:c": value }. */
export function testWorkbook(cells: Record<string, string | number> = {}): IWorkbookData {
  const cellData: Record<number, Record<number, { v: string | number }>> = {};
  for (const [at, v] of Object.entries(cells)) {
    const [r, c] = at.split(":").map(Number);
    (cellData[r] ??= {})[c] = { v };
  }
  return clone({
    id: SHEET_UNIT_ID, name: "Budget", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["s1"],
    sheets: { s1: { id: "s1", name: "Sheet1", rowCount: 100, columnCount: 20, cellData } }, resources: [],
  }) as unknown as IWorkbookData;
}

/** Test policy standing in for mutation-filter's acceptRemoteOp: plain `sheet.mutation.*` ops for this unit only. */
export const acceptTestOp: SheetOpAcceptor = (op, unitId): op is SheetOp =>
  isPlain(op) && typeof op.mutationId === "string" && op.mutationId.startsWith("sheet.mutation.")
  && isPlain(op.params) && op.params.unitId === unitId;

export const setCellOp = (row: number, col: number, v: string | number): SheetOp => ({
  mutationId: "sheet.mutation.set-range-values",
  params: { unitId: SHEET_UNIT_ID, subUnitId: "s1", cellValue: { [row]: { [col]: { v } } } },
});
/** Not idempotent: applying it twice shows. */
export const insertRowOp = (): SheetOp => ({ mutationId: "sheet.mutation.insert-row", params: { unitId: SHEET_UNIT_ID, subUnitId: "s1" } });

export class FakeModelAdapter implements SheetModelAdapter {
  wb: Json = {};
  editable = false;
  loads: IWorkbookData[] = [];
  applied: SheetOp[] = [];
  highlighted: { color: string; selection: SheetSelection } | null = null;
  /** applyRemote fails on these mutation ids (accepted, but they "throw"). */
  readonly failOn = new Set<string>();
  disposed = false;
  private readonly local = new Set<(op: SheetOp) => void>();
  private readonly snapshots = new Set<(id: string) => void>();
  private readonly selections = new Set<(s: SheetSelection | null) => void>();
  private selection: SheetSelection | null = null;

  load(data: IWorkbookData): void {
    this.loads.push(clone(data));
    this.wb = clone(data) as unknown as Json;
  }

  applyRemote(ops: readonly SheetOp[]): { applied: number; failedAt: number } {
    for (let i = 0; i < ops.length; i++) {
      if (this.failOn.has(ops[i].mutationId)) return { applied: i, failedAt: i };
      this.execute(ops[i]);
      this.applied.push(clone(ops[i]));
    }
    return { applied: ops.length, failedAt: -1 };
  }

  save(): IWorkbookData { return clone(this.wb) as unknown as IWorkbookData; }
  saveForExport(): IWorkbookData { return this.save(); }
  onLocalOp(listener: (op: SheetOp) => void): () => void { return this.listen(this.local, listener); }
  onNeedsSnapshot(listener: (id: string) => void): () => void { return this.listen(this.snapshots, listener); }
  onSelectionChange(listener: (s: SheetSelection | null) => void): () => void { return this.listen(this.selections, listener); }
  setEditable(editable: boolean): void { this.editable = editable; }
  getSelection(): SheetSelection | null { return this.selection; }
  highlightPeer(peer: { color: string; selection: SheetSelection } | null): void { this.highlighted = peer; }
  dispose(): void { this.disposed = true; }

  /** A user edit: refused while read-only (as Univer's permission check), else applied and captured. */
  edit(op: SheetOp): boolean {
    if (!this.editable) return false;
    this.execute(op);
    for (const listener of [...this.local]) listener(clone(op));
    return true;
  }

  /** An op captured although the model is read-only (an adapter missing a permission check): applied and emitted. */
  leak(op: SheetOp): void {
    this.execute(op);
    for (const listener of [...this.local]) listener(clone(op));
  }

  /** A change no op can carry (the sheet's name here): the model changes, then asks for a snapshot. */
  snapshotOnlyEdit(name: string): void {
    (this.wb.sheets as Record<string, Json>).s1.name = name;
    this.needsSnapshot("sheet.command.snapshot-only");
  }

  needsSnapshot(mutationId: string): void { for (const listener of [...this.snapshots]) listener(mutationId); }
  select(selection: SheetSelection | null): void {
    this.selection = selection;
    for (const listener of [...this.selections]) listener(selection);
  }

  cell(row: number, col: number): unknown {
    const sheet = (this.wb.sheets as Record<string, Json> | undefined)?.s1;
    return ((sheet?.cellData as Record<string, Record<string, { v: unknown }>> | undefined)?.[row]?.[col])?.v;
  }
  get rowCount(): number { return Number((this.wb.sheets as Record<string, Json>).s1.rowCount); }

  private execute(op: SheetOp): void {
    const sheet = (this.wb.sheets as Record<string, Json>).s1;
    if (op.mutationId === "sheet.mutation.set-range-values") {
      const data = (sheet.cellData ??= {}) as Record<string, Record<string, unknown>>;
      for (const [r, cols] of Object.entries(op.params.cellValue as Record<string, Record<string, unknown>>)) {
        for (const [c, value] of Object.entries(cols)) (data[r] ??= {})[c] = clone(value);
      }
    } else if (op.mutationId === "sheet.mutation.insert-row") {
      sheet.rowCount = Number(sheet.rowCount) + 1;
    }
  }

  private listen<T>(set: Set<T>, listener: T): () => void {
    set.add(listener);
    return () => set.delete(listener);
  }
}

// ── Clock ─────────────────────────────────────────────────────────────────────

/** Macrotask turns: enough for promise chains, the codec's MessageChannel yields and the fake subscription. */
export async function settle(turns = 12): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setImmediate(resolve));
}

export class ManualClock {
  nowMs: number;
  private seq = 0;
  private readonly due = new Map<number, { at: number; fn: () => void }>();
  constructor(startMs: number) { this.nowMs = startMs; }
  readonly now = (): number => this.nowMs;
  readonly timers: SheetTimers = {
    setTimeout: ((fn: () => void, ms?: number) => {
      const id = ++this.seq;
      this.due.set(id, { at: this.nowMs + Math.max(0, ms ?? 0), fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: ((id?: ReturnType<typeof setTimeout>) => {
      this.due.delete(id as unknown as number);
    }) as typeof clearTimeout,
  };

  /** Move time forward, firing every timer that falls due (in order), settling after each. */
  async advance(ms: number): Promise<void> {
    const end = this.nowMs + ms;
    for (;;) {
      await settle();
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const entry of this.due) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      this.due.delete(next[0]);
      this.nowMs = Math.max(this.nowMs, next[1].at);
      next[1].fn();
    }
    this.nowMs = end;
    await settle();
  }
}

// ── Server + clients ──────────────────────────────────────────────────────────

const PRESENCE = loadModule(["upsertDocumentPresence", "removeDocumentPresence"], { Timestamp: FakeTimestamp });

type Callback = (...args: unknown[]) => void;
interface FakeTable { handle: DocTableHandle<never>; sync(rows: Row[], announce: boolean): Array<() => void> }

function fakeTable(pk: string, map: (row: Row) => unknown): FakeTable {
  const raw = new Map<string, Row>();
  const mapped = new Map<string, unknown>();
  const cbs = { insert: new Set<Callback>(), update: new Set<Callback>(), delete: new Set<Callback>() };
  const fire = (kind: keyof typeof cbs, ...rows: unknown[]) => () => { for (const cb of [...cbs[kind]]) cb(undefined, ...rows); };
  const handle = {
    iter: () => [...mapped.values()],
    onInsert: (cb: Callback) => cbs.insert.add(cb), removeOnInsert: (cb: Callback) => cbs.insert.delete(cb),
    onUpdate: (cb: Callback) => cbs.update.add(cb), removeOnUpdate: (cb: Callback) => cbs.update.delete(cb),
    onDelete: (cb: Callback) => cbs.delete.add(cb), removeOnDelete: (cb: Callback) => cbs.delete.delete(cb),
  } as unknown as DocTableHandle<never>;
  return {
    handle,
    /** Apply `rows` as the new cache content; returns the callbacks to fire (after every table is applied). */
    sync(rows, announce) {
      const out: Array<() => void> = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const key = keyOf(row[pk]);
        seen.add(key);
        const before = raw.get(key);
        if (before === row) continue;
        const next = map(row);
        const old = mapped.get(key);
        raw.set(key, row);
        mapped.set(key, next);
        if (announce) out.push(before ? fire("update", old, next) : fire("insert", next));
      }
      for (const key of [...raw.keys()]) {
        if (seen.has(key)) continue;
        const old = mapped.get(key);
        raw.delete(key);
        mapped.delete(key);
        if (announce) out.push(fire("delete", old));
      }
      return out;
    },
  };
}

export class FakeSheetClient {
  connection = FakeIdentity.random();
  online = true;
  /** While true, committed transactions queue up instead of reaching this client's cache. */
  held = false;
  /** The next reducer call commits on the server, then the socket closes before the reply. */
  dropNextReply = false;
  conn!: SheetConnection;
  private docs = new Set<string>();
  private tables!: { update: FakeTable; snapshot: FakeTable; presence: FakeTable; lease: FakeTable };
  readonly transport: SheetTransport;

  constructor(readonly server: FakeSheetServer, readonly member: FakeMember) {
    this.connect();
    const call = (fn: unknown, args: Json) => this.call(fn, args);
    const acting = (i: { actingMemberId?: string | null }) => i.actingMemberId ?? "";
    this.transport = {
      acquireLease: (i) => call(R.acquireSheetLease, { documentId: i.documentId, sessionId: i.sessionId, actingMemberId: acting(i) }),
      heartbeatLease: (i) => call(R.heartbeatSheetLease, { ...i, actingMemberId: acting(i) }),
      releaseLease: (i) => call(R.releaseSheetLease, { documentId: i.documentId, sessionId: i.sessionId }),
      declineLeaseRequest: (i) => call(R.declineSheetLeaseRequest, { ...i, actingMemberId: acting(i) }),
      cancelLeaseRequest: (i) => call(R.cancelSheetLeaseRequest, { documentId: i.documentId, sessionId: i.sessionId }),
      pushOps: (i) => call(R.pushSheetOps, { ...i, actingMemberId: acting(i) }),
      compact: (i) => call(R.compactSheet, { ...i, actingMemberId: acting(i) }),
      resetContent: (i) => call(R.resetSheetContent, { ...i, actingMemberId: acting(i) }),
      saveVersion: (i) => call(R.saveSheetVersion, { ...i, name: i.name || undefined, actingMemberId: acting(i) }),
      upsertPresence: (i) => call(PRESENCE.upsertDocumentPresence, { ...i }),
      removePresence: (documentId, yClientId) => call(PRESENCE.removeDocumentPresence, { documentId, yClientId }),
    };
  }

  /** The socket closes: the server runs onDisconnect for it; calls fail offline until reconnect(). */
  disconnect(): void {
    if (!this.online) return;
    this.online = false;
    this.server.run(MODULE.onDisconnect, this.member, {}, this.connection);
  }

  /** A new socket (a new connection id and a new, empty SheetConnection to attach). */
  reconnect(): SheetConnection {
    this.connection = FakeIdentity.random();
    this.online = true;
    this.connect();
    return this.conn;
  }

  /** Deliver what the server committed since the last delivery (the SDK applying transaction updates). */
  deliver(): void {
    if (!this.online || this.held || this.docs.size === 0) return;
    const db = this.server.db;
    const of = (rows: Row[]) => rows.filter((row) => this.docs.has(String(row.documentId)));
    const fire = [
      ...this.tables.update.sync(of(db.rows("documentUpdate")), true),
      ...this.tables.snapshot.sync(of(db.rows("documentSnapshot")), true),
      ...this.tables.presence.sync(of(db.rows("documentPresence")), true),
      ...this.tables.lease.sync(of(db.rows("documentEditLease")), true),
    ];
    for (const cb of fire) cb();
  }

  private async call(fn: unknown, args: Json): Promise<void> {
    await Promise.resolve();
    if (!this.online) throw new SheetOfflineError();
    this.server.run(fn, this.member, args, this.connection);
    if (this.dropNextReply) {
      this.dropNextReply = false;
      this.disconnect();
      throw new SheetOfflineError("[sheet.offline] The connection closed before the server answered");
    }
  }

  private connect(): void {
    const tables = {
      update: fakeTable("id", mapUpdateRow), snapshot: fakeTable("documentId", mapSnapshotRow),
      presence: fakeTable("id", mapPresenceRow), lease: fakeTable("documentId", mapLeaseRow),
    };
    this.tables = tables;
    this.docs = new Set();
    const connectionHex = this.connection.toHexString();
    const builder = (): DocSubscriptionBuilder => {
      let applied: (() => void) | null = null;
      const b: DocSubscriptionBuilder = {
        onApplied: (cb) => ((applied = cb), b),
        onError: () => b,
        subscribe: (queries) => {
          const id = /'([0-9a-f-]{36})'/.exec(queries[0] ?? "")?.[1] ?? "";
          let active = true;
          void Promise.resolve().then(() => {
            if (!active || !this.online || this.tables !== tables) return;
            this.docs.add(id);
            const rows = (accessor: string) => this.server.db.rows(accessor).filter((row) => String(row.documentId) === id);
            // Cache first, callbacks after onApplied (the SDK re-announces the initial rows as inserts).
            const fire = [
              ...tables.update.sync(rows("documentUpdate"), true), ...tables.snapshot.sync(rows("documentSnapshot"), true),
              ...tables.presence.sync(rows("documentPresence"), true), ...tables.lease.sync(rows("documentEditLease"), true),
            ];
            applied?.();
            for (const cb of fire) cb();
          });
          return { unsubscribe: () => { active = false; this.docs.delete(id); }, isActive: () => active, isEnded: () => !active };
        },
      };
      return b;
    };
    this.conn = {
      connectionIdHex: connectionHex,
      db: { documentUpdate: tables.update.handle, documentSnapshot: tables.snapshot.handle, documentPresence: tables.presence.handle },
      leases: tables.lease.handle,
      subscriptionBuilder: builder,
      // The bootstrap subscription keeps this device's own operator row in the cache (RLS: identity = :sender).
      deviceOperator: () => {
        const row = this.server.db.find("deviceOperatorSession", this.member.identity);
        return row ? { organizationId: String(row.organizationId), memberId: String(row.memberId) } : null;
      },
    } as SheetConnection;
  }
}

export class FakeSheetServer {
  readonly world: SheetWorld = createSheetWorld();
  readonly db = this.world.db;
  readonly clients: FakeSheetClient[] = [];
  constructor(readonly clock: ManualClock) {}

  client(member: FakeMember): FakeSheetClient {
    const client = new FakeSheetClient(this, member);
    this.clients.push(client);
    return client;
  }

  /** One transaction at the clock's time (never before the database's own clock), delivered to every client. */
  run(fn: unknown, member: FakeMember, args: Json, connection: FakeIdentity): void {
    const at = BigInt(Math.floor(this.clock.nowMs)) * 1000n; // a jittered retry fires at a fractional millisecond
    this.db.run(fn, member, args, { connectionId: connection, atMicros: at > this.db.nowMicros ? at : this.db.nowMicros + 1n });
    for (const client of this.clients) client.deliver();
  }
}
