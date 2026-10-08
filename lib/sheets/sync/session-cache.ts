// Keeps recently closed spreadsheets warm (sheets.md §5.7), as lib/docs/session-cache.ts does for text documents.
//
// Browser-shell tab switches remount the editor. Instead of throwing the session away, the release parks it: capture
// is muted, the model is saved synchronously (the host disposes Univer only in a microtask) and unbound, and presence
// is withdrawn, while the subscription, heartbeat and push queue keep running (a request arriving meanwhile hands
// the lease over at once). A re-acquire within SHEET_SESSION_IDLE_MS for the same (org, member, acting member,
// document) re-binds the next model to the parked workbook without a decode.
//
// A parked session is destroyed after SHEET_SESSION_IDLE_MS, or evicted beyond SHEET_SESSION_MAX_IDLE (least recently
// released first): flush, release, cancel the request, remove presence, unsubscribe — no compaction. One that still
// holds edits it can save stays until they are on the server. One that lost access is destroyed on release, so the
// next open starts clean, as does one whose PIN operator was replaced on the store tablet (it can never write again;
// flushSheetSessions saves what it can before such a switch). Two editors open on the same key at once get two
// sessions (the same person in two tabs).
//
// Parked sessions follow the app connection the keeper publishes (./app-connection.ts), not only an open editor's,
// and the unload guard is installed while any session exists: closing the tab with a parked sheet's edits unsent
// asks first, whether or not an editor is mounted.
//
// Pure: no React, no Univer runtime. Used by lib/sheets/use-sheet-session.ts; exported for tests.

import { SheetSyncSession, type SheetSessionOptions } from "@/lib/sheets/sync/session";
import { currentSheetAppConnection, onSheetAppConnection, setSheetSessionFlush } from "./app-connection";
import type { SheetConnection } from "./connection";
import { SHEET_TIMERS, type SheetTimers } from "./push-queue";

export const SHEET_SESSION_IDLE_MS = 30_000;
export const SHEET_SESSION_MAX_IDLE = 2;
/** flushSheetSessions' bound: a PIN switch waits this long at most. */
export const SHEET_FLUSH_BEFORE_OPERATOR_CHANGE_MS = 5_000;

export interface SheetSessionKey {
  organizationId: string;
  /** The signed-in account's member. */
  memberId: string;
  /** '' off /store. A new operator never inherits another operator's session. */
  actingMemberId: string;
  documentId: string;
}

/** Everything else a new session needs (the key supplies the rest). */
export type SheetSessionInit = Omit<SheetSessionOptions, keyof SheetSessionKey>;

interface Entry {
  readonly key: string;
  readonly session: SheetSyncSession;
  readonly timers: SheetTimers;
  inUse: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Release order, for least-recently-released eviction. */
  releasedSeq: number;
}

const entries = new Map<string, Entry[]>();
let releaseSeq = 0;
let unloadGuardInstalled = false;
let followingApp = false;

/** Stable cache key: any other org, member, operator or document gets another session. */
export function sheetSessionKey(key: SheetSessionKey): string {
  return JSON.stringify([key.organizationId, key.memberId, key.actingMemberId.trim(), key.documentId.trim().toLowerCase()]);
}

function allEntries(): Entry[] {
  return [...entries.values()].flat();
}

function entryOf(session: SheetSyncSession): Entry | null {
  return allEntries().find((entry) => entry.session === session) ?? null;
}

/** The parked session for `key` (re-bound, presence back), or a new one. The caller binds its model next. */
export function acquireSheetSession(key: SheetSessionKey, init: SheetSessionInit): SheetSyncSession {
  const id = sheetSessionKey(key);
  const parked = (entries.get(id) ?? []).find((entry) => !entry.inUse);
  if (parked && retired(parked.session)) {
    evict(parked); // lost access, or replaced as the device's operator, while parked: start over
  } else if (parked) {
    parked.inUse = true;
    clearIdleTimer(parked);
    parked.session.setUser(init.user);
    parked.session.setCanEdit(init.canEdit);
    return parked.session;
  }
  const session = new SheetSyncSession({ ...init, ...key });
  const entry: Entry = { key: id, session, timers: init.timers ?? SHEET_TIMERS, inUse: true, idleTimer: null, releasedSeq: 0 };
  entries.set(id, [...(entries.get(id) ?? []), entry]);
  installUnloadGuard();
  followAppConnection();
  return session;
}

