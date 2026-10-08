// Isolated fixture for scripts/tests/drive/home-render.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process, once per scenario (DRIVE_HOME_SCENARIO).
//
// Server-renders the real DriveHome (page header actions, nav, toolbar, grid / list, empty states, members overview,
// "Stored in apps") with its data hooks mocked: useDriveData returns the real entry tree built from fixture rows
// (home/fixture.ts), the management notice renders markers whose state each scenario sets, and the copy is English.

import { expect, mock, test } from "bun:test";
import { createContext, createElement as h, type ReactNode } from "react";
import { VIRTUAL_SOURCES } from "@/components/drive/model/virtual-sources";
import { formatDriveBytes } from "@/lib/drive/format";
import { fmt } from "@/lib/i18n/fmt";
import { decode, driveData, entryOf, GONE, makeDoc, makeItem, ME, ORG, PRIYA, translator, uuid } from "./home/fixture";

type Scenario =
  | "checking" | "not_published" | "offline" | "empty-my" | "items-grid" | "items-list" | "trash-empty"
  | "search-no-matches" | "members" | "apps-summary" | "needs-ack" | "storage-off" | "storage-off-items" | "plugin-missing";
const SCENARIO = (process.env.DRIVE_HOME_SCENARIO ?? "checking") as Scenario;

const SEARCH: Partial<Record<Scenario, string>> = {
  "items-list": "?view=list",
  "trash-empty": "?space=trash",
  "search-no-matches": "?q=zzzz-nothing",
  members: "?space=members",
  "apps-summary": "?space=apps",
};

const FOLDER = uuid(1);
const PDF = uuid(2);
const DOC = uuid(3);
const SHEET = uuid(4);
const DECK = uuid(5);
const PRIYA_FILE = uuid(6);
const GONE_FILE = uuid(7);

const withItems = ["offline", "items-grid", "items-list", "search-no-matches", "members", "needs-ack", "storage-off-items", "plugin-missing"].includes(SCENARIO);
const items = withItems
  ? [
      makeItem({ id: FOLDER, name: "Receipts", kind: "folder" }),
      makeItem({ id: PDF, name: "menu.pdf", kind: "file" }),
      makeItem({ id: PRIYA_FILE, name: "shift-swap.jpg", kind: "file", mimeType: "image/jpeg", ownerMemberId: PRIYA, createdByMemberId: PRIYA }),
      makeItem({ id: GONE_FILE, name: "old-invoice.pdf", kind: "file", ownerMemberId: GONE, createdByMemberId: GONE, sizeBytes: 5000 }),
    ]
  : [];
const docs = withItems || SCENARIO === "not_published"
  ? [
      makeDoc({ id: DOC, title: "Q3 plan", excerpt: "Hire two more baristas" }),
      makeDoc({ id: SHEET, title: "Budget", fileType: "sheet" }),
      makeDoc({ id: DECK, title: "Pitch", fileType: "slides", visibility: "org_edit" }),
    ]
  : [];

// Q3 plan has a recorded size; Budget and Pitch have none yet (shown as nothing, never "0 B").
const DOC_BYTES = 12_300;
// Every app file of the store: chat and bugs have tiles; images in documents and profile photos are rows.
const APP_BYTES = { chat: 3_000_000, bugs: 5_000, doc_image: 34_000_000, avatar: 2_000 } as const;
const data = driveData({
  items,
  docs,
  status: SCENARIO === "checking" ? "checking" : SCENARIO === "not_published" ? "not_published" : "ready",
  documentSizes: [[DOC, DOC_BYTES]],
  appBytesBySource: Object.entries(APP_BYTES) as [keyof typeof APP_BYTES, number][],
});
let notice = { ready: true, needsAck: SCENARIO === "needs-ack", acknowledge: async () => {} };
// Forms: record bytes (answer text + attached files) the tile lists itself, outside the app-file total.
const FORM_BYTES = 7_500;
const virtual = {
  sources: VIRTUAL_SOURCES.filter((meta) => meta.id === "chat" || meta.id === "bugs" || meta.id === "forms").map((meta) =>
    meta.id === "forms"
      ? { meta, count: 2, listedBytes: FORM_BYTES, latest: Date.now() }
      : { meta, count: meta.id === "chat" ? 3 : 1, listedBytes: null, latest: Date.now() }),
  entries: [],
  ready: true,
};
const tr = translator();
const noop = () => {};

