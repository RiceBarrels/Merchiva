// SpacetimeDB connection for the TUI.
//
// Reuses the SAME generated DbConnection the web app uses, so the CLI reads
// the exact same live tables. Auth token resolution (first match wins):
//   1. ~/.merchiva/config.json  token
//   2. MERCHIVA_TOKEN env
//   3. SPACETIMEDB_SERVICE_TOKEN env (.env.local, auto-loaded by Bun)
//
// Without a token the builder still attempts an anonymous connection; the UI
// renders a "not connected" state, mirroring the web's connecting screen.

import { DbConnection } from "../../../lib/spacetimedb/generated/index.ts";
import { loadConfig } from "../../lib/config.ts";

const URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ??
  "c200b446cd88a8dfa10c16c03d8f315007c61f331ff36bd711acba146a2f43aa";

export function resolveToken(): string | undefined {
  return (
    loadConfig().token ||
    process.env.MERCHIVA_TOKEN ||
    process.env.SPACETIMEDB_SERVICE_TOKEN ||
    undefined
  );
}

// True when connecting as a real signed-in user (vs. the service/admin token).
// Drives permission enforcement — service mode gets full access.
export function isUserMode(): boolean {
  return Boolean(loadConfig().token || process.env.MERCHIVA_TOKEN);
}

export type ConnStatus = "connecting" | "connected" | "error";
export interface ConnState {
  status: ConnStatus;
  error?: string;
  identity?: string;
  hasToken: boolean;
}

let state: ConnState = { status: "connecting", hasToken: Boolean(resolveToken()) };
const listeners = new Set<() => void>();

function emit(patch: Partial<ConnState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribeConn(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getConnState(): ConnState {
  return state;
}

// Build the connection builder handed to <SpacetimeDBProvider>. The provider
// calls .build() internally; we attach lifecycle callbacks to surface status.
export function buildConnectionBuilder() {
  const token = resolveToken();
  let b = DbConnection.builder().withUri(URI).withDatabaseName(MODULE);
  if (token) b = b.withToken(token);
  return b
    .onConnect((_conn: unknown, identity: unknown) => {
      let hex: string | undefined;
      try {
        const id = identity as { toHexString?: () => string };
        hex = id?.toHexString?.();
      } catch {
        /* ignore */
      }
      emit({ status: "connected", identity: hex });
    })
    .onConnectError((_ctx: unknown, err: unknown) => {
      emit({ status: "error", error: err instanceof Error ? err.message : String(err) });
    });
}
