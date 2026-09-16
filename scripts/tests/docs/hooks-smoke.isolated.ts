// Isolated fixture for scripts/tests/docs/hooks.test.ts — NOT auto-discovered
// by `bun test` (no .test. in the name). It replaces modules with mock.module,
// so it must run in its own process; the harness spawns it per scenario.
//
//   DOCS_HOOKS_SCENARIO=pre-codegen  generated bindings have no document* tables
//   DOCS_HOOKS_SCENARIO=bindings     bindings exist, connection not active yet
//
// Renders every docs hook once with react-dom/server and checks they return
// empty results without throwing and without opening docs subscriptions.

import { expect, mock, test } from "bun:test";
import { createElement } from "react";

const SCENARIO = process.env.DOCS_HOOKS_SCENARIO === "bindings" ? "bindings" : "pre-codegen";
const DOC_ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const ORG_ID = "org-1";

interface TableCall { accessor: string; enabled: boolean | undefined; predicate: unknown }
const tableCalls: TableCall[] = [];

const ORG_MEMBER_TABLE = { __accessor: "orgMember" };
const MEMBERS = [
  { id: { toString: () => "member-1" }, organizationId: ORG_ID, status: "active", userId: { toHexString: () => "identity-1" } },
  { id: { toString: () => "member-2" }, organizationId: "org-2", status: "active", userId: { toHexString: () => "identity-1" } },
];

const DOC_ACCESSORS = [
  "document",
  "documentUpdate",
  "documentSnapshot",
  "documentPresence",
  "documentComment",
  "documentVersion",
  "documentStar",
  "documentAccess",
];

function fakeDocTable(accessor: string) {
  return {
    __accessor: accessor,
    where(predicate: (row: Record<string, { eq(value: string): unknown }>) => unknown) {
      const row = new Proxy({} as Record<string, { eq(value: string): unknown }>, {
        get: (_target, column) => ({ eq: (value: string) => ({ column: String(column), value }) }),
      });
      return { __accessor: accessor, predicate: predicate(row) };
    },
  };
}

const docTables = SCENARIO === "bindings" ? Object.fromEntries(DOC_ACCESSORS.map((a) => [a, fakeDocTable(a)])) : {};

