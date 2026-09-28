// The live rows of one spreadsheet (sheets.md §4.6, §7.3): sheetLiveQueries(documentId) on the attached connection
// as ONE query set, so a compaction or a reset never lands "between" the snapshot, the op log and the edit lease.
// Every row event of that document goes to the session's handlers; events of other documents (another open sheet
// shares the table cache) are dropped here. A failed subscription is retried with backoff on the same connection.
//
// Pure: no React, no Univer runtime.

import { sheetLiveQueries } from "@/lib/docs/queries";
import type { DocSubscriptionHandle } from "@/lib/docs/sync-types";
import type { DocPresenceRow, DocSnapshotRow, DocUpdateRow } from "@/lib/docs/types";
import { SHEET_TUNING, type SheetTuning } from "@/lib/sheets/constants";
import type { SheetLeaseRow } from "@/lib/sheets/lease";
import type { SheetConnection } from "@/lib/sheets/sync/connection";
import { SHEET_TIMERS, type SheetTimers } from "@/lib/sheets/sync/push-queue";

/** The document's rows as the live subscription's cache holds them. */
export interface SheetRowSource {
  snapshot(): DocSnapshotRow | null;
  /** Log rows with id > `id`, ascending. */
  rowsAfter(id: bigint): DocUpdateRow[];
  lease(): SheetLeaseRow | null;
}

