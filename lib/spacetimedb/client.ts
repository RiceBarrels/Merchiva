// SpacetimeDB connection manager
//
// This file provides the connection config and a cached connection reference.
//
// IMPORTANT: `DbConnection` is code-generated per SpacetimeDB module.
// Once the Merchiva server module is generated (by the server-side session), import it:
//   import { DbConnection } from "@/lib/spacetimedb/generated";
//
// The `buildConnection` helper below is wired to be called from the provider
// using the generated DbConnection.builder() static method.

import type { DbConnectionImpl } from "spacetimedb/sdk";

export const SPACETIMEDB_URI =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";

export const SPACETIMEDB_MODULE =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "bizops";

/** Retrieves a persisted auth token from localStorage (client only). */
export function getStoredToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("stdb_token") ?? undefined;
}

/** Persists the auth token returned by onConnect. */
export function storeToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("stdb_token", token);
  }
}

/** Clears the persisted auth token (e.g. on logout). */
export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("stdb_token");
  }
}

// Active organization ID — set by AuthLoader once membership is resolved.
let _activeOrgId: string | null = null;

export function setActiveOrgId(id: string): void {
  _activeOrgId = id;
}

export function getActiveOrgId(): string {
  if (!_activeOrgId) throw new Error("Organization not loaded");
  return _activeOrgId;
}

// Single cached connection reference — populated by the provider on mount.
let _connection: DbConnectionImpl<any> | null = null;

export function setConnection(conn: DbConnectionImpl<any>): void {
  _connection = conn;
}

export function getConnection(): DbConnectionImpl<any> | null {
  return _connection;
}

export function clearConnection(): void {
  _connection = null;
}