mock.module("spacetimedb/react", () => ({
  useSpacetimeDB: () => ({
    isActive: SCENARIO === "pre-codegen",
    getConnection: () => null,
    identity: { toHexString: () => "identity-1", toString: () => "identity-1" },
  }),
  useTable: (query: { __accessor: string; predicate?: unknown }, opts?: { enabled?: boolean }) => {
    tableCalls.push({ accessor: query.__accessor, enabled: opts?.enabled, predicate: query.predicate });
    if (query === ORG_MEMBER_TABLE) return [MEMBERS, true];
    return opts?.enabled === false ? [[], true] : [[], false];
  },
  useReducer: () => async () => {},
  useProcedure: () => async () => {},
  SpacetimeDBProvider: ({ children }: { children: unknown }) => children,
}));
mock.module("@/lib/spacetimedb/generated", () => ({ tables: { orgMember: ORG_MEMBER_TABLE, ...docTables }, reducers: {} }));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({ role: "staff", permissions: { dashboard: { view: true } }, organizationId: ORG_ID }),
}));
mock.module("@/lib/auth/context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

test(`docs hooks render empty without throwing (${SCENARIO})`, async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const docsHooks = await import("@/lib/spacetimedb/hooks/useDocs");
  const rawHooks = await import("@/lib/spacetimedb/hooks");
  const { NO_DOC_ACCESS } = await import("@/lib/docs/access");

  type Captured = {
    status: ReturnType<typeof docsHooks.useDocsBackendStatus>;
    memberId: ReturnType<typeof docsHooks.useCurrentMemberId>;
    documents: ReturnType<typeof docsHooks.useDocuments>;
    document: ReturnType<typeof docsHooks.useDocument>;
    noDocument: ReturnType<typeof docsHooks.useDocument>;
    comments: ReturnType<typeof docsHooks.useDocumentComments>;
    versions: ReturnType<typeof docsHooks.useDocumentVersions>;
    recent: ReturnType<typeof docsHooks.useRecentDocuments>;
    rawRows: unknown[] | null;
  };
  let captured: Captured | null = null;
  let docTableCallsBeforeRaw = 0;

  function Probe() {
    const value: Captured = {
      status: docsHooks.useDocsBackendStatus(),
      memberId: docsHooks.useCurrentMemberId(),
      documents: docsHooks.useDocuments(),
      document: docsHooks.useDocument(DOC_ID),
      noDocument: docsHooks.useDocument(null),
      comments: docsHooks.useDocumentComments(DOC_ID),
      versions: docsHooks.useDocumentVersions(DOC_ID, true),
      recent: docsHooks.useRecentDocuments(8),
      rawRows: null,
    };
    docTableCallsBeforeRaw = tableCalls.filter((c) => c.accessor !== "orgMember").length;
    if (SCENARIO === "pre-codegen") {
      value.rawRows = [
        rawHooks.useDocumentRows(ORG_ID),
        rawHooks.useDocumentStarRows(ORG_ID),
        rawHooks.useDocumentAccessRows(ORG_ID),
        rawHooks.useDocumentCommentRows(DOC_ID),
        rawHooks.useDocumentVersionRows(DOC_ID, true),
      ];
    }
    captured = value;
    return null;
  }

  expect(() => renderToStaticMarkup(createElement(Probe))).not.toThrow();
  expect(captured).not.toBeNull();
  const c = captured as unknown as Captured;

  expect(c.memberId).toBe("member-1");
  expect(c.documents.docs).toEqual([]);
  expect(c.documents.trashed).toEqual([]);
  expect(c.documents.grants).toEqual([]);
  expect(c.documents.starredIds.size).toBe(0);
  expect(c.document.doc).toBeNull();
  expect(c.document.access).toEqual(NO_DOC_ACCESS);
  expect(c.document.isStarred).toBe(false);
  expect(c.document.notFound).toBe(false);
  expect(c.noDocument.notFound).toBe(false);
  expect(c.comments.threads).toEqual([]);
  expect(c.versions.versions).toEqual([]);
  expect(c.recent.items).toEqual([]);

  // accessFor works even with no rows: staff with dashboard.view on an org_edit doc → editor.
  const sample = {
    id: DOC_ID, organizationId: ORG_ID, ownerMemberId: "someone", title: "", excerpt: "", icon: null,
    visibility: "org_edit" as const, templateId: null, pageSetup: null, wordCount: 0,
    createdAt: new Date(0), updatedAt: new Date(0), lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null,
  };
  expect(c.documents.accessFor(sample).role).toBe("editor");

  if (SCENARIO === "pre-codegen") {
    expect(docsHooks.DOCS_BINDINGS_GENERATED).toBe(false);
    expect(c.status).toBe("not_published");
    expect(c.documents.backendStatus).toBe("not_published");
    expect(c.documents.isReady).toBe(true);
    expect(c.document.isReady).toBe(true);
    expect(c.comments.isReady).toBe(true);
    expect(c.versions.isReady).toBe(true);
    expect(c.recent.ready).toBe(true);
    // Raw hooks fall back to the stable empty tuple; nothing subscribes to docs tables.
    expect(c.rawRows).toEqual([[[], false], [[], false], [[], false], [[], false], [[], false]]);
    expect(tableCalls.filter((call) => call.accessor !== "orgMember")).toEqual([]);
  } else {
    expect(docsHooks.DOCS_BINDINGS_GENERATED).toBe(true);
    expect(c.status).toBe("checking");
    expect(c.documents.isReady).toBe(false);
    expect(c.recent.ready).toBe(false);
    expect(c.comments.isReady).toBe(false);
    // Bindings exist but the backend isn't confirmed: every docs query is disabled.
    const docCalls = tableCalls.filter((call) => call.accessor !== "orgMember");
    expect(docTableCallsBeforeRaw).toBe(docCalls.length);
    expect(docCalls.length).toBeGreaterThan(0);
    for (const call of docCalls) expect(call.enabled).toBe(false);
    expect(docCalls.find((call) => call.accessor === "document")?.predicate).toEqual({ column: "organizationId", value: "" });
    expect(docCalls.find((call) => call.accessor === "documentComment")?.predicate).toEqual({ column: "documentId", value: "" });
  }
});
