// "Is Docs published on the connected server?" (lib/spacetimedb/hooks/useDocs.ts).
//
// One probe per connection object: a zero-row query set over every docs table
// (docsProbeQueries). It applies only when the module has all of them. Drive and
// Sheets reuse the monitor with their own zero-row set (the `queries` option).
//
// - Applied → `ready` (final for that connection).
// - SubscriptionError that names a missing table/column → `not_published`, then
//   re-checked with a slow backoff while something is listening, so a later
//   `spacetime publish` is noticed without a reload.
// - Any other error, or a sync throw → transient: keep the current answer and
//   retry with backoff.
// - Connection closed/failed before the answer → the probe is abandoned; a new
//   connection object gets a fresh probe.
//
// While a connection's probe hasn't answered (or there is no live connection),
// the last answer from any earlier connection is reported, so a reconnect
// doesn't flash "checking" over an open editor.

import { isDocConnectionDown, onDocConnectionDown } from "./connection";
import { docsProbeQueries } from "./queries";

/**
 * - `checking`: not connected yet, or the probe subscription hasn't answered.
 * - `ready`: the connected module has every docs table.
 * - `not_published`: bindings not generated, or the server lacks the docs tables.
 */
export type DocsBackendStatus = "checking" | "ready" | "not_published";

interface ProbeHandle {
  unsubscribe(): void;
  isActive(): boolean;
}

interface ProbeBuilder {
  onApplied(cb: (ctx: unknown) => void): ProbeBuilder;
  onError(cb: (ctx: unknown, error?: unknown) => void): ProbeBuilder;
  subscribe(queries: string[]): ProbeHandle;
}

/** The part of a raw SpacetimeDB connection the probe uses. */
export interface DocsProbeConnection {
  subscriptionBuilder(): ProbeBuilder;
}

export interface DocsProbeTuning {
  retryBaseMs: number;
  retryMaxMs: number;
  recheckBaseMs: number;
  recheckMaxMs: number;
}

export const DEFAULT_DOCS_PROBE_TUNING: DocsProbeTuning = {
  retryBaseMs: 1_000,
  retryMaxMs: 30_000,
  recheckBaseMs: 60_000,
  recheckMaxMs: 10 * 60_000,
};

// Server-side messages (spacetimedb-standalone 2.2) for a query over a table or
// column the module doesn't have: "no such table: `x`. If the table exists, it
// may be marked private.", "Unknown table: `x`", "Table not found: x",
// "`x` does not have a field `y`", "`x` is not in scope".
const MISSING_SCHEMA_PATTERNS: readonly RegExp[] = [
  /no such table/i,
  /unknown table/i,
  /table not found/i,
  /table with provided name or id doesn't exist/i,
  /does not have a field/i,
  /is not in scope/i,
];

function messageOf(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object") {
    const record = value as { message?: unknown; event?: unknown; error?: unknown };
    if (typeof record.message === "string") return record.message;
    return messageOf(record.event, depth + 1) || messageOf(record.error, depth + 1);
  }
  return "";
}

/** Whether a probe failure means the server module has no docs schema (vs. a transient failure). */
export function isMissingDocsSchemaError(...causes: unknown[]): boolean {
  for (const cause of causes) {
    const message = messageOf(cause);
    if (message && MISSING_SCHEMA_PATTERNS.some((re) => re.test(message))) return true;
  }
  return false;
}

interface ProbeState {
  readonly conn: DocsProbeConnection;
  status: DocsBackendStatus;
  readonly listeners: Set<() => void>;
  down: boolean;
  running: boolean;
  generation: number;
  timer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  recheckAttempt: number;
}

function backoff(base: number, max: number, attempt: number): number {
  const delay = Math.min(max, base * 2 ** Math.min(attempt, 30));
  return delay * (0.75 + Math.random() * 0.5);
}

function safeUnsubscribe(handle: ProbeHandle | null): void {
  if (!handle) return;
  try {
    if (handle.isActive()) handle.unsubscribe();
  } catch {
    // Already ending.
  }
}

export class DocsBackendMonitor {
  private readonly probes = new WeakMap<object, ProbeState>();
  private readonly tuning: DocsProbeTuning;
  private lastAnswer: "ready" | "not_published" | null = null;

