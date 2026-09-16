// Contracts shared by the SpacetimeDB data layer (lib/docs/connection.ts,
// lib/docs/transport.ts) and the Yjs sync provider (lib/docs/spacetime-provider.ts).
// They live in their own module so neither side imports the other.

import type { DocErrorCode, DocPresenceRow, DocSerialized, DocSnapshotRow, DocUpdateRow, DocVersionKind } from "./types";

export type DocSyncStatus = "connecting" | "syncing" | "saving" | "saved" | "offline" | "error";

export interface DocPeer {
  yClientId: number; memberId: string; name: string; color: string; canEdit: boolean; isSelf: boolean;
}
export interface DocProviderError {
  code: DocErrorCode | "subscription" | "apply" | "unknown"; message: string; cause?: unknown;
}

export interface DocTableHandle<Row> {
  iter(): Iterable<Row>;
  onInsert(cb: (ctx: unknown, row: Row) => void): void;
  removeOnInsert(cb: (ctx: unknown, row: Row) => void): void;
  onDelete(cb: (ctx: unknown, row: Row) => void): void;
  removeOnDelete(cb: (ctx: unknown, row: Row) => void): void;
  onUpdate(cb: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
  removeOnUpdate(cb: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
}
export interface DocSubscriptionHandle { unsubscribe(): void; isActive(): boolean; isEnded(): boolean }
export interface DocSubscriptionBuilder {
  onApplied(cb: () => void): DocSubscriptionBuilder;
  onError(cb: (ctx: unknown) => void): DocSubscriptionBuilder;
  subscribe(queries: string[]): DocSubscriptionHandle;
}
export interface DocConnection {
  connectionIdHex: string;
  db: {
    documentUpdate: DocTableHandle<DocUpdateRow>;
    documentSnapshot: DocTableHandle<DocSnapshotRow>;
    documentPresence: DocTableHandle<DocPresenceRow>;
  };
  subscriptionBuilder(): DocSubscriptionBuilder;
}

export interface DocTransport {
  pushUpdate(documentId: string, sessionId: string, payload: Uint8Array): Promise<void>;
  compact(input: { documentId: string; throughUpdateId: bigint; state: Uint8Array } & DocSerialized): Promise<void>;
  saveVersion(input: { documentId: string; kind: DocVersionKind; name?: string; state: Uint8Array; throughUpdateId: bigint; wordCount: number }): Promise<void>;
  upsertPresence(input: { documentId: string; yClientId: number; name: string; color: string; awareness: Uint8Array }): Promise<void>;
  removePresence(documentId: string, yClientId: number): Promise<void>;
}
