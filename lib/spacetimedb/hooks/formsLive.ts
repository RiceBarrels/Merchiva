"use client";

// Live-row plumbing for the Forms hooks (lib/spacetimedb/hooks/useForms.ts):
//
//   useCachedRows(conn-cache accessor)  rows of one table straight from the
//       connection's client cache, re-read on that table's own row events. Unlike
//       `useTable` it opens no subscription of its own (useTable's bare
//       `SELECT * FROM <table>` would undo the scoped and windowed ones).
//   useOnDemandSubscription(queries)    keeps a query set subscribed while mounted,
//       shared by every mounted reader of the same set and released a tick after
//       the last one unmounts (safeUnsubscribe, as in lib/docs/spacetime-provider.ts).

import { useCallback, useSyncExternalStore } from "react";
import type { DocsProbeConnection } from "@/lib/docs/backend-probe";
import { useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";
// ── Client-cache rows ────────────────────────────────────────────────────────

type RowListener = (...args: unknown[]) => void;

/** The part of a client-cache table this file reads. */
interface CacheTable {
  iter(): Iterable<unknown>;
  onInsert(cb: RowListener): void;
  removeOnInsert(cb: RowListener): void;
  onDelete(cb: RowListener): void;
  removeOnDelete(cb: RowListener): void;
  onUpdate?(cb: RowListener): void;
  removeOnUpdate?(cb: RowListener): void;
}

interface CacheConnection extends DocsProbeConnection {
  db: unknown;
}

const NO_ROWS: readonly unknown[] = Object.freeze([]);

/** One table of one connection: a cached snapshot, invalidated by the table's own row events. */
class CachedTable {
  private snapshot: readonly unknown[] | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly onChange: RowListener = () => {
    this.snapshot = null;
    for (const listener of [...this.listeners]) listener();
  };

  constructor(private readonly table: CacheTable) {}

  rows(): readonly unknown[] {
    if (!this.snapshot) this.snapshot = Object.freeze(Array.from(this.table.iter()));
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0) {
      this.table.onInsert(this.onChange);
      this.table.onDelete(this.onChange);
      this.table.onUpdate?.(this.onChange);
      this.snapshot = null;
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.table.removeOnInsert(this.onChange);
      this.table.removeOnDelete(this.onChange);
      this.table.removeOnUpdate?.(this.onChange);
    };
  }
}

const cachedTables = new WeakMap<object, Map<string, CachedTable | null>>();

/** The cached view of `accessor` on `conn` (null without a connection or such a table). Exported for tests. */
export function cachedTable(conn: CacheConnection | null, accessor: string): CachedTable | null {
  if (!conn) return null;
  let byAccessor = cachedTables.get(conn);
  if (!byAccessor) cachedTables.set(conn, (byAccessor = new Map()));
  if (!byAccessor.has(accessor)) {
    const table = (conn.db as Record<string, CacheTable | undefined> | null)?.[accessor];
    byAccessor.set(accessor, table && typeof table.iter === "function" ? new CachedTable(table) : null);
  }
  return byAccessor.get(accessor) ?? null;
}

const noopUnsubscribe = (): void => {};
const getServerRows = (): readonly unknown[] => NO_ROWS;

/** Raw rows of one table in the client cache; [] while `enabled` is false or there is no live connection. */
export function useCachedRows(accessor: string, enabled: boolean): readonly unknown[] {
  const conn = useLiveSpacetimeConnection() as CacheConnection | null;
  const table = enabled ? cachedTable(conn, accessor) : null;
  const subscribe = useCallback((onChange: () => void) => (table ? table.subscribe(onChange) : noopUnsubscribe), [table]);
  const getSnapshot = useCallback(() => (table ? table.rows() : NO_ROWS), [table]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerRows);
}

// ── On-demand subscriptions ──────────────────────────────────────────────────

export type OnDemandState = "idle" | "pending" | "applied" | "failed";

interface SubscriptionHandle {
  unsubscribe(): void;
  isActive(): boolean;
  isEnded?(): boolean;
}

function safeUnsubscribe(handle: SubscriptionHandle | null): void {
  if (!handle || handle.isEnded?.()) return;
  try {
    if (handle.isActive()) handle.unsubscribe();
  } catch {
    // Already ending.
  }
}

/** One query set on one connection, shared by every mounted reader and released a tick after the last one leaves. */
class SharedSubscription {
  state: OnDemandState = "pending";
  private handle: SubscriptionHandle | null = null;
  private refs = 0;
  private released = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(conn: DocsProbeConnection, queries: string[], private readonly onGone: () => void) {
    try {
      this.handle = conn
        .subscriptionBuilder()
        .onApplied(() => {
          if (this.released) return safeUnsubscribe(this.handle);
          this.set("applied");
        })
        .onError(() => this.set("failed"))
        .subscribe(queries) as SubscriptionHandle;
    } catch {
      this.state = "failed";
    }
  }

  private set(state: OnDemandState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }

  acquire(listener: () => void): () => void {
    this.refs += 1;
    this.listeners.add(listener);
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    return () => {
      this.listeners.delete(listener);
      this.refs -= 1;
      if (this.refs > 0) return;
      // A tick of grace: a remount (Strict Mode, a tab switch) reuses the handle instead of re-fetching.
      this.releaseTimer = setTimeout(() => {
        if (this.refs > 0) return;
        this.released = true;
        safeUnsubscribe(this.handle);
        this.onGone();
      }, 0);
    };
  }
}

const sharedSubscriptions = new WeakMap<object, Map<string, SharedSubscription>>();

/** The shared subscription of `queries` on `conn`, created on first use. Exported for tests. */
export function sharedSubscription(conn: DocsProbeConnection, queries: string[]): SharedSubscription {
  let byKey = sharedSubscriptions.get(conn);
  if (!byKey) sharedSubscriptions.set(conn, (byKey = new Map()));
  const key = queries.join("\n");
  let entry = byKey.get(key);
  if (!entry) {
    const map = byKey;
    entry = new SharedSubscription(conn, queries, () => {
      if (map.get(key) === entry) map.delete(key);
    });
    byKey.set(key, entry);
  }
  return entry;
}

/** Keeps `queries` subscribed while mounted (null = nothing to subscribe). */
export function useOnDemandSubscription(queries: string[] | null): OnDemandState {
  const conn = useLiveSpacetimeConnection() as DocsProbeConnection | null;
  const key = queries ? queries.join("\n") : "";
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!conn || !key) return noopUnsubscribe;
      return sharedSubscription(conn, key.split("\n")).acquire(onChange);
    },
    [conn, key],
  );
  const getSnapshot = useCallback(
    (): OnDemandState => (conn && key ? (sharedSubscriptions.get(conn)?.get(key)?.state ?? "pending") : "idle"),
    [conn, key],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => "idle");
}