mock.module("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(SEARCH[SCENARIO] ?? ""),
  useRouter: () => ({ push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }),
  usePathname: () => "/manager/drive",
  useParams: () => ({}),
}));
mock.module("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => {
    void prefetch;
    return h("a", { href, ...rest }, children);
  },
}));
mock.module("next/dynamic", () => ({ default: () => () => null }));
mock.module("@/lib/i18n/context", () => ({ useT: () => tr, useI18n: () => ({ locale: "en", dir: "ltr", setLocale: noop, t: tr }) }));
mock.module("@/components/drive/use-drive-data", () => ({ useDriveData: () => data }));
mock.module("@/components/drive/virtual/use-virtual-sources", () => ({ useVirtualSources: () => virtual }));
mock.module("@/components/drive/notice/use-notice-ack", () => ({ useManagementNoticeAck: () => notice }));
mock.module("@/components/drive/notice/management-notice", () => ({
  NoticeGateScope: createContext(false),
  ManagementNoticeBanner: () => h("div", { "data-drive-notice": "banner" }, "drive.disclosure.short"),
  ManagementNoticeGate: () => h("div", { "data-drive-notice": "gate", "data-open": String(notice.needsAck) }),
  ManagementNoticeDialog: () => null,
  LiteNoticeGate: ({ children }: { children: ReactNode }) => children,
}));
const connection = {};
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  DOCS_BINDINGS_GENERATED: true,
  useLiveSpacetimeConnection: () => (SCENARIO === "offline" ? null : connection),
  useDocsBackendStatus: () => "ready",
  useSignedInMember: () => ({ memberId: ME, role: "owner", ready: true }),
  useCurrentMemberId: () => ME,
  useDocuments: () => ({ docs: [], trashed: [], starredIds: new Set(), grants: [], accessFor: noop, isReady: true, backendStatus: "ready" }),
  useDocument: () => ({ doc: null, access: null, isReady: true }),
  useDocumentComments: () => ({ threads: [], isReady: true }),
  useDocumentVersions: () => ({ versions: [], isReady: true }),
  useRecentDocuments: () => ({ items: [], ready: true }),
}));
// Docs, Sheets and Slides are installed, except Sheets in "plugin-missing"; `installed` and `isInstalled` agree.
const installedIds = SCENARIO === "plugin-missing" ? ["docs", "slides"] : ["docs", "sheets", "slides"];
const installed = new Set(installedIds);
mock.module("@/lib/spacetimedb/hooks/useDeviceApps", () => ({
  useDeviceApps: () => ({
    installed, installedIds, isInstalled: (id: string) => id === "drive" || installed.has(id), setInstalled: async () => {}, savingId: null,
    isReady: true, loading: false,
  }),
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({ organizationId: ORG, role: "owner", permissions: {}, can: () => true, currentOrg: { id: ORG, name: "Downtown" }, organizations: [] }),
}));
const opened: string[] = [];
mock.module("@/lib/browser-shell", () => ({
  useSetTabTitle: noop, useTabActions: () => ({ openUrl: (href: string) => void opened.push(href) }), dispositionFromKeyboard: () => "current",
  useTabSlotId: () => null,
}));
mock.module("@/lib/drive/use-drive-token", () => ({ useDriveTokenBridge: noop }));
mock.module("@/lib/drive/use-drive-uploads", () => ({
  useDriveUploads: () => ({ entries: [], queue: { localItemIds: () => new Set<string>(), enqueue: () => [], cancel: noop, retry: noop, clearFinished: noop } }),
}));
mock.module("@/lib/drive/use-drive-url", () => ({ useDriveUrl: () => ({ url: null, loading: false, error: null }) }));
mock.module("@/lib/drive/use-drive-storage-status", () => ({
  useDriveStorageStatus: () => ({ status: SCENARIO.startsWith("storage-off") ? "unavailable" : "ready" }),
}));
mock.module("@/components/page-header", () => ({
  PageHeader: ({ title, right }: { title: string; right?: ReactNode }) => h("header", null, h("h1", null, title), right),
}));
mock.module("@/lib/haptics", () => ({ hapticLight: noop, hapticMedium: noop, hapticHeavy: noop, hapticSuccess: noop, hapticError: noop, hapticWarning: noop }));

