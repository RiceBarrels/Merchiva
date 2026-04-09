"use client";

// SpacetimeDB React provider
//
// IMPORTANT: This provider is a stub. Once the BizOps server module is
// code-generated, pass a `connectionBuilder` created from the generated
// `DbConnection.builder()` method:
//
//   import { DbConnection } from "@/lib/spacetimedb/generated";
//   const builder = DbConnection.builder()
//     .withUri(SPACETIMEDB_URI)
//     .withDatabaseName(SPACETIMEDB_MODULE)
//     .withToken(getStoredToken())
//     .onConnect((conn, identity, token) => { storeToken(token); });
//
// Then pass it as the `connectionBuilder` prop to <SpacetimeProvider>.

import { SpacetimeDBProvider } from "spacetimedb/react";
import type { DbConnectionBuilder, DbConnectionImpl } from "spacetimedb/sdk";
import { setConnection, clearConnection } from "./client";
import type { ReactNode } from "react";

interface SpacetimeProviderProps {
  connectionBuilder: DbConnectionBuilder<DbConnectionImpl<any>>;
  children: ReactNode;
}

export function SpacetimeProvider({
  connectionBuilder,
  children,
}: SpacetimeProviderProps) {
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}

export { setConnection, clearConnection };
