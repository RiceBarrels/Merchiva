"use client";

// Docs read hooks (docs home, editor, New Tab page, shell recents).
//
// Subscriptions are always scoped — org-wide for document/file/star/access rows,
// per document for comments and versions — and only open while the caller is
// mounted, the Docs gate passes, and the server module actually has the docs
// tables. Before `spacetime generate` / `spacetime publish` every hook returns
// empty results with `isReady: true` and `backendStatus: "not_published"`, so
// screens can show a not-published state instead of spinning.
//
// `document` rows also hold Sheets and Slides files. A document's type and
// folder are its `document_file` row (none: a text document at the root), a
// separate subscription: no document is listed or returned until it has
// applied, and the module gives `document_file` exactly `document`'s RLS rules
// (spacetimedb/src/index.ts), so a spreadsheet or deck never passes for a text
// document. Lists
// default to text documents; Drive and the shell recents ask for the other types.
// Inside a device panel (lib/drive/actor-context.ts) access and stars are
// evaluated for the panel's member — the PIN operator on /store.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { docsGateAllows, NO_DOC_ACCESS, resolveDocAccess, sameMemberId } from "@/lib/docs/access";
import { DocsBackendMonitor, type DocsBackendStatus, type DocsProbeConnection } from "@/lib/docs/backend-probe";
import { isDocConnectionDown, onDocConnectionDown } from "@/lib/docs/connection";
import { isDocumentId } from "@/lib/docs/ids";
import {
  groupDocCommentThreads,
  idString,
  mapComment,
  mapDocuments,
  mapGrant,
  mapStar,
  mapVersion,
} from "@/lib/docs/mappers";
import { useLastOpenedMap } from "@/lib/docs/recent";
import type {
  DocAccess,
  DocAccessGrant,
  DocCommentThread,
  DocFileType,
  DocVersion,
  DocumentMeta,
  RecentDocumentItem,
} from "@/lib/docs/types";
import { useDriveActorOverride } from "@/lib/drive/actor-context";
import { documentFileHref } from "@/lib/drive/hrefs";
import { tables } from "@/lib/spacetimedb/generated";
import {
  useDocumentAccessRows,
  useDocumentCommentRows,
  useDocumentFileRows,
  useDocumentRows,
  useDocumentStarRows,
  useDocumentVersionRows,
  useOrgMembers,
  useSpacetimeDB,
} from "@/lib/spacetimedb/hooks";
import type { OrgRole } from "@/lib/types";

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
  "documentFile",
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

const ORG_ROLES: readonly string[] = ["owner", "manager", "staff"] satisfies readonly OrgRole[];

export interface SignedInMember {
  /** The identity's active org_member id in the current org; null until known. */
  memberId: string | null;
  /** That member's role; null until known. */
  role: OrgRole | null;
  /** That member's own stored `settings.edit` grant (what setDeviceApps accepts from a non-manager). */
  settingsEdit: boolean;
  ready: boolean;
}

/**
 * The signed-in identity's own active org_member row in the current org: on a store tablet the tablet account,
 * never the PIN operator. Access and stars use useCurrentMemberId() instead.
 */
export function useSignedInMember(): SignedInMember {
  const { identity } = useSpacetimeDB();
  const { organizationId } = usePermissions();
  const [members, membersReady] = useOrgMembers();
  const row = useMemo(() => {
    if (!identity || !organizationId) return null;
    const me = identity.toHexString();
    return (
      members.find((m) => m.organizationId === organizationId && m.status === "active" && m.userId.toHexString() === me) ??
      null
    );
  }, [identity, organizationId, members]);
  const memberId = row ? idString(row.id) : null;
  const role = row && ORG_ROLES.includes(row.role) ? (row.role as OrgRole) : null;
  const settingsEdit = useMemo(() => storedSettingsEdit(row?.permissions), [row?.permissions]);
  const ready = membersReady || memberId !== null;
  return useMemo(() => ({ memberId, role, settingsEdit, ready }), [memberId, role, settingsEdit, ready]);
}

/** `settings.edit` from a member's stored permissions JSON, read the way the setDeviceApps reducer reads it. */
function storedSettingsEdit(json: string | undefined): boolean {
  if (!json) return false;
  try {
    return (JSON.parse(json) as { settings?: { edit?: unknown } }).settings?.edit === true;
  } catch {
    return false;
  }
}

/** The panel's member under a DriveActorOverrideContext (the PIN operator on /store), else the signed-in member. */
function useCurrentMember(): { memberId: string | null; ready: boolean } {
  const signedIn = useSignedInMember();
  const override = useDriveActorOverride();
  if (override) return { memberId: override.memberId, ready: override.memberId !== null || signedIn.ready };
  return { memberId: signedIn.memberId, ready: signedIn.ready };
}

/** The caller's active org_member id in the current org (null until known); inside a device panel, the panel's member. */
export function useCurrentMemberId(): string | null {
  return useCurrentMember().memberId;
}

export interface DocsSender {
  /**
   * The member the Docs reducers that take no actingMemberId record and check — comment and version authors, stars,
   * copies, the owner rule of setDocumentVisibility: the signed-in identity's. On /store that is the tablet account,
   * not the PIN operator; everywhere else it is useCurrentMemberId(). null until known.
   */
  memberId: string | null;
  /** On /store, the operator is not the tablet account (or that is not known yet): star and copy would be theirs. */
  actingForOther: boolean;
}

