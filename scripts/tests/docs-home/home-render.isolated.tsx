// Isolated fixture for scripts/tests/docs-home/home-render.test.ts — NOT auto-discovered by
// `bun test` (no .test. in the name). It replaces modules with mock.module, so it must run in
// its own process; the harness spawns it once per scenario (DOCS_HOME_SCENARIO).
//
// Server-renders the real DocsHome tree (toolbar, template band, grid, empty states) with the
// data hooks, router and shell mocked, and checks what each backend / data state shows.

import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { docAccessFromRole } from "@/lib/docs/access";
import type { DocumentMeta } from "@/lib/docs/types";

type Scenario = "checking" | "not_published" | "empty" | "docs" | "trash-empty" | "no-matches";
const SCENARIO = (process.env.DOCS_HOME_SCENARIO ?? "checking") as Scenario;

const SEARCH: Record<Scenario, string> = {
  checking: "",
  not_published: "",
  empty: "",
  docs: "",
  "trash-empty": "?scope=trash",
  "no-matches": "?q=zzzz-nothing",
};

const DOC_A = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const DOC_B = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function makeDoc(patch: Partial<DocumentMeta> & { id: string }): DocumentMeta {
  return {
    organizationId: "org-1",
    ownerMemberId: "m-1",
    title: "",
    excerpt: "",
    icon: null,
    visibility: "org_edit",
    templateId: null,
    pageSetup: null,
    wordCount: 0,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-14T10:00:00Z"),
    lastEditorMemberId: null,
    trashedAt: null,
    trashedByMemberId: null,
    ...patch,
  };
}

const withDocs = SCENARIO === "docs" || SCENARIO === "no-matches";
const docs = withDocs
  ? [
      makeDoc({ id: DOC_A, title: "Shift handover notes", excerpt: "Cash drawer counted" }),
      makeDoc({ id: DOC_B, title: "", visibility: "private", ownerMemberId: "m-2" }),
    ]
  : [];

const docsState = {
  docs,
  trashed: [] as DocumentMeta[],
  starredIds: new Set<string>(withDocs ? [DOC_A] : []),
  grants: [],
  accessFor: () => docAccessFromRole("manager", false),
  isReady: SCENARIO !== "checking",
  backendStatus: SCENARIO === "checking" ? "checking" : SCENARIO === "not_published" ? "not_published" : "ready",
};

const MEMBERS = [
  { id: "m-1", organizationId: "org-1", displayName: "Ana Ruiz", email: "ana@example.test", status: "active", role: "owner" },
  { id: "m-2", organizationId: "org-1", displayName: "Priya Patel", email: "priya@example.test", status: "active", role: "staff" },
];

const noop = () => {};
const resolved = async () => {};

mock.module("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(SEARCH[SCENARIO]),
  useRouter: () => ({ push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }),
  usePathname: () => "/manager/docs",
  useParams: () => ({}),
}));
mock.module("next/link", () => ({
  default: (props: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => {
    const { href, prefetch, ...rest } = props;
    void prefetch;
    return createElement("a", { href, ...rest });
  },
}));
mock.module("next/dynamic", () => ({ default: () => () => null }));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useDocuments: () => docsState,
  useCurrentMemberId: () => "m-1",
}));
mock.module("@/lib/spacetimedb/hooks", () => ({ useOrgMembers: () => [MEMBERS, true] }));
mock.module("@/lib/spacetimedb/actions", () => ({
  createDocument: async () => DOC_A,
  duplicateDocument: async () => DOC_B,
  renameDocument: resolved,
  restoreDocument: resolved,
  toggleDocumentStar: resolved,
  trashDocument: resolved,
  deleteDocumentForever: resolved,
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({
    organizationId: "org-1",
    currentOrg: { id: "org-1", name: "Downtown" },
    role: "owner",
    permissions: {},
    organizations: [],
  }),
}));
mock.module("@/lib/auth/context", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "ana@example.test", firstName: "Ana", lastName: "Ruiz" } }),
}));
mock.module("@/lib/browser-shell", () => ({
  useTabActions: () => ({ openUrl: noop }),
  dispositionFromKeyboard: () => "current",
}));
mock.module("@/lib/haptics", () => ({
  hapticLight: resolved,
  hapticMedium: resolved,
  hapticHeavy: resolved,
  hapticSuccess: resolved,
  hapticError: resolved,
  hapticWarning: resolved,
}));
mock.module("@/components/page-header", () => ({
  PageHeader: ({ title, right }: { title: string; right?: ReactNode }) =>
    createElement("header", null, createElement("h1", null, title), right),
}));
mock.module("@/components/docs/dialogs/import-dialog", () => ({ ImportDialog: () => null }));
mock.module("@/components/docs/dialogs/rename-dialog", () => ({ RenameDialog: () => null }));
mock.module("@/components/docs/dialogs/delete-forever-dialog", () => ({ DeleteForeverDialog: () => null }));

const { renderToStaticMarkup } = await import("react-dom/server");
const { DocsHome } = await import("@/components/docs/home/docs-home");

function render(): string {
  return renderToStaticMarkup(createElement(DocsHome))
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

test(`docs home: ${SCENARIO}`, () => {
  const html = render();
  expect(html).toContain("<h1>Docs</h1>");

  switch (SCENARIO) {
    case "checking":
      expect(html).toContain("Loading documents…");
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Start a new document");
      expect(html).not.toContain("No documents yet");
      break;
    case "not_published":
      expect(html).toContain("Docs isn't available yet");
      expect(html).toContain("Documents will be ready after the next Merchiva update.");
      expect(html).not.toContain("Start a new document");
      expect(html).not.toContain("Loading documents…");
      // Import + New document are disabled.
      expect(html.match(/<button[^>]*disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
      break;
    case "empty":
      expect(html).toContain("No documents yet");
      expect(html).toContain("Create a document or start from a template.");
      expect(html).toContain("Blank document");
      expect(html).not.toContain("Loading documents…");
      break;
    case "docs":
      expect(html).toContain("Shift handover notes");
      expect(html).toContain(`href="/manager/docs/edit?id=${DOC_A}"`);
      expect(html).toContain("Untitled document");
      expect(html).toContain("Cash drawer counted");
      expect(html).toContain("Today");
      expect(html).toContain('aria-label="More actions"');
      expect(html).not.toContain("No documents yet");
      break;
    case "trash-empty":
      expect(html).toContain("Trash is empty");
      expect(html).toContain("Documents stay in trash until someone deletes them forever.");
      break;
    case "no-matches":
      expect(html).toContain("No matching documents");
      expect(html).toContain("Clear filters");
      expect(html).not.toContain("Shift handover notes");
      break;
  }
});