/** Reads one document's rows out of a connection's table cache. */
export function sheetRowSource(conn: SheetConnection, documentId: string): SheetRowSource {
  const find = <Row extends { documentId: string }>(rows: Iterable<Row>): Row | null => {
    for (const row of rows) if (row.documentId === documentId) return row;
    return null;
  };
  return {
    snapshot: () => find(conn.db.documentSnapshot.iter()),
    lease: () => find(conn.leases.iter()),
    rowsAfter: (id) => [...conn.db.documentUpdate.iter()]
      .filter((row) => row.documentId === documentId && row.id > id)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** Row events of one document's live query set; `presence(null)` is a presence row leaving. */
export interface SheetLiveHandlers {
  applied(conn: SheetConnection): void;
  failed(cause: unknown): void;
  update(row: DocUpdateRow): void;
  updateDeleted(): void;
  snapshot(row: DocSnapshotRow): void;
  lease(row: SheetLeaseRow | null): void;
  presence(row: DocPresenceRow | null): void;
}

function safeUnsubscribe(handle: DocSubscriptionHandle | null): void {
  if (!handle || handle.isEnded()) return;
  try {
    if (handle.isActive()) handle.unsubscribe();
  } catch {
    // Already ending.
  }
}

/** One document's live query set on the attached connection (see the file header). */
export class SheetLiveSubscription {
  private conn: SheetConnection | null = null;
  private sub: DocSubscriptionHandle | null = null;
  private generation = 0;
  private appliedValue = false;
  private everAppliedValue = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private disposed = false;
  private readonly tuning: SheetTuning;
  private readonly timers: SheetTimers;

  constructor(
    private readonly documentId: string,
    private readonly handlers: SheetLiveHandlers,
    opts: { tuning?: Partial<SheetTuning>; timers?: SheetTimers } = {},
  ) {
    this.tuning = { ...SHEET_TUNING, ...opts.tuning };
    this.timers = opts.timers ?? SHEET_TIMERS;
  }

  get connection(): SheetConnection | null { return this.conn; }
  /** The query set applied on the current connection: the cache holds the document. */
  get applied(): boolean { return this.appliedValue; }
  get everApplied(): boolean { return this.everAppliedValue; }
  /** The attached connection's id once applied; '' otherwise. */
  get connectionId(): string { return this.conn && this.appliedValue ? this.conn.connectionIdHex : ""; }
  get source(): SheetRowSource | null { return this.conn && this.appliedValue ? sheetRowSource(this.conn, this.documentId) : null; }

  /** Follow `conn` (null detaches). The same connection again is a no-op. */
  attach(conn: SheetConnection | null): void {
    if (this.disposed) return;
    if (conn === this.conn) {
      if (!conn) this.detach(); // also cancels a pending re-subscribe to a connection the app has dropped
      return;
    }
    this.detach();
    if (conn) this.subscribe(conn);
  }

  dispose(): void {
    this.detach();
    this.disposed = true;
  }

  private subscribe(conn: SheetConnection): void {
    this.conn = conn;
    const generation = ++this.generation;
    const { documentUpdate, documentSnapshot, documentPresence } = conn.db;
    documentUpdate.onInsert(this.onUpdate);
    documentUpdate.onDelete(this.onUpdateDelete);
    documentSnapshot.onInsert(this.onSnapshot);
    documentSnapshot.onUpdate(this.onSnapshotUpdate);
    documentPresence.onInsert(this.onPresence);
    documentPresence.onUpdate(this.onPresenceUpdate);
    documentPresence.onDelete(this.onPresenceDelete);
    conn.leases.onInsert(this.onLease);
    conn.leases.onUpdate(this.onLeaseUpdate);
    conn.leases.onDelete(this.onLeaseDelete);
    let handle: DocSubscriptionHandle | null = null;
    let stale = false;
    try {
      handle = conn.subscriptionBuilder()
        .onApplied(() => {
          if (generation !== this.generation) {
            // Detached before it applied: unsubscribing is only valid now.
            if (handle) safeUnsubscribe(handle);
            else stale = true;
            return;
          }
          this.appliedValue = true;
          this.everAppliedValue = true;
          this.retryAttempt = 0;
          this.handlers.applied(conn);
        })
        .onError((ctx) => {
          if (generation === this.generation) this.fail(conn, ctx);
        })
        .subscribe(sheetLiveQueries(this.documentId));
    } catch (cause) {
      if (generation === this.generation) this.fail(conn, cause);
      return;
    }
    if (stale || generation !== this.generation) safeUnsubscribe(handle);
    else this.sub = handle;
  }

  private fail(conn: SheetConnection, cause: unknown): void {
    this.detach();
    this.handlers.failed(cause);
    if (this.disposed) return;
    const delay = Math.min(this.tuning.retryMaxMs, this.tuning.retryBaseMs * 2 ** Math.min(this.retryAttempt++, 30));
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      if (!this.disposed && !this.conn) this.attach(conn);
    }, delay);
  }

  private detach(): void {
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const conn = this.conn;
    if (!conn) return;
    const { documentUpdate, documentSnapshot, documentPresence } = conn.db;
    // Listeners go BEFORE the unsubscribe: evicted cache rows must not reach the session.
    documentUpdate.removeOnInsert(this.onUpdate);
    documentUpdate.removeOnDelete(this.onUpdateDelete);
    documentSnapshot.removeOnInsert(this.onSnapshot);
    documentSnapshot.removeOnUpdate(this.onSnapshotUpdate);
    documentPresence.removeOnInsert(this.onPresence);
    documentPresence.removeOnUpdate(this.onPresenceUpdate);
    documentPresence.removeOnDelete(this.onPresenceDelete);
    conn.leases.removeOnInsert(this.onLease);
    conn.leases.removeOnUpdate(this.onLeaseUpdate);
    conn.leases.removeOnDelete(this.onLeaseDelete);
    this.generation++;
    safeUnsubscribe(this.sub);
    this.sub = null;
    this.conn = null;
    this.appliedValue = false;
  }

  private mine(row: { documentId: string }): boolean {
    return this.appliedValue && row.documentId === this.documentId;
  }

  private onUpdate = (_ctx: unknown, row: DocUpdateRow): void => { if (this.mine(row)) this.handlers.update(row); };
  private onUpdateDelete = (_ctx: unknown, row: DocUpdateRow): void => { if (this.mine(row)) this.handlers.updateDeleted(); };
  private onSnapshot = (_ctx: unknown, row: DocSnapshotRow): void => { if (this.mine(row)) this.handlers.snapshot(row); };
  private onSnapshotUpdate = (_ctx: unknown, _old: DocSnapshotRow, row: DocSnapshotRow): void => this.onSnapshot(_ctx, row);
  private onLease = (_ctx: unknown, row: SheetLeaseRow): void => { if (this.mine(row)) this.handlers.lease(row); };
  private onLeaseUpdate = (_ctx: unknown, _old: SheetLeaseRow, row: SheetLeaseRow): void => this.onLease(_ctx, row);
  private onLeaseDelete = (_ctx: unknown, row: SheetLeaseRow): void => { if (this.mine(row)) this.handlers.lease(null); };
  private onPresence = (_ctx: unknown, row: DocPresenceRow): void => { if (this.mine(row)) this.handlers.presence(row); };
  private onPresenceUpdate = (_ctx: unknown, _old: DocPresenceRow, row: DocPresenceRow): void => this.onPresence(_ctx, row);
  private onPresenceDelete = (_ctx: unknown, row: DocPresenceRow): void => { if (this.mine(row)) this.handlers.presence(null); };
}
