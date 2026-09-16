"use client";

// Docs read hooks (docs home, editor, New Tab page, shell recents).
//
// Subscriptions are always scoped — org-wide for document/star/access rows,
// per document for comments and versions — and only open while the caller is
// mounted, the Docs gate passes, and the server module actually has the docs
// tables. Before `spacetime generate` / `spacetime publish` every hook returns
// empty results with `isReady: true` and `backendStatus: "not_published"`, so
// screens can show a not-published state instead of spinning.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { docsGateAllows, NO_DOC_ACCESS, resolveDocAccess } from "@/lib/docs/access";
import { DocsBackendMonitor, type DocsBackendStatus, type DocsProbeConnection } from "@/lib/docs/backend-probe";
import { isDocConnectionDown, onDocConnectionDown } from "@/lib/docs/connection";
import { documentHref } from "@/lib/docs/hrefs";
import { isDocumentId } from "@/lib/docs/ids";
import {
  groupDocCommentThreads,
  idString,
  mapComment,
  mapDocument,
  mapGrant,
  mapStar,
  mapVersion,
} from "@/lib/docs/mappers";
import { useLastOpenedMap } from "@/lib/docs/recent";
import type {
  DocAccess,
  DocAccessGrant,
  DocCommentThread,
  DocVersion,
  DocumentMeta,
  RecentDocumentItem,
} from "@/lib/docs/types";
import { tables } from "@/lib/spacetimedb/generated";
import {
  useDocumentAccessRows,
  useDocumentCommentRows,
  useDocumentRows,
  useDocumentStarRows,
  useDocumentVersionRows,
  useOrgMembers,
  useSpacetimeDB,
} from "@/lib/spacetimedb/hooks";

export type { DocsBackendStatus } from "@/lib/docs/backend-probe";

// ── Backend availability ─────────────────────────────────────────────────────

const DOC_TABLE_ACCESSORS = [
  "document",
  "documentUpdate",
  "documentSnapshot",
  "documentPresence",
  "documentComment",
  "documentVersion",
  "documentStar",
  "documentAccess",
] as const;

/** Whether `lib/spacetimedb/generated` contains the docs tables. */
export const DOCS_BINDINGS_GENERATED: boolean = DOC_TABLE_ACCESSORS.every((accessor) =>
  Boolean((tables as unknown as Record<string, unknown>)[accessor]),
);

type LiveConnection = NonNullable<ReturnType<ReturnType<typeof useSpacetimeDB>["getConnection"]>>;

const noop = (): void => {};
const getServerLive = (): boolean => false;

/**
 * The app's SpacetimeDB connection while its socket is actually open, else null.
 * `useSpacetimeDB().isActive` can stay true after a drop (lib/docs/connection.ts),
 * so this also follows the connection's own disconnect / connect-error events.
 */
export function useLiveSpacetimeConnection(): LiveConnection | null {
  const stdb = useSpacetimeDB();
  const candidate = stdb.isActive ? stdb.getConnection() : null;
  const subscribe = useCallback(
    (onChange: () => void) => (candidate ? onDocConnectionDown(candidate, onChange) : noop),
    [candidate],
  );
  const getSnapshot = useCallback(() => candidate !== null && !isDocConnectionDown(candidate), [candidate]);
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerLive);
  return live ? candidate : null;
}

// Probes each connection once (retrying transient failures, re-checking not_published); lib/docs/backend-probe.ts.
const backendMonitor = new DocsBackendMonitor({ bindingsGenerated: DOCS_BINDINGS_GENERATED });

// Bindings are a module constant, so this matches the client's first snapshot.
const getServerBackendStatus = (): DocsBackendStatus => (DOCS_BINDINGS_GENERATED ? "checking" : "not_published");

/** Whether Docs can be used against the current SpacetimeDB connection. */
export function useDocsBackendStatus(): DocsBackendStatus {
  const conn: DocsProbeConnection | null = useLiveSpacetimeConnection();
  const subscribe = useCallback((onChange: () => void) => backendMonitor.subscribe(conn, onChange), [conn]);
  const getSnapshot = useCallback((): DocsBackendStatus => backendMonitor.status(conn), [conn]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerBackendStatus);
}

// ── Current member ───────────────────────────────────────────────────────────

