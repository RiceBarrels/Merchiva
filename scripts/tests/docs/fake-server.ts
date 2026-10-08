// Test helper: an in-process stand-in for SpacetimeDB that runs the REAL docs
// reducers from spacetimedb/src/index.ts (extracted by ./server-source.ts)
// against in-memory tables, and talks to the client through the real
// lib/docs/connection.ts adapter and lib/spacetimedb/actions.ts wrappers.
//
// Semantics mirrored from spacetimedb@2.2.0 (node_modules/spacetimedb/dist/index.mjs):
// - Reducers run serially, one transaction each, in arrival order; a throw rolls
//   back every write and rejects the caller with the error message.
// - Auto-increment ids are handed out in commit order and never reused.
// - Each client has a FIFO inbox, so it observes commits in commit order.
//   `step`/`pump` interleave server work and deliveries across clients.
// - SubscribeApplied: rows enter the cache, onApplied fires, THEN row callbacks.
// - ReducerResult: the caller's row callbacks fire, then its promise settles.
// - Cached rows are reference-counted per query set; insert/delete callbacks fire
//   only when a row enters/leaves the cache; delete+insert of one key is an update.
// - `unsubscribe()` may be called once; the query set's rows leave with onDelete.
// - Disconnecting drops queued calls and runs the module's clientDisconnected hook.

import { randomBytes, randomUUID } from "node:crypto";
import { createDocConnection } from "@/lib/docs/connection";
import type { DocConnection, DocTransport } from "@/lib/docs/sync-types";
import { spacetimeDocTransport } from "@/lib/docs/transport";
import { clearConnection, getConnection, setConnection } from "@/lib/spacetimedb/client";
import { loadServerDeclarations } from "./server-source";

export type Row = Readonly<Record<string, unknown>>;

// ── SDK value stand-ins ──────────────────────────────────────────────────────

/** Identity / ConnectionId. */
export class FakeHex {
  constructor(readonly hex: string) {}
  static random(bytes = 16): FakeHex {
    return new FakeHex(randomBytes(bytes).toString("hex"));
  }
  toHexString(): string {
    return this.hex;
  }
  toString(): string {
    return this.hex;
  }
  isEqual(other: { toHexString(): string } | null | undefined): boolean {
    return !!other && other.toHexString() === this.hex;
  }
}