// "plugin-missing": the page's open and New handlers are captured from the render and called afterwards. A server
// render never re-renders, so the prompt itself is checked in home/actions.isolated.tsx; here: nothing navigates and
// nothing is created before Sheets is installed, while Slides (installed) still creates.
const created: string[] = [];
const captured: { openInPlace?: (entry: ReturnType<typeof entryOf>) => boolean; onNewDocument?: (kind: "doc" | "sheet" | "slides") => void } = {};
let dialogMarkup = "";
if (SCENARIO === "plugin-missing") {
  const editors = { ...(await import("@/lib/drive/editors")) };
  mock.module("@/lib/drive/editors", () => ({
    ...editors,
    createDriveDoc: async (kind: string) => (created.push(kind), uuid(99)),
  }));
  const { useDriveActions } = { ...(await import("@/components/drive/actions/use-drive-actions")) };
  mock.module("@/components/drive/actions/use-drive-actions", () => ({
    useDriveActions: (opts: Parameters<typeof useDriveActions>[0]) => {
      const actions = useDriveActions(opts);
      captured.openInPlace = actions.openInPlace;
      return actions;
    },
  }));
  const newMenu = { ...(await import("@/components/drive/toolbar/new-menu")) };
  mock.module("@/components/drive/toolbar/new-menu", () => ({
    ...newMenu,
    NewMenu: (props: Parameters<typeof newMenu.NewMenu>[0]) => {
      captured.onNewDocument = props.onNewDocument;
      return newMenu.NewMenu(props);
    },
  }));
  mock.module("@/components/plugins/plugin-install-prompt", () => ({
    PluginInstallDialog: (props: { open: boolean; appId: string; mode: string }) => {
      dialogMarkup = `${props.appId}:${props.mode}:${props.open}`;
      return null;
    },
  }));
}

const { renderToStaticMarkup } = await import("react-dom/server");
const { DriveHome } = await import("@/components/drive/drive-home");

function render(): string {
  return decode(renderToStaticMarkup(h(DriveHome)));
}

/** The page header's actions: Upload and New. */
function headerOf(html: string): string {
  return html.slice(html.indexOf("<header>"), html.indexOf("</header>"));
}

function disabledButtons(html: string): number {
  return html.match(/<button[^>]*disabled=""/g)?.length ?? 0;
}

