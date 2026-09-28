// Isolated fixture for scripts/tests/docs-home/panels.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process.
//
// DocEditorRoute (/manager/docs/edit, and the editor screen of a device panel), server-rendered with useEffect run
// inline so router.replace calls are observable:
//   · a spreadsheet or deck id on /manager moves to its own editor, keeping a comment thread;
//   · in a panel it shows "opens in Drive" instead (with an Open button only when the host can open it);
//   · not found; a text document renders the editor behind the management notice gate;
//   · "just created" comes from `?new=1` on /manager and from the `isNew` prop in a panel (never the page URL);
//   · a `?version=` link from before version ids were hyphenated still names its version;
//   · before document types are known (useDocument: no doc, not ready) nothing opens, redirects or reads "not found".
import { expect, mock, test } from "bun:test";
import * as ReactActual from "react";

const SHEET = "3c9e2a41-7b5d-4f8e-9a1c-2d3e4f5a6b7c";
const VERSION = "0f8fad5b-d9cb-469f-a165-70867728950e";

type FileType = "doc" | "sheet" | "slides" | "unknown";

const replaced: string[] = [];
let search = new URLSearchParams();
let doc: Record<string, unknown> | null = null;
let ready = true;

function makeDoc(fileType: FileType): Record<string, unknown> {
  return {
    id: SHEET, organizationId: "org-1", ownerMemberId: "m-1", title: "Stock count", excerpt: "", icon: null,
    visibility: "org_edit", templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(), updatedAt: new Date(),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType, folderId: "",
  };
}

