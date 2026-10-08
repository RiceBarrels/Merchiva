// Isolated fixture for scripts/tests/drive/lite-render.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process, once per scenario (DRIVE_LITE_SCENARIO).
//
// Server-renders the real Drive lite app (components/device/apps/drive.tsx and components/drive/lite/*) with its
// data hook mocked: useDriveData returns the real entry tree of lite/fixture.ts, evaluated for the person using
// Drive (the PIN operator on /store) with the tablet account's ceiling where it applies. The management notice,
// the actor provider, "From other apps" (useVirtualSources over fixture rows) and the upload pickers are real.

import { expect, mock, test } from "bun:test";
import { createElement as h } from "react";
import { liteActionOptions } from "@/components/drive/lite/lite-actions";
import type { LiteDriveScreen } from "@/components/drive/lite/lite-state";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import type { DriveEntry } from "@/components/drive/model/types";
import {
  cameraShot, decode, ID, liteData, memberRows, ORG, PEOPLE, PRIYA_ID, storeDocs, storeItems, storeTrashedDocs, toastRecorder, translator,
  TILL_URL, uuid, virtualRows, type Person,
} from "./lite/fixture";
import { formatDriveBytes } from "@/lib/drive/format";
import { appFileKeyHash } from "@/lib/storage/uploadthing-key";

type Scenario =
  | "store-operator" | "staff-tablet" | "personal" | "needs-ack" | "empty" | "not-published" | "offline" | "checking"
  | "editor" | "camera" | "operator" | "storage-off" | "plugin-missing" | "plugin-ask" | "plugin-template";
const SCENARIO = (process.env.DRIVE_LITE_SCENARIO ?? "store-operator") as Scenario;

// "plugin-missing" / "plugin-template": the owner works the tablet she signed in, so she may download;
// "plugin-ask": staff operator Priya.
const person: Person = SCENARIO === "personal" || SCENARIO === "plugin-missing" || SCENARIO === "plugin-template" ? PEOPLE.ana : PEOPLE.priya;
const pluginScenario = SCENARIO === "plugin-missing" || SCENARIO === "plugin-ask" || SCENARIO === "plugin-template";
const surface = SCENARIO === "personal" ? "personal" : "store";
const tablet: Person = SCENARIO === "staff-tablet" ? PEOPLE.ben : PEOPLE.ana;
// Storage: everything the store keeps, in four parts; Priya's sheet and the chat photo have recorded sizes.
const PARTS = { files: 4096, documents: 2_000_000, sheets: 9_000, apps: 37_001_000 } as const;
const USAGE = {
  usedBytes: PARTS.files, reservedBytes: 0, quotaBytes: 10 * 1024 ** 3, fileCount: 3, sheetBytes: PARTS.sheets,
  breakdown: { ...PARTS, total: PARTS.files + PARTS.documents + PARTS.sheets + PARTS.apps, quota: 10 * 1024 ** 3 },
};
const PRIYA_SHEET_BYTES = 9_000;
const TILL_BYTES = 2_500;
const APP_BYTES = { chat: 3_000_000, logo: 1_000, doc_image: 34_000_000 } as const;
const data = liteData({
  person,
  surface,
  staffTablet: SCENARIO === "staff-tablet" ? PEOPLE.ben : null,
  items: SCENARIO === "empty" ? [] : storeItems(),
  docs: SCENARIO === "empty" ? [] : storeDocs(),
  trashedDocs: SCENARIO === "empty" ? [] : storeTrashedDocs(),
  status: SCENARIO === "checking" ? "checking" : SCENARIO === "not-published" ? "not_published" : "ready",
  usage: SCENARIO === "empty" ? undefined : USAGE,
  documentSizes: [[ID.priyaSheet, PRIYA_SHEET_BYTES]],
  appFileSizes: [[appFileKeyHash(TILL_URL) ?? "", { sizeBytes: TILL_BYTES, source: "chat", mimeType: "image/jpeg" }]],
  appBytesBySource: Object.entries(APP_BYTES) as [keyof typeof APP_BYTES, number][],
});
const tr = translator();
const noop = () => {};
const rows = virtualRows();
// The editor plugins: all three, except Sheets in the plugin scenarios (Docs in "plugin-template"). setInstalled
// records and installs.
const installed = new Set(
  SCENARIO === "plugin-template" ? ["sheets", "slides"] : pluginScenario ? ["docs", "slides"] : ["docs", "sheets", "slides"],
);
const installCalls: [string, boolean][] = [];

// ── Recorders ────────────────────────────────────────────────────────────────

