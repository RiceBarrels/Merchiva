// Keeps recently closed documents warm (plan D45, §B6).
//
// Switching browser tabs remounts the editor. Instead of throwing the Y.Doc and
// its subscription away, the last release parks the session: presence is
// withdrawn, sync keeps running, and the session is destroyed after 30 s idle.
// At most 3 idle sessions are kept (least recently released evicted first).
// A session that still has edits it can save is never evicted — it stays until
// its edits reach the server. Edits a session can never save (access lost,
// read-only) don't pin it, and don't arm the unload guard.
//
// A session whose access was lost is destroyed on release and replaced on the
// next acquire, so reopening a document after access returns starts clean.
//
// Internal to lib/docs/use-document-collaboration.ts; exported for tests.

import * as Y from "yjs";
import { SpacetimeYjsProvider, type DocProviderTuning } from "./spacetime-provider";
import type { DocConnection, DocTransport } from "./sync-types";
import { spacetimeDocTransport } from "./transport";

export const DOC_SESSION_IDLE_MS = 30_000;
export const DOC_SESSION_MAX_IDLE = 3;

export interface DocSessionKey {
  documentId: string;
  organizationId: string;
  memberId: string;
}

export interface DocSession {
  readonly key: string;
  readonly ydoc: Y.Doc;
  readonly provider: SpacetimeYjsProvider;
}

export interface DocSessionInit {
  user: { name: string; color: string };
  readOnly: boolean;
  /** Defaults to the SpacetimeDB reducer transport. */
  transport?: DocTransport;
  tuning?: Partial<DocProviderTuning>;
}

interface Entry {
  readonly session: DocSession;
  refs: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Release order, for least-recently-used eviction. */
  releasedSeq: number;
}

const entries = new Map<string, Entry>();
let releaseSeq = 0;
let unloadGuardInstalled = false;

/** Stable cache key: a different org or member always gets a different session. */
export function docSessionKey(key: DocSessionKey): string {
  return JSON.stringify([key.organizationId, key.memberId, key.documentId.toLowerCase()]);
}

/** Unsaved edits this session can still get to the server. */
function holdsSaveableEdits(provider: SpacetimeYjsProvider): boolean {
  return provider.accessLostCode === null && !provider.isReadOnly && provider.hasUnsavedChanges();
}

export function acquireDocSession(key: DocSessionKey, init: DocSessionInit): DocSession {
  const id = docSessionKey(key);
  const existing = entries.get(id);
  if (existing && existing.refs === 0 && existing.session.provider.accessLostCode !== null) {
    evict(existing); // lost access while parked: start over with a fresh provider
  } else if (existing) {
    existing.refs += 1;
    if (existing.refs === 1) {
      clearIdleTimer(existing);
      const { provider } = existing.session;
      provider.setUser(init.user);
      provider.setReadOnly(init.readOnly);
      provider.setPresenceActive(true);
    }
    return existing.session;
  }

  const ydoc = new Y.Doc();
  let provider: SpacetimeYjsProvider;
  try {
    provider = new SpacetimeYjsProvider(ydoc, {
      documentId: key.documentId,
      organizationId: key.organizationId,
      memberId: key.memberId,
      user: init.user,
      readOnly: init.readOnly,
      transport: init.transport ?? spacetimeDocTransport,
      tuning: init.tuning,
    });
  } catch (err) {
    ydoc.destroy();
    throw err;
  }
  const session: DocSession = Object.freeze({ key: id, ydoc, provider });
  entries.set(id, { session, refs: 1, idleTimer: null, releasedSeq: 0 });
  installUnloadGuard();
  return session;
}

export function releaseDocSession(session: DocSession): void {
  const entry = entries.get(session.key);
  if (!entry || entry.session !== session || entry.refs === 0) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (entry.session.provider.accessLostCode !== null) {
    evict(entry); // read-only for good; nothing worth keeping warm
    return;
  }
  entry.session.provider.setPresenceActive(false);
  entry.releasedSeq = ++releaseSeq;
  scheduleIdleEviction(entry);
  enforceIdleCap();
}

/**
 * Points every parked session at `connection` (null detaches them → offline).
 * Open sessions follow their own store; called by DocCollaborationStore whenever
 * the app connection changes, so parked sessions never stay on a dead socket.
 */
export function attachIdleDocSessions(connection: DocConnection | null): void {
  for (const entry of [...entries.values()]) {
    if (entry.refs === 0) entry.session.provider.attach(connection);
  }
}

/** True while any open or idle session still has edits the server hasn't confirmed and could still accept. */
export function hasUnsavedDocSessions(): boolean {
  for (const entry of entries.values()) {
    if (holdsSaveableEdits(entry.session.provider)) return true;
  }
  return false;
}

/** Cache size, for tests. */
export function __docSessionStatsForTests(): { total: number; idle: number } {
  let idle = 0;
  for (const entry of entries.values()) if (entry.refs === 0) idle++;
  return { total: entries.size, idle };
}

export function __resetDocSessionsForTests(): void {
  for (const entry of [...entries.values()]) evict(entry);
  entries.clear();
  releaseSeq = 0;
  removeUnloadGuard();
}

function scheduleIdleEviction(entry: Entry): void {
  clearIdleTimer(entry);
  entry.idleTimer = setTimeout(() => {
    entry.idleTimer = null;
    if (entries.get(entry.session.key) !== entry || entry.refs > 0) return;
    if (holdsSaveableEdits(entry.session.provider)) {
      scheduleIdleEviction(entry); // still saving (or offline): check again later
      return;
    }
    evict(entry);
  }, DOC_SESSION_IDLE_MS);
}

function enforceIdleCap(): void {
  const idle = [...entries.values()].filter((e) => e.refs === 0).sort((a, b) => a.releasedSeq - b.releasedSeq);
  let excess = idle.length - DOC_SESSION_MAX_IDLE;
  for (const entry of idle) {
    if (excess <= 0) break;
    if (holdsSaveableEdits(entry.session.provider)) continue;
    evict(entry);
    excess -= 1;
  }
}

function evict(entry: Entry): void {
  clearIdleTimer(entry);
  if (entries.get(entry.session.key) === entry) entries.delete(entry.session.key);
  try {
    entry.session.provider.destroy();
  } finally {
    entry.session.ydoc.destroy();
  }
  if (entries.size === 0) removeUnloadGuard();
}

function clearIdleTimer(entry: Entry): void {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedDocSessions()) return;
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
