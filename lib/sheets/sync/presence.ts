// Presence of a spreadsheet session (sheets.md §6): who has the file open, and where each person's selection is.
//
// Sheets reuse the Docs presence rows (`document_presence`, written by upsertDocumentPresence and removed by
// removeDocumentPresence or the server's disconnect cleanup): one row per (connection, client id) with a
// server-derived member id and edit flag, the client-sent name and colour (display only, as in Docs), and awareness
// bytes carrying the selection (./awareness.ts). SheetPresence announces one session: at once on start, again when
// the selection or the user changes (at most once per second), and as a heartbeat every 15 s. peersFromPresence and
// peerSelections turn the subscribed rows back into the avatar list and the highlights.
//
// A row's updatedAt is the server's clock. SheetPresence learns the offset to the local clock from the echo of its
// own upserts (serverNow()), so a tablet whose clock runs ahead does not hide every peer as stale.

import { docErrorCode } from "@/lib/docs/errors";
import type { DocPeer } from "@/lib/docs/sync-types";
import type { DocPresenceRow } from "@/lib/docs/types";
import { SHEET_TUNING } from "@/lib/sheets/constants";
import type { SheetSelection } from "@/lib/sheets/types";
import {
  decodeSheetAwareness, encodeSheetAwareness, sameSheetSelection, selectionFromAwareness, selectionToAwareness,
  type DecodedSheetAwareness,
} from "./awareness";
import type { SheetTransport } from "./transport";

/** Rows not renewed for this long (three missed heartbeats) are treated as gone. */
export const SHEET_PRESENCE_STALE_MS = 45_000;

/** A random non-zero u32 for this session's presence row (the awareness client id). */
export function newSheetClientId(): number {
  const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  return value === 0 ? 1 : value;
}

/** This session's own row: its socket and client id. */
export interface SheetPresenceSelf { connectionId: string; clientId: number }

export interface SheetPeerSelection {
  yClientId: number;
  connectionId: string;
  memberId: string;
  name: string;
  color: string;
  selection: SheetSelection;
  updatedAt: Date;
}

interface LiveEntry { row: DocPresenceRow; state: NonNullable<DecodedSheetAwareness["state"]>; isSelf: boolean }

const keyOf = (row: DocPresenceRow) => `${row.connectionId}:${row.yClientId}`;

/** Fresh, decodable, non-withdrawn rows, one per (connection, client) — the newest — in key order. */
function liveEntries(rows: readonly DocPresenceRow[], self: SheetPresenceSelf, nowMs: number): LiveEntry[] {
  const byKey = new Map<string, LiveEntry>();
  for (const row of rows) {
    const isSelf = row.connectionId === self.connectionId && row.yClientId === self.clientId;
    if (!isSelf && nowMs - row.updatedAt.getTime() > SHEET_PRESENCE_STALE_MS) continue;
    const decoded = decodeSheetAwareness(row.awareness);
    if (!decoded || decoded.clientId !== row.yClientId || decoded.state === null) continue;
    const previous = byKey.get(keyOf(row));
    if (previous && previous.row.updatedAt.getTime() >= row.updatedAt.getTime()) continue;
    byKey.set(keyOf(row), { row, state: decoded.state, isSelf });
  }
  return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, entry]) => entry);
}

/**
 * The avatar list of one document's presence rows (filter by documentId first): this session first, then everyone
 * else in a stable order. Names, colours, member ids and edit flags come from the row columns.
 */
export function peersFromPresence(rows: readonly DocPresenceRow[], self: SheetPresenceSelf, nowMs: number): DocPeer[] {
  const entries = liveEntries(rows, self, nowMs);
  entries.sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
  return entries.map(({ row, isSelf }) => ({
    yClientId: row.yClientId,
    memberId: row.memberId,
    name: row.name,
    color: row.color,
    canEdit: row.canEdit,
    isSelf,
  }));
}

/** Same avatars in the same order: selection moves change nothing here, so an unchanged list need not re-render. */
export function samePeers(a: readonly DocPeer[], b: readonly DocPeer[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i];
    return x.yClientId === y.yClientId && x.memberId === y.memberId && x.name === y.name && x.color === y.color
      && x.canEdit === y.canEdit && x.isSelf === y.isSelf;
  });
}