function useCurrentMember(): { memberId: string | null; ready: boolean } {
  const { identity } = useSpacetimeDB();
  const { organizationId } = usePermissions();
  const [members, membersReady] = useOrgMembers();
  const memberId = useMemo(() => {
    if (!identity || !organizationId) return null;
    const me = identity.toHexString();
    const row = members.find(
      (m) => m.organizationId === organizationId && m.status === "active" && m.userId.toHexString() === me,
    );
    return row ? idString(row.id) : null;
  }, [identity, organizationId, members]);
  return { memberId, ready: membersReady || memberId !== null };
}

/** The caller's active org_member id in the current org (null until known). */
export function useCurrentMemberId(): string | null {
  return useCurrentMember().memberId;
}

// ── Documents ────────────────────────────────────────────────────────────────

const EMPTY_GRANTS: readonly DocAccessGrant[] = Object.freeze([]);

interface DocsCore {
  status: DocsBackendStatus;
  gate: boolean;
  organizationId: string | null;
  allDocs: DocumentMeta[];
  grants: DocAccessGrant[];
  starredIds: ReadonlySet<string>;
  accessFor: (doc: DocumentMeta) => DocAccess;
  isReady: boolean;
}

function useDocsCore(): DocsCore {
  const { role, permissions, organizationId } = usePermissions();
  const status = useDocsBackendStatus();
  const gate = docsGateAllows(role, permissions);
  const scopedOrgId = gate && status === "ready" ? organizationId : null;
  const { memberId, ready: memberReady } = useCurrentMember();

  const [docRows, docsReady]: readonly [readonly unknown[], boolean] = useDocumentRows(scopedOrgId);
  const [starRows, starsReady]: readonly [readonly unknown[], boolean] = useDocumentStarRows(scopedOrgId);
  const [accessRows, accessReady]: readonly [readonly unknown[], boolean] = useDocumentAccessRows(scopedOrgId);

  const allDocs = useMemo(() => docRows.map((row) => mapDocument(row)), [docRows]);

  const grants = useMemo(() => {
    const out: DocAccessGrant[] = [];
    for (const row of accessRows) {
      const grant = mapGrant(row);
      if (grant) out.push(grant);
    }
    return out;
  }, [accessRows]);

  const grantsByDoc = useMemo(() => {
    const byDoc = new Map<string, DocAccessGrant[]>();
    for (const grant of grants) {
      const list = byDoc.get(grant.documentId);
      if (list) list.push(grant);
      else byDoc.set(grant.documentId, [grant]);
    }
    return byDoc;
  }, [grants]);

  const starredIds = useMemo(() => {
    const ids = new Set<string>();
    if (!memberId) return ids;
    for (const row of starRows) {
      const star = mapStar(row);
      if (star.memberId === memberId) ids.add(star.documentId);
    }
    return ids;
  }, [starRows, memberId]);

  const accessFor = useCallback(
    (doc: DocumentMeta): DocAccess =>
      resolveDocAccess({ doc, memberId, orgRole: role, permissions, grants: grantsByDoc.get(doc.id) ?? EMPTY_GRANTS }),
    [memberId, role, permissions, grantsByDoc],
  );

  const isReady =
    !gate ||
    status === "not_published" ||
    (status === "ready" && (!scopedOrgId || (docsReady && starsReady && accessReady && memberReady)));

  return { status, gate, organizationId, allDocs, grants, starredIds, accessFor, isReady };
}

export interface UseDocumentsResult {
  /** Documents the caller can view, not trashed, most recently updated first. */
  docs: DocumentMeta[];
  /** Trashed documents the caller manages, most recently trashed first. */
  trashed: DocumentMeta[];
  /** Documents the caller starred. */
  starredIds: ReadonlySet<string>;
  /** Every grant in the org (for the share dialog). */
  grants: DocAccessGrant[];
  accessFor(doc: DocumentMeta): DocAccess;
  isReady: boolean;
  backendStatus: DocsBackendStatus;
}

export function useDocuments(): UseDocumentsResult {
  const { status, allDocs, grants, starredIds, accessFor, isReady } = useDocsCore();
  const lists = useMemo(() => {
    const docs: DocumentMeta[] = [];
    const trashed: DocumentMeta[] = [];
    for (const doc of allDocs) {
      const access = accessFor(doc);
      if (doc.trashedAt) {
        if (access.canManage) trashed.push(doc);
      } else if (access.canView) {
        docs.push(doc);
      }
    }
    docs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    trashed.sort((a, b) => (b.trashedAt?.getTime() ?? 0) - (a.trashedAt?.getTime() ?? 0));
    return { docs, trashed };
  }, [allDocs, accessFor]);

  return useMemo(
    () => ({
      docs: lists.docs,
      trashed: lists.trashed,
      starredIds,
      grants,
      accessFor,
      isReady,
      backendStatus: status,
    }),
    [lists, starredIds, grants, accessFor, isReady, status],
  );
}

