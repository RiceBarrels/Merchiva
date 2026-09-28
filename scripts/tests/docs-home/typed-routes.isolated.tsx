// Isolated fixture for scripts/tests/docs-home/panels.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process.
//
// SheetEditorRoute and SlidesEditorRoute (/manager/drive/sheet|slides, and the editor screen of a device panel),
// server-rendered with useEffect run inline so URL replacements are observable. A document's type is its
// document_file row, a subscription of its own: until it has applied useDocument returns no doc and is not ready, and
// neither route may read that as "not found" or as another type (which would send a valid spreadsheet or deck to
// another editor). Once the type is known each route opens its own and moves any other to its editor.
import { expect, mock, test } from "bun:test";
import * as ReactActual from "react";

const ID = "3c9e2a41-7b5d-4f8e-9a1c-2d3e4f5a6b7c";

type FileType = "doc" | "sheet" | "slides" | "unknown";

const replaced: string[] = [];
let search = new URLSearchParams();
let doc: Record<string, unknown> | null = null;
let ready = true;

function makeDoc(fileType: FileType): Record<string, unknown> {
  return {
    id: ID, organizationId: "org-1", ownerMemberId: "m-1", title: "Stock count", excerpt: "", icon: null,
    visibility: "org_edit", templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(), updatedAt: new Date(),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType, folderId: "",
  };
}

mock.module("react", () => ({ ...ReactActual, useEffect: (fn: () => void) => void fn() }));
mock.module("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace: (url: string) => void replaced.push(url), push: () => {}, back: () => {} }),
}));
// Either editor chunk: a marker instead of Univer or the slide canvas.
mock.module("next/dynamic", () => ({ default: () => () => ReactActual.createElement("main", null, "EDITOR") }));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useDocument: () => ({
    doc,
    access: { canView: true, canComment: true, canEdit: true, canManage: true, role: "manager" },
    isStarred: false,
    isReady: ready,
    notFound: false, // a null doc without notFound skips the 5 s grace timer (window-only)
    backendStatus: "ready",
  }),
}));
mock.module("@/lib/spacetimedb/hooks/useSheets", () => ({ useSheetsBackendStatus: () => "ready" }));
mock.module("@/lib/spacetimedb/hooks", () => ({ useOrgMembers: () => [[], true] }));
mock.module("@/lib/context/permissions", () => ({ usePermissions: () => ({ organizationId: "org-1" }) }));
mock.module("@/lib/auth/context", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
mock.module("@/lib/browser-shell", () => ({
  useSetTabTitle: () => {},
  useShellChrome: () => {},
  // useSheetReplaceUrl on /manager: the shell's replace navigation.
  useTabActions: () => ({ openUrl: () => {}, navigateActive: (url: string) => void replaced.push(url) }),
}));
mock.module("@/lib/docs/recent", () => ({ markDocumentOpened: () => {} }));
mock.module("@/components/drive/drive-actor", () => ({ useDriveActor: () => ({ ready: true, ceiling: null }) }));
mock.module("@/components/drive/notice/use-notice-ack", () => ({ useManagementNoticeAck: () => ({ ready: true, needsAck: false }) }));
mock.module("@/components/drive/notice/management-notice", () => ({
  ManagementNoticeGate: () => ReactActual.createElement("i", { "data-gate": "" }),
  NoticeGateScope: ReactActual.createContext(false),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { SheetEditorRoute } = await import("@/components/sheets/sheet-editor-route");
const { SlidesEditorRoute } = await import("@/components/slides/editor/slides-editor-route");

const ROUTES = { sheet: SheetEditorRoute, slides: SlidesEditorRoute } as const;
/** Every full-page state other than the skeleton and the editor. */
const SETTLED_STATE = /not found|opens in Drive|isn't a presentation|access|aren't available/i;

/** Where the last render sent the URL (effects run inline, so a render-phase state update repeats them). */
const replacedTo = (): string[] => [...new Set(replaced)];

function render(route: keyof typeof ROUTES, opts: { fileType: FileType | null; panel?: boolean }): string {
  replaced.length = 0;
  search = new URLSearchParams(opts.panel ? "" : `id=${ID}`);
  doc = opts.fileType === null ? null : makeDoc(opts.fileType);
  const props = opts.panel ? { documentId: ID, mobile: true } : {};
  return renderToStaticMarkup(ReactActual.createElement(ROUTES[route], props));
}

test("before the document_file rows apply (no doc, not ready): a skeleton, never an editor, a redirect or not found", () => {
  ready = false;
  for (const route of ["sheet", "slides"] as const) {
    for (const panel of [false, true]) {
      const html = render(route, { fileType: null, panel });
      expect([route, panel, replacedTo()]).toEqual([route, panel, []]);
      expect(html).toContain('role="status"');
      expect(html).not.toContain("EDITOR");
      expect(html).not.toMatch(SETTLED_STATE);
    }
  }
  ready = true;
});

test("once the type is known, each route opens its own type", () => {
  for (const panel of [false, true]) {
    let html = render("sheet", { fileType: "sheet", panel });
    expect([replacedTo(), html.includes("<main>EDITOR</main>")]).toEqual([[], true]);
    html = render("slides", { fileType: "slides", panel });
    expect([replacedTo(), html.includes("<main>EDITOR</main>")]).toEqual([[], true]);
  }
});

test("once the type is known, /manager moves another type to its own editor", () => {
  render("sheet", { fileType: "doc" });
  expect(replacedTo()).toEqual([`/manager/docs/edit?id=${ID}`]);
  render("sheet", { fileType: "slides" });
  expect(replacedTo()).toEqual([`/manager/drive/slides?id=${ID}`]);
  render("slides", { fileType: "sheet" });
  expect(replacedTo()).toEqual([`/manager/drive/sheet?id=${ID}`]);
  render("slides", { fileType: "doc" });
  expect(replacedTo()).toEqual([`/manager/docs/edit?id=${ID}`]);
  for (const route of ["sheet", "slides"] as const) {
    const html = render(route, { fileType: route === "sheet" ? "doc" : "sheet", panel: true });
    expect([route, replacedTo(), html.includes("EDITOR")]).toEqual([route, [], false]);
  }
});