const { toasts, toast: toastFn } = toastRecorder();
const calls: { name: string; args: unknown[] }[] = [];
const operatorError = () => new Error("[drive.operator] Enter your PIN again");
const reducer = (name: string, fails = false) => (...args: unknown[]) => {
  calls.push({ name, args });
  return fails ? Promise.reject(operatorError()) : Promise.resolve();
};
const enqueued: { sources: { file: File; name?: string }[]; target: Record<string, unknown> }[] = [];
const operatorChanges: unknown[] = [];
const shellOpened: string[] = [];
const uploadTarget = (actingMemberId: string) => ({ organizationId: ORG, space: "my", parentId: "", ownerMemberId: actingMemberId, actingMemberId });
const uploads = SCENARIO === "operator"
  ? [
      { key: "u1", itemId: uuid(41), name: "till-photo.jpg", sizeBytes: 900, target: uploadTarget(PRIYA_ID), state: "failed", loaded: 0, errorCode: "operator", createdAt: 1 },
      { key: "u2", itemId: uuid(42), name: "ben-secret.jpg", sizeBytes: 900, target: uploadTarget(PEOPLE.ben.id), state: "uploading", loaded: 10, errorCode: null, createdAt: 2 },
    ]
  : [];

// ── Mocks ────────────────────────────────────────────────────────────────────

mock.module("sonner", () => ({ toast: toastFn }));
mock.module("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }),
  usePathname: () => "/store",
  useParams: () => ({}),
}));
mock.module("@/lib/i18n/context", () => ({ useT: () => tr, useI18n: () => ({ locale: "en", dir: "ltr", setLocale: noop, t: tr }) }));
mock.module("@/components/drive/use-drive-data", () => ({ useDriveData: () => data }));
mock.module("@/components/drive/notice/use-notice-ack", () => ({
  useManagementNoticeAck: () => ({ ready: true, needsAck: SCENARIO === "needs-ack", acknowledge: async () => {} }),
}));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  DOCS_BINDINGS_GENERATED: true,
  useLiveSpacetimeConnection: () => (SCENARIO === "offline" ? null : {}),
  useDocsBackendStatus: () => "ready",
  useSignedInMember: () => ({ memberId: tablet.id, role: tablet.role, ready: true }),
  useCurrentMemberId: () => person.id,
}));
const table = (value: readonly unknown[]) => () => [value, true] as const;
mock.module("@/lib/spacetimedb/hooks", () => ({
  useOrgMembers: table(memberRows()),
  useDocumentAccessRows: table([]),
  useSpacetimeDB: () => ({ identity: { toHexString: () => tablet.hex } }),
  useChatConversations: table(rows.chatConversations),
  useChatMessages: table(rows.chatMessages),
  useChatMembers: table([]),
  useRoleTasks: table([]),
  useRoleTaskAssignments: table([]),
  useInventoryTransactions: table([]),
  useInventoryItems: table([]),
  useTrainingObjectives: table([]),
  useBugReports: table([]),
  useOrganizations: table(rows.organizations),
  useUsers: table(rows.users),
}));
// The real useVirtualSources lists forms too; no forms here (the Forms tables are not part of this fixture).
mock.module("@/lib/spacetimedb/hooks/useForms", () => ({
  useForms: () => ({ forms: [], canManage: false, isReady: true, notPublished: false }),
}));
mock.module("@/lib/spacetimedb/hooks/useDeviceApps", () => ({
  useDeviceApps: () => ({
    installed, installedIds: [...installed], isInstalled: (id: string) => installed.has(id), isReady: true, loading: false, savingId: null,
    setInstalled: async (id: string, on: boolean) => {
      installCalls.push([id, on]);
      if (on) installed.add(id);
      else installed.delete(id);
    },
  }),
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({
    organizationId: ORG, role: person.role, permissions: person.permissions ?? {}, can: () => true,
    currentOrg: { id: ORG, name: "Downtown" }, organizations: [], pickOrg: noop,
  }),
}));
mock.module("@/lib/browser-shell", () => ({
  useTabActions: () => ({ openUrl: (url: string) => void shellOpened.push(url) }),
  useSetTabTitle: noop,
  useShellChrome: noop,
}));
mock.module("@/lib/drive/use-drive-token", () => ({ useDriveTokenBridge: noop }));
mock.module("@/lib/drive/use-drive-url", () => ({ useDriveUrl: () => ({ url: null, loading: false, error: null }) }));
mock.module("@/lib/drive/use-drive-storage-status", () => ({
  useDriveStorageStatus: () => ({ status: SCENARIO === "storage-off" ? "unavailable" : "ready" }),
}));
mock.module("@/lib/drive/use-drive-uploads", () => ({
  useDriveUploads: () => ({
    entries: uploads,
    queue: {
      localItemIds: () => new Set<string>(),
      enqueue: (sources: { file: File; name?: string }[], target: Record<string, unknown>) => {
        enqueued.push({ sources, target });
        return sources.map((_, i) => `q${i}`);
      },
      cancel: noop, retry: noop, clearFinished: noop,
    },
  }),
}));
mock.module("@/lib/haptics", () => ({ hapticLight: noop, hapticMedium: noop, hapticHeavy: noop, hapticSuccess: noop, hapticError: noop, hapticWarning: noop }));
mock.module("@/lib/store-device-lock", () => ({ setCurrentOperator: (op: unknown) => void operatorChanges.push(op) }));
mock.module("@/lib/spacetimedb/actions/drive", () => ({
  createDriveFolder: reducer("createDriveFolder"),
  renameDriveItem: reducer("renameDriveItem"),
  renameDriveDocument: reducer("renameDriveDocument"),
  moveDriveEntries: reducer("moveDriveEntries"),
  trashDriveEntries: reducer("trashDriveEntries"),
  restoreDriveEntries: reducer("restoreDriveEntries", SCENARIO === "operator"),
  deleteDriveEntriesForever: reducer("deleteDriveEntriesForever"),
  toggleDriveStar: reducer("toggleDriveStar"),
  createDriveDocument: reducer("createDriveDocument"),
}));
class FakeEditorError extends Error {}
mock.module("@/lib/drive/editors", () => ({
  DRIVE_IMPORT_FAILED_KEY: "drive.home.errors.importFailed",
  DriveEditorError: FakeEditorError,
  checkDriveImport: async () => null,
  importIntoDrive: async () => ({ documentId: uuid(901), warnings: 0 }),
  createDriveDoc: async (kind: string) => {
    calls.push({ name: "createDriveDoc", args: [kind] });
    if (SCENARIO === "operator") throw operatorError();
    return uuid(902);
  },
  createDriveDocFromTemplate: async (templateId: string, target: unknown, ctx: { storeName: string | null; authorName: string | null }) => {
    calls.push({ name: "createDriveDocFromTemplate", args: [templateId, target, { storeName: ctx.storeName, authorName: ctx.authorName }] });
    return uuid(903);
  },
  driveEditorErrorMessage: (_err: unknown, t: (k: string) => string, fallback: string) => t(fallback),
}));
mock.module("@/components/drive/download", () => ({
  readDownloadEnv: () => ({ capacitor: false, coarsePointer: true }),
  downloadEntries: (entries: DriveEntry[]) => {
    calls.push({ name: "downloadEntries", args: entries.map((e) => e.key) });
    return Promise.resolve("downloaded");
  },
}));

