// Merchiva Docs — Yjs sync over SpacetimeDB (backend spec §8, plan §B6).
//
// Content is a Yjs CRDT. The latest compacted state lives in
// `document_snapshot`; edits since then are appended to `document_update`
// (auto-increment ids in commit order). A provider subscribes to snapshot +
// update log + presence for ONE document as a single query set, merges them
// into its Y.Doc, pushes local edits through reducers, keeps the log short by
// compacting, and mirrors y-protocols awareness into `document_presence`.
//
// Status machine (§8.1):
//   connecting ─attach(conn)→ syncing ─applied→ saved | saving
//   saved ─local edit→ saving ─push ok, queue empty→ saved
//   saving ─transient failure→ saving (backoff 1 s → 30 s, jittered)
//   saving ─transport has no connection→ offline (same backoff; next success → saved)
//   any ─attach(null) / detach→ offline (pending edits kept in memory)
//   offline ─attach(conn)→ syncing ─(state-vector diff pushed, only if the server lacks something)→ saving → saved
//   any ─[doc.forbidden | not_found | trashed | not_published]→ error (+ accessLost, read-only)
//   error ─setReadOnly(false)→ syncing (access retried: re-sync + push; rejected again → error)
//   subscription error → offline, then re-subscribe with backoff
//
// While read-only nothing is pushed; queued edits wait for setReadOnly(false).

import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { docErrorCode } from "./errors";
import { isDocumentId } from "./ids";
import { docLiveQueries } from "./queries";
import type {
  DocConnection,
  DocPeer,
  DocProviderError,
  DocSubscriptionHandle,
  DocSyncStatus,
  DocTransport,
} from "./sync-types";
import type { DocErrorCode, DocPresenceRow, DocSerialized, DocSnapshotRow, DocUpdateRow, DocVersionKind } from "./types";

export type { DocConnection, DocPeer, DocProviderError, DocSyncStatus, DocTransport } from "./sync-types";

/** Transaction origin for everything that came from the server. Never pushed back. */
export const REMOTE_ORIGIN: unique symbol = Symbol("merchiva-docs-remote");
/** Origin of the tiny marker edit used by the oversize-write fallback; sent directly, never queued. */
const MARKER_ORIGIN: unique symbol = Symbol("merchiva-docs-marker");
/** y-protocols' conventional origin for local awareness changes. */
const LOCAL_AWARENESS_ORIGIN = "local";
/** Top-level Y.Map outside the editor's `default` fragment. */
const META_MAP = "__merchiva_meta";
/** How long the oversize fallback waits for its marker row to come back. */
const MARKER_WAIT_MS = 5_000;
/** Matches the server's DOC_PRESENCE_DEFAULT_COLOR. */
const DEFAULT_PEER_COLOR = "#57534e";

/** Error name a DocTransport rejects with when there is no connection to send on. */
export const DOC_OFFLINE_ERROR_NAME = "DocOfflineError";

/** The rejection a DocTransport uses when it has no connection (lib/docs/transport.ts). */
export function docOfflineError(): Error {
  const error = new Error("Not connected");
  error.name = DOC_OFFLINE_ERROR_NAME;
  return error;
}

export function isDocOfflineError(err: unknown): boolean {
  return err instanceof Error && err.name === DOC_OFFLINE_ERROR_NAME;
}

export interface DocProviderTuning {
  pushDebounceMs: number;         // 120
  pushMaxWaitMs: number;          // 800
  presenceThrottleMs: number;     // 250
  retryBaseMs: number;            // 1000
  retryMaxMs: number;             // 30000
  compactMaxRows: number;         // 200
  compactMaxBytes: number;        // 256 KiB
  compactMinIntervalMs: number;   // 15000
  autoVersionIntervalMs: number;  // 600000 (server also gates at 10 min)
  electionFreshMs: number;        // 60000 (tolerates clock skew)
  updateMaxBytes: number;         // 1 MiB  — must equal DOC_UPDATE_MAX_BYTES
  stateMaxBytes: number;          // 8 MiB  — must equal DOC_STATE_MAX_BYTES
}

export const DEFAULT_DOC_TUNING: DocProviderTuning = {
  pushDebounceMs: 120,
  pushMaxWaitMs: 800,
  presenceThrottleMs: 250,
  retryBaseMs: 1000,
  retryMaxMs: 30000,
  compactMaxRows: 200,
  compactMaxBytes: 256 * 1024,
  compactMinIntervalMs: 15000,
  autoVersionIntervalMs: 600000,
  electionFreshMs: 60000,
  updateMaxBytes: 1024 * 1024,
  stateMaxBytes: 8 * 1024 * 1024,
};

export interface SpacetimeYjsProviderOptions {
  documentId: string;
  organizationId: string;
  memberId: string;
  user: { name: string; color: string };
  transport: DocTransport;
  readOnly?: boolean;
  tuning?: Partial<DocProviderTuning>;
}

export type DocProviderEvents = {
  status: [DocSyncStatus];
  synced: [boolean];
  peers: [DocPeer[]];
  error: [DocProviderError];
  accessLost: [DocErrorCode];
  compacted: [bigint];
};

type Handler<A extends unknown[]> = (...args: A) => void;

