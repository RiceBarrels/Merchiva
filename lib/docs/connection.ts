/* eslint-disable @typescript-eslint/no-explicit-any */
// Adapts a live SpacetimeDB DbConnection to the narrow DocConnection the Yjs
// provider needs: the three per-document live tables (callbacks receive mapped
// rows) and the subscription builder.

import { mapPresenceRow, mapSnapshotRow, mapUpdateRow } from "./mappers";
import type { DocConnection, DocSubscriptionBuilder, DocSubscriptionHandle, DocTableHandle } from "./sync-types";

type RowCallback<Row> = (ctx: unknown, row: Row) => void;
type UpdateCallback<Row> = (ctx: unknown, oldRow: Row, newRow: Row) => void;

// One adapter per raw connection, so `provider.attach(conn)` can compare identity.
const adapters = new WeakMap<object, DocConnection>();

// ── Connection liveness ─────────────────────────────────────────────────────
//
// spacetimedb@2.2.0 emits "disconnect" from `ws.onclose` BEFORE it clears
// `isActive`, and the React ConnectionManager copies `isActive` inside that
// callback, so `useSpacetimeDB().isActive` can stay true forever after a drop.
// A DbConnection object never reconnects (the app builds a new one), so once
// one closes or fails it is down for good.

interface Liveness {
  down: boolean;
  readonly listeners: Set<() => void>;
}

const liveness = new WeakMap<object, Liveness>();

function livenessOf(raw: object): Liveness {
  const existing = liveness.get(raw);
  if (existing) return existing;
  const entry: Liveness = { down: false, listeners: new Set() };
  liveness.set(raw, entry);
  const markDown = (): void => {
    if (entry.down) return;
    entry.down = true;
    for (const listener of [...entry.listeners]) {
      try {
        listener();
      } catch (err) {
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  };
  const conn = raw as any;
  try {
    if (typeof conn.onDisconnect === "function") conn.onDisconnect(markDown);
    if (typeof conn.onConnectError === "function") conn.onConnectError(markDown);
  } catch {
    // Not an SDK connection; only `isActive` can tell.
  }
  return entry;
}

/**
 * True once the raw SpacetimeDB connection closed or failed. Also true while an
 * SDK connection has not opened yet (`isActive === false`); callers only ask
 * about connections React already reported as active.
 */
export function isDocConnectionDown(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  if (livenessOf(raw).down) return true;
  return (raw as { isActive?: unknown }).isActive === false;
}

/** Calls `listener` once the raw connection closes or fails. Returns the unsubscribe function. */
export function onDocConnectionDown(raw: unknown, listener: () => void): () => void {
  if (!raw || typeof raw !== "object") return () => {};
  const entry = livenessOf(raw);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/**
 * A raw SDK table handle whose rows and callbacks come out mapped (each cached row mapped once). Also used by the
 * Sheets connection adapter for its lease table.
 */
export function wrapDocTable<Row>(raw: any, map: (row: any) => Row): DocTableHandle<Row> {
  // Cached rows are immutable decoded objects; map each one once.
  const mapped = new WeakMap<object, Row>();
  const mapRow = (row: any): Row => {
    if (row === null || typeof row !== "object") return map(row);
    let out = mapped.get(row);
    if (out === undefined) {
      out = map(row);
      mapped.set(row, out);
    }
    return out;
  };
  // Keep the wrapper for each caller callback so removeOn* can find it.
  const inserts = new WeakMap<RowCallback<Row>, (ctx: unknown, row: any) => void>();
  const deletes = new WeakMap<RowCallback<Row>, (ctx: unknown, row: any) => void>();
  const updates = new WeakMap<UpdateCallback<Row>, (ctx: unknown, oldRow: any, newRow: any) => void>();

  return {
    *iter(): Iterable<Row> {
      for (const row of raw.iter()) yield mapRow(row);
    },
    onInsert(cb) {
      const wrapped = (ctx: unknown, row: any) => cb(ctx, mapRow(row));
      inserts.set(cb, wrapped);
      raw.onInsert(wrapped);
    },
    removeOnInsert(cb) {
      const wrapped = inserts.get(cb);
      if (!wrapped) return;
      raw.removeOnInsert(wrapped);
      inserts.delete(cb);
    },
    onDelete(cb) {
      const wrapped = (ctx: unknown, row: any) => cb(ctx, mapRow(row));
      deletes.set(cb, wrapped);
      raw.onDelete(wrapped);
    },
    removeOnDelete(cb) {
      const wrapped = deletes.get(cb);
      if (!wrapped) return;
      raw.removeOnDelete(wrapped);
      deletes.delete(cb);
    },
    onUpdate(cb) {
      const wrapped = (ctx: unknown, oldRow: any, newRow: any) => cb(ctx, mapRow(oldRow), mapRow(newRow));
      updates.set(cb, wrapped);
      raw.onUpdate(wrapped);
    },
    removeOnUpdate(cb) {
      const wrapped = updates.get(cb);
      if (!wrapped) return;
      raw.removeOnUpdate(wrapped);
      updates.delete(cb);
    },
  };
}

function wrapSubscriptionBuilder(raw: any): DocSubscriptionBuilder {
  const builder: DocSubscriptionBuilder = {
    onApplied(cb) {
      raw.onApplied(() => cb());
      return builder;
    },
    onError(cb) {
      raw.onError((ctx: unknown) => cb(ctx));
      return builder;
    },
    subscribe(queries): DocSubscriptionHandle {
      const handle = raw.subscribe(queries);
      return {
        unsubscribe: () => handle.unsubscribe(),
        isActive: () => handle.isActive(),
        isEnded: () => handle.isEnded(),
      };
    },
  };
  return builder;
}

/**
 * DocConnection for a raw `DbConnectionImpl`, or null when the docs bindings
 * haven't been generated yet (the live tables are missing from `db`).
 */
export function createDocConnection(raw: unknown): DocConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const cached = adapters.get(raw);
  if (cached) return cached;
  const conn = raw as any;
  let db: any;
  try {
    db = conn.db;
    if (!db?.documentUpdate || !db.documentSnapshot || !db.documentPresence) return null;
  } catch {
    return null;
  }
  if (typeof conn.subscriptionBuilder !== "function") return null;

  const adapter: DocConnection = {
    // Read live: the id is assigned once the connection handshake completes.
    get connectionIdHex(): string {
      const id = conn.connectionId;
      return id && typeof id.toHexString === "function" ? String(id.toHexString()) : "";
    },
    db: {
      documentUpdate: wrapDocTable(db.documentUpdate, mapUpdateRow),
      documentSnapshot: wrapDocTable(db.documentSnapshot, mapSnapshotRow),
      documentPresence: wrapDocTable(db.documentPresence, mapPresenceRow),
    },
    subscriptionBuilder: () => wrapSubscriptionBuilder(conn.subscriptionBuilder()),
  };
  adapters.set(raw, adapter);
  return adapter;
}