/** Who the Docs reducers without an actingMemberId write for, and whether that is someone else than the operator. */
export function useDocsSender(): DocsSender {
  const signedIn = useSignedInMember();
  const override = useDriveActorOverride();
  const acting = override?.actingMemberId ?? "";
  const memberId = acting || !override ? signedIn.memberId : override.memberId;
  const actingForOther = acting !== "" && !sameMemberId(signedIn.memberId, acting);
  return useMemo(() => ({ memberId, actingForOther }), [memberId, actingForOther]);
}

// ── Documents ────────────────────────────────────────────────────────────────

const EMPTY_GRANTS: readonly DocAccessGrant[] = Object.freeze([]);
const NO_DOCS: DocumentMeta[] = [];

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

/** `memberOverride`: evaluate access and stars as this member instead of useCurrentMember(). */
function useDocsCore(memberOverride?: string | null): DocsCore {
  const { role, permissions, organizationId } = usePermissions();
  const status = useDocsBackendStatus();
  const gate = docsGateAllows(role, permissions);
  const scopedOrgId = gate && status === "ready" ? organizationId : null;
  const current = useCurrentMember();
  const memberId = memberOverride || current.memberId;
  const memberReady = memberOverride ? true : current.ready;

  const [docRows, docsReady]: readonly [readonly unknown[], boolean] = useDocumentRows(scopedOrgId);
  const [fileRows, filesReady]: readonly [readonly unknown[], boolean] = useDocumentFileRows(scopedOrgId);
  const [starRows, starsReady]: readonly [readonly unknown[], boolean] = useDocumentStarRows(scopedOrgId);
  const [accessRows, accessReady]: readonly [readonly unknown[], boolean] = useDocumentAccessRows(scopedOrgId);

  // Types are known once the document_file subscription has applied; before that a document without its row would
  // read as a text document, so none is shown. A document and its row are written in one transaction, and the two
  // tables have the same RLS rules (so the same subscriber receives both), so afterwards a document without one
  // really is a text document from before Drive. That pairing holds only while their rules stay identical.
  const allDocs = useMemo(() => (filesReady ? mapDocuments(docRows, fileRows) : NO_DOCS), [docRows, fileRows, filesReady]);

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
    (status === "ready" && (!scopedOrgId || (docsReady && filesReady && starsReady && accessReady && memberReady)));

  return { status, gate, organizationId, allDocs, grants, starredIds, accessFor, isReady };
}

/**
 * Which `document` rows a list shows. "text" = Docs documents only; "all" = every row, including "unknown" types a
 * newer client wrote; an array = exactly those types.
 */
export type DocFileTypeFilter = "text" | "all" | readonly DocFileType[];

export interface UseDocumentsOptions {
  /** Default "text": the Docs surfaces never list spreadsheets, decks or types they can't open. */
  fileTypes?: DocFileTypeFilter;
  /** Evaluate access and stars as this member (the store tablet's PIN operator). Default: useCurrentMemberId(). */
  memberId?: string | null;
}

/** Every type an editor opens. */
const KNOWN_FILE_TYPES: readonly DocFileType[] = ["doc", "sheet", "slides"];

// One string per filter, so a caller's inline array literal doesn't rebuild the lists on every render.
function fileTypeFilterKey(filter: DocFileTypeFilter | undefined): string {
  if (filter === undefined || filter === "text") return "doc";
  if (filter === "all") return "*";
  return [...new Set(filter)].sort().join(",");
}

/** The types a filter key lets through; null = every type. */
function fileTypesOfKey(key: string): ReadonlySet<string> | null {
  return key === "*" ? null : new Set(key.split(",").filter(Boolean));
}

export interface UseDocumentsResult {
  /** Documents of the requested types the caller can view, not trashed, most recently updated first. */
  docs: DocumentMeta[];
  /** Trashed documents of the requested types the caller manages, most recently trashed first. */
  trashed: DocumentMeta[];
  /** Documents the caller starred. */
  starredIds: ReadonlySet<string>;
  /** Every grant in the org (for the share dialog). */
  grants: DocAccessGrant[];
  accessFor(doc: DocumentMeta): DocAccess;
  isReady: boolean;
  backendStatus: DocsBackendStatus;
}

export function useDocuments(opts: UseDocumentsOptions = {}): UseDocumentsResult {
  const { status, allDocs, grants, starredIds, accessFor, isReady } = useDocsCore(opts.memberId);
  const filterKey = fileTypeFilterKey(opts.fileTypes);
  const lists = useMemo(() => {
    const types = fileTypesOfKey(filterKey);
    const docs: DocumentMeta[] = [];
    const trashed: DocumentMeta[] = [];
    for (const doc of allDocs) {
      if (types && !types.has(doc.fileType)) continue;
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
  }, [allDocs, accessFor, filterKey]);

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
   * content. Never returned before its `fileType` is known (null meanwhile,
   * with `isReady` false), so a route can trust the type of any doc it gets.
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

/**
 * Viewable documents by max(updatedAt, last opened on this device), newest first. Empty when the Docs gate fails.
 * Default: every type an editor opens (Docs, Sheets, Slides), each `href` pointing at its own editor.
 */
export function useRecentDocuments(
  limit: number,
  opts: { fileTypes?: DocFileTypeFilter } = {},
): { items: RecentDocumentItem[]; ready: boolean } {
  const { docs, isReady } = useDocuments({ fileTypes: opts.fileTypes ?? KNOWN_FILE_TYPES });
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
        href: documentFileHref(doc),
        updatedAt: doc.updatedAt,
        lastOpenedAt,
        ownerMemberId: doc.ownerMemberId,
        fileType: doc.fileType,
      }),
    );
  }, [docs, opened, limit]);
  return useMemo(() => ({ items, ready: isReady }), [items, isReady]);
}
