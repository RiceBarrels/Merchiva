// Isolated fixture for scripts/tests/drive/home/new-menu.test.ts — NOT auto-discovered by `bun test`. It replaces the
// menu primitives, the editor adapter, the auth and permission contexts and sonner with mock.module, so it runs in its
// own process.
//
// The Drive New menu (components/drive/toolbar/new-menu.tsx): Doc, Sheet and Slides always show, a kind whose editor
// plugin is missing says "download first"; From a template lists the Docs store templates (not blank); Import a file
// opens a picker of every importable format. useDriveCreate.importFile picks the editor by extension, asks for a
// missing plugin before reading the file, checks the importer's rules before importing, and opens the new document.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement as h, type ReactNode } from "react";
import { documentFileHref } from "@/lib/drive/hrefs";
import { decode, ME, ORG, translator, uuid } from "./fixture";

const t = translator();
const noop = () => {};
mock.module("@/lib/i18n/context", () => ({ useT: () => t, useI18n: () => ({ locale: "en", dir: "ltr", setLocale: noop, t }) }));
mock.module("@/lib/auth/context", () => ({
  useAuth: () => ({ user: { firstName: "Sam", lastName: "Lee", email: "sam@example.com" } }),
}));
mock.module("@/lib/context/permissions", () => ({ usePermissions: () => ({ currentOrg: { name: "Corner Cafe" }, organizationId: ORG }) }));

// The menu renders inline, open, so server markup shows every item and its prose hint (never the shortcut slot).
type Slot = { children?: ReactNode; hint?: string; shortcut?: string; disabled?: boolean; onClick?: () => void; render?: ReactNode };
const item = ({ children, hint, shortcut, disabled }: Slot) =>
  h("div", { "data-item": "", "data-disabled": disabled ? "" : undefined }, children, hint ? h("small", null, hint) : null, shortcut ? h("kbd", null, shortcut) : null);
const box = (tag: string) => ({ children }: Slot) => h("div", { [`data-${tag}`]: "" }, children);
mock.module("@/components/docs/ui/doc-menu", () => ({
  DocMenu: box("menu"),
  DocMenuTrigger: ({ render }: Slot) => render ?? null,
  DocMenuContent: box("content"),
  DocMenuItem: item,
  DocMenuSeparator: () => h("hr"),
  DocMenuSub: box("sub"),
  DocMenuSubTrigger: ({ children }: Slot) => h("div", { "data-sub-trigger": "" }, children),
  DocMenuSubContent: box("sub-content"),
}));

interface Toast { kind: string; message: string }
const toasts: Toast[] = [];
mock.module("sonner", () => ({
  toast: Object.assign((message: string) => void toasts.push({ kind: "info", message }), {
    error: (message: string) => void toasts.push({ kind: "error", message }),
    warning: (message: string) => void toasts.push({ kind: "warning", message }),
    success: (message: string) => void toasts.push({ kind: "success", message }),
  }),
}));