// The editors are dynamic chunks: a marker records what the host asked for, and which opener the editor gets.
const { useDocsOpenUrl } = await import("@/components/docs/docs-open-context");
const captured: { open?: DocsOpenUrl; inputs?: { onPicked(source: string, files: unknown): void }; ctx?: unknown } = {};
mock.module("next/dynamic", () => ({
  default: () =>
    function DynamicEditor(props: Record<string, unknown>) {
      captured.open = useDocsOpenUrl();
      return h("div", { "data-dynamic": JSON.stringify(props) });
    },
}));
// The pickers are real; the hidden inputs hand their props to the test.
const inputs = await import("@/components/drive/upload/file-inputs");
mock.module("@/components/drive/upload/file-inputs", () => ({
  ...inputs,
  DriveFileInputs: (props: { onPicked(source: string, files: unknown): void }) => {
    captured.inputs = props;
    return null;
  },
}));
if (SCENARIO === "operator" || pluginScenario) {
  const { useLiteDriveContext } = await import("@/components/drive/lite/lite-context");
  mock.module("@/components/drive/lite/lite-trash", () => ({
    LiteTrash: () => {
      captured.ctx = useLiteDriveContext();
      return null;
    },
  }));
}

// The plugin scenarios: a server render never re-renders, so the gate's requests are recorded as they open the
// install drawer, and the drawer is then rendered on its own with one of them. Bottom sheets render in place (vaul
// portals render nothing on the server) and every LiteButton hands its props to the test, to be tapped.
interface InstallRequest { kind: string; mode: string; then(): void }
const installRequests: InstallRequest[] = [];
const buttons: { label: string; disabled?: boolean; onClick(): void }[] = [];
/** Every option row a rendered bottom sheet offered, to be tapped. */
const drawerOptions: { id: string; label: string; sub?: string; hidden?: boolean; onSelect(): void }[] = [];
/** The editor links built for a document (documentFileHref), with their options. */
const docHrefs: unknown[][] = [];
if (pluginScenario) {
  type DrawerOption = (typeof drawerOptions)[number];
  const option = (o: DrawerOption) => {
    drawerOptions.push(o);
    return h("li", { key: o.id, "data-option": o.id }, o.label, o.sub ? h("small", null, o.sub) : null);
  };
  mock.module("@/components/device/device-drawer", () => ({
    DeviceDrawer: (props: { open: boolean; title: string; children?: unknown; options?: DrawerOption[]; cancelLabel?: string }) =>
      props.open
        ? h(
            "section",
            { "data-drawer": props.title },
            props.options ? h("ul", null, props.options.filter((o) => !o.hidden).map(option)) : null,
            props.children as never,
            h("span", null, props.cancelLabel ?? "Cancel"),
          )
        : null,
  }));
  const hrefs = { ...(await import("@/lib/drive/hrefs")) };
  mock.module("@/lib/drive/hrefs", () => ({
    ...hrefs,
    documentFileHref: (...args: Parameters<typeof hrefs.documentFileHref>) => {
      docHrefs.push(args);
      return hrefs.documentFileHref(...args);
    },
  }));
  const lite = { ...(await import("@/components/device/apps/lite")) };
  mock.module("@/components/device/apps/lite", () => ({
    ...lite,
    LiteButton: (props: Parameters<typeof lite.LiteButton>[0]) => {
      buttons.push(props);
      return lite.LiteButton(props);
    },
  }));
  const gate = { ...(await import("@/components/drive/lite/lite-install-drawer")) };
  mock.module("@/components/drive/lite/lite-install-drawer", () => ({
    ...gate,
    useLiteEditorGate: (surface: "store" | "personal", openInstall: (request: InstallRequest) => void) =>
      gate.useLiteEditorGate(surface, (request) => {
        installRequests.push(request);
        openInstall(request);
      }),
  }));
}