export class FakeUuid {
  constructor(private readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export class FakeTimestamp {
  constructor(readonly microsSinceUnixEpoch: bigint) {}
  toDate(): Date {
    return new Date(Number(this.microsSinceUnixEpoch / 1000n));
  }
}

class FakeSenderError extends Error {
  name = "SenderError";
}

// ── Schema ───────────────────────────────────────────────────────────────────

interface TableDef {
  readonly accessor: string;
  readonly sqlName: string;
  readonly primaryKey: string;
  readonly autoInc?: boolean;
  /** index accessor → column */
  readonly indexes: Readonly<Record<string, string>>;
}

/** Mirrors the table definitions in spacetimedb/src/index.ts. */
const TABLE_DEFS: readonly TableDef[] = [
  { accessor: "document", sqlName: "document", primaryKey: "id", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "documentUpdate", sqlName: "document_update", primaryKey: "id", autoInc: true, indexes: { byDocumentId: "documentId" } },
  { accessor: "documentSnapshot", sqlName: "document_snapshot", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  {
    accessor: "documentPresence",
    sqlName: "document_presence",
    primaryKey: "id",
    indexes: { byDocumentId: "documentId", byConnectionId: "connectionId" },
  },
  { accessor: "documentComment", sqlName: "document_comment", primaryKey: "id", indexes: { byDocumentId: "documentId", byThreadId: "threadId" } },
  { accessor: "documentVersion", sqlName: "document_version", primaryKey: "id", indexes: { byDocumentId: "documentId" } },
  { accessor: "documentStar", sqlName: "document_star", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "documentAccess", sqlName: "document_access", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "orgMember", sqlName: "org_member", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "notification", sqlName: "notification", primaryKey: "id", indexes: {} },
  // spacetimedb/src/drive/tables.ts: docs reducers keep the reader index current; sheets touch the other two.
  { accessor: "documentReaderIndex", sqlName: "document_reader_index", primaryKey: "id", indexes: { byDocumentId: "documentId", byUserId: "userId" } },
  {
    accessor: "documentEditLease",
    sqlName: "document_edit_lease",
    primaryKey: "documentId",
    indexes: { byOrganizationId: "organizationId", byHolderConnectionId: "holderConnectionId", byRequestedByConnectionId: "requestedByConnectionId" },
  },
  {
    accessor: "documentVersionState",
    sqlName: "document_version_state",
    primaryKey: "versionId",
    indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" },
  },
  // A document's Drive type and folder (drive/document-file.ts): restoreDocument and setDocumentVisibility read it.
  { accessor: "documentFile", sqlName: "document_file", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  // Storage accounting (drive/storage.ts): new documents check the org's quota and keep a document_size row.
  { accessor: "driveUsage", sqlName: "drive_usage", primaryKey: "organizationId", indexes: { byScope: "scope" } },
  { accessor: "orgStorageUsage", sqlName: "org_storage_usage", primaryKey: "organizationId", indexes: {} },
  { accessor: "documentSize", sqlName: "document_size", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  // Allowed, not yet recorded app uploads count toward the same quota (orgStorageTotal).
  { accessor: "appUploadHold", sqlName: "app_upload_hold", primaryKey: "id", autoInc: true, indexes: { byOrganizationId: "organizationId" } },
];

/** Reducers the fake server exposes, taken verbatim from the module. */
export const FAKE_SERVER_REDUCERS = [
  "createDocument",
  "pushDocumentUpdate",
  "compactDocument",
  "saveDocumentVersion",
  "upsertDocumentPresence",
  "removeDocumentPresence",
  "setDocumentVisibility",
  "grantDocumentAccess",
  "revokeDocumentAccess",
  "trashDocument",
  "restoreDocument",
] as const;

interface ReducerCtx {
  db: Record<string, unknown>;
  sender: FakeHex;
  connectionId: FakeHex;
  timestamp: FakeTimestamp;
  newUuidV4(): FakeUuid;
}
type ReducerFn = (ctx: ReducerCtx, args: Record<string, unknown>) => void;

let declarations: Record<string, unknown> | null | undefined;

function moduleDeclarations(): Record<string, unknown> {
  if (declarations === undefined) {
    // `t.string()`, `t.option(t.byteArray())`, `.primaryKey()`… only describe argument types.
    const typeBuilder: unknown = new Proxy(function typeBuilderStub() {}, {
      get: () => typeBuilder,
      apply: () => typeBuilder,
    });
    declarations = loadServerDeclarations([...FAKE_SERVER_REDUCERS, "onDisconnect"], {
      spacetimedb: {
        reducer: (_params: unknown, fn: ReducerFn) => fn,
        clientDisconnected: (fn: (ctx: ReducerCtx) => void) => fn,
      },
      t: typeBuilder,
      SenderError: FakeSenderError,
      // No service identity in these tests; findActiveMember then resolves real org_member rows.
      isServiceCaller: () => false,
    });
  }
  if (!declarations) throw new Error("spacetimedb/src/index.ts does not define the docs reducers");
  return declarations;
}

function keyOf(value: unknown): string {
  if (typeof value === "bigint") return `n${value}`;
  if (value && typeof value === "object" && typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return `h${(value as { toHexString(): string }).toHexString()}`;
  }
  return `s${String(value)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Server storage ───────────────────────────────────────────────────────────

type Journal = Map<ServerTable, Map<string, Row | undefined>>;

interface Change {
  readonly table: ServerTable;
  readonly key: string;
  readonly before: Row | undefined;
  readonly after: Row | undefined;
}

interface TableHandle {
  insert(row: Record<string, unknown>): Row;
  delete(row: Row): boolean;
  iter(): Row[];
}

class ServerTable {
  readonly rows = new Map<string, Row>();
  readonly handle: Record<string, unknown>;
  private nextAutoInc = 1n;

  constructor(
    readonly def: TableDef,
    private readonly onWrite: (table: ServerTable, key: string) => void,
  ) {
    const pk = def.primaryKey;
    const handle: Record<string, unknown> = {
      insert: (row: Record<string, unknown>) => this.insert(row),
      delete: (row: Row) => this.deleteKey(row[pk]),
      iter: () => [...this.rows.values()],
      count: () => BigInt(this.rows.size),
      [pk]: {
        // null on a miss, like the SDK's unique-index find (never undefined).
        find: (value: unknown) => this.rows.get(keyOf(value)) ?? null,
        update: (row: Record<string, unknown>) => this.update(row),
        delete: (value: unknown) => this.deleteKey(value),
      },
    };
    for (const [accessor, column] of Object.entries(def.indexes)) {
      handle[accessor] = {
        // An iterator, like the SDK's index filter (reducers call `.next()` on it); snapshotted, so deleting while iterating is safe.
        filter: (value: unknown) => [...this.rows.values()].filter((row) => keyOf(row[column]) === keyOf(value)).values(),
      };
    }
    this.handle = handle;
  }

  private insert(row: Record<string, unknown>): Row {
    const pk = this.def.primaryKey;
    const next: Record<string, unknown> = { ...row };
    if (this.def.autoInc) {
      const id = next[pk];
      if (id === 0n || id === undefined) next[pk] = this.nextAutoInc++;
      else if (typeof id === "bigint" && id >= this.nextAutoInc) this.nextAutoInc = id + 1n;
    }
    const key = keyOf(next[pk]);
    if (this.rows.has(key)) throw new Error(`${this.def.sqlName}: duplicate primary key`);
    this.onWrite(this, key);
    const frozen = Object.freeze(next);
    this.rows.set(key, frozen);
    return frozen;
  }

  private update(row: Record<string, unknown>): Row {
    const key = keyOf(row[this.def.primaryKey]);
    if (!this.rows.has(key)) throw new Error(`${this.def.sqlName}: update of a missing row`);
    this.onWrite(this, key);
    const frozen = Object.freeze({ ...row });
    this.rows.set(key, frozen);
    return frozen;
  }

  private deleteKey(value: unknown): boolean {
    const key = keyOf(value);
    if (!this.rows.has(key)) return false;
    this.onWrite(this, key);
    this.rows.delete(key);
    return true;
  }
}

interface ParsedQuery {
  readonly table: ServerTable;
  readonly column: string;
  readonly value: string;
}

const QUERY_RE = /^SELECT \* FROM "([a-z_]+)" WHERE "([a-z_]+)"\."([a-z_]+)" = '((?:[^']|'')*)'$/;

function matchesQuery(query: ParsedQuery, row: Row): boolean {
  return keyOf(row[query.column]) === keyOf(query.value);
}

// ── Messages ─────────────────────────────────────────────────────────────────

interface Settler {
  resolve(): void;
  reject(err: Error): void;
}

type Inbound =
  | { kind: "call"; client: FakeClient; name: string; args: Record<string, unknown>; settle: Settler }
  | { kind: "subscribe"; client: FakeClient; subId: number; queries: readonly string[] }
  | { kind: "unsubscribe"; client: FakeClient; subId: number };

interface Op {
  readonly type: "insert" | "delete";
  readonly accessor: string;
  readonly key: string;
  readonly row: Row;
}

type InboxMessage =
  | { type: "subscribeApplied"; subId: number; ops: Op[] }
  | { type: "subscriptionError"; subId: number; message: string }
  | { type: "unsubscribeApplied"; subId: number; ops: Op[] }
  | { type: "transaction"; ops: Op[] }
  | { type: "reducerResult"; ops: Op[]; error: Error | null; settle: Settler };

export interface CallRecord {
  readonly reducer: string;
  readonly identity: string;
  readonly connectionId: string;
  readonly ok: boolean;
  readonly error: string | null;
  /**
   * Other clients' update-log inserts still undelivered to the caller when the server ran
   * the call. > 0 means the caller made its change without having seen those commits.
   */
  readonly unseenUpdates: number;
}

export interface FakeMember {
  readonly memberId: string;
  readonly identity: FakeHex;
  readonly organizationId: string;
}

// ── Server ───────────────────────────────────────────────────────────────────

export class FakeDocServer {
  readonly reducerNames: readonly string[] = FAKE_SERVER_REDUCERS;
  /** Every processed reducer call, in processing order. */
  readonly callLog: CallRecord[] = [];
  /** Simulates a module without the docs tables: every subscription fails. */
  failSubscriptions = false;
  commitCount = 0;

  private readonly tables = new Map<string, ServerTable>();
  private readonly tablesBySqlName = new Map<string, ServerTable>();
  private readonly db: Record<string, unknown> = {};
  private readonly reducers: Record<string, ReducerFn> = {};
  private readonly disconnectHook: (ctx: ReducerCtx) => void;
  private readonly inbound: Inbound[] = [];
  private readonly clients: FakeClient[] = [];
  private journal: Journal | null = null;
  private lastMicros = 0n;

  constructor() {
    const decls = moduleDeclarations();
    for (const name of FAKE_SERVER_REDUCERS) this.reducers[name] = decls[name] as ReducerFn;
    this.disconnectHook = decls.onDisconnect as (ctx: ReducerCtx) => void;
    for (const def of TABLE_DEFS) {
      const table = new ServerTable(def, (t, key) => this.recordWrite(t, key));
      this.tables.set(def.accessor, table);
      this.tablesBySqlName.set(def.sqlName, table);
      this.db[def.accessor] = table.handle;
    }
  }

  // ── setup ──

  addMember(input: { organizationId: string; role?: "owner" | "manager" | "staff"; permissions?: string; displayName?: string }): FakeMember {
    const identity = FakeHex.random();
    const id = new FakeUuid(randomUUID());
    this.transact((db) => {
      (db.orgMember as TableHandle).insert({
        id,
        organizationId: input.organizationId,
        userId: identity,
        role: input.role ?? "staff",
        displayName: input.displayName ?? "Member",
        email: "",
        permissions: input.permissions ?? "{}",
        status: "active",
        joinedAt: this.now(),
        punchInCode: undefined,
        hourlyRate: undefined,
      });
    });
    return { memberId: id.toString(), identity, organizationId: input.organizationId };
  }

  connect(identity: FakeHex): FakeClient {
    const client = new FakeClient(this, identity, [...this.tables.keys()], this.reducerNames);
    this.clients.push(client);
    return client;
  }

  link(identity: FakeHex): FakeLink {
    return new FakeLink(this, identity);
  }

  /** A write outside any reducer (fixtures). Commits and broadcasts like a reducer; throws roll back. */
  transact(body: (db: Record<string, unknown>) => void): void {
    const result = this.runTransaction(() => body(this.db));
    if (!result.ok) throw result.error;
    this.broadcast(result.changes, null, null);
  }

  // ── inspection ──

  rows(accessor: string): Row[] {
    const table = this.tables.get(accessor);
    if (!table) throw new Error(`Unknown table ${accessor}`);
    return [...table.rows.values()];
  }

  get inboundSize(): number {
    return this.inbound.length;
  }

  isIdle(): boolean {
    return this.inbound.length === 0 && this.clients.every((c) => c.inboxSize === 0);
  }

  // ── scheduling ──

  /** Process the oldest inbound message (reducer call, subscribe or unsubscribe). */
  processNext(): boolean {
    const message = this.inbound.shift();
    if (!message) return false;
    const { client } = message;
    switch (message.kind) {
      case "call":
        this.processCall(client, message.name, message.args, message.settle);
        break;
      case "subscribe":
        this.processSubscribe(client, message.subId, message.queries);
        break;
      case "unsubscribe": {
        const queries = client.serverSubscriptions.get(message.subId);
        if (!client.connected || !queries) break;
        client.serverSubscriptions.delete(message.subId);
        client.receive({ type: "unsubscribeApplied", subId: message.subId, ops: this.currentRows(queries, "delete") });
        break;
      }
    }
    return true;
  }

  processAll(): number {
    let n = 0;
    while (this.processNext()) n++;
    return n;
  }

  /** One unit of work chosen at random: process one inbound message or deliver one inbox message. */
  step(random: () => number = Math.random): boolean {
    const work: Array<() => boolean> = [];
    if (this.inbound.length > 0) work.push(() => this.processNext());
    for (const client of this.clients) if (client.inboxSize > 0) work.push(() => client.deliverNext());
    if (work.length === 0) return false;
    work[Math.floor(random() * work.length)]();
    return true;
  }

  /** Step until nothing is left to process or deliver (synchronous). */
  pump(random: () => number = Math.random, maxSteps = 1_000_000): number {
    let steps = 0;
    while (this.step(random)) {
      if (++steps >= maxSteps) throw new Error("FakeDocServer.pump did not settle");
    }
    return steps;
  }

  // ── internals used by FakeClient ──

  enqueue(message: Inbound): void {
    this.inbound.push(message);
  }

  disconnected(client: FakeClient): void {
    client.serverSubscriptions.clear();
    for (let i = this.inbound.length - 1; i >= 0; i--) {
      const message = this.inbound[i];
      if (message.client !== client) continue;
      this.inbound.splice(i, 1);
      if (message.kind === "call") message.settle.reject(new Error("Connection closed"));
    }
    const ctx = this.context(client);
    const result = this.runTransaction(() => this.disconnectHook(ctx));
    if (result.ok) this.broadcast(result.changes, null, null);
  }

  private processCall(client: FakeClient, name: string, args: Record<string, unknown>, settle: Settler): void {
    if (!client.connected) {
      settle.reject(new Error("Connection closed"));
      return;
    }
    const reducer = this.reducers[name];
    const ctx = this.context(client);
    const result = reducer
      ? this.runTransaction(() => reducer(ctx, args))
      : { ok: false as const, error: new Error(`No such reducer: ${name}`) };
    const record = {
      reducer: name,
      identity: client.identity.hex,
      connectionId: client.connectionId.hex,
      unseenUpdates: client.undeliveredUpdateInserts(),
    };
    if (result.ok) {
      this.callLog.push({ ...record, ok: true, error: null });
      this.broadcast(result.changes, client, settle);
    } else {
      const error = new Error(errorMessage(result.error));
      this.callLog.push({ ...record, ok: false, error: error.message });
      client.receive({ type: "reducerResult", ops: [], error, settle });
    }
  }

  private processSubscribe(client: FakeClient, subId: number, sqls: readonly string[]): void {
    if (!client.connected) return;
    const parsed = sqls.map((sql) => this.parseQuery(sql));
    if (this.failSubscriptions || parsed.some((q) => q === null)) {
      client.receive({ type: "subscriptionError", subId, message: "Subscription failed: no such table" });
      return;
    }
    const queries = parsed as ParsedQuery[];
    client.serverSubscriptions.set(subId, queries);
    client.receive({ type: "subscribeApplied", subId, ops: this.currentRows(queries, "insert") });
  }

  private parseQuery(sql: string): ParsedQuery | null {
    const match = QUERY_RE.exec(sql);
    if (!match || match[1] !== match[2]) return null;
    const table = this.tablesBySqlName.get(match[1]);
    if (!table) return null;
    const column = match[3].replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
    return { table, column, value: match[4].replace(/''/g, "'") };
  }

  private currentRows(queries: readonly ParsedQuery[], type: Op["type"]): Op[] {
    const ops: Op[] = [];
    for (const query of queries) {
      for (const [key, row] of query.table.rows) {
        if (matchesQuery(query, row)) ops.push({ type, accessor: query.table.def.accessor, key, row });
      }
    }
    return ops;
  }

  private context(client: FakeClient): ReducerCtx {
    return {
      db: this.db,
      sender: client.identity,
      connectionId: client.connectionId,
      timestamp: this.now(),
      newUuidV4: () => new FakeUuid(randomUUID()),
    };
  }

  private now(): FakeTimestamp {
    let micros = BigInt(Date.now()) * 1000n;
    if (micros <= this.lastMicros) micros = this.lastMicros + 1n;
    this.lastMicros = micros;
    return new FakeTimestamp(micros);
  }

  private recordWrite(table: ServerTable, key: string): void {
    if (!this.journal) throw new Error("Write outside a transaction");
    let befores = this.journal.get(table);
    if (!befores) {
      befores = new Map();
      this.journal.set(table, befores);
    }
    if (!befores.has(key)) befores.set(key, table.rows.get(key));
  }

  private runTransaction(body: () => void): { ok: true; changes: Change[] } | { ok: false; error: unknown } {
    if (this.journal) throw new Error("Nested transaction");
    const journal: Journal = new Map();
    this.journal = journal;
    try {
      body();
    } catch (error) {
      for (const [table, befores] of journal) {
        for (const [key, before] of befores) {
          if (before === undefined) table.rows.delete(key);
          else table.rows.set(key, before);
        }
      }
      return { ok: false, error };
    } finally {
      this.journal = null;
    }
    const changes: Change[] = [];
    for (const [table, befores] of journal) {
      for (const [key, before] of befores) {
        const after = table.rows.get(key);
        if (before !== after) changes.push({ table, key, before, after });
      }
    }
    this.commitCount++;
    return { ok: true, changes };
  }

  private broadcast(changes: readonly Change[], caller: FakeClient | null, settle: Settler | null): void {
    for (const client of this.clients) {
      if (!client.connected) continue;
      const ops = this.visibleOps(client, changes);
      if (client === caller && settle) client.receive({ type: "reducerResult", ops, error: null, settle });
      else if (ops.length > 0) client.receive({ type: "transaction", ops });
    }
  }

  private visibleOps(client: FakeClient, changes: readonly Change[]): Op[] {
    const ops: Op[] = [];
    for (const change of changes) {
      const accessor = change.table.def.accessor;
      for (const queries of client.serverSubscriptions.values()) {
        for (const query of queries) {
          if (query.table !== change.table) continue;
          if (change.before && matchesQuery(query, change.before)) ops.push({ type: "delete", accessor, key: change.key, row: change.before });
          if (change.after && matchesQuery(query, change.after)) ops.push({ type: "insert", accessor, key: change.key, row: change.after });
        }
      }
    }
    return ops;
  }
}

// ── Client ───────────────────────────────────────────────────────────────────

type RowCallback = (ctx: unknown, row: Row) => void;
type UpdateCallback = (ctx: unknown, oldRow: Row, newRow: Row) => void;

const EVENT_CONTEXT = Object.freeze({ event: Object.freeze({ tag: "Transaction" }) });

class ClientTable {
  readonly rows = new Map<string, { row: Row; refs: number }>();
  private readonly inserts = new Set<RowCallback>();
  private readonly deletes = new Set<RowCallback>();
  private readonly updates = new Set<UpdateCallback>();

  readonly handle = {
    iter: (): Row[] => [...this.rows.values()].map((entry) => entry.row),
    count: (): bigint => BigInt(this.rows.size),
    onInsert: (cb: RowCallback): void => void this.inserts.add(cb),
    removeOnInsert: (cb: RowCallback): void => void this.inserts.delete(cb),
    onDelete: (cb: RowCallback): void => void this.deletes.add(cb),
    removeOnDelete: (cb: RowCallback): void => void this.deletes.delete(cb),
    onUpdate: (cb: UpdateCallback): void => void this.updates.add(cb),
    removeOnUpdate: (cb: UpdateCallback): void => void this.updates.delete(cb),
  };

  /** Applies one message's operations; returns the row callbacks to dispatch afterwards. */
  apply(ops: readonly Op[]): Array<() => void> {
    const inserted = new Map<string, { row: Row; count: number }>();
    const deleted = new Map<string, { row: Row; count: number }>();
    for (const op of ops) {
      const bucket = op.type === "insert" ? inserted : deleted;
      const entry = bucket.get(op.key);
      if (entry) {
        entry.count += 1;
        entry.row = op.row;
      } else {
        bucket.set(op.key, { row: op.row, count: 1 });
      }
    }
    const callbacks: Array<() => void> = [];
    for (const [key, ins] of inserted) {
      const existing = this.rows.get(key);
      const del = deleted.get(key);
      if (del) {
        deleted.delete(key);
        if (!existing) {
          this.rows.set(key, { row: ins.row, refs: Math.max(1, ins.count - del.count) });
          callbacks.push(() => this.emitInsert(ins.row));
          continue;
        }
        const oldRow = existing.row;
        existing.refs += ins.count - del.count;
        existing.row = ins.row;
        if (existing.refs <= 0) {
          this.rows.delete(key);
          callbacks.push(() => this.emitDelete(oldRow));
        } else {
          callbacks.push(() => this.emitUpdate(oldRow, ins.row));
        }
        continue;
      }
      if (existing) {
        existing.refs += ins.count;
        continue;
      }
      this.rows.set(key, { row: ins.row, refs: ins.count });
      callbacks.push(() => this.emitInsert(ins.row));
    }
    for (const [key, del] of deleted) {
      const existing = this.rows.get(key);
      if (!existing) continue;
      existing.refs -= del.count;
      if (existing.refs <= 0) {
        this.rows.delete(key);
        const row = existing.row;
        callbacks.push(() => this.emitDelete(row));
      }
    }
    return callbacks;
  }

  private emitInsert(row: Row): void {
    for (const cb of [...this.inserts]) cb(EVENT_CONTEXT, row);
  }
  private emitDelete(row: Row): void {
    for (const cb of [...this.deletes]) cb(EVENT_CONTEXT, row);
  }
  private emitUpdate(oldRow: Row, newRow: Row): void {
    for (const cb of [...this.updates]) cb(EVENT_CONTEXT, oldRow, newRow);
  }
}

export class FakeSubscriptionHandle {
  private active = false;
  private ended = false;
  private unsubscribeCalled = false;

  constructor(
    private readonly client: FakeClient,
    readonly id: number,
    private readonly onApplied: ((ctx: unknown) => void) | undefined,
    private readonly onError: ((ctx: unknown) => void) | undefined,
  ) {}

  unsubscribe(): void {
    if (this.unsubscribeCalled) throw new Error("Unsubscribe has already been called");
    this.unsubscribeCalled = true;
    this.client.closeSubscription(this.id);
  }

  isActive(): boolean {
    return this.active;
  }

  isEnded(): boolean {
    return this.ended;
  }

  markApplied(): void {
    this.active = true;
    this.onApplied?.({ event: { tag: "SubscribeApplied" } });
  }

  markEnded(): void {
    this.active = false;
    this.ended = true;
  }

  markFailed(message: string): void {
    this.active = false;
    this.ended = true;
    this.onError?.({ event: new Error(message) });
  }
}

class FakeSubscriptionBuilder {
  private applied: ((ctx: unknown) => void) | undefined;
  private failed: ((ctx: unknown) => void) | undefined;

  constructor(private readonly client: FakeClient) {}

  onApplied(cb: (ctx: unknown) => void): FakeSubscriptionBuilder {
    this.applied = cb;
    return this;
  }

  onError(cb: (ctx: unknown) => void): FakeSubscriptionBuilder {
    this.failed = cb;
    return this;
  }

  subscribe(queries: string | readonly string[]): FakeSubscriptionHandle {
    return this.client.openSubscription(typeof queries === "string" ? [queries] : [...queries], this.applied, this.failed);
  }
}

/** Runs `fn` with `client` as the app-wide connection, so lib/spacetimedb/actions.ts reaches it. */
export function withConnection<T>(client: FakeClient, fn: () => Promise<T>): Promise<T> {
  const previous = getConnection();
  setConnection(client.raw as never);
  try {
    return fn(); // docs wrappers resolve the connection synchronously, before their first await
  } finally {
    if (previous) setConnection(previous);
    else clearConnection();
  }
}

/** The production transport (lib/docs/transport.ts → actions.ts wrappers), aimed at whichever client `current` returns. */
function routedTransport(current: () => FakeClient): DocTransport {
  return {
    pushUpdate: (documentId, sessionId, payload) =>
      withConnection(current(), () => spacetimeDocTransport.pushUpdate(documentId, sessionId, payload)),
    compact: (input) => withConnection(current(), () => spacetimeDocTransport.compact(input)),
    saveVersion: (input) => withConnection(current(), () => spacetimeDocTransport.saveVersion(input)),
    upsertPresence: (input) => withConnection(current(), () => spacetimeDocTransport.upsertPresence(input)),
    removePresence: (documentId, yClientId) =>
      withConnection(current(), () => spacetimeDocTransport.removePresence(documentId, yClientId)),
  };
}

export class FakeClient {
  readonly connectionId = FakeHex.random();
  connected = true;
  /** Server-side registry of this client's query sets. */
  readonly serverSubscriptions = new Map<number, ParsedQuery[]>();
  /** What `createDocConnection` and `setConnection` receive. */
  readonly raw: Record<string, unknown>;
  readonly docConnection: DocConnection;
  readonly transport: DocTransport;

  private readonly inbox: InboxMessage[] = [];
  private readonly cache = new Map<string, ClientTable>();
  private readonly handles = new Map<number, FakeSubscriptionHandle>();
  private nextSubId = 1;

  constructor(
    private readonly server: FakeDocServer,
    readonly identity: FakeHex,
    accessors: readonly string[],
    reducerNames: readonly string[],
  ) {
    const db: Record<string, unknown> = {};
    for (const accessor of accessors) {
      const table = new ClientTable();
      this.cache.set(accessor, table);
      db[accessor] = table.handle;
    }
    const reducers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
    for (const name of reducerNames) reducers[name] = (args) => this.call(name, args);
    this.raw = {
      identity,
      connectionId: this.connectionId,
      db,
      reducers,
      subscriptionBuilder: () => new FakeSubscriptionBuilder(this),
    };
    const connection = createDocConnection(this.raw);
    if (!connection) throw new Error("createDocConnection rejected the fake connection");
    this.docConnection = connection;
    this.transport = routedTransport(() => this);
  }

  get inboxSize(): number {
    return this.inbox.length;
  }

  /** Update-log rows other clients committed that this client hasn't received yet. */
  undeliveredUpdateInserts(): number {
    let n = 0;
    for (const message of this.inbox) {
      if (message.type !== "transaction") continue;
      for (const op of message.ops) if (op.accessor === "documentUpdate" && op.type === "insert") n++;
    }
    return n;
  }

  call(name: string, args: Record<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("Connection closed"));
        return;
      }
      this.server.enqueue({ kind: "call", client: this, name, args, settle: { resolve, reject } });
    });
  }

  openSubscription(
    queries: readonly string[],
    onApplied: ((ctx: unknown) => void) | undefined,
    onError: ((ctx: unknown) => void) | undefined,
  ): FakeSubscriptionHandle {
    const subId = this.nextSubId++;
    const handle = new FakeSubscriptionHandle(this, subId, onApplied, onError);
    this.handles.set(subId, handle);
    if (this.connected) this.server.enqueue({ kind: "subscribe", client: this, subId, queries });
    return handle;
  }

  closeSubscription(subId: number): void {
    if (this.connected) this.server.enqueue({ kind: "unsubscribe", client: this, subId });
  }

  receive(message: InboxMessage): void {
    if (this.connected) this.inbox.push(message);
  }

  /** Deliver the oldest inbox message, in the SDK's callback order. */
  deliverNext(): boolean {
    const message = this.inbox.shift();
    if (!message) return false;
    switch (message.type) {
      case "subscribeApplied": {
        const callbacks = this.applyOps(message.ops);
        this.handles.get(message.subId)?.markApplied();
        for (const cb of callbacks) cb();
        break;
      }
      case "subscriptionError": {
        const handle = this.handles.get(message.subId);
        this.handles.delete(message.subId);
        handle?.markFailed(message.message);
        break;
      }
      case "unsubscribeApplied": {
        const callbacks = this.applyOps(message.ops);
        this.handles.get(message.subId)?.markEnded();
        this.handles.delete(message.subId);
        for (const cb of callbacks) cb();
        break;
      }
      case "transaction": {
        for (const cb of this.applyOps(message.ops)) cb();
        break;
      }
      case "reducerResult": {
        if (message.error) {
          message.settle.reject(message.error);
        } else {
          for (const cb of this.applyOps(message.ops)) cb();
          message.settle.resolve();
        }
        break;
      }
    }
    return true;
  }

  deliverAll(): number {
    let n = 0;
    while (this.deliverNext()) n++;
    return n;
  }

  cachedRows(accessor: string): Row[] {
    return this.cache.get(accessor)?.handle.iter() ?? [];
  }

  /** Close the socket: undelivered messages are lost, queued calls fail, the module's onDisconnect runs. */
  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    for (const message of this.inbox.splice(0)) {
      if (message.type === "reducerResult") message.settle.reject(new Error("Connection closed"));
    }
    this.server.disconnected(this);
  }

  private applyOps(ops: readonly Op[]): Array<() => void> {
    const byTable = new Map<string, Op[]>();
    for (const op of ops) {
      const list = byTable.get(op.accessor) ?? [];
      list.push(op);
      byTable.set(op.accessor, list);
    }
    const callbacks: Array<() => void> = [];
    for (const [accessor, list] of byTable) {
      const table = this.cache.get(accessor);
      if (table) callbacks.push(...table.apply(list));
    }
    return callbacks;
  }
}

/** One member's app connection that survives reconnects (like the app-wide connection). */
export class FakeLink {
  client: FakeClient;
  /** Always routed to the current connection, like spacetimeDocTransport in the app. */
  readonly transport: DocTransport;

  constructor(
    private readonly server: FakeDocServer,
    readonly identity: FakeHex,
  ) {
    this.client = server.connect(identity);
    this.transport = routedTransport(() => this.client);
  }

  get docConnection(): DocConnection {
    return this.client.docConnection;
  }

  /** Drops the connection (the module's onDisconnect runs) and opens a new one for the same identity. */
  reconnect(): FakeClient {
    this.client.disconnect();
    this.client = this.server.connect(this.identity);
    return this.client;
  }

  withActions<T>(fn: () => Promise<T>): Promise<T> {
    return withConnection(this.client, fn);
  }
}

// ── Test utilities ───────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic PRNG for reproducible interleavings. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pump the server and let provider timers/promises run until the server is idle
 * and none of `providers` has unsaved edits, for `quietRounds` consecutive rounds.
 */
export async function settle(
  server: FakeDocServer,
  providers: ReadonlyArray<{ hasUnsavedChanges(): boolean }> = [],
  options: { random?: () => number; quietRounds?: number; maxRounds?: number } = {},
): Promise<void> {
  const random = options.random ?? Math.random;
  const quietRounds = options.quietRounds ?? 3;
  const maxRounds = options.maxRounds ?? 5_000;
  let quiet = 0;
  for (let round = 0; round < maxRounds; round++) {
    server.pump(random);
    await sleep(0);
    const busy = !server.isIdle() || providers.some((p) => p.hasUnsavedChanges());
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= quietRounds) return;
  }
  throw new Error("settle: the fake server never went quiet");
}

/** Pump and wait (real timers) until `predicate` holds. */
export async function waitFor(server: FakeDocServer, predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    server.pump();
    await sleep(2);
  }
}