class TypedEmitter<E extends { [K in keyof E]: unknown[] }> {
  private handlers = new Map<keyof E, Set<Handler<never[]>>>();

  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set<Handler<never[]>>();
    set.add(fn as unknown as Handler<never[]>);
    this.handlers.set(event, set);
    return () => this.off(event, fn);
  }

  off<K extends keyof E>(event: K, fn: Handler<E[K]>): void {
    this.handlers.get(event)?.delete(fn as unknown as Handler<never[]>);
  }

  protected emit<K extends keyof E>(event: K, ...args: E[K]): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) {
      try {
        (fn as unknown as Handler<E[K]>)(...args);
      } catch (err) {
        // A throwing listener must not leave the sync state half-updated.
        // Rethrow outside the provider so it still surfaces.
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  protected clearHandlers(): void {
    this.handlers.clear();
  }
}

type TimerKey = "pushTimer" | "retryTimer" | "presenceTimer" | "compactTimer" | "resubscribeTimer";

const ACCESS_LOSS_CODES: ReadonlySet<DocErrorCode> = new Set<DocErrorCode>(["forbidden", "not_found", "trashed", "not_published"]);

const isEmptyUpdate = (u: Uint8Array): boolean => u.byteLength <= 2; // v1 empty update = [0, 0]
const EMPTY_STATE_VECTOR = new Uint8Array([0]);
const byId = (a: DocUpdateRow, b: DocUpdateRow): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface DeleteSetLike {
  clients: Map<number, Array<{ clock: number; len: number }>>;
}

/** Whether every deleted range in `local` is also deleted in `server`. */
function deleteSetCovers(server: DeleteSetLike | null, local: DeleteSetLike): boolean {
  for (const [client, items] of local.clients) {
    const wanted = items.filter((item) => item.len > 0);
    if (wanted.length === 0) continue;
    const ranges = [...(server?.clients.get(client) ?? [])].filter((r) => r.len > 0).sort((a, b) => a.clock - b.clock);
    const merged: Array<{ start: number; end: number }> = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.clock <= last.end) last.end = Math.max(last.end, range.clock + range.len);
      else merged.push({ start: range.clock, end: range.clock + range.len });
    }
    for (const item of wanted) {
      const end = item.clock + item.len;
      if (!merged.some((m) => m.start <= item.clock && end <= m.end)) return false;
    }
  }
  return true;
}

/**
 * Whether `diff` — the local state minus the server's state vector — holds
 * anything the server lacks. `diffUpdate` copies the whole local delete set, so
 * a diff with no structs still needs its deletions compared against the server.
 */
function diffAddsToServer(diff: Uint8Array, server: Uint8Array | null, serverKnown: boolean): boolean {
  if (isEmptyUpdate(diff)) return false;
  try {
    const local = Y.decodeUpdate(diff);
    if (local.structs.length > 0) return true;
    if (local.ds.clients.size === 0) return false;
    if (!serverKnown) return true;
    return !deleteSetCovers(server ? Y.decodeUpdate(server).ds : null, local.ds);
  } catch {
    return true; // can't tell: re-sending is idempotent
  }
}

function readVarUint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let value = 0;
  let multiplier = 1;
  for (let i = offset; i < bytes.length && i < offset + 8; i++) {
    const byte = bytes[i];
    value += (byte & 0x7f) * multiplier;
    if (byte < 0x80) return { value, next: i + 1 };
    multiplier *= 128;
  }
  return null;
}

/** True when `bytes` is an awareness update (lib0 varUint count, then clientID) with one entry, for `yClientId`. */
export function awarenessIsForClient(bytes: Uint8Array, yClientId: number): boolean {
  const count = readVarUint(bytes, 0);
  if (!count || count.value !== 1) return false;
  const client = readVarUint(bytes, count.next);
  return client !== null && client.value === yClientId;
}

function samePeers(a: readonly DocPeer[], b: readonly DocPeer[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.yClientId !== y.yClientId ||
      x.memberId !== y.memberId ||
      x.name !== y.name ||
      x.color !== y.color ||
      x.canEdit !== y.canEdit ||
      x.isSelf !== y.isSelf
    ) {
      return false;
    }
  }
  return true;
}

function safeUnsubscribe(h: DocSubscriptionHandle | null): void {
  if (!h || h.isEnded()) return;
  try {
    if (h.isActive()) h.unsubscribe();
  } catch {
    // Already ending.
  }
}

function randomSessionId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function backoffDelay(tuning: DocProviderTuning, attempt: number): number {
  const base = Math.min(tuning.retryMaxMs, tuning.retryBaseMs * 2 ** Math.min(attempt, 30));
  return base * (0.75 + Math.random() * 0.5);
}

export class SpacetimeYjsProvider extends TypedEmitter<DocProviderEvents> {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly documentId: string;
  readonly sessionId = randomSessionId();
  status: DocSyncStatus = "connecting";
  synced = false;

  private readonly opts: SpacetimeYjsProviderOptions;
  private readonly tuning: DocProviderTuning;
  private user: { name: string; color: string };
  private serialize: (() => DocSerialized) | null = null;
  /** Effective: the app asked for read-only, or access was lost. */
  private readOnly: boolean;
  /** What the app last asked for via the constructor / setReadOnly. */
  private requestedReadOnly: boolean;
  private lostAccess: DocErrorCode | null = null;
  private lastErrorValue: DocProviderError | null = null;
  private peerList: DocPeer[] = [];
  private destroyed = false;
  private presenceActive = true;

  private conn: DocConnection | null = null;
  private sub: DocSubscriptionHandle | null = null;
  private generation = 0;
  private applied = false;
  private everSynced = false;
  private resubscribeTimer: ReturnType<typeof setTimeout> | null = null;
  private resubscribeAttempt = 0;

