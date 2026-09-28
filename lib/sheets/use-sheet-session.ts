"use client";

// React binding of a spreadsheet session (sheets.md §7.4). It acquires the document's SheetSyncSession from the cache
// (lib/sheets/sync/session-cache.ts), attaches it to the live app connection once the sheet tables are published,
// forwards the user / access changes, and mirrors the session's state with useSyncExternalStore. Unmounting releases
// the session, which parks it (the model is saved first) so a browser-shell tab switch keeps the lease.
//
// Components get the facade only: they never open subscriptions or touch the connection, and write through the
// lib/spacetimedb/actions* wrappers or the session's own methods. The editor hands its model adapter to
// `facade.bindModel(adapter)` once Univer is up, and `bindModel(null)` before it disposes Univer; the store keeps
// the adapter bound across session changes (another operator, a re-open).

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isDocumentId } from "@/lib/docs/ids";
import type { DocPeer } from "@/lib/docs/sync-types";
import type { DocAccess, DocErrorCode, DocumentMeta } from "@/lib/docs/types";
import type { SheetLeaseView } from "@/lib/sheets/lease";
import { createSheetConnection, type SheetConnection } from "@/lib/sheets/sync/connection";
import { LOADING_VIEW } from "@/lib/sheets/sync/lease-controller";
import type { SheetOpAcceptor } from "@/lib/sheets/sync/remote-apply";
import type { SheetLoadState, SheetSizeWarning, SheetSyncSession } from "@/lib/sheets/sync/session";
import {
  acquireSheetSession, attachIdleSheetSessions, releaseSheetSession, type SheetSessionInit, type SheetSessionKey,
} from "@/lib/sheets/sync/session-cache";
import { spacetimeSheetTransport } from "@/lib/sheets/sync/transport";
import type { SheetModelAdapter, SheetSyncStatus } from "@/lib/sheets/types";
import { useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";
import { useSheetsBackendStatus } from "@/lib/spacetimedb/hooks/useSheets";

export interface UseSheetSessionInput {
  doc: DocumentMeta;
  /** The route's access (the device ceiling already intersected, lib/sheets/access.ts). */
  access: DocAccess;
  user: { name: string; color: string };
  /** The signed-in account's member (the tablet account on /store). */
  memberId: string;
  /** actorMemberId: who edits (the PIN operator on /store, else memberId); actingMemberId: '' off /store. */
  actor: { actorMemberId: string; actingMemberId: string };
  /** Desktop and tablet take a free lease on open; phones open read-only (sheets.md §5.4). */
  autoAcquire: boolean;
  /** acceptRemoteOp of lib/sheets/univer/mutation-filter.ts (the editor chunk passes it). */
  acceptRemoteOp: SheetOpAcceptor;
}

export interface SheetSessionFacade {
  /** Null until the session is acquired (after the first commit), and for a non-sheet document. */
  session: SheetSyncSession | null;
  status: SheetSyncStatus;
  lease: SheetLeaseView;
  peers: DocPeer[];
  diverged: boolean;
  updateRequired: boolean;
  loadState: SheetLoadState;
  reloading: boolean;
  accessLost: DocErrorCode | null;
  sizeWarning: SheetSizeWarning | null;
  hasUnsavedChanges: boolean;
  /** Stable. Binds the editor's model to whichever session is open; null (the editor unmounts) parks it first. */
  bindModel: (model: SheetModelAdapter | null) => void;
}

const NO_PEERS: DocPeer[] = [];

/** No session yet. Every facade a store hands out carries that store's own bindModel, from the first render on. */
const IDLE: Omit<SheetSessionFacade, "bindModel"> = Object.freeze({
  session: null, status: "connecting", lease: LOADING_VIEW, peers: NO_PEERS, diverged: false, updateRequired: false,
  loadState: "loading", reloading: false, accessLost: null, sizeWarning: null, hasUnsavedChanges: false,
});

function facadeOf(session: SheetSyncSession | null, bindModel: SheetSessionFacade["bindModel"]): SheetSessionFacade {
  if (!session) return { ...IDLE, bindModel };
  return {
    session, status: session.status, lease: session.lease, peers: session.peers, diverged: session.diverged,
    updateRequired: session.updateRequired, loadState: session.loadState, reloading: session.reloading,
    accessLost: session.accessLost, sizeWarning: session.sizeWarning, hasUnsavedChanges: session.hasUnsavedChanges, bindModel,
  };
}

function sameFacade(a: SheetSessionFacade, b: SheetSessionFacade): boolean {
  return (Object.keys(a) as Array<keyof SheetSessionFacade>).every((key) => a[key] === b[key]);
}

/** Owns one acquired session at a time and turns its events into immutable snapshots. Exported for tests. */
export class SheetSessionStore {
  private session: SheetSyncSession | null = null;
  private model: SheetModelAdapter | null = null;
  private off: (() => void) | null = null;
  private connection: SheetConnection | null = null;
  private user = { name: "", color: "" };
  private canEdit = false;
  private options: Pick<SheetSessionInit, "autoAcquire" | "acceptRemoteOp"> | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Kept for the next open(): a model bound before any session exists (the editor mounts first) is not lost. */
  bindModel = (model: SheetModelAdapter | null): void => {
    if (model === this.model) return;
    this.model = model;
    if (!this.session) return;
    // Unbinding saves the workbook while Univer is still alive (the park), so a return skips the decode.
    if (model) void this.session.bindModel(model);
    else this.session.parkModel();
  };

  /** Declared after bindModel: field initializers run in order, and the idle facade carries it. */
  private readonly idle: SheetSessionFacade = facadeOf(null, this.bindModel);
  private snapshot: SheetSessionFacade = this.idle;

  getSnapshot = (): SheetSessionFacade => this.snapshot;
  /** The hydration render: this store's idle facade (stable), so its bindModel is the store's as well. */
  getServerSnapshot = (): SheetSessionFacade => this.idle;

  /** Read when a session opens: changing them never re-opens one (acceptRemoteOp must be a stable function). */
  setOptions(options: Pick<SheetSessionInit, "autoAcquire" | "acceptRemoteOp">): void {
    this.options = options;
  }

  open(key: SheetSessionKey, init: Omit<SheetSessionInit, "user" | "canEdit" | "autoAcquire" | "acceptRemoteOp">): void {
    this.close();
    if (!this.options) return;
    const session = acquireSheetSession(key, { ...init, ...this.options, user: this.user, canEdit: this.canEdit });
    this.session = session;
    this.off = session.on("changed", this.refresh);
    session.attach(this.connection);
    if (this.model) void session.bindModel(this.model);
    this.refresh();
  }

  close(): void {
    const session = this.session;
    if (!session) return;
    this.off?.();
    this.off = null;
    this.session = null;
    releaseSheetSession(session);
    this.refresh();
  }

  /**
   * null while offline or not published. Parked sessions follow too, so none stays on a closed socket (with no editor
   * mounted they follow the app's connection, lib/sheets/use-sheet-session-keeper.ts).
   */
  setConnection(connection: SheetConnection | null): void {
    this.connection = connection;
    attachIdleSheetSessions(connection);
    this.session?.attach(connection);
  }

  setUser(user: { name: string; color: string }): void {
    this.user = { name: user.name, color: user.color };
    this.session?.setUser(this.user);
  }

  setCanEdit(canEdit: boolean): void {
    this.canEdit = canEdit;
    this.session?.setCanEdit(canEdit);
  }

  private refresh = (): void => {
    const next = facadeOf(this.session, this.bindModel);
    if (sameFacade(next, this.snapshot)) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  };
}

export function useSheetSession(input: UseSheetSessionInput): SheetSessionFacade {
  const { doc, access, user, memberId, actor, autoAcquire, acceptRemoteOp } = input;
  const [store] = useState(() => new SheetSessionStore());
  const rawConnection = useLiveSpacetimeConnection();
  const backendStatus = useSheetsBackendStatus();
  const sheetConnection = useMemo(() => (rawConnection ? createSheetConnection(rawConnection) : null), [rawConnection]);
  const liveConnection = backendStatus === "ready" ? sheetConnection : null;
  const documentId = doc.fileType === "sheet" && isDocumentId(doc.id) ? doc.id.toLowerCase() : null;
  const { organizationId } = doc;
  const { actorMemberId, actingMemberId } = actor;

  // Declared before the session effect, so a newly opened session starts with the latest values.
  useEffect(() => {
    store.setUser({ name: user.name, color: user.color });
  }, [store, user.name, user.color]);

  useEffect(() => {
    store.setCanEdit(access.canEdit);
  }, [store, access.canEdit]);

  useEffect(() => {
    store.setOptions({ autoAcquire, acceptRemoteOp });
  }, [store, autoAcquire, acceptRemoteOp]);

  useEffect(() => {
    store.setConnection(liveConnection);
  }, [store, liveConnection]);

  useEffect(() => {
    if (!documentId || !organizationId || !memberId) return;
    store.open(
      { documentId, organizationId, memberId, actingMemberId },
      { actorMemberId: actorMemberId || memberId, transport: spacetimeSheetTransport },
    );
    return () => store.close();
  }, [store, documentId, organizationId, memberId, actingMemberId, actorMemberId]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
