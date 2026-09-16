"use client";

// React binding for real-time document collaboration (backend spec §9, plan §B6).
//
// Wiring rules for the editor (required for correctness):
// - Collaboration.configure({ document: ydoc, field: "default" }) and
//   CollaborationCaret.configure({ provider, user: { name, color } }).
// - StarterKit.configure({ undoRedo: false }); never pass `content`; mount the
//   editor only once `synced` is true.
// - editor.setEditable(access.canEdit && !accessLost).
// - provider.setSerializer(() => ({ html, plainText, wordCount })) on create,
//   setSerializer(null) on destroy.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { useDocsBackendStatus, useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";
import { createDocConnection } from "./connection";
import { isDocumentId } from "./ids";
import {
  acquireDocSession,
  attachIdleDocSessions,
  releaseDocSession,
  type DocSession,
  type DocSessionInit,
  type DocSessionKey,
} from "./session-cache";
import type { SpacetimeYjsProvider } from "./spacetime-provider";
import type { DocConnection, DocPeer, DocProviderError, DocSyncStatus } from "./sync-types";
import type { DocErrorCode } from "./types";

export interface UseDocumentCollaborationArgs {
  documentId: string | null;
  organizationId: string | null;
  memberId: string | null;
  user: { name: string; color: string } | null;
  readOnly: boolean;
}

export interface DocumentCollaboration {
  ydoc: Y.Doc | null;
  provider: SpacetimeYjsProvider | null;
  status: DocSyncStatus;
  /** Mount the Tiptap editor ONLY after this is true. */
  synced: boolean;
  peers: DocPeer[];
  error: DocProviderError | null;
  accessLost: DocErrorCode | null;
}

/** Matches the server's DOC_PRESENCE_DEFAULT_COLOR; used until the member's name/color are known. */
const FALLBACK_COLOR = "#57534e";
const NO_PEERS: DocPeer[] = [];

const IDLE: DocumentCollaboration = Object.freeze({
  ydoc: null,
  provider: null,
  status: "connecting",
  synced: false,
  peers: NO_PEERS,
  error: null,
  accessLost: null,
}) as DocumentCollaboration;

const NOT_PUBLISHED: DocProviderError = Object.freeze({
  code: "not_published",
  message: "Docs is not available on this server yet",
}) as DocProviderError;

const getServerSnapshot = (): DocumentCollaboration => IDLE;

function sameSnapshot(a: DocumentCollaboration, b: DocumentCollaboration): boolean {
  return (
    a.ydoc === b.ydoc &&
    a.provider === b.provider &&
    a.status === b.status &&
    a.synced === b.synced &&
    a.peers === b.peers &&
    a.error === b.error &&
    a.accessLost === b.accessLost
  );
}

/**
 * External store behind useDocumentCollaboration: owns one acquired session at a
 * time, forwards connection/user/read-only changes to its provider and turns
 * provider events into immutable snapshots. Exported for tests.
 */
export class DocCollaborationStore {
  private session: DocSession | null = null;
  private offProviderEvents: Array<() => void> = [];
  private connection: DocConnection | null = null;
  private connectionError: DocProviderError | null = null;
  private user: { name: string; color: string } = { name: "", color: FALLBACK_COLOR };
  private readOnly = true;
  private snapshot: DocumentCollaboration = IDLE;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly sessionOptions: Pick<DocSessionInit, "transport" | "tuning"> = {}) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DocumentCollaboration => this.snapshot;

  open(key: DocSessionKey): void {
    this.close();
    const session = acquireDocSession(key, { user: this.user, readOnly: this.readOnly, ...this.sessionOptions });
    this.session = session;
    const { provider } = session;
    this.offProviderEvents = [
      provider.on("status", this.refresh),
      provider.on("synced", this.refresh),
      provider.on("peers", this.refresh),
      provider.on("error", this.refresh),
      provider.on("accessLost", this.refresh),
    ];
    // A cached session may still carry the settings it was parked with.
    provider.setUser(this.user);
    provider.setReadOnly(this.readOnly);
    provider.attach(this.connection);
    this.refresh();
  }

  close(): void {
    const session = this.session;
    if (!session) return;
    for (const off of this.offProviderEvents) off();
    this.offProviderEvents = [];
    this.session = null;
    releaseDocSession(session);
    this.refresh();
  }

  /**
   * `connection` is null while offline, still checking, or not published (`error` says which).
   * Parked sessions follow too, so none of them stays on a closed socket.
   */
  setConnection(connection: DocConnection | null, error: DocProviderError | null): void {
    this.connection = connection;
    this.connectionError = error;
    attachIdleDocSessions(connection);
    this.session?.provider.attach(connection);
    this.refresh();
  }

  setUser(user: { name: string; color: string }): void {
    this.user = { name: user.name, color: user.color };
    this.session?.provider.setUser(this.user);
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.session?.provider.setReadOnly(readOnly);
  }

  private refresh = (): void => {
    const session = this.session;
    const next: DocumentCollaboration = session
      ? {
          ydoc: session.ydoc,
          provider: session.provider,
          status: session.provider.status,
          synced: session.provider.synced,
          peers: session.provider.peers,
          error: this.connectionError ?? session.provider.lastError,
          accessLost: session.provider.accessLostCode,
        }
      : IDLE;
    if (sameSnapshot(next, this.snapshot)) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  };
}

export function useDocumentCollaboration(args: UseDocumentCollaborationArgs): DocumentCollaboration {
  const { documentId, organizationId, memberId, user, readOnly } = args;
  const [store] = useState(() => new DocCollaborationStore());

  // null as soon as the socket closes, even while useSpacetimeDB().isActive is stale → providers go offline.
  const rawConnection = useLiveSpacetimeConnection();
  const backendStatus = useDocsBackendStatus();
  const docConnection = useMemo(() => (rawConnection ? createDocConnection(rawConnection) : null), [rawConnection]);
  // Connected, but the generated bindings have no docs tables, or the module on the server doesn't.
  const notPublished = (rawConnection !== null && docConnection === null) || backendStatus === "not_published";
  const liveConnection = backendStatus === "ready" ? docConnection : null;

  const userName = user?.name ?? "";
  const userColor = user?.color ?? FALLBACK_COLOR;
  const key = documentId && isDocumentId(documentId) ? documentId.toLowerCase() : null;

  // Declared before the session effect so a newly opened session starts with the latest values.
  useEffect(() => {
    store.setUser({ name: userName, color: userColor });
  }, [store, userName, userColor]);

  useEffect(() => {
    store.setReadOnly(readOnly);
  }, [store, readOnly]);

  useEffect(() => {
    store.setConnection(liveConnection, notPublished ? NOT_PUBLISHED : null);
  }, [store, liveConnection, notPublished]);

  useEffect(() => {
    if (!key || !organizationId || !memberId) return;
    store.open({ documentId: key, organizationId, memberId });
    return () => store.close();
  }, [store, key, organizationId, memberId]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}