const calls: { name: string; args: unknown[] }[] = [];
const named = (name: string) => calls.filter((c) => c.name === name).map((c) => c.args);
class FakeEditorError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}
let importProblem: string | null = null;
mock.module("@/lib/drive/editors", () => ({
  DRIVE_IMPORT_FAILED_KEY: "drive.home.errors.importFailed",
  DriveEditorError: FakeEditorError,
  checkDriveImport: async (kind: string, file: File) => {
    calls.push({ name: "checkDriveImport", args: [kind, file.name] });
    return importProblem;
  },
  importIntoDrive: async (file: File, kind: string, target: unknown, ctx: { beforeCreate?: () => void }) => {
    calls.push({ name: "importIntoDrive", args: [file.name, kind, target] });
    ctx.beforeCreate?.();
    return { documentId: uuid(910), warnings: 2 };
  },
  createDriveDoc: async () => uuid(911),
  createDriveDocFromTemplate: async () => uuid(912),
  driveEditorErrorMessage: (err: unknown, tr: (k: string) => string, fallback: string) => (err instanceof FakeEditorError ? err.userMessage : tr(fallback)),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { render } = await import("ink-testing-library");
const { NewMenu } = await import("@/components/drive/toolbar/new-menu");
const { DRIVE_IMPORT_ACCEPT } = await import("@/components/drive/toolbar/import-file-input");
const { STORE_TEMPLATE_IDS, useDocTemplateNames } = await import("@/components/drive/store-templates");
const { useDriveCreate } = await import("@/components/drive/actions/use-drive-create");
const { buildDriveTree } = await import("@/components/drive/model/entries");

const MY_ROOT = { space: "my" as const, parentId: "", ownerMemberId: ME };
const DOWNLOAD_FIRST = t("pluginInstall.downloadFirst");

function menuMarkup(installed: readonly string[], canDownloadEditors = true): string {
  return decode(
    renderToStaticMarkup(
      h(NewMenu, {
        disabledReason: null,
        editorInstalled: (kind) => installed.includes(kind),
        canDownloadEditors,
        supportsFolder: false,
        onNewFolder: noop,
        onUploadFiles: noop,
        onUploadFolder: noop,
        onNewDocument: noop,
        onNewFromTemplate: noop,
        onImportFile: noop,
      }),
    ),
  );
}
/** The text of each menu item, with its hint after " | ". */
function items(markup: string): string[] {
  return [...markup.matchAll(/<div data-item="">(.*?)<\/div>/g)].map((m) => m[1].replace("<small>", " | ").replace(/<[^>]+>/g, ""));
}

describe("New menu", () => {
  test("Doc, Sheet and Slides always show; a missing plugin says download first", () => {
    const list = items(menuMarkup(["slides"]));
    expect(list).toContain(`${t("drive.menu.newDoc")} | ${DOWNLOAD_FIRST}`);
    expect(list).toContain(`${t("drive.menu.newSheet")} | ${DOWNLOAD_FIRST}`);
    expect(list).toContain(t("drive.menu.newSlides"));
    expect(items(menuMarkup(["doc", "sheet", "slides"])).some((text) => text.includes(DOWNLOAD_FIRST))).toBe(false);
  });

  test("From a template lists the five store templates, not blank; Import a file has its picker", () => {
    const markup = menuMarkup(["doc"]);
    expect(markup).toContain(`<div data-sub-trigger="">${t("drive.home.newFromTemplate")}</div>`);
    expect(STORE_TEMPLATE_IDS).toEqual(["meetingNotes", "shiftHandover", "storeSop", "incidentReport", "weeklyChecklist"]);
    const list = items(markup);
    for (const id of STORE_TEMPLATE_IDS) expect(list).toContain(t(`docs.templates.${id}.title`));
    expect(list).not.toContain(t("docs.templates.blank"));
    expect(list).toContain(t("drive.home.importFile"));
    expect(markup).toContain(`accept="${DRIVE_IMPORT_ACCEPT}"`);
    expect(markup).not.toMatch(/![a-z]+\.[A-Za-z.]+/);
    expect(DRIVE_IMPORT_ACCEPT.split(",")).toEqual([".docx", ".md", ".markdown", ".html", ".htm", ".txt", ".xlsx", ".xlsm", ".csv", ".pptx"]);
  });

  test("someone who may not download is told it is not installed, never to download it", () => {
    const list = items(menuMarkup(["slides"], false));
    expect(list).toContain(`${t("drive.menu.newSheet")} | ${t("pluginInstall.notInstalled")}`);
    expect(list.some((text) => text.includes(DOWNLOAD_FIRST))).toBe(false);
  });

  test("templates are hinted only while Docs is missing", () => {
    const meeting = t("docs.templates.meetingNotes.title");
    expect(items(menuMarkup(["sheet"]))).toContain(`${meeting} | ${DOWNLOAD_FIRST}`);
    expect(items(menuMarkup(["doc"]))).toContain(meeting);
  });
});

function Probe<T>({ useValue, report }: { useValue: () => T; report(value: T): void }) {
  report(useValue());
  return null;
}
/** Renders a component that calls `useValue` and returns a reader of its latest value. */
function mountHook<T>(useValue: () => T): () => T {
  const latest: { current: T | null } = { current: null };
  render(h(Probe<T>, { useValue, report: (value: T) => void (latest.current = value) }));
  return () => {
    if (latest.current === null) throw new Error("not rendered");
    return latest.current;
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const openUrls: [string, string][] = [];
const gated: [string, string][] = [];
let missing: string[] = [];
const pending: (() => void)[] = [];
const tree = buildDriveTree([]);
const create = () =>
  mountHook(() =>
    useDriveCreate({
      tree, organizationId: ORG, actingMemberId: "", actorMemberId: ME, section: "my", usage: null,
      // A missing plugin holds the create until "installed" (pending), like the editor gate's prompt.
      ensureEditor: (kind, mode, then) => {
        gated.push([kind, mode]);
        if (missing.includes(kind)) pending.push(then);
        else then();
      },
      queue: { enqueue: () => [] }, openUrl: (href, disposition) => void openUrls.push([href, disposition]),
      showMyFiles: noop, t, locale: "en",
    }),
  );

beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  openUrls.length = 0;
  gated.length = 0;
  pending.length = 0;
  missing = [];
  importProblem = null;
});

describe("Import a file", () => {
  test("the extension picks the editor; a missing plugin is asked for before the file is read", async () => {
    missing = ["sheet"];
    const run = create();
    run().importFile(new File(["a,b"], "Stock.csv", { type: "text/csv" }), MY_ROOT);
    await flush();
    expect(gated).toEqual([["sheet", "create"]]);
    expect(calls).toEqual([]);
    expect(run().creating).toBeNull();
    pending.shift()?.();
    await flush();
    expect(named("checkDriveImport")).toEqual([["sheet", "Stock.csv"]]);
    expect(named("importIntoDrive")).toEqual([
      ["Stock.csv", "sheet", { organizationId: ORG, space: "my", folderId: "", ownerMemberId: ME, actingMemberId: "" }],
    ]);
    expect(openUrls).toEqual([[documentFileHref({ id: uuid(910), fileType: "sheet" }, { isNew: true }), "current"]]);
    expect(toasts).toEqual([{ kind: "info", message: t("drive.preview.importWarnings") }]);
    expect(run().creating).toBeNull();
  });

  test("a deck goes to Slides and a .docx to Docs", async () => {
    const run = create();
    run().importFile(new File(["x"], "Pitch.pptx"), MY_ROOT);
    await flush();
    run().importFile(new File(["x"], "Notes.docx"), MY_ROOT);
    await flush();
    expect(gated).toEqual([["slides", "create"], ["doc", "create"]]);
    expect(named("importIntoDrive").map((args) => args[1])).toEqual(["slides", "doc"]);
  });

  test("a file the importer refuses says why and imports nothing", async () => {
    importProblem = "Too big to open.";
    const run = create();
    run().importFile(new File(["x"], "Huge.xlsx"), MY_ROOT);
    await flush();
    expect(named("checkDriveImport")).toEqual([["sheet", "Huge.xlsx"]]);
    expect(named("importIntoDrive")).toEqual([]);
    expect(openUrls).toEqual([]);
    expect(toasts).toEqual([{ kind: "error", message: "Too big to open." }]);
  });

  test("a format no editor imports is refused before anything else", async () => {
    const run = create();
    run().importFile(new File(["x"], "menu.pdf", { type: "application/pdf" }), MY_ROOT);
    await flush();
    expect(gated).toEqual([]);
    expect(calls).toEqual([]);
    expect(toasts).toEqual([{ kind: "error", message: t("docs.import.unsupported") }]);
    expect(t("docs.import.unsupported").startsWith("!")).toBe(false);
  });
});

describe("template names", () => {
  test("the member's name, else the account's; the store's name", () => {
    const named_ = mountHook(() => useDocTemplateNames(new Map([[ME, "Sam at the till"]]), ME));
    expect(named_()).toEqual({ storeName: "Corner Cafe", authorName: "Sam at the till" });
    const fromAccount = mountHook(() => useDocTemplateNames(new Map(), ME));
    expect(fromAccount()).toEqual({ storeName: "Corner Cafe", authorName: "Sam Lee" });
  });
});
