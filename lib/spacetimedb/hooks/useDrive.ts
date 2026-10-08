"use client";

// Drive read hook: folders and uploaded files (`drive_item`), the storage meter
// (`drive_usage`, plus the storage-accounting rows of useDriveStorage), stars, plus every Docs / Sheets / Slides document the actor
// may see — each evaluated for the actor, who is the PIN operator on /store.
//
// Works before `spacetime generate` and against a module without Drive: the
// status is then `not_published`, nothing Drive-specific is subscribed, the
// Drive lists stay empty and `isReady` is true, while documents keep coming
// from the Docs hooks. Subscriptions are scoped to the active store and open
// only once the Drive probe (lib/drive/queries.ts) applies.
//
// Notice acknowledgements are not read here: the notice gates use the thin
// useDriveNoticeAckRows (lib/spacetimedb/hooks.ts), so Docs screens don't mount
// all of Drive.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { docsGateAllows } from "@/lib/docs/access";
import { DocsBackendMonitor, type DocsBackendStatus, type DocsProbeConnection } from "@/lib/docs/backend-probe";
import type { DocAccess, DocAccessGrant, DocumentMeta } from "@/lib/docs/types";
import { driveAdminAccess, resolveDriveItemAccess, storeDeviceIsStoreOnly, type DriveClientActor } from "@/lib/drive/access";
import { useDriveActorOverride } from "@/lib/drive/actor-context";
import { mapDriveItem, mapDriveStar, mapDriveUsage, toDriveUsageView } from "@/lib/drive/mappers";
import { driveProbeQueries } from "@/lib/drive/queries";
import type { AppFileSize } from "@/lib/drive/storage-rows";
import type { DriveAdminAccess, DriveItem, DriveItemAccess, DriveUsageView } from "@/lib/drive/types";
import type { AppFileSource } from "@/lib/storage/sources";
import { refreshMyDriveAccess } from "@/lib/spacetimedb/actions/drive";
import { tables } from "@/lib/spacetimedb/generated";
import { useDriveItemRows, useDriveStarRows, useDriveUsageRows, useSpacetimeDB } from "@/lib/spacetimedb/hooks";
import {
  DOCS_BINDINGS_GENERATED,
  useCurrentMemberId,
  useDocuments,
  useLiveSpacetimeConnection,
  useSignedInMember,
} from "@/lib/spacetimedb/hooks/useDocs";
import { useDriveStorage } from "@/lib/spacetimedb/hooks/useDriveStorage";

// ── Backend availability ─────────────────────────────────────────────────────

export const DRIVE_TABLE_ACCESSORS = ["driveItem", "driveUsage", "driveStar", "driveNoticeAck"] as const;

/** Whether `lib/spacetimedb/generated` contains the Drive tables (and the Docs tables they build on). */
export const DRIVE_BINDINGS_GENERATED: boolean =
  DOCS_BINDINGS_GENERATED &&
  DRIVE_TABLE_ACCESSORS.every((accessor) => Boolean((tables as unknown as Record<string, unknown>)[accessor]));

export type DriveBackendStatus = DocsBackendStatus;

// Same monitor as Docs with the Drive query set: a module with Docs but without Drive reports not_published here only.
const backendMonitor = new DocsBackendMonitor({ bindingsGenerated: DRIVE_BINDINGS_GENERATED, queries: driveProbeQueries });

const getServerBackendStatus = (): DriveBackendStatus => (DRIVE_BINDINGS_GENERATED ? "checking" : "not_published");

/** Whether Drive can be used against the current SpacetimeDB connection. */
export function useDriveBackendStatus(): DriveBackendStatus {
  const conn: DocsProbeConnection | null = useLiveSpacetimeConnection();
  const subscribe = useCallback((onChange: () => void) => backendMonitor.subscribe(conn, onChange), [conn]);
  const getSnapshot = useCallback((): DriveBackendStatus => backendMonitor.status(conn), [conn]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerBackendStatus);
}

// ── Self-heal ────────────────────────────────────────────────────────────────

// refreshMyDriveAccess runs once per tab per (identity, store); a failed call is retried by the next mount.
const refreshedAccess = new Set<string>();
const refreshingAccess = new Set<string>();

function useRefreshMyDriveAccess(status: DriveBackendStatus, organizationId: string | null): void {
  const { identity } = useSpacetimeDB();
  const identityHex = identity ? identity.toHexString() : null;
  useEffect(() => {
    if (status !== "ready" || !organizationId || !identityHex) return;
    const key = `${identityHex}:${organizationId}`;
    if (refreshedAccess.has(key) || refreshingAccess.has(key)) return;
    refreshingAccess.add(key);
    refreshMyDriveAccess(organizationId)
      .then(() => {
        refreshedAccess.add(key);
      })
      .catch(() => {
        // Best effort: every member write keeps the indexes; this only repairs a missed one.
      })
      .finally(() => {
        refreshingAccess.delete(key);
      });
  }, [status, organizationId, identityHex]);
}

// ── useDrive ─────────────────────────────────────────────────────────────────

export interface UseDriveOptions {
  /** Evaluate everything for this member (the store tablet's PIN operator). Default: useCurrentMemberId(). */
  actorMemberId?: string | null;
}

