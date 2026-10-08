// The app's live connection as spreadsheet sessions use it (sheets.md §5.7). An open editor's store follows the
// connection itself, but a parked session outlives its editor: the keeper the signed-in app mounts once
// (lib/sheets/use-sheet-session-keeper.ts) publishes the connection here, and the session cache re-points every
// parked session at it, so one holding unsent edits follows a reconnect with no editor mounted. Kept apart from the
// cache, so the always-mounted keeper loads none of the sync code; for the same reason the /store operator flows reach
// the cache's flush through here (flushSheetEditsBeforeOperatorChange).
//
// Pure: no React.

import type { SheetConnection } from "./connection";

type Listener = (connection: SheetConnection | null) => void;

let current: SheetConnection | null = null;
const listeners = new Set<Listener>();

/** The live connection with the sheet tables published on it; null while offline or not published. */
export function publishSheetAppConnection(connection: SheetConnection | null): void {
  if (connection === current) return;
  current = connection;
  for (const listener of [...listeners]) listener(connection);
}

export function currentSheetAppConnection(): SheetConnection | null {
  return current;
}

/** Called on every change of the published connection. Returns the unsubscribe function. */
export function onSheetAppConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Before a store tablet's PIN operator changes ─────────────────────────────

let flushSessions: (() => Promise<boolean>) | null = null;

/** Set by the session cache when it loads (./session-cache.ts flushSheetSessions). */
export function setSheetSessionFlush(flush: () => Promise<boolean>): void {
  flushSessions = flush;
}

/**
 * For the /store sign-in and lock flows, awaited before this device's PIN operator changes: unsent sheet edits go out
 * while the outgoing operator's PIN still counts (the server refuses them afterwards). Bounded; true when nothing is
 * left unsaved, at once when no sheet was opened on this device.
 */
export function flushSheetEditsBeforeOperatorChange(): Promise<boolean> {
  return flushSessions ? flushSessions() : Promise.resolve(true);
}