test(`drive home: ${SCENARIO}`, async () => {
  const html = render();
  expect(html).toContain("<h1>Drive</h1>");
  expect(html).toContain(`data-drive-notice="gate" data-open="${notice.needsAck}"`);
  if (SCENARIO !== "apps-summary") expect(html).toContain('data-drive-notice="banner"');
  // The nav column lists the sections and the storage meter reads the usage row.
  expect(html).toContain("Drive sections");
  const header = headerOf(html);

  switch (SCENARIO) {
    case "checking":
      expect(html).toContain("Loading files…");
      expect(html).toContain('aria-busy="true"');
      expect(html).not.toContain("Nothing in My files yet");
      expect(disabledButtons(header)).toBe(2);
      break;
    case "not_published":
      expect(html).toContain("Drive isn't available yet");
      expect(html).toContain("Files will be ready after the next Merchiva update.");
      // Docs, Sheets and Slides still list; nothing can be created.
      expect(html).toContain("Q3 plan");
      expect(disabledButtons(header)).toBe(2);
      expect(header).toContain("Drive isn't available yet");
      break;
    case "offline":
      expect(html).toContain("You're offline");
      expect(html).toContain("Receipts");
      expect(disabledButtons(header)).toBe(2);
      break;
    case "empty-my":
      expect(html).toContain("Nothing in My files yet");
      expect(html).toContain('data-drive-empty="my"');
      expect(disabledButtons(header)).toBe(0);
      // The empty state offers Upload and New folder too.
      expect(html.split(">Upload<").length - 1).toBe(2);
      expect(html).toContain(">New folder<");
      break;
    case "items-grid":
      expect(disabledButtons(header)).toBe(0);
      expect(html).toContain(">Folders<");
      expect(html).toContain(">Files<");
      expect(html).toContain(`href="/manager/drive?folder=${FOLDER}"`);
      expect(html).toContain(`href="/manager/drive?preview=item%3A${PDF}"`);
      expect(html).toContain(`href="/manager/docs/edit?id=${DOC}"`);
      expect(html).toContain(`href="/manager/drive/sheet?id=${SHEET}"`);
      expect(html).toContain("Q3 plan");
      // Pitch is in Store; other members' files are theirs.
      expect(html).not.toContain("Pitch");
      expect(html).not.toContain("shift-swap.jpg");
      expect(html).toContain('aria-label="More actions"');
      checkNoticeBlocksCreation(html);
      break;
    case "items-list": {
      expect(html).toContain("<table");
      expect(html).toContain("menu.pdf");
      expect(html).toContain("Budget");
      // Sizes: the upload's, the document's recorded one; Budget's is unknown and reads as the dash.
      const rowOf = (name: string) => html.slice(html.indexOf(name), html.indexOf("</tr>", html.indexOf(name)));
      expect(rowOf("Q3 plan")).toContain(`>${formatDriveBytes(DOC_BYTES, "en")}<`);
      expect(rowOf("menu.pdf")).toContain(`>${formatDriveBytes(items[1].sizeBytes, "en")}<`);
      expect(rowOf("Budget")).toContain(">—<");
      expect(rowOf("Budget")).not.toContain(">0 B<");
      expect(html).toContain(`href="/manager/drive?preview=item%3A${PDF}"`);
      break;
    }
    case "trash-empty":
      expect(html).toContain("Trash is empty");
      expect(html).toContain("deleted forever after 30 days");
      expect(header).toContain("You can't add files here.");
      expect(disabledButtons(header)).toBe(2);
      break;
    case "search-no-matches":
      expect(html).toContain("No matching files");
      expect(html).toContain("Clear filters");
      expect(html).not.toContain("menu.pdf");
      break;
    case "members":
      expect(html).toContain("You can open everyone's files.");
      expect(html).toContain("Priya Patel");
      expect(html).toContain("Staff");
      expect(html).toContain("Former members");
      expect(html).toContain("Former member");
      expect(html).toContain(`href="/manager/drive?space=members&member=${PRIYA}"`);
      expect(html).toContain(`href="/manager/drive?space=members&member=${GONE}"`);
      // Ana: menu.pdf + Q3 plan + Budget; Priya: one photo; the former member: one invoice.
      expect(html).toContain(">3 files<");
      // Ana's bytes: menu.pdf plus Q3 plan's recorded size (Budget's is unknown and adds nothing).
      expect(html).toContain(`>${formatDriveBytes(2048 + DOC_BYTES, "en")}<`);
      expect(html.split(">1 file<").length - 1).toBe(2);
      expect(header).toContain("You can't add files here.");
      break;
    case "apps-summary":
      expect(html).toContain("Photos and files people added in other Merchiva apps.");
      expect(html).toContain("Bug reports");
      expect(html).toContain("3 files");
      expect(html).toContain(tr("drive.apps.notIncluded"));
      // The store's app files in total, per visible app, and the files nobody can list here as plain rows.
      expect(html).toContain(`${formatDriveBytes(3_000_000 + 5_000 + 34_000_000 + 2_000, "en")} stored in other apps`);
      expect(html).toContain(tr("drive.apps.notStoredHere"));
      expect(html).toContain(`3 files · ${formatDriveBytes(3_000_000, "en")}`);
      expect(html).toContain(tr("drive.apps.sources.forms"));
      expect(html).toContain(`${fmt(tr("drive.apps.countForms"), { count: 2 })} · ${formatDriveBytes(FORM_BYTES, "en")}`);
      expect(html).toContain(`data-drive-app-bytes="doc_image"`);
      expect(html).toContain("Images in documents");
      expect(html).toContain(formatDriveBytes(34_000_000, "en"));
      expect(html).toContain(`data-drive-app-bytes="avatar"`);
      expect(html).toContain("Profile photos");
      // A row is a size, not a way in.
      expect(html).not.toMatch(/<button[^>]*data-drive-app-bytes/);
      expect(html).not.toContain('data-drive-notice="banner"');
      break;
    case "storage-off":
    case "storage-off-items": {
      // The file store is unavailable: only the uploads are off; New (folders, documents) works. The header's
      // reason is a hover tooltip, so the page body says it once too, where a touch screen shows it.
      const reason = "File uploads aren't available right now. Try again later.";
      expect(disabledButtons(header)).toBe(1);
      expect(header).toMatch(/<button[^>]*disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?<span[^>]*>Upload</);
      expect(header).toContain(reason);
      const body = html.slice(html.indexOf("</header>"));
      expect(body).toMatch(new RegExp(`data-drive-upload-off=""[^>]*>(?:<svg[\\s\\S]*?<\\/svg>)?<div[^>]*><div[^>]*>${reason}</div>`));
      expect(body.split(reason).length - 1).toBe(1);
      if (SCENARIO === "storage-off-items") {
        expect(html).toContain("Receipts");
        expect(html).not.toContain("data-drive-empty=");
        break;
      }
      expect(html).toContain('data-drive-empty="my"');
      const empty = html.slice(html.indexOf('data-drive-empty="my"'));
      expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?Upload</);
      expect(empty).toMatch(/<button(?![^>]*disabled="")[^>]*>(?:<svg[\s\S]*?<\/svg>)?New folder</);
      break;
    }
    case "plugin-missing": {
      // Every document still lists and links to its editor; the install prompt is mounted, closed.
      expect(html).toContain(`href="/manager/drive/sheet?id=${SHEET}"`);
      expect(html).toContain(`href="/manager/docs/edit?id=${DOC}"`);
      expect(dialogMarkup).toBe("docs:open:false");
      // A plain click on the sheet asks instead of following the link.
      expect(captured.openInPlace?.(entryOf(data.tree, `doc:${SHEET}`))).toBe(true);
      expect(captured.openInPlace?.(entryOf(data.tree, `doc:${DOC}`))).toBe(false);
      // New ▸ Sheet creates nothing; New ▸ Slides does.
      captured.onNewDocument?.("sheet");
      expect(created).toEqual([]);
      captured.onNewDocument?.("slides");
      await Promise.resolve();
      expect(created).toEqual(["slides"]);
      expect(opened).toEqual([]);
      break;
    }
    case "needs-ack":
      expect(disabledButtons(header)).toBe(2);
      expect(header).toContain("Read the note about who can see your files first.");
      expect(html).toContain("Receipts");
      break;
  }
  if (!SCENARIO.startsWith("storage-off")) expect(html).not.toContain("data-drive-upload-off");
  expect(html).not.toContain("!drive.");
});

/** Until the notice is acknowledged (or while that is unknown), Upload and New are off. */
function checkNoticeBlocksCreation(acked: string): void {
  expect(disabledButtons(headerOf(acked))).toBe(0);
  for (const state of [{ ready: true, needsAck: true }, { ready: false, needsAck: false }]) {
    notice = { ...state, acknowledge: async () => {} };
    const html = render();
    expect(html).toContain(`data-drive-notice="gate" data-open="${state.needsAck}"`);
    expect(disabledButtons(headerOf(html))).toBe(2);
  }
  notice = { ready: true, needsAck: false, acknowledge: async () => {} };
}