export interface UseDriveResult {
  status: DriveBackendStatus;
  isReady: boolean;
  actor: DriveClientActor;
  /** The actor's "everyone's files" power. */
  admin: DriveAdminAccess;
  /** /store on a tablet whose signed-in account is not an owner or manager: only the Store space works there. */
  storeOnly: boolean;
  /** Every visible drive_item row, trashed and pending ones included. */
  items: DriveItem[];
  itemsById: ReadonlyMap<string, DriveItem>;
  /** Docs, Sheets and Slides files the actor can view, not trashed ("unknown" types left out). */
  documents: DocumentMeta[];
  /** Trashed documents of every type the actor manages. */
  trashedDocuments: DocumentMeta[];
  grants: DocAccessGrant[];
  starredItemIds: ReadonlySet<string>;
  starredDocumentIds: ReadonlySet<string>;
  /**
   * null until the storage rows are in and the store's drive_usage or org_storage_usage row exists. `breakdown` is
   * everything the store keeps; without the storage tables (an older module) documents and apps are null (unknown).
   */
  usage: DriveUsageView | null;
  /** Whether the module measures documents and app files (displayUsage leaves them unknown otherwise). */
  storageMeasured: boolean;
  /** Document id → stored bytes (content + kept versions); a document without a `document_size` row is absent. */
  documentSizes: ReadonlyMap<string, number>;
  /** appFileKeyHash(url) → the app file's size, source and type (`app_file`). */
  appFileSizes: ReadonlyMap<string, AppFileSize>;
  /** Bytes per app source over every app file of the store. */
  appBytesBySource: ReadonlyMap<AppFileSource, number>;
  accessForItem(item: DriveItem): DriveItemAccess;
  accessForDocument(doc: DocumentMeta): DocAccess;
}

export function useDrive(opts: UseDriveOptions = {}): UseDriveResult {
  const { role, permissions, organizationId } = usePermissions();
  const override = useDriveActorOverride();
  const signedIn = useSignedInMember();
  const currentMemberId = useCurrentMemberId();
  const memberId = opts.actorMemberId || currentMemberId;

  const status = useDriveBackendStatus();
  const gate = docsGateAllows(role, permissions);
  const scopedOrgId = gate && status === "ready" ? organizationId : null;
  useRefreshMyDriveAccess(status, organizationId);

  const [itemRows, itemsReady]: readonly [readonly unknown[], boolean] = useDriveItemRows(scopedOrgId);
  const [usageRows, usageReady]: readonly [readonly unknown[], boolean] = useDriveUsageRows(scopedOrgId);
  const [starRows, starsReady]: readonly [readonly unknown[], boolean] = useDriveStarRows(scopedOrgId);
  const docs = useDocuments({ fileTypes: "all", memberId: opts.actorMemberId });
  const storage = useDriveStorage(scopedOrgId);

  // Memoised on the flags: a new permissions object with the same values keeps every callback stable.
  const power = driveAdminAccess(role, permissions);
  const admin = useMemo((): DriveAdminAccess => ({ view: power.view, edit: power.edit }), [power.view, power.edit]);
  const actor = useMemo(
    (): DriveClientActor => ({
      organizationId,
      memberId,
      role: role ?? null,
      gate,
      canViewAll: admin.view,
      canEditAll: admin.edit,
    }),
    [organizationId, memberId, role, gate, admin],
  );
  const onStore = override !== null && override.actingMemberId !== "";
  const storeOnly = onStore && storeDeviceIsStoreOnly(signedIn.role);

  const items = useMemo(() => itemRows.map((row) => mapDriveItem(row)), [itemRows]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Nothing until the storage rows are in (or known to be absent): drive_usage alone leaves out Docs and app files,
  // so the meter and the upload preflight would read too low during the storage probe.
  const usage = useMemo(() => {
    if (!storage.settled) return null;
    for (const row of usageRows) {
      const mapped = mapDriveUsage(row);
      if (mapped.organizationId === organizationId) return toDriveUsageView(mapped, storage.orgUsage, storage.measured);
    }
    return toDriveUsageView(null, storage.orgUsage, storage.measured);
  }, [usageRows, organizationId, storage.settled, storage.orgUsage, storage.measured]);

  const starredItemIds = useMemo(() => {
    const ids = new Set<string>();
    if (!memberId) return ids;
    for (const row of starRows) {
      const star = mapDriveStar(row);
      if (star.memberId === memberId) ids.add(star.itemId);
    }
    return ids;
  }, [starRows, memberId]);

  const documents = useMemo(() => docs.docs.filter((doc) => doc.fileType !== "unknown"), [docs.docs]);

  const accessForItem = useCallback((item: DriveItem) => resolveDriveItemAccess(item, actor), [actor]);

  const driveSettled =
    !gate || status === "not_published" || (status === "ready" && (!scopedOrgId || (itemsReady && usageReady && starsReady && storage.settled)));
  // On /store, storeOnly reads the tablet account's role: wait for its org_member row, or an owner tablet would
  // briefly report a ready storeOnly: true.
  const isReady = driveSettled && docs.isReady && (!onStore || signedIn.ready);

  return useMemo(
    () => ({
      status,
      isReady,
      actor,
      admin,
      storeOnly,
      items,
      itemsById,
      documents,
      trashedDocuments: docs.trashed,
      grants: docs.grants,
      starredItemIds,
      starredDocumentIds: docs.starredIds,
      usage,
      storageMeasured: storage.measured,
      documentSizes: storage.documentSizes,
      appFileSizes: storage.appFileSizes,
      appBytesBySource: storage.appBytesBySource,
      accessForItem,
      accessForDocument: docs.accessFor,
    }),
    [status, isReady, actor, admin, storeOnly, items, itemsById, documents, docs, starredItemIds, usage, storage, accessForItem],
  );
}