  constructor(
    private readonly options: {
      bindingsGenerated: boolean;
      tuning?: Partial<DocsProbeTuning>;
      /** The zero-row query set to probe with (default docsProbeQueries). */
      queries?: () => string[];
    },
  ) {
    this.tuning = { ...DEFAULT_DOCS_PROBE_TUNING, ...options.tuning };
  }

  /** The status to show for `conn` (null: no live connection). */
  status(conn: DocsProbeConnection | null): DocsBackendStatus {
    if (!this.options.bindingsGenerated) return "not_published";
    const state = conn ? this.probes.get(conn) : undefined;
    if (state && !state.down && state.status !== "checking") return state.status;
    return this.lastAnswer ?? "checking";
  }

  /** Starts (or resumes) probing `conn` while at least one listener is subscribed. */
  subscribe(conn: DocsProbeConnection | null, listener: () => void): () => void {
    if (!this.options.bindingsGenerated || !conn) return () => {};
    const state = this.ensure(conn);
    state.listeners.add(listener);
    if (!state.down && !state.running && !state.timer && state.status !== "ready") {
      if (state.status === "checking") this.start(state);
      else this.scheduleRecheck(state);
    }
    return () => {
      state.listeners.delete(listener);
      if (state.listeners.size === 0) this.clearTimer(state);
    };
  }

  private ensure(conn: DocsProbeConnection): ProbeState {
    const existing = this.probes.get(conn);
    if (existing) return existing;
    const state: ProbeState = {
      conn,
      status: "checking",
      listeners: new Set(),
      down: isDocConnectionDown(conn),
      running: false,
      generation: 0,
      timer: null,
      retryAttempt: 0,
      recheckAttempt: 0,
    };
    this.probes.set(conn, state);
    if (!state.down) {
      onDocConnectionDown(conn, () => {
        state.down = true;
        state.running = false;
        state.generation++; // late answers from the dead connection are ignored
        this.clearTimer(state);
        this.notify(state);
      });
    }
    return state;
  }

  private start(state: ProbeState): void {
    if (state.down || state.running) return;
    this.clearTimer(state);
    const generation = ++state.generation;
    state.running = true;
    let handle: ProbeHandle | null = null;
    let appliedEarly = false;
    const current = () => generation === state.generation && !state.down;
    try {
      // Separate query set: a missing table fails only this handle, never the app's main subscriptions.
      handle = state.conn
        .subscriptionBuilder()
        .onApplied(() => {
          if (handle) safeUnsubscribe(handle);
          else appliedEarly = true;
          if (!current()) return;
          state.running = false;
          state.retryAttempt = 0;
          state.recheckAttempt = 0;
          this.settle(state, "ready");
        })
        .onError((ctx, error) => {
          if (!current()) return;
          state.running = false;
          this.onProbeFailed(state, isMissingDocsSchemaError(error, ctx));
        })
        .subscribe((this.options.queries ?? docsProbeQueries)());
      if (appliedEarly) safeUnsubscribe(handle);
    } catch (cause) {
      if (!current()) return;
      state.running = false;
      this.onProbeFailed(state, isMissingDocsSchemaError(cause));
    }
  }

  private onProbeFailed(state: ProbeState, missingSchema: boolean): void {
    if (missingSchema) {
      state.retryAttempt = 0;
      this.settle(state, "not_published");
      this.scheduleRecheck(state);
      return;
    }
    if (state.listeners.size === 0) return; // the next subscriber restarts it
    const delay = backoff(this.tuning.retryBaseMs, this.tuning.retryMaxMs, state.retryAttempt++);
    state.timer = setTimeout(() => {
      state.timer = null;
      this.start(state);
    }, delay);
  }

  private scheduleRecheck(state: ProbeState): void {
    if (state.down || state.timer || state.listeners.size === 0) return;
    const delay = backoff(this.tuning.recheckBaseMs, this.tuning.recheckMaxMs, state.recheckAttempt++);
    state.timer = setTimeout(() => {
      state.timer = null;
      this.start(state);
    }, delay);
  }

  private settle(state: ProbeState, status: "ready" | "not_published"): void {
    this.lastAnswer = status;
    if (state.status === status) return;
    state.status = status;
    this.notify(state);
  }

  private notify(state: ProbeState): void {
    for (const listener of [...state.listeners]) listener();
  }

  private clearTimer(state: ProbeState): void {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }
}