mock.module("react", () => ({ ...ReactActual, useEffect: (fn: () => void) => void fn() }));
mock.module("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace: (url: string) => void replaced.push(url), push: () => {}, back: () => {} }),
}));
mock.module("next/link", () => ({
  default: (props: { href: string; children?: ReactActual.ReactNode }) => ReactActual.createElement("a", { href: props.href }, props.children),
}));
// The editor chunk: its props, as JSON, instead of Tiptap.
mock.module("next/dynamic", () => ({
  default: () => (props: { initialNew: boolean; versionParam: string | null; threadParam: string | null }) =>
    ReactActual.createElement(
      "main",
      null,
      `DOC_EDITOR ${JSON.stringify({ initialNew: props.initialNew, versionParam: props.versionParam, threadParam: props.threadParam })}`,
    ),
}));
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
mock.module("@/lib/spacetimedb/hooks", () => ({ useOrgMembers: () => [[], true] }));
mock.module("@/lib/context/permissions", () => ({ usePermissions: () => ({ organizationId: "org-1" }) }));
mock.module("@/lib/auth/context", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
mock.module("@/lib/browser-shell", () => ({
  useSetTabTitle: () => {},
  useShellChrome: () => {},
  useTabActions: () => ({ openUrl: () => {} }),
}));
mock.module("@/lib/docs/recent", () => ({ markDocumentOpened: () => {} }));
mock.module("@/components/drive/notice/management-notice", () => ({
  ManagementNoticeGate: () => ReactActual.createElement("i", { "data-gate": "" }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { DocEditorRoute } = await import("@/components/docs/editor/doc-editor-route");
type RouteProps = NonNullable<Parameters<typeof DocEditorRoute>[0]>;

function render(opts: { query?: string; fileType?: FileType | null; props?: RouteProps }): string {
  replaced.length = 0;
  search = new URLSearchParams(opts.query ?? "");
  doc = opts.fileType === null ? null : makeDoc(opts.fileType ?? "doc");
  return renderToStaticMarkup(ReactActual.createElement(DocEditorRoute, opts.props ?? {})).replace(/&quot;/g, '"');
}

/** The props the editor chunk received. */
function editorProps(html: string): { initialNew: boolean; versionParam: string | null; threadParam: string | null } {
  const at = html.indexOf("DOC_EDITOR ");
  if (at === -1) throw new Error(`no editor in ${html.slice(0, 300)}`);
  return JSON.parse(html.slice(at + "DOC_EDITOR ".length, html.indexOf("</main>", at)));
}

const PANEL: RouteProps = { documentId: SHEET, mobile: true };

test("/manager: a spreadsheet, deck or unknown type moves to its own editor", () => {
  let html = render({ query: `id=${SHEET}`, fileType: "sheet" });
  expect(replaced).toEqual([`/manager/drive/sheet?id=${SHEET}`]);
  expect(html).not.toContain("DOC_EDITOR");
  render({ query: `id=${SHEET}&comment=t-1`, fileType: "sheet" });
  expect(replaced).toEqual([`/manager/drive/sheet?id=${SHEET}&comment=t-1`]);
  html = render({ query: `id=${SHEET}`, fileType: "slides" });
  expect(replaced).toEqual([`/manager/drive/slides?id=${SHEET}`]);
  expect(html).not.toContain("DOC_EDITOR");
  html = render({ query: `id=${SHEET}`, fileType: "unknown" });
  expect(replaced).toEqual(["/manager/drive"]);
  expect(html).not.toContain("DOC_EDITOR");
});

test("a panel shows where another file type opens, with Open only when its host can open it", () => {
  let html = render({ fileType: "sheet", props: PANEL });
  expect(replaced).toEqual([]);
  expect(html).toMatch(/This file opens in Drive|docs\.editor\.otherTypeTitle/);
  expect(html).toMatch(/>Open<|docs\.editor\.openInDrive/);
  expect(html).not.toContain("DOC_EDITOR");
  expect(html).not.toContain("data-gate");

  html = render({ fileType: "sheet", props: { ...PANEL, opensOtherFileTypes: false } });
  expect(replaced).toEqual([]);
  expect(html).toMatch(/This file opens in Drive|docs\.editor\.otherTypeTitle/);
  expect(html).toContain('<a href="/manager/docs">');
  expect(html).not.toMatch(/>Open<|docs\.editor\.openInDrive/);
  expect(html).not.toContain("DOC_EDITOR");
});

test("not found, and a text document behind the notice gate", () => {
  let html = render({ query: `id=${SHEET}`, fileType: null });
  expect(html).toMatch(/Document not found|docs\.editor\.notFoundTitle/);
  expect(html).toMatch(/shared with you|docs\.editor\.notFoundOrNoAccess/);

  html = render({ query: `id=${SHEET}`, fileType: "doc" });
  expect(replaced).toEqual([]);
  expect(html).toMatch(/<main>DOC_EDITOR [^<]*<\/main><i data-gate=""><\/i>/);
});

test("before the document_file rows apply (no doc, not ready): a skeleton, never Tiptap, a redirect or not found", () => {
  ready = false;
  for (const props of [{}, PANEL]) {
    const html = render({ query: `id=${SHEET}&new=1`, fileType: null, props });
    expect(replaced).toEqual([]);
    expect(html).not.toContain("DOC_EDITOR");
    expect(html).not.toMatch(/notFoundTitle|Document not found|otherTypeTitle|opens in Drive/);
  }
  ready = true;
});

test("just created: ?new=1 on /manager, the isNew prop in a panel", () => {
  expect(editorProps(render({ query: `id=${SHEET}&new=1` })).initialNew).toBe(true);
  expect(editorProps(render({ query: `id=${SHEET}` })).initialNew).toBe(false);
  expect(editorProps(render({ props: { ...PANEL, isNew: true } })).initialNew).toBe(true);
  expect(editorProps(render({ props: PANEL })).initialNew).toBe(false);
  // The page URL belongs to the device surface, not to the panel's document.
  expect(editorProps(render({ query: "new=1", props: PANEL })).initialNew).toBe(false);
});

test("a ?version= link in the old 32-hex form still names its (hyphenated) version", () => {
  const bare = VERSION.replace(/-/g, "");
  expect(editorProps(render({ query: `id=${SHEET}&version=${bare}` })).versionParam).toBe(VERSION);
  expect(editorProps(render({ query: `id=${SHEET}&version=${VERSION.toUpperCase()}` })).versionParam).toBe(VERSION);
  expect(editorProps(render({ query: `id=${SHEET}&version=${VERSION}&comment=t-1` }))).toEqual({
    initialNew: false,
    versionParam: VERSION,
    threadParam: "t-1",
  });
  expect(editorProps(render({ query: `id=${SHEET}` })).versionParam).toBeNull();
});