const { renderToStaticMarkup } = await import("react-dom/server");
const { DriveLite } = await import("@/components/device/apps/drive");
const { DriveLiteRouter } = await import("@/components/drive/lite/lite-router");
const { DriveActorProvider } = await import("@/components/drive/drive-actor");
const { LiteNoticeGate } = await import("@/components/drive/notice/management-notice");
const { LiteDriveProvider } = await import("@/components/drive/lite/lite-context");
const { LiteInstallDrawer } = await import("@/components/drive/lite/lite-install-drawer");
const { LiteNewDrawer } = await import("@/components/drive/lite/lite-new-drawer");
const { LiteTemplateDrawer } = await import("@/components/drive/lite/lite-template-drawer");

const member = { id: person.id, displayName: person.name, role: person.role, userIdHex: person.hex, punchInCode: null };

function renderApp(): string {
  return decode(renderToStaticMarkup(h(DriveLite, { surface, organizationId: ORG, member, isManager: person.role !== "staff" })));
}

function renderScreens(screens: LiteDriveScreen[]): string {
  const router = h(DriveLiteRouter, { organizationId: ORG, initialScreens: screens });
  return decode(renderToStaticMarkup(h(DriveActorProvider, { member, surface, children: h(LiteNoticeGate, null, router) })));
}