  private maxAppliedId = 0n;
  /** throughUpdateId of the snapshot already merged into the doc (null: none yet). */
  private snapshotThrough: bigint | null = null;
  /** Update rows currently in the server log for this doc → byteLength. */
  private readonly logRowBytes = new Map<bigint, number>();
  private logBytes = 0;

  private pending: Uint8Array[] = [];
  private inFlight: Uint8Array | null = null;
  private firstPendingAt = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  /** The last push failed because the transport had no connection. */
  private transportOffline = false;
  private largeWrite = false;
  private markerWaiter: { readonly after: bigint; finish(ok: boolean): void } | null = null;

  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceDirty = false;
  private lastPresenceAt = 0;
  /** No presence upserts before this time (the server refused presence on a trashed document). */
  private presenceBlockedUntil = 0;
  private presenceBlockAttempt = 0;
  private readonly peerMeta = new Map<number, { memberId: string; canEdit: boolean }>();

  private compacting = false;
  private lastCompactAt = 0;
  private compactTimer: ReturnType<typeof setTimeout> | null = null;
  private changedSinceVersion = false;
  private readonly versionTimer: ReturnType<typeof setInterval>;

  constructor(doc: Y.Doc, opts: SpacetimeYjsProviderOptions) {
    super();
    if (!isDocumentId(opts.documentId)) throw new Error("Invalid document id");
    this.doc = doc;
    this.opts = opts;
    this.documentId = opts.documentId.toLowerCase();
    this.tuning = { ...DEFAULT_DOC_TUNING, ...opts.tuning };
    this.readOnly = !!opts.readOnly;
    this.requestedReadOnly = this.readOnly;
    this.user = { name: opts.user.name, color: opts.user.color };
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField("user", this.localUser());
    doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    this.awareness.on("change", this.emitPeers);
    this.versionTimer = setInterval(this.onVersionTick, this.tuning.autoVersionIntervalMs);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  // ── public API ──────────────────────────────────────────────────────────────

  /**
   * Everyone in the awareness map (including this tab while presence is active).
   * The array identity only changes when a peer's identity, name, colour or edit
   * right changes — caret moves don't produce a new list.
   */
  get peers(): DocPeer[] {
    return this.peerList;
  }

  /** Most recent non-access error since the last successful sync (null when healthy). */
  get lastError(): DocProviderError | null {
    return this.lastErrorValue;
  }

  /** Why this provider went read-only, or null. Cleared when setReadOnly(false) retries access. */
  get accessLostCode(): DocErrorCode | null {
    return this.lostAccess;
  }

  /** The connection this provider is attached to (null while detached). */
  get connection(): DocConnection | null {
    return this.conn;
  }

  /** True while local edits are neither queued nor pushed (read-only requested, or access lost). */
  get isReadOnly(): boolean {
    return this.readOnly;
  }

  setSerializer(fn: (() => DocSerialized) | null): void {
    this.serialize = fn;
    if (fn) this.maybeCompact();
  }

  /**
   * Read-only providers neither queue nor push local edits. `false` after an
   * access loss means the app believes access is back (restored from the trash,
   * edit right re-granted): the provider re-syncs and retries; if the server
   * still refuses, access is lost again.
   */
  setReadOnly(readOnly: boolean): void {
    this.requestedReadOnly = readOnly;
    if (this.destroyed) return;
    if (!readOnly && this.lostAccess !== null) {
      this.retryAccess();
      return;
    }
    const next = readOnly || this.lostAccess !== null;
    if (next === this.readOnly) return;
    this.readOnly = next;
    this.emitPeers();
    if (!next) {
      if (this.pending.length && this.conn && this.applied) this.schedulePush(0);
      this.maybeCompact();
    }
  }

  setUser(user: { name: string; color: string }): void {
    if (user.name === this.user.name && user.color === this.user.color) return;
    this.user = { name: user.name, color: user.color };
    if (this.presenceActive && !this.destroyed) this.awareness.setLocalStateField("user", this.localUser());
  }

  /**
   * false: this tab stops being present (idle cached session) — local awareness is
   * cleared and the presence row removed. true: re-announce the user and upsert.
   * Sync itself keeps running either way.
   */
  setPresenceActive(active: boolean): void {
    if (this.destroyed || active === this.presenceActive) return;
    this.presenceActive = active;
    if (!active) {
      this.clearTimer("presenceTimer");
      this.presenceDirty = false;
      if (this.awareness.getLocalState() !== null) {
        removeAwarenessStates(this.awareness, [this.doc.clientID], LOCAL_AWARENESS_ORIGIN);
      }
      if (this.conn) void this.opts.transport.removePresence(this.documentId, this.doc.clientID).catch(() => {});
      return;
    }
    this.awareness.setLocalState({ user: this.localUser() });
    this.presenceDirty = true;
    this.schedulePresence();
  }

  hasUnsavedChanges(): boolean {
    return this.pending.length > 0 || this.inFlight !== null;
  }

  /** State for "Save version" / restore previews. */
  snapshotState(): { state: Uint8Array; throughUpdateId: bigint } {
    return { state: Y.encodeStateAsUpdate(this.doc), throughUpdateId: this.maxAppliedId };
  }

  async saveVersion(kind: DocVersionKind, name?: string): Promise<void> {
    const { state, throughUpdateId } = this.snapshotState();
    await this.opts.transport.saveVersion({
      documentId: this.documentId,
      kind,
      name,
      state,
      throughUpdateId,
      wordCount: this.serialize?.().wordCount ?? 0,
    });
  }

  /** Called by the React binding whenever the SpacetimeDB connection changes. */
  attach(conn: DocConnection | null): void {
    if (this.destroyed) return;
    if (conn === this.conn) {
      if (!conn) this.clearTimer("resubscribeTimer");
      return;
    }
    this.detach();
    if (!conn) {
      this.setStatus("offline");
      return;
    }
    this.subscribe(conn);
  }

  detach(): void {
    this.clearTimer("resubscribeTimer");
    if (!this.conn) return;
    const { documentUpdate, documentSnapshot, documentPresence } = this.conn.db;
    // Remove listeners BEFORE unsubscribing: evicting cached rows must not reach us.
    documentUpdate.removeOnInsert(this.onUpdateInsert);
    documentUpdate.removeOnDelete(this.onUpdateDelete);
    documentSnapshot.removeOnInsert(this.onSnapshotInsert);
    documentSnapshot.removeOnUpdate(this.onSnapshotUpdate);
    documentPresence.removeOnInsert(this.onPresenceInsert);
    documentPresence.removeOnUpdate(this.onPresenceUpdate);
    documentPresence.removeOnDelete(this.onPresenceDelete);
    this.generation++;
    safeUnsubscribe(this.sub);
    this.sub = null;
    this.conn = null;
    this.applied = false;
    this.transportOffline = false;
    if (this.inFlight) {
      this.pending.unshift(this.inFlight); // re-sending is idempotent
      this.inFlight = null;
    }
    this.clearTimer("retryTimer");
    this.clearTimer("compactTimer");
    this.clearTimer("presenceTimer");
    this.markerWaiter?.finish(false);
    this.logRowBytes.clear();
    this.logBytes = 0;
    const remote = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    if (remote.length) removeAwarenessStates(this.awareness, remote, REMOTE_ORIGIN);
    // Forget remote clocks too, so the same presence rows apply again after re-attaching.
    for (const id of [...this.awareness.meta.keys()]) if (id !== this.doc.clientID) this.awareness.meta.delete(id);
    this.peerMeta.clear();
    if (!this.destroyed) this.setStatus("offline");
  }

  /** Push merged pending updates, one reducer call at a time. */
  async flush(): Promise<void> {
    if (this.inFlight || this.largeWrite || !this.canPush() || !this.pending.length) return;
    const gen = this.generation;
    // Take the longest prefix whose summed size fits the cap (merged ≤ sum).
    let count = 0;
    let bytes = 0;
    while (count < this.pending.length && bytes + this.pending[count].byteLength <= this.tuning.updateMaxBytes) {
      bytes += this.pending[count].byteLength;
      count++;
    }
    if (count === 0) {
      await this.writeViaSnapshot(); // a single update is over the cap
      return;
    }
    const batch = this.pending.splice(0, count);
    const payload = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch);
    this.inFlight = payload;
    this.firstPendingAt = this.pending.length ? Date.now() : 0;
    try {
      await this.opts.transport.pushUpdate(this.documentId, this.sessionId, payload);
      if (gen !== this.generation) return; // detach() already re-queued it
      this.inFlight = null;
      this.retryAttempt = 0;
      this.transportOffline = false;
      if (this.pending.length) void this.flush();
      else this.setStatus("saved");
    } catch (err) {
      if (gen !== this.generation) return;
      this.inFlight = null;
      this.pending.unshift(payload);
      const code = docErrorCode(err);
      if (code && ACCESS_LOSS_CODES.has(code)) {
        this.loseAccess(code);
      } else if (code === "too_large") {
        await this.writeViaSnapshot();
      } else {
        if (isDocOfflineError(err)) this.transportOffline = true;
        this.scheduleRetry();
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this.canPush() && this.hasUnsavedChanges()) {
      void this.opts.transport.pushUpdate(this.documentId, this.sessionId, this.mergedUnsaved()).catch(() => {});
    }
    if (this.conn) void this.opts.transport.removePresence(this.documentId, this.doc.clientID).catch(() => {});
    this.destroyed = true;
    this.clearTimer("pushTimer");
    this.clearTimer("retryTimer");
    this.clearTimer("presenceTimer");
    this.clearTimer("compactTimer");
    this.clearTimer("resubscribeTimer");
    clearInterval(this.versionTimer);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.awareness.off("change", this.emitPeers);
    removeAwarenessStates(this.awareness, [this.doc.clientID], LOCAL_AWARENESS_ORIGIN);
    this.awareness.destroy();
    this.detach();
    this.markerWaiter?.finish(false);
    this.clearHandlers();
  }

  // ── sync internals ──────────────────────────────────────────────────────────

  /** Attached, synced, allowed to write. */
  private canPush(): boolean {
    return !!this.conn && this.applied && this.lostAccess === null && !this.readOnly;
  }

  private subscribe(conn: DocConnection): void {
    this.conn = conn;
    const gen = ++this.generation;
    this.applied = false;
    this.setStatus("syncing");
    const { documentUpdate, documentSnapshot, documentPresence } = conn.db;
    documentUpdate.onInsert(this.onUpdateInsert);
    documentUpdate.onDelete(this.onUpdateDelete);
    documentSnapshot.onInsert(this.onSnapshotInsert);
    documentSnapshot.onUpdate(this.onSnapshotUpdate);
    documentPresence.onInsert(this.onPresenceInsert);
    documentPresence.onUpdate(this.onPresenceUpdate);
    documentPresence.onDelete(this.onPresenceDelete);
    // ONE query set: snapshot + updates + presence are applied atomically, so a
    // compaction can never land "between" the snapshot and the update log.
    let handle: DocSubscriptionHandle | null = null;
    let appliedWhileStale = false;
    try {
      handle = conn
        .subscriptionBuilder()
        .onApplied(() => {
          if (gen !== this.generation) {
            // Detached before the subscription applied: unsubscribing is only valid now.
            if (handle) safeUnsubscribe(handle);
            else appliedWhileStale = true;
            return;
          }
          this.handleInitialSync(conn);
        })
        .onError((ctx) => {
          if (gen !== this.generation) return;
          this.onSubscriptionError(conn, ctx);
        })
        .subscribe(docLiveQueries(this.documentId));
    } catch (cause) {
      if (gen === this.generation) this.onSubscriptionError(conn, cause);
      return;
    }
    if (gen !== this.generation || appliedWhileStale) {
      safeUnsubscribe(handle);
      return;
    }
    this.sub = handle;
  }

  private onSubscriptionError(conn: DocConnection, cause: unknown): void {
    this.recordError({ code: "subscription", message: "Document subscription failed", cause });
    this.detach();
    if (this.destroyed) return;
    const delay = backoffDelay(this.tuning, this.resubscribeAttempt++);
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      if (!this.destroyed && !this.conn) this.attach(conn);
    }, delay);
  }

  private handleInitialSync(conn: DocConnection): void {
    this.lastErrorValue = null;
    this.transportOffline = false;
    let snapshot: DocSnapshotRow | null = null;
    for (const s of conn.db.documentSnapshot.iter()) {
      if (s.documentId === this.documentId) {
        snapshot = s;
        break;
      }
    }
    const rows = [...conn.db.documentUpdate.iter()].filter((r) => r.documentId === this.documentId).sort(byId);
    const parts = [...(snapshot ? [snapshot.state] : []), ...rows.map((r) => r.payload)];
    let serverUpdate: Uint8Array | null = null;
    let mergeFailed = false;
    if (parts.length === 1) serverUpdate = parts[0];
    else if (parts.length > 1) {
      try {
        serverUpdate = Y.mergeUpdates(parts);
      } catch {
        mergeFailed = true;
      }
    }

    // Reconnect: whatever the server lacks (offline edits, lost in-flight pushes)
    // supersedes the queue — the diff is a superset of every queued update. When
    // the server already has everything, nothing is pushed (no spurious row).
    if (this.everSynced && !this.readOnly && this.lostAccess === null) {
      const missing = Y.diffUpdate(Y.encodeStateAsUpdate(this.doc), this.serverStateVector(parts, serverUpdate, mergeFailed));
      this.pending = diffAddsToServer(missing, serverUpdate, !mergeFailed) ? [missing] : [];
      this.inFlight = null;
      this.firstPendingAt = this.pending.length ? Date.now() : 0;
    }
    if (serverUpdate) this.applyRemote(serverUpdate, "Could not apply document state");
    else if (mergeFailed) for (const part of parts) this.applyRemote(part, "Could not apply document state");

    this.maxAppliedId = snapshot?.throughUpdateId ?? 0n;
    this.snapshotThrough = snapshot ? snapshot.throughUpdateId : null;
    this.logRowBytes.clear();
    this.logBytes = 0;
    for (const r of rows) {
      if (r.id > this.maxAppliedId) this.maxAppliedId = r.id;
      this.trackLogRow(r);
    }
    this.applied = true;
    for (const p of conn.db.documentPresence.iter()) this.applyRemotePresence(p);

    this.everSynced = true;
    this.retryAttempt = 0;
    this.resubscribeAttempt = 0;
    if (!this.synced) {
      this.synced = true;
      this.emit("synced", true);
    }
    const willPush = this.pending.length > 0 && !this.readOnly;
    this.setStatus(willPush ? "saving" : "saved");
    if (willPush) this.schedulePush(0);
    this.presenceDirty = true;
    this.schedulePresence();
    this.emitPeers();
    this.maybeCompact();
  }

  private serverStateVector(parts: Uint8Array[], merged: Uint8Array | null, mergeFailed: boolean): Uint8Array {
    if (merged) return Y.encodeStateVectorFromUpdate(merged);
    if (!mergeFailed) return EMPTY_STATE_VECTOR;
    const scratch = new Y.Doc();
    try {
      for (const part of parts) {
        try {
          Y.applyUpdate(scratch, part);
        } catch {
          // Skip the malformed part; the diff then re-sends what it covered.
        }
      }
      return Y.encodeStateVector(scratch);
    } finally {
      scratch.destroy();
    }
  }

  private applyRemote(update: Uint8Array, message: string): void {
    try {
      Y.applyUpdate(this.doc, update, REMOTE_ORIGIN);
    } catch (cause) {
      this.recordError({ code: "apply", message, cause });
    }
  }

  private trackLogRow(row: DocUpdateRow): void {
    if (this.logRowBytes.has(row.id)) return;
    this.logRowBytes.set(row.id, row.byteLength);
    this.logBytes += row.byteLength;
  }

  private onUpdateInsert = (_ctx: unknown, row: DocUpdateRow): void => {
    if (!this.applied || row.documentId !== this.documentId) return;
    // The SDK announces the initial query-set rows after onApplied; those are already merged.
    if (this.logRowBytes.has(row.id)) return;
    this.trackLogRow(row);
    if (row.id > this.maxAppliedId) this.maxAppliedId = row.id;
    this.changedSinceVersion = true;
    if (row.sessionId !== this.sessionId) this.applyRemote(row.payload, "Could not apply a remote edit");
    if (this.markerWaiter && row.sessionId === this.sessionId && row.id > this.markerWaiter.after) {
      this.markerWaiter.finish(true);
    }
    this.maybeCompact();
  };

  private onUpdateDelete = (_ctx: unknown, row: DocUpdateRow): void => {
    if (!this.applied || row.documentId !== this.documentId) return; // compaction trimmed the log
    const bytes = this.logRowBytes.get(row.id);
    if (bytes === undefined) return;
    this.logRowBytes.delete(row.id);
    this.logBytes = Math.max(0, this.logBytes - bytes);
  };

  private onSnapshotInsert = (_ctx: unknown, row: DocSnapshotRow): void => this.applySnapshot(row);
  private onSnapshotUpdate = (_ctx: unknown, _old: DocSnapshotRow, row: DocSnapshotRow): void => this.applySnapshot(row);

  private applySnapshot(row: DocSnapshotRow): void {
    if (!this.applied || row.documentId !== this.documentId) return;
    // Snapshots only ever advance; an equal one is the row we loaded (re-announced by the SDK).
    if (this.snapshotThrough !== null && row.throughUpdateId <= this.snapshotThrough) return;
    this.snapshotThrough = row.throughUpdateId;
    // Idempotent; also covers the oversize path where content arrives only via snapshot.
    this.applyRemote(row.state, "Could not apply snapshot");
    if (row.throughUpdateId > this.maxAppliedId) this.maxAppliedId = row.throughUpdateId;
    this.emit("compacted", row.throughUpdateId);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN || origin === MARKER_ORIGIN || this.destroyed || this.readOnly) return;
    this.pending.push(update);
    this.changedSinceVersion = true;
    if (!this.firstPendingAt) this.firstPendingAt = Date.now();
    if (this.conn) this.setStatus(!this.applied ? "syncing" : this.transportOffline ? "offline" : "saving");
    else if (this.status !== "connecting") this.setStatus("offline");
    this.schedulePush();
  };

  private schedulePush(delay = this.tuning.pushDebounceMs): void {
    this.clearTimer("pushTimer");
    const waited = this.firstPendingAt ? Date.now() - this.firstPendingAt : 0;
    const wait = Math.max(0, Math.min(delay, this.tuning.pushMaxWaitMs - waited));
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.flush();
    }, wait);
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.destroyed) return;
    const delay = backoffDelay(this.tuning, this.retryAttempt++);
    this.setStatus(this.conn && !this.transportOffline ? "saving" : "offline");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private mergedUnsaved(): Uint8Array {
    const all = [...(this.inFlight ? [this.inFlight] : []), ...this.pending];
    return all.length === 1 ? all[0] : Y.mergeUpdates(all);
  }

  /**
   * Oversize fallback: a local update bigger than `updateMaxBytes` can't be pushed
   * as a row, so the whole state goes into the snapshot instead.
   * 1. Refuse (error, edits stay unsaved) if even the full state is over `stateMaxBytes`.
   * 2. Push a tiny marker edit so the log has a row newer than the current snapshot.
   * 3. Wait (≤ 5 s) for that row to come back, so every row ≤ its id is applied here.
   * 4. Compact through it; the queued updates are now contained in the snapshot.
   * Other clients hold the marker in pendingStructs until the snapshot arrives,
   * which also blocks their compaction meanwhile (canCompact guard).
   */
  private async writeViaSnapshot(): Promise<void> {
    if (this.largeWrite || !this.canPush() || this.destroyed) return;
    if (Y.encodeStateAsUpdate(this.doc).byteLength > this.tuning.stateMaxBytes) {
      this.recordError({ code: "too_large", message: "Document exceeds the size limit" });
      this.setStatus("error");
      return;
    }
    if (!this.serialize) {
      // html/plainText for the snapshot come from the editor; wait until it is mounted.
      this.scheduleRetry();
      return;
    }
    const gen = this.generation;
    this.largeWrite = true;
    try {
      const after = this.maxAppliedId;
      const marker = this.createMarkerUpdate();
      const seen = this.waitForOwnRow(after);
      await this.opts.transport.pushUpdate(this.documentId, this.sessionId, marker);
      const markerApplied = await seen;
      if (gen !== this.generation) return;
      if (!markerApplied) {
        this.scheduleRetry();
        return;
      }
      const covered = new Set(this.pending);
      const compacted = await this.compactNow({ force: true });
      if (gen !== this.generation) return;
      if (!compacted) {
        this.scheduleRetry();
        return;
      }
      this.pending = this.pending.filter((u) => !covered.has(u));
      this.firstPendingAt = this.pending.length ? Date.now() : 0;
      this.retryAttempt = 0;
      this.transportOffline = false;
      if (this.pending.length) this.schedulePush(0);
      else if (!this.inFlight) this.setStatus("saved");
    } catch (err) {
      if (gen !== this.generation) return;
      const code = docErrorCode(err);
      if (code && ACCESS_LOSS_CODES.has(code)) this.loseAccess(code);
      else {
        if (isDocOfflineError(err)) this.transportOffline = true;
        this.scheduleRetry();
      }
    } finally {
      this.markerWaiter?.finish(false);
      this.largeWrite = false;
    }
  }

  private createMarkerUpdate(): Uint8Array {
    const captured: { update: Uint8Array | null } = { update: null };
    const capture = (update: Uint8Array, origin: unknown): void => {
      if (origin === MARKER_ORIGIN) captured.update = update;
    };
    this.doc.on("update", capture);
    try {
      this.doc.transact(() => {
        this.doc.getMap(META_MAP).set("largeWriteAt", Date.now());
      }, MARKER_ORIGIN);
    } finally {
      this.doc.off("update", capture);
    }
    if (!captured.update) throw new Error("Could not create the marker edit");
    return captured.update;
  }

  private waitForOwnRow(after: bigint): Promise<boolean> {
    this.markerWaiter?.finish(false);
    return new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const waiter = {
        after,
        finish: (ok: boolean): void => {
          if (timer) clearTimeout(timer);
          timer = null;
          if (this.markerWaiter === waiter) this.markerWaiter = null;
          resolve(ok);
        },
      };
      this.markerWaiter = waiter;
      timer = setTimeout(() => waiter.finish(false), MARKER_WAIT_MS);
    });
  }

  private maybeCompact(): void {
    if (this.compactTimer || !this.canCompact()) return;
    const rows = this.logRowBytes.size;
    const over = rows >= this.tuning.compactMaxRows || this.logBytes >= this.tuning.compactMaxBytes;
    if (!over) return;
    const severe = rows >= this.tuning.compactMaxRows * 2 || this.logBytes >= this.tuning.compactMaxBytes * 2;
    const elected = this.isElectedCompactor();
    if (!elected && !severe) return;
    // Non-elected clients only step in when the log is 2× over (elected client gone/stuck), with jitter.
    const delay = elected ? 0 : 500 + Math.random() * 4500;
    this.compactTimer = setTimeout(() => {
      this.compactTimer = null;
      void this.compactNow();
    }, delay);
  }

  private canCompact(): boolean {
    return (
      !this.readOnly &&
      this.lostAccess === null &&
      this.applied &&
      !!this.conn &&
      !this.compacting &&
      !!this.serialize &&
      Date.now() - this.lastCompactAt >= this.tuning.compactMinIntervalMs &&
      // Never snapshot while structs/deletes are waiting on missing dependencies.
      this.doc.store.pendingStructs === null &&
      this.doc.store.pendingDs === null
    );
  }

  /** Lowest `${connectionIdHex}:${yClientId}` among fresh editor presence rows wins. */
  private isElectedCompactor(): boolean {
    if (!this.conn) return false;
    const me = `${this.conn.connectionIdHex}:${this.doc.clientID}`;
    let best = me;
    for (const p of this.conn.db.documentPresence.iter()) {
      if (p.documentId !== this.documentId || !p.canEdit) continue;
      if (Date.now() - p.updatedAt.getTime() > this.tuning.electionFreshMs) continue;
      const key = `${p.connectionId}:${p.yClientId}`;
      if (key < best) best = key;
    }
    return best === me;
  }

  private async compactNow(opts: { force?: boolean } = {}): Promise<boolean> {
    if (!opts.force && !this.canCompact()) return false;
    if (!this.serialize || !this.conn) return false;
    const gen = this.generation;
    this.compacting = true;
    this.lastCompactAt = Date.now();
    try {
      const throughUpdateId = this.maxAppliedId; // every row ≤ this id has been applied locally
      const state = Y.encodeStateAsUpdate(this.doc);
      if (state.byteLength > this.tuning.stateMaxBytes) {
        this.recordError({ code: "too_large", message: "Document exceeds the size limit" });
        return false;
      }
      await this.opts.transport.compact({ documentId: this.documentId, throughUpdateId, state, ...this.serialize() });
      return gen === this.generation;
    } catch {
      return false; // stale (lost the race) or transient — the next trigger retries
    } finally {
      this.compacting = false;
    }
  }

  private onVersionTick = (): void => {
    if (!this.changedSinceVersion || !this.canCompact() || !this.isElectedCompactor()) return;
    this.changedSinceVersion = false;
    this.saveVersion("auto").catch(() => {
      this.changedSinceVersion = true;
    });
  };

  // ── presence and awareness internals ───────────────────────────────────────

  private localUser(): { name: string; color: string; memberId: string } {
    return { name: this.user.name, color: this.user.color, memberId: this.opts.memberId };
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === REMOTE_ORIGIN || !this.presenceActive) return;
    const me = this.doc.clientID;
    if (!added.includes(me) && !updated.includes(me) && !removed.includes(me)) return;
    // y-protocols renews the local state every 15 s ("update" fires) → heartbeat for free.
    this.presenceDirty = true;
    this.schedulePresence();
  };

  private schedulePresence(): void {
    if (this.presenceTimer || !this.conn || !this.applied || !this.presenceActive || this.lostAccess) return;
    const now = Date.now();
    const wait = Math.max(0, this.tuning.presenceThrottleMs - (now - this.lastPresenceAt), this.presenceBlockedUntil - now);
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      void this.sendPresence();
    }, wait);
  }

  private async sendPresence(): Promise<void> {
    if (!this.presenceDirty || !this.conn || !this.applied || this.lostAccess || !this.presenceActive) return;
    if (this.awareness.getLocalState() === null) return;
    this.presenceDirty = false;
    this.lastPresenceAt = Date.now();
    const gen = this.generation;
    const { name, color } = this.user;
    try {
      await this.opts.transport.upsertPresence({
        documentId: this.documentId,
        yClientId: this.doc.clientID,
        name,
        color,
        awareness: encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
      });
      if (gen === this.generation) {
        this.presenceBlockedUntil = 0;
        this.presenceBlockAttempt = 0;
      }
    } catch (err) {
      if (gen !== this.generation || this.destroyed) return;
      const code = docErrorCode(err);
      if (code === "forbidden" || code === "not_found") {
        this.loseAccess(code);
        return;
      }
      this.presenceDirty = true; // retried on the next awareness change / heartbeat
      if (code === "trashed") {
        // A trashed document stays open read-only (and can be restored), so this
        // is not an access loss: back off instead of calling on every caret move.
        this.presenceBlockedUntil = Date.now() + backoffDelay(this.tuning, this.presenceBlockAttempt++);
      }
    }
  }

  private onPresenceInsert = (_ctx: unknown, row: DocPresenceRow): void => {
    if (this.applied) this.applyRemotePresence(row);
  };

  private onPresenceUpdate = (_ctx: unknown, _old: DocPresenceRow, row: DocPresenceRow): void => {
    if (this.applied) this.applyRemotePresence(row);
  };

  private onPresenceDelete = (_ctx: unknown, row: DocPresenceRow): void => {
    if (!this.applied || row.documentId !== this.documentId || row.yClientId === this.doc.clientID) return;
    removeAwarenessStates(this.awareness, [row.yClientId], REMOTE_ORIGIN);
    // Drop the clock as well: the peer may re-upsert the same awareness bytes later.
    this.awareness.meta.delete(row.yClientId);
    this.peerMeta.delete(row.yClientId);
    this.emitPeers();
  };

  private applyRemotePresence(row: DocPresenceRow): void {
    if (row.documentId !== this.documentId || row.yClientId === this.doc.clientID) return;
    const previous = this.peerMeta.get(row.yClientId);
    this.peerMeta.set(row.yClientId, { memberId: row.memberId, canEdit: row.canEdit });
    // Only an update for the row's own client may set that client's state (the server enforces this too).
    if (awarenessIsForClient(row.awareness, row.yClientId)) {
      try {
        applyAwarenessUpdate(this.awareness, row.awareness, REMOTE_ORIGIN);
      } catch {
        // Malformed row.
      }
    }
    // Server-side changes (canEdit after a grant) don't touch the awareness bytes.
    if (previous && (previous.canEdit !== row.canEdit || previous.memberId !== row.memberId)) this.emitPeers();
  }

  /**
   * Rebuilds the peer list. Awareness "change" fires on every caret move (local
   * and remote), but DocPeer carries no cursor, so an unchanged list is not
   * re-emitted — otherwise every keystroke would re-render the whole editor UI.
   */
  private emitPeers = (): void => {
    const peers: DocPeer[] = [];
    this.awareness.getStates().forEach((state, yClientId) => {
      const user = (state as { user?: { name?: string; color?: string; memberId?: string } }).user;
      if (!user) return;
      const meta = this.peerMeta.get(yClientId);
      const isSelf = yClientId === this.doc.clientID;
      peers.push({
        yClientId,
        memberId: meta?.memberId ?? user.memberId ?? "",
        name: user.name ?? "",
        color: user.color ?? DEFAULT_PEER_COLOR,
        canEdit: isSelf ? !this.readOnly : (meta?.canEdit ?? false),
        isSelf,
      });
    });
    if (samePeers(peers, this.peerList)) return;
    this.peerList = peers;
    this.emit("peers", peers);
  };

  // ── lifecycle helpers ───────────────────────────────────────────────────────

  private onPageHide = (): void => {
    if (this.canPush() && this.hasUnsavedChanges()) {
      void this.opts.transport.pushUpdate(this.documentId, this.sessionId, this.mergedUnsaved()).catch(() => {});
    }
    if (this.conn) void this.opts.transport.removePresence(this.documentId, this.doc.clientID).catch(() => {});
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      this.clearTimer("pushTimer");
      void this.flush();
    } else {
      this.presenceDirty = true;
      this.schedulePresence();
    }
  };

  private loseAccess(code: DocErrorCode): void {
    if (this.lostAccess) return;
    this.lostAccess = code;
    this.readOnly = true;
    this.clearTimer("pushTimer");
    this.clearTimer("retryTimer");
    this.clearTimer("compactTimer");
    this.clearTimer("presenceTimer");
    this.emit("accessLost", code);
    this.setStatus("error");
    this.emitPeers();
  }

  /**
   * The app says access is back: forget the loss and run the reconnect path, so
   * the state-vector diff pushes whatever the server lacks (the rejected edits
   * included) and presence is re-announced. A renewed rejection loses access again.
   */
  private retryAccess(): void {
    if (this.destroyed || this.lostAccess === null) return;
    this.lostAccess = null;
    this.readOnly = this.requestedReadOnly;
    this.retryAttempt = 0;
    this.presenceBlockedUntil = 0;
    this.presenceBlockAttempt = 0;
    const conn = this.conn;
    if (conn) {
      this.detach();
      this.subscribe(conn);
    } else {
      this.setStatus("offline");
    }
    this.emitPeers();
  }

  private recordError(error: DocProviderError): void {
    this.lastErrorValue = error;
    this.emit("error", error);
  }

  private setStatus(next: DocSyncStatus): void {
    if (this.lostAccess && next !== "error") return;
    if (this.status === next) return;
    this.status = next;
    this.emit("status", next);
  }

  private clearTimer(key: TimerKey): void {
    const timer = this[key];
    if (timer) clearTimeout(timer);
    this[key] = null;
  }
}
