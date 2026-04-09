"use client";

import { useMemo } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./generated";
import {
  SPACETIMEDB_URI,
  SPACETIMEDB_MODULE,
  getStoredToken,
  storeToken,
  setConnection,
  clearConnection,
} from "./client";
import type { ReactNode } from "react";

interface SpacetimeProviderProps {
  children: ReactNode;
}

export function SpacetimeProvider({ children }: SpacetimeProviderProps) {
  // Build once — useMemo prevents re-creating the builder on every render.
  // SpacetimeDBProvider calls .build() internally on first mount.
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(SPACETIMEDB_URI)
        .withDatabaseName(SPACETIMEDB_MODULE)
        .withToken(getStoredToken())
        .onConnect((conn, _identity, token) => {
          storeToken(token);
          setConnection(conn);
          // Subscribe to all public tables
          conn
            .subscriptionBuilder()
            .subscribe([
              "SELECT * FROM organization",
              "SELECT * FROM user",
              "SELECT * FROM site",
              "SELECT * FROM site_page",
              "SELECT * FROM membership_tier",
              "SELECT * FROM membership_perk",
            ]);
        })
        .onDisconnect(() => {
          clearConnection();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      {children}
    </SpacetimeDBProvider>
  );
}

export { setConnection, clearConnection };