/** Everyone else's current selection (one document's rows), for highlights and "jump to". */
export function peerSelections(rows: readonly DocPresenceRow[], self: SheetPresenceSelf, nowMs: number): SheetPeerSelection[] {
  const out: SheetPeerSelection[] = [];
  for (const { row, state, isSelf } of liveEntries(rows, self, nowMs)) {
    if (isSelf || !state.sheet) continue;
    out.push({
      yClientId: row.yClientId,
      connectionId: row.connectionId,
      memberId: row.memberId,
      name: row.name,
      color: row.color,
      selection: selectionFromAwareness(state.sheet),
      updatedAt: row.updatedAt,
    });
  }
  return out;
}

/** The lease holder's selection (the newest one on its socket), or null: free lease, this session, or none shared. */
export function holderSelection(
  rows: readonly DocPresenceRow[], holderConnectionId: string, self: SheetPresenceSelf, nowMs: number,
): SheetPeerSelection | null {
  if (!holderConnectionId) return null;
  let best: SheetPeerSelection | null = null;
  for (const peer of peerSelections(rows, self, nowMs)) {
    if (peer.connectionId !== holderConnectionId) continue;
    if (!best || peer.updatedAt.getTime() > best.updatedAt.getTime()) best = peer;
  }
  return best;
}

export interface SheetPresenceUser { name: string; color: string; memberId: string }

export interface SheetPresenceOptions {
  documentId: string;
  user: SheetPresenceUser;
  transport: Pick<SheetTransport, "upsertPresence" | "removePresence">;
  /** Default: newSheetClientId(). */
  clientId?: number;
  heartbeatMs?: number;
  throttleMs?: number;
  now?: () => number;
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  /**
   * Every failed upsert. After `[doc.forbidden]` / `[doc.not_found]` the presence stops for good (lostAccess);
   * after `[doc.trashed]` it backs off; anything else is retried with the next heartbeat.
   */
  onError?: (err: unknown) => void;
}

export class SheetPresence {
  readonly documentId: string;
  readonly clientId: number;
  private user: SheetPresenceUser;
  private selection: SheetSelection | null = null;
  private readonly opts: SheetPresenceOptions;
  private readonly now: () => number;
  private readonly timers: NonNullable<SheetPresenceOptions["timers"]>;
  private readonly heartbeatMs: number;
  private readonly throttleMs: number;
  private connectionId = "";
  private running = false;
  private blocked = false;
  private announced = false;
  private dirty = false;
  private generation = 0;
  private clock = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt = 0;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;
  private withdrawal: Promise<void> = Promise.resolve();
  private retryAt = 0;
  private retryAttempt = 0;
  private echo = { clock: -1, sentAt: 0 };
  private offsetMs = 0;

  constructor(opts: SheetPresenceOptions) {
    this.opts = opts;
    this.documentId = opts.documentId.trim().toLowerCase();
    this.clientId = opts.clientId ?? newSheetClientId();
    this.user = { ...opts.user };
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
    this.heartbeatMs = opts.heartbeatMs ?? SHEET_TUNING.presenceHeartbeatMs;
    this.throttleMs = opts.throttleMs ?? SHEET_TUNING.presenceThrottleMs;
  }

  /** Announcing (started, not stopped, access not lost). */
  get active(): boolean { return this.running; }
  /** The server refused presence for lack of access; start() does nothing any more. */
  get lostAccess(): boolean { return this.blocked; }
  /** Server clock minus local clock, learned from the echo of this session's own upserts (0 until one arrives). */
  get clockOffsetMs(): number { return this.offsetMs; }
  serverNow(): number { return this.now() + this.offsetMs; }
  get self(): SheetPresenceSelf { return { connectionId: this.connectionId, clientId: this.clientId }; }

  /** Announce on `connectionId` (the attached connection's id); again after a reconnect. */
  start(connectionId: string): void {
    if (this.blocked || !connectionId || (this.running && connectionId === this.connectionId)) return;
    this.connectionId = connectionId;
    this.running = true;
    this.generation++;
    this.dirty = true;
    this.schedule(0);
  }

  setUser(user: SheetPresenceUser): void {
    if (user.name === this.user.name && user.color === this.user.color && user.memberId === this.user.memberId) return;
    this.user = { ...user };
    this.changed();
  }

  setSelection(selection: SheetSelection | null): void {
    if (sameSheetSelection(selection, this.selection)) return;
    this.selection = selection ? { ...selection } : null;
    this.changed();
  }