export interface UseDocumentResult {
  /**
   * The document row whenever it exists in the current org — including ones
   * the caller can't open. Check `access.canView` before showing its title or
   * content.
   */
  doc: DocumentMeta | null;
  access: DocAccess;
  isStarred: boolean;
  isReady: boolean;
  /** Ready, reachable backend, and no document with this id in the current org (or the id is malformed). */
  notFound: boolean;
  backendStatus: DocsBackendStatus;
}

export function useDocument(documentId: string | null): UseDocumentResult {
  const { status, gate, organizationId, allDocs, starredIds, accessFor, isReady } = useDocsCore();
  const id = documentId !== null && isDocumentId(documentId) ? documentId.toLowerCase() : null;
  const doc = useMemo(() => (id ? (allDocs.find((d) => d.id === id) ?? null) : null), [allDocs, id]);
  const access = useMemo(() => (doc ? accessFor(doc) : NO_DOC_ACCESS), [doc, accessFor]);
  const isStarred = doc !== null && starredIds.has(doc.id);
  const notFound = documentId !== null && isReady && status === "ready" && gate && !!organizationId && doc === null;
  return useMemo(
    () => ({ doc, access, isStarred, isReady, notFound, backendStatus: status }),
    [doc, access, isStarred, isReady, notFound, status],
  );
}

// ── Per-document tables ──────────────────────────────────────────────────────

function useDocScope(documentId: string | null, enabled: boolean) {
  const { role, permissions } = usePermissions();
  const status = useDocsBackendStatus();
  const gate = docsGateAllows(role, permissions);
  const id = documentId !== null && isDocumentId(documentId) ? documentId.toLowerCase() : null;
  const scopedId = gate && enabled && status === "ready" ? id : null;
  const settled = !gate || !enabled || status === "not_published" || (status === "ready" && !id);
  return { scopedId, settled };
}

/** Comment threads of one document (subscribe while the editor is mounted). */
export function useDocumentComments(documentId: string | null): { threads: DocCommentThread[]; isReady: boolean } {
  const { scopedId, settled } = useDocScope(documentId, true);
  const [rows, ready]: readonly [readonly unknown[], boolean] = useDocumentCommentRows(scopedId);
  const threads = useMemo(() => groupDocCommentThreads(rows.map((row) => mapComment(row))), [rows]);
  const isReady = settled || (scopedId !== null && ready);
  return useMemo(() => ({ threads, isReady }), [threads, isReady]);
}

/** Saved versions of one document, newest first. Pass `enabled` only while the history panel is open — rows carry full state. */
export function useDocumentVersions(documentId: string | null, enabled: boolean): { versions: DocVersion[]; isReady: boolean } {
  const { scopedId, settled } = useDocScope(documentId, enabled);
  const [rows, ready]: readonly [readonly unknown[], boolean] = useDocumentVersionRows(scopedId, scopedId !== null);
  const versions = useMemo(() => {
    const list = rows.map((row) => mapVersion(row));
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list;
  }, [rows]);
  const isReady = settled || (scopedId !== null && ready);
  return useMemo(() => ({ versions, isReady }), [versions, isReady]);
}

// ── Recents ──────────────────────────────────────────────────────────────────

/** Viewable documents by max(updatedAt, last opened on this device), newest first. Empty when the Docs gate fails. */
export function useRecentDocuments(limit: number): { items: RecentDocumentItem[]; ready: boolean } {
  const { docs, isReady } = useDocuments();
  const opened = useLastOpenedMap();
  const items = useMemo(() => {
    const max = Math.max(0, Math.floor(limit));
    if (max === 0 || docs.length === 0) return [];
    const scored = docs.map((doc) => {
      const lastOpenedAt = opened.get(doc.id) ?? null;
      return { doc, lastOpenedAt, score: Math.max(doc.updatedAt.getTime(), lastOpenedAt ?? 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map(
      ({ doc, lastOpenedAt }): RecentDocumentItem => ({
        id: doc.id,
        title: doc.title,
        href: documentHref(doc.id),
        updatedAt: doc.updatedAt,
        lastOpenedAt,
        ownerMemberId: doc.ownerMemberId,
      }),
    );
  }, [docs, opened, limit]);
  return useMemo(() => ({ items, ready: isReady }), [items, isReady]);
}
