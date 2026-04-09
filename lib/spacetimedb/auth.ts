// SpacetimeDB auth utilities — used by login/signup pages (outside SpacetimeProvider).
// These functions create an imperative DbConnection, not through the React provider.

import { DbConnection } from "./generated";
import { SPACETIMEDB_URI, SPACETIMEDB_MODULE, storeToken, getStoredToken } from "./client";

/** SHA-256 hash a password string — result is a lowercase hex string. */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface StdbAuthResult {
  conn: DbConnection;
  token: string;
}

/**
 * Open an imperative SpacetimeDB connection.
 * Pass `token` to restore an existing Identity; omit for a new anonymous Identity.
 * Stores the token in localStorage on connect.
 */
export function connectToStdb(token?: string): Promise<StdbAuthResult> {
  return new Promise((resolve, reject) => {
    const builder = DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .onConnect((conn, _identity, newToken) => {
        storeToken(newToken);
        resolve({ conn, token: newToken });
      })
      .onConnectError((_ctx, err) => {
        reject(err);
      });

    if (token) {
      builder.withToken(token);
    }

    builder.build();
  });
}

/**
 * Subscribe to the user table and wait for initial data, then resolve with the
 * calling identity's user row (if any).
 */
export function waitForUserRow(
  conn: DbConnection,
  timeoutMs = 5000
): Promise<{ email: string } | null> {
  return new Promise((resolve) => {
    const sub = conn
      .subscriptionBuilder()
      .onApplied(() => {
        const identity = conn.identity;
        if (!identity) { resolve(null); return; }
        const rows = [...(conn as any).clientCache?.getTable?.("user") ?? []];
        const row = rows.find(
          (r: any) => r.identity?.toString() === identity.toString()
        );
        resolve(row ? { email: row.email } : null);
      })
      .subscribe(["SELECT * FROM user", "SELECT * FROM org_member"]);

    setTimeout(() => {
      try { sub.unsubscribe(); } catch {}
      resolve(null);
    }, timeoutMs);
  });
}

/** Check if there is a stored SpacetimeDB token (client-only). */
export function hasStoredToken(): boolean {
  if (typeof window === "undefined") return false;
  return !!getStoredToken();
}