  /**
   * Withdraw: no more upserts, then remove this session's row (after any upsert still in flight). `announced` is
   * cleared only when the removal is sent, so of several overlapping stop() calls (park, then destroy) exactly one
   * removes the row and all of them resolve once it is gone; a restart meanwhile keeps the new announcement.
   */
  async stop(): Promise<void> {
    this.generation++;
    this.running = false;
    this.dirty = false;
    this.clearTimer();
    if (this.inflight) await this.inflight;
    if (this.running) return; // restarted meanwhile: the new announcement stands
    if (this.announced) {
      this.announced = false;
      this.withdrawal = this.withdraw();
    }
    await this.withdrawal;
  }

  /** Timers only, no network of its own (a stop() already under way still removes the row). */
  dispose(): void {
    this.generation++;
    this.running = false;
    this.clearTimer();
  }

  /** Feed every presence insert/update: this session's own echo calibrates serverNow(). */
  observe(row: DocPresenceRow): void {
    if (this.echo.clock < 0 || row.documentId !== this.documentId) return;
    if (row.connectionId !== this.connectionId || row.yClientId !== this.clientId) return;
    const decoded = decodeSheetAwareness(row.awareness);
    if (!decoded || decoded.clock !== this.echo.clock) return;
    this.offsetMs = row.updatedAt.getTime() - this.echo.sentAt;
    this.echo = { clock: -1, sentAt: 0 };
  }

  peers(rows: Iterable<DocPresenceRow>): DocPeer[] {
    return peersFromPresence(this.rowsOf(rows), this.self, this.serverNow());
  }

  selections(rows: Iterable<DocPresenceRow>): SheetPeerSelection[] {
    return peerSelections(this.rowsOf(rows), this.self, this.serverNow());
  }

  holderSelection(rows: Iterable<DocPresenceRow>, holderConnectionId: string): SheetPeerSelection | null {
    return holderSelection(this.rowsOf(rows), holderConnectionId, this.self, this.serverNow());
  }

  private rowsOf(rows: Iterable<DocPresenceRow>): DocPresenceRow[] {
    return [...rows].filter((row) => row.documentId === this.documentId);
  }

  private changed(): void {
    if (!this.running) return;
    this.dirty = true;
    this.schedule(0);
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    const now = this.now();
    const due = Math.max(now + delayMs, this.lastSentAt + this.throttleMs, this.retryAt);
    if (this.timer !== null) {
      if (this.timerDueAt <= due) return;
      this.timers.clearTimeout(this.timer);
    }
    this.timerDueAt = due;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.send();
    }, Math.max(0, due - now));
  }

  private send(): void {
    if (!this.running) return;
    if (this.inflight) {
      this.dirty = true; // sent again once the call settles
      return;
    }
    this.dirty = false;
    const clock = ++this.clock;
    const sheet = this.selection ? selectionToAwareness(this.selection) : null;
    const { name, color } = this.user;
    const awareness = encodeSheetAwareness(this.clientId, clock, sheet ? { user: this.user, sheet } : { user: this.user });
    const sentAt = this.now();
    this.lastSentAt = sentAt;
    this.echo = { clock, sentAt };
    this.announced = true;
    const generation = this.generation;
    let call: Promise<void>;
    try {
      call = this.opts.transport.upsertPresence({ documentId: this.documentId, yClientId: this.clientId, name, color, awareness });
    } catch (err) {
      call = Promise.reject(err);
    }
    this.inflight = call
      .then(
        () => {
          if (generation !== this.generation) return;
          this.retryAt = 0;
          this.retryAttempt = 0;
        },
        (err: unknown) => this.failed(err, generation),
      )
      .finally(() => {
        this.inflight = null;
        this.schedule(this.dirty ? 0 : this.heartbeatMs);
      });
  }

  private failed(err: unknown, generation: number): void {
    if (generation !== this.generation) return;
    const code = docErrorCode(err);
    if (code === "forbidden" || code === "not_found") {
      this.blocked = true;
      this.running = false;
      this.clearTimer();
    } else if (code === "trashed") {
      // A trashed sheet stays open read-only and can be restored: back off instead of calling on every move.
      const base = Math.min(SHEET_TUNING.retryMaxMs, SHEET_TUNING.retryBaseMs * 2 ** Math.min(this.retryAttempt++, 30));
      this.retryAt = this.now() + base * (0.75 + Math.random() * 0.5);
    }
    this.opts.onError?.(err);
  }

  private async withdraw(): Promise<void> {
    try {
      await this.opts.transport.removePresence(this.documentId, this.clientId);
    } catch {
      // Best effort: the server's disconnect cleanup and the staleness window remove it too.
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }
}
