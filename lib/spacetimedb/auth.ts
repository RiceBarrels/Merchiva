// SpacetimeDB connection utilities — used outside the React provider context
// (e.g. invite validation on the signup page).
// Authentication is now handled by SpacetimeAuth (OIDC); the OIDC id_token is
// passed to SpacetimeDB via withToken() in the provider.

import { DbConnection } from "./generated";
import { SPACETIMEDB_URI, SPACETIMEDB_MODULE, storeToken, getStoredToken } from "./client";

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

/** Check if there is a stored SpacetimeDB token (client-only). */
export function hasStoredToken(): boolean {
  if (typeof window === "undefined") return false;
  return !!getStoredToken();
}