const home = (tab: "mine" | "store" | "shared" | "team", folderId = ""): LiteDriveScreen => ({ kind: "home", tab, folderId, memberId: "", q: "" });
const entry = (key: string): DriveEntry => {
  const found = data.tree.byKey.get(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
};
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
/** The install drawer alone, open on `request`, under the router's context (`ctx`) captured from a render. */
function renderDrawer(ctx: unknown, request: InstallRequest): string {
  const value = ctx as { panels: { state: Record<string, unknown> } };
  const panels = { ...value.panels, state: { ...value.panels.state, open: "install", install: request } };
  return decode(renderToStaticMarkup(h(LiteDriveProvider, { value: { ...value, panels } as never }, h(LiteInstallDrawer))));
}
/** The options of a pill toggle group (LiteChoice). */
const tabsIn = (html: string) => [...html.matchAll(/aria-pressed="(true|false)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]+)</g)].map((m) => `${m[2]}${m[1] === "true" ? "*" : ""}`);

test(`drive lite: ${SCENARIO}`, async () => {
  switch (SCENARIO) {
    case "store-operator": {
      // Staff operator Priya on a tablet signed in as the owner: Mine is Priya's, never the account's.
      const html = renderApp();
      expect(html).toContain("Store management can see everything you save here.");
      expect(html).toContain('data-drive-notice="shared-device"');
      expect(tabsIn(html)).toEqual(["Mine*", "Store"]);
      for (const own of ["Receipts", "priya-notes.pdf", "Priya budget"]) expect(html).toContain(own);
      for (const theirs of ["ana-private.pdf", "Ana plan", "ben-shift.pdf", "menu.pdf"]) expect(html).not.toContain(theirs);
      for (const label of ["Take photo", "Upload file", "From other apps", "Trash"]) expect(html).toContain(label);
      // Storage: everything the store keeps against the quota, then its four parts as rows.
      expect(html).toContain(`>${formatDriveBytes(USAGE.breakdown.total, "en")} of 10 GB used<`);
      const storage = html.slice(html.indexOf("data-lite-storage="));
      expect(storage).toContain(tr("drive.storage.breakdown.title"));
      for (const [part, bytes] of Object.entries(PARTS)) {
        expect(storage).toContain(tr(`drive.storage.breakdown.${part}`));
        expect(storage).toContain(`>${formatDriveBytes(bytes, "en")}<`);
      }
      // A document's recorded size sits on its line; one without a size shows none (never "0 B").
      expect(html).toContain(formatDriveBytes(PRIYA_SHEET_BYTES, "en"));
      expect(html).not.toContain(">0 B");

      const store = renderScreens([home("store")]);
      for (const shared of ["menu.pdf", "shelf.jpg", "Store pitch"]) expect(store).toContain(shared);
      expect(store).not.toContain("priya-notes.pdf");

      // Trash: only what Priya may put back — none of the tablet account's.
      const trash = renderScreens([home("mine"), { kind: "trash" }]);
      expect(trash).toContain("old-receipt.pdf");
      for (const theirs of ["ana-trash.pdf", "Ana old doc"]) expect(trash).not.toContain(theirs);

      // Other apps: no chat on the shared tablet; the profile source holds the store logo only.
      const apps = renderScreens([home("mine"), { kind: "apps", source: "" }]);
      expect(apps).toContain("Store & profile");
      // Totals over every app file of the store; the logo folds into Store & profile; chat (not on the tablet) and
      // images inside documents are plain rows with a size.
      expect(apps).toContain(`${formatDriveBytes(Object.values(APP_BYTES).reduce((a, b) => a + b, 0), "en")} stored in other apps`);
      expect(apps).toContain(tr("drive.apps.notStoredHere"));
      expect(apps).toContain(`1 file · ${formatDriveBytes(1_000, "en")}`);
      const tiles = apps.slice(apps.indexOf('data-lite-list="apps"'), apps.indexOf('data-lite-list="app-bytes"'));
      expect(tiles).not.toContain(">Chat<");
      const plain = apps.slice(apps.indexOf('data-lite-list="app-bytes"'));
      expect(plain).toContain(">Chat<");
      expect(plain).toContain("Images in documents");
      expect(plain).toContain(formatDriveBytes(34_000_000, "en"));
      expect(plain).not.toContain("<button");
      const profile = renderScreens([home("mine"), { kind: "apps", source: "profile" }]);
      expect(profile).toContain("Store logo");
      expect(profile).not.toContain("Your profile photo");

      // Actions: no stars, sharing or tabs on the device; another member's Store file can't be renamed or deleted.
      const ctx = { surface: "store" as const, section: "store" as const, offline: false };
      const moves = { toStore: false, toMy: false };
      for (const e of data.tree.entries) {
        const actions = liteActionOptions(e, ctx, moves).map((o) => o.action);
        for (const managerOnly of ["star", "unstar", "share", "openNewTab", "select", "openOriginal"]) expect(actions).not.toContain(managerOnly);
      }
      const anaStore = liteActionOptions(entry(`item:${ID.storeMenu}`), ctx, moves).map((o) => o.action);
      expect(anaStore).toEqual(expect.arrayContaining(["preview", "download", "details"]));
      for (const refused of ["rename", "move", "trash"]) expect(anaStore).not.toContain(refused);
      const own = liteActionOptions(entry(`item:${ID.priyaFile}`), ctx, moves);
      expect(own.map((o) => o.action)).toEqual(expect.arrayContaining(["preview", "download", "rename", "move", "trash"]));
      expect(own.find((o) => o.action === "trash")).toMatchObject({ labelKey: "device.lite.drive.trashItem", tone: "warn" });
      break;
    }
    case "staff-tablet": {
      // A staff account signed in on the tablet: Store only, and a note says why.
      const html = renderApp();
      expect(html).toContain('data-lite-note="staff-tablet"');
      expect(html).toContain("This tablet can't open personal files.");
      expect(tabsIn(html)).toEqual([]);
      for (const shared of ["menu.pdf", "shelf.jpg", "Store pitch"]) expect(html).toContain(shared);
      for (const mine of ["priya-notes.pdf", "Receipts", "Priya budget"]) expect(html).not.toContain(mine);
      expect(html).toContain("Take photo");
      break;
    }
    case "personal": {
      // The owner on her own phone: her files, Team, no shared-tablet note; chat and her profile photo are hers.
      const html = renderApp();
      expect(tabsIn(html)).toEqual(["Mine*", "Store", "Team"]);
      expect(html).not.toContain('data-drive-notice="shared-device"');
      for (const own of ["ana-private.pdf", "Ana plan"]) expect(html).toContain(own);
      expect(html).not.toContain("priya-notes.pdf");
      const apps = renderScreens([home("mine"), { kind: "apps", source: "" }]);
      expect(apps).toContain(">Chat<");
      expect(apps).toContain("2 files");
      // The Chat tile counts the one file it lists; the rest of the store's chat bytes (other people's attachments)
      // is a plain "files you can't open here" row, so the tile's count and size describe the same files.
      expect(apps).toContain(`1 file · ${formatDriveBytes(TILL_BYTES, "en")}`);
      const notListed = apps.slice(apps.indexOf('data-lite-list="app-bytes"'));
      expect(notListed).toContain("Chat: files you can't open here");
      expect(notListed).toContain(formatDriveBytes(3_000_000 - TILL_BYTES, "en"));
      // The chat photo is an UploadThing file: its recorded size is on its line.
      const chat = renderScreens([home("mine"), { kind: "apps", source: "chat" }]);
      expect(chat).toContain("till.jpg");
      expect(chat).toContain(formatDriveBytes(TILL_BYTES, "en"));
      // …and on its preview's back row, after its kind.
      const preview = renderScreens([home("mine"), { kind: "apps", source: "chat" }, { kind: "preview", key: `v:chat:${uuid(32)}` }]);
      expect(preview).toContain(`· ${formatDriveBytes(TILL_BYTES, "en")}`);
      const team = renderScreens([home("team")]);
      expect(team).toContain("Priya Patel");
      expect(team).toContain("Ben Ito");
      break;
    }
    case "needs-ack": {
      const html = renderApp();
      expect(html).toContain('data-drive-notice="lite-gate"');
      expect(html).toContain("I understand");
      for (const hidden of ["Take photo", "Mine", "priya-notes.pdf", "From other apps"]) expect(html).not.toContain(hidden);
      break;
    }
    case "empty": {
      const html = renderApp();
      expect(html).toContain("Nothing here yet");
      expect(html).toContain("Take a photo or upload a file.");
      expect(html).toContain("Take photo");
      break;
    }
    case "not-published": {
      const html = renderApp();
      expect(html).toContain("Drive isn't ready yet. Try again later.");
      for (const hidden of ["Take photo", "Search files", "priya-notes.pdf"]) expect(html).not.toContain(hidden);
      break;
    }
    case "offline": {
      const html = renderApp();
      expect(html).toContain('data-lite-note="offline"');
      expect(html).toContain("No connection. You can look, but changes can't be saved.");
      expect(html).toContain("priya-notes.pdf");
      expect(html).not.toContain("Take photo");
      break;
    }
    case "storage-off": {
      // The file store is unavailable: the photo and file buttons are off and a note says why; New still works.
      const html = renderApp();
      expect(html).toContain('data-lite-note="storage"');
      expect(html).toContain("File uploads aren't available right now. Try again later.");
      for (const label of ["Take photo", "Upload file"]) {
        expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>(?:<svg[\\s\\S]*?</svg>)?${label}<`));
      }
      expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>(?:<svg[\s\S]*?<\/svg>)?New</);
      expect(html).toContain("priya-notes.pdf");
      break;
    }
    case "checking": {
      const html = renderApp();
      expect(html).toContain("min-h-[40vh]");
      for (const hidden of ["Take photo", "Nothing here yet", "priya-notes.pdf"]) expect(html).not.toContain(hidden);
      break;
    }
    case "editor": {
      // A Sheet opens in its editor inside the panel, in the phone layout, with the panel's opener.
      const html = renderScreens([home("mine"), { kind: "editor", docKind: "sheet", id: ID.priyaSheet }]);
      expect(html).toContain('data-lite-screen="editor"');
      expect(html).toContain('data-drive-editor="sheet"');
      expect(html).toContain(`"documentId":"${ID.priyaSheet}"`);
      expect(html).toContain('"mobile":true');
      expect(html).not.toContain('"isNew"');
      // A document just made in the panel reaches its route as new (a panel has no `?new=1`).
      const fresh = renderScreens([home("mine"), { kind: "editor", docKind: "slides", id: ID.storeDeck, isNew: true }]);
      expect(fresh).toContain('data-drive-editor="slides"');
      expect(fresh).toContain('"isNew":true');
      const open = captured.open;
      if (!open) throw new Error("the editor got no opener");
      open("/manager/drive", "current");
      open(`/manager/drive/slides?id=${ID.storeDeck}`, "current");
      open(`/manager/docs/edit?id=${ID.anaDoc}`, "current");
      expect(toasts).toEqual([]);
      // Nothing leaves the panel.
      expect(shellOpened).toEqual([]);
      break;
    }
    case "plugin-missing": {
      // Ana (owner) works her own tablet and Sheets isn't downloaded. A sheet's editor screen asks instead.
      const sheetScreen: LiteDriveScreen = { kind: "editor", docKind: "sheet", id: ID.priyaSheet };
      const prompt = renderScreens([home("mine"), sheetScreen]);
      expect(prompt).toContain('data-lite-install="sheets"');
      expect(prompt).toContain("Sheets isn't installed");
      expect(prompt).toContain(">Download<");
      expect(prompt).not.toContain("data-drive-editor");

      // Every way into a sheet asks first and writes nothing: a tap, New ▸ Sheet, an editor link.
      renderScreens([home("mine"), { kind: "trash" }]);
      const ctx = captured.ctx as {
        openEntry(e: DriveEntry): void;
        nav: { openUrl: DocsOpenUrl };
        drive: { createDocument(kind: string, target: unknown): void };
      } | undefined;
      if (!ctx) throw new Error("no lite context");
      const storeRoot = { space: "store", parentId: "", ownerMemberId: "" };
      ctx.openEntry(entry(`doc:${ID.priyaSheet}`));
      ctx.drive.createDocument("sheet", storeRoot);
      ctx.nav.openUrl(`/manager/drive/sheet?id=${ID.priyaSheet}`, "current");
      // Docs and Slides are downloaded: they open and create at once.
      ctx.openEntry(entry(`doc:${ID.storeDeck}`));
      ctx.nav.openUrl(`/manager/docs/edit?id=${ID.anaDoc}`, "current");
      await settle();
      expect(installRequests.map((r) => `${r.kind}:${r.mode}`)).toEqual(["sheet:open", "sheet:create", "sheet:open"]);
      expect(calls.filter((c) => c.name === "createDriveDoc")).toEqual([]);

      // The drawer for New ▸ Sheet: Download installs Sheets for the store, then the sheet is created.
      const drawer = renderDrawer(ctx, installRequests[1]);
      expect(drawer).toContain('data-drawer="Sheets"');
      expect(drawer).toContain("Download Sheets to create this.");
      expect(drawer).toContain("Not now");
      buttons.length = 0;
      renderDrawer(ctx, installRequests[1]);
      const download = buttons.find((b) => b.label === "Download");
      if (!download) throw new Error("no Download button");
      expect(download.disabled).toBeFalsy();
      download.onClick();
      await settle();
      expect(installCalls).toEqual([["sheets", true]]);
      expect(calls.filter((c) => c.name === "createDriveDoc").map((c) => c.args)).toEqual([["sheet"]]);
      expect(toasts.map((x) => x.message)).toContain("Sheets is ready");
      // The new sheet's link passed the panel's opener without asking again, and the editor now opens.
      expect(installRequests).toHaveLength(3);
      expect(renderScreens([home("mine"), sheetScreen])).toContain('data-drive-editor="sheet"');
      break;
    }
    case "plugin-template": {
      // Ana (owner) on her tablet, Docs not downloaded. New offers every kind; the ones to download say so.
      renderScreens([home("mine"), { kind: "trash" }]);
      const ctx = captured.ctx as { panels: { state: Record<string, unknown> } } | undefined;
      if (!ctx) throw new Error("no lite context");
      const storeRoot = { space: "store", parentId: "", ownerMemberId: "" };
      const withPanels = (state: Record<string, unknown>, child: Parameters<typeof h>[0], props: Record<string, unknown> | null = null) =>
        decode(renderToStaticMarkup(h(LiteDriveProvider, {
          value: { ...ctx, panels: { ...ctx.panels, state: { ...ctx.panels.state, ...state } } } as never,
        }, h(child, props))));
      const newSheet = withPanels({}, LiteNewDrawer, { open: true, onOpenChange: noop, target: storeRoot, onPickPhotos: null });
      expect(drawerOptions.map((o) => `${o.id}${o.sub ? `(${o.sub})` : ""}`)).toEqual([
        "folder", "doc(Download first)", "template(Download first)", "sheet", "slides",
      ]);
      expect(newSheet).toContain("Doc from a template");

      // The template sheet lists the five store templates; picking one asks to download Docs and writes nothing.
      drawerOptions.length = 0;
      const sheet = withPanels({ open: "templates", templates: storeRoot }, LiteTemplateDrawer);
      expect(sheet).toContain('data-drawer="Pick a template"');
      expect(drawerOptions.map((o) => o.label)).toEqual([
        "Meeting notes", "Shift handover", "Store procedure", "Incident report", "Weekly checklist",
      ]);
      drawerOptions[1].onSelect();
      await settle();
      expect(installRequests.map((r) => `${r.kind}:${r.mode}`)).toEqual(["doc:create"]);
      expect(calls.filter((c) => c.name === "createDriveDocFromTemplate")).toEqual([]);

      // Download installs Docs, then the Doc is made from the template, signed with the store's and Ana's names,
      // and opens as a new document.
      buttons.length = 0;
      renderDrawer(ctx, installRequests[0]);
      const download = buttons.find((b) => b.label === "Download");
      if (!download) throw new Error("no Download button");
      download.onClick();
      await settle();
      expect(installCalls).toEqual([["docs", true]]);
      expect(calls.filter((c) => c.name === "createDriveDocFromTemplate").map((c) => c.args)).toEqual([
        ["shiftHandover", { organizationId: ORG, space: "store", folderId: "", ownerMemberId: "", actingMemberId: PEOPLE.ana.id },
          { storeName: "Downtown", authorName: "Ana Ruiz" }],
      ]);
      expect(docHrefs).toEqual([[{ id: uuid(903), fileType: "doc" }, { isNew: true }]]);
      expect(toasts.filter((x) => x.kind === "error")).toEqual([]);
      expect(installRequests).toHaveLength(1);
      break;
    }
    case "plugin-ask": {
      // Staff operator Priya on the owner's tablet may not download: she is told to ask, and there is no Download.
      const prompt = renderScreens([home("mine"), { kind: "editor", docKind: "sheet", id: ID.priyaSheet }]);
      expect(prompt).toContain('data-lite-install="sheets"');
      expect(prompt).toContain("Ask an owner or a manager to download Sheets from Plugins.");
      expect(prompt).not.toContain(">Download<");
      // The editor's header is gone, so the prompt brings its own way back to the list.
      expect(prompt).toContain("Back");

      renderScreens([home("mine"), { kind: "trash" }]);
      const ctx = captured.ctx as { openEntry(e: DriveEntry): void } | undefined;
      if (!ctx) throw new Error("no lite context");
      ctx.openEntry(entry(`doc:${ID.priyaSheet}`));
      expect(installRequests.map((r) => `${r.kind}:${r.mode}`)).toEqual(["sheet:open"]);
      buttons.length = 0;
      const drawer = renderDrawer(ctx, installRequests[0]);
      expect(drawer).toContain("Download Sheets to open this file.");
      expect(drawer).toContain("Ask an owner or a manager to download Sheets from Plugins.");
      expect(drawer).toContain("Close");
      expect(buttons.map((b) => b.label)).not.toContain("Download");
      expect(installCalls).toEqual([]);
      break;
    }
    case "camera": {
      // A camera shot inside a folder uploads there, named "Photo <date time>.jpg", as the operator.
      renderScreens([home("mine"), home("mine", ID.priyaFolder)]);
      const picked = captured.inputs;
      if (!picked) throw new Error("no file inputs mounted");
      picked.onPicked("camera", [cameraShot("image.jpg", "image/jpeg", 512)]);
      await settle();
      expect(enqueued).toHaveLength(1);
      const [{ sources, target }] = enqueued;
      expect(sources).toHaveLength(1);
      expect(sources[0].name).toMatch(/^Photo \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.jpg$/);
      expect(target).toEqual({ organizationId: ORG, space: "my", parentId: ID.priyaFolder, ownerMemberId: PRIYA_ID, actingMemberId: PRIYA_ID });
      break;
    }
    case "operator": {
      // The tablet's PIN session is gone: every failure says so and offers to log in again, which drops the operator.
      const html = renderScreens([home("mine")]);
      expect(html).toContain("till-photo.jpg");
      expect(html).toContain("Enter your PIN again to continue.");
      expect(html).toContain("Log in again");
      expect(html).not.toContain("ben-secret.jpg");

      renderScreens([home("mine"), { kind: "trash" }]);
      const ctx = captured.ctx as {
        act(e: DriveEntry, action: string): void;
        drive: { createDocument(kind: string, target: unknown): void };
      } | undefined;
      if (!ctx) throw new Error("no lite context");
      ctx.act(entry(`item:${ID.priyaTrashed}`), "restore");
      await settle();
      ctx.drive.createDocument("sheet", { space: "store", parentId: "", ownerMemberId: "" });
      await settle();
      expect(calls.filter((c) => c.name === "restoreDriveEntries")).toHaveLength(1);
      expect((calls.find((c) => c.name === "restoreDriveEntries")?.args[0] as { actingMemberId: string }).actingMemberId).toBe(PRIYA_ID);
      const relogins = toasts.filter((x) => x.kind === "error");
      expect(relogins.map((x) => [x.message, x.opts?.action?.label])).toEqual([
        ["Enter your PIN again to continue.", "Log in again"],
        ["Enter your PIN again to continue.", "Log in again"],
      ]);
      relogins[0].opts?.action?.onClick();
      expect(operatorChanges).toEqual([null]);
      break;
    }
  }
});

test("no unresolved copy", () => {
  const html = SCENARIO === "editor" || SCENARIO === "camera" ? "" : renderApp();
  expect(html).not.toMatch(/!(device|drive|common|pluginInstall)\./);
});