/** The editor unmounted: park the session (its model is saved now, before Univer goes), or drop it. */
export function releaseSheetSession(session: SheetSyncSession): void {
  const entry = entryOf(session);
  if (!entry || !entry.inUse) return;
  entry.inUse = false;
  if (retired(session)) {
    evict(entry);
    return;
  }
  session.parkModel();
  // The editor's store stops following the connection now: the app's is followed instead (when a keeper publishes it).
  const app = currentSheetAppConnection();
  if (app) session.attach(app);
  entry.releasedSeq = ++releaseSeq;
  scheduleIdleEviction(entry);
  enforceIdleCap();
}

/** Point every parked session at `connection` (null: offline), so none stays on a closed socket. */
export function attachIdleSheetSessions(connection: SheetConnection | null): void {
  for (const entry of allEntries()) if (!entry.inUse) entry.session.attach(connection);
}

/** True while an open or parked session holds edits that can still reach the server (the unload guard). */
export function hasUnsavedSheetSessions(): boolean {
  return allEntries().some((entry) => entry.session.holdsSaveableEdits);
}

/**
 * Before this store device's PIN operator changes (the lock, the next sign-in): every session gets its unsent edits
 * to the server while the outgoing operator's PIN still counts, since the server refuses them afterwards. Bounded by
 * `timeoutMs`; true once no session holds edits it could still save.
 */
export async function flushSheetSessions(timeoutMs = SHEET_FLUSH_BEFORE_OPERATOR_CHANGE_MS, timers: SheetTimers = SHEET_TIMERS): Promise<boolean> {
  const pending = allEntries().filter((entry) => entry.session.holdsSaveableEdits);
  if (pending.length === 0) return true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<void>((resolve) => (timer = timers.setTimeout(resolve, timeoutMs)));
  await Promise.race([Promise.all(pending.map((entry) => entry.session.flush().catch(() => {}))), timeout]);
  if (timer !== null) timers.clearTimeout(timer);
  return !hasUnsavedSheetSessions();
}

setSheetSessionFlush(() => flushSheetSessions());

/** Sign-out, org switch: destroy every session (each flushes first, bounded). */
export async function destroyAllSheetSessions(): Promise<void> {
  const all = allEntries();
  for (const entry of all) clearIdleTimer(entry);
  entries.clear();
  removeUnloadGuard();
  await Promise.all(all.map((entry) => entry.session.destroy().catch(() => {})));
}

/** Cache size, for tests. */
export function __sheetSessionStatsForTests(): { total: number; parked: number } {
  const all = allEntries();
  return { total: all.length, parked: all.filter((entry) => !entry.inUse).length };
}

/** Never writes again: access lost, or another person signed in on this device (a new open starts over). */
function retired(session: SheetSyncSession): boolean {
  return session.accessLost !== null || session.operatorChanged;
}

function scheduleIdleEviction(entry: Entry): void {
  clearIdleTimer(entry);
  entry.idleTimer = entry.timers.setTimeout(() => {
    entry.idleTimer = null;
    if (entry.inUse || !(entries.get(entry.key) ?? []).includes(entry)) return;
    if (entry.session.holdsSaveableEdits) {
      scheduleIdleEviction(entry); // still saving (or offline): check again later
      return;
    }
    evict(entry);
  }, SHEET_SESSION_IDLE_MS);
}

function enforceIdleCap(): void {
  const idle = allEntries().filter((entry) => !entry.inUse).sort((a, b) => a.releasedSeq - b.releasedSeq);
  let excess = idle.length - SHEET_SESSION_MAX_IDLE;
  for (const entry of idle) {
    if (excess <= 0) break;
    if (entry.session.holdsSaveableEdits) continue;
    evict(entry);
    excess--;
  }
}

function evict(entry: Entry): void {
  clearIdleTimer(entry);
  const list = (entries.get(entry.key) ?? []).filter((other) => other !== entry);
  if (list.length > 0) entries.set(entry.key, list);
  else entries.delete(entry.key);
  if (entries.size === 0) removeUnloadGuard();
  void entry.session.destroy().catch(() => {});
}

function clearIdleTimer(entry: Entry): void {
  if (entry.idleTimer !== null) entry.timers.clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
}

/** Once, for the module's life: every change of the published app connection re-points the parked sessions. */
function followAppConnection(): void {
  if (followingApp) return;
  followingApp = true;
  onSheetAppConnection((connection) => attachIdleSheetSessions(connection));
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedSheetSessions()) return;
  event.preventDefault();
  // Safari and older Chromium only prompt when returnValue is set.
  event.returnValue = "";
}

function installUnloadGuard(): void {
  if (unloadGuardInstalled || typeof window === "undefined") return;
  window.addEventListener("beforeunload", onBeforeUnload);
  unloadGuardInstalled = true;
}

function removeUnloadGuard(): void {
  if (!unloadGuardInstalled || typeof window === "undefined") return;
  window.removeEventListener("beforeunload", onBeforeUnload);
  unloadGuardInstalled = false;
}
