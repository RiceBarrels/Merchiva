// Isolated fixture for scripts/tests/drive/home-render.test.ts — NOT auto-discovered by `bun test`. It replaces the
// reducer wrappers, the download runner, the editor adapter and sonner with mock.module, so it runs in its own process.
//
// Runs the real useDriveActions and useDriveCreate (components/drive/actions/*) under ink's React renderer over the
// real entry tree of home/fixture.ts: downloads start inside the click and "Save next" saves one file per click; trash
// toasts "Undo", which restores; drops that can't happen say why and a space change asks first; rename and New folder
// go through their dialog, and what lands in My files from Recent says so; "Open as …" imports and opens the new file;
// a create whose reply never comes (once sent) ends with the "no answer" copy instead of spinning forever; a missing
// editor plugin (use-editor-gate.ts) is asked for before anything opens, imports or is created.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement as h, useMemo, useSyncExternalStore } from "react";
import { folderContainer } from "@/components/drive/model/entries";
import type { DriveEntry, DriveSection } from "@/components/drive/model/types";
import { documentFileHref } from "@/lib/drive/hrefs";
import { driveData, entryOf, makeDoc, makeItem, ME, ORG, PRIYA, translator, uuid } from "./fixture";

interface Call { name: string; args: unknown[] }
const calls: Call[] = [];
const named = (name: string) => calls.filter((c) => c.name === name);
const record = (name: string, value?: (args: unknown[]) => unknown) => (...args: unknown[]) => {
  calls.push({ name, args });
  return Promise.resolve(value?.(args));
};

interface Toast { kind: string; message: string; opts?: { action?: { label: string; onClick: () => void } } }
const toasts: Toast[] = [];
const toastFn = Object.assign((message: string, opts?: Toast["opts"]) => void toasts.push({ kind: "info", message, opts }), {
  success: (message: string, opts?: Toast["opts"]) => void toasts.push({ kind: "success", message, opts }),
  error: (message: string, opts?: Toast["opts"]) => void toasts.push({ kind: "error", message, opts }),
  warning: (message: string, opts?: Toast["opts"]) => void toasts.push({ kind: "warning", message, opts }),
  loading: (message: string) => {
    toasts.push({ kind: "loading", message });
    return "loading-1";
  },
  dismiss: (id: string) => void toasts.push({ kind: "dismiss", message: id }),
});
mock.module("sonner", () => ({ toast: toastFn }));

// Downloads record whether they ran inside the click (`inGesture`, set by click()) and answer from a script.
let inGesture = false;
function click<T>(run: () => T): T {
  inGesture = true;
  try {
    return run();
  } finally {
    inGesture = false;
  }
}
const downloadResults: unknown[] = [];
mock.module("@/components/drive/download", () => ({
  readDownloadEnv: () => ({ capacitor: false, coarsePointer: false }),
  downloadEntries: (entries: DriveEntry[]) => {
    calls.push({ name: "downloadEntries", args: [entries.map((e) => e.key), inGesture] });
    return Promise.resolve(downloadResults.shift() ?? "downloaded");
  },
}));
mock.module("@/lib/spacetimedb/actions/drive", () => ({
  createDriveFolder: record("createDriveFolder", (args) => (args[0] as { itemId: string }).itemId),
  renameDriveItem: record("renameDriveItem"),
  renameDriveDocument: record("renameDriveDocument"),
  moveDriveEntries: record("moveDriveEntries"),
  trashDriveEntries: record("trashDriveEntries"),
  restoreDriveEntries: record("restoreDriveEntries"),
  deleteDriveEntriesForever: record("deleteDriveEntriesForever"),
  toggleDriveStar: record("toggleDriveStar"),
  createDriveDocument: record("createDriveDocument", () => uuid(900)),
}));
class FakeEditorError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}
let importFails = false;
// "parse": the call never reaches its create; "reply": its create is sent (beforeCreate) and never answered.
let hang: "none" | "parse" | "reply" = "none";
function stall(ctx: { beforeCreate?: () => void }): Promise<never> {
  if (hang === "reply") ctx.beforeCreate?.();
  return new Promise<never>(() => {});
}
mock.module("@/lib/drive/editors", () => ({
  DRIVE_IMPORT_FAILED_KEY: "drive.home.errors.importFailed",
  DriveEditorError: FakeEditorError,
  checkDriveImport: async (kind: string, file: unknown) => {
    calls.push({ name: "checkDriveImport", args: [kind, file] });
    return null;
  },
  importIntoDrive: async (file: File, kind: string, target: unknown, ctx: { driveItemId?: string; beforeCreate?: () => void }) => {
    calls.push({ name: "importIntoDrive", args: [file.name, file.type, kind, target, ctx.driveItemId] });
    if (hang !== "none") return stall(ctx);
    if (importFails) throw new FakeEditorError("Only .xlsx and .csv files can be opened.");
    return { documentId: uuid(901), warnings: 1 };
  },
  createDriveDoc: async (kind: string, target: unknown, ctx: { beforeCreate?: () => void }) => {
    calls.push({ name: "createDriveDoc", args: [kind, target] });
    if (createHold) await createHold;
    return hang === "none" ? uuid(902) : stall(ctx);
  },
  createDriveDocFromTemplate: async (templateId: string, target: unknown, ctx: { beforeCreate?: () => void }) => {
    calls.push({ name: "createDriveDocFromTemplate", args: [templateId, target] });
    return hang === "none" ? uuid(903) : stall(ctx);
  },
  driveEditorErrorMessage: (err: unknown, t: (k: string) => string, fallback: string) => (err instanceof FakeEditorError ? err.userMessage : t(fallback)),
}));
mock.module("@/lib/drive/download", () => ({
  fetchDriveItemBytes: async (item: { id: string }) => {
    calls.push({ name: "fetchDriveItemBytes", args: [item.id] });
    return new TextEncoder().encode("bytes").buffer;
  },
}));

// The org has only Slides: Docs and Sheets are missing. install() succeeds, but the page keeps the old install
// state until it re-renders (as when the settings row has not streamed back yet).
// A test may add to `streamed` (and call `restream`) to stand for that row arriving and re-rendering the page.
const pluginInstalls: string[] = [];
const streamed = new Set<string>();
let streamVersion = 0;
let streamReady = true;
const streamListeners = new Set<() => void>();
const restream = () => {
  streamVersion += 1;
  for (const listener of streamListeners) listener();
};
let createHold: Promise<void> | null = null;
mock.module("@/components/plugins/use-plugin-install", () => ({
  usePluginInstall: () => {
    const version = useSyncExternalStore(
      (listener) => (streamListeners.add(listener), () => void streamListeners.delete(listener)),
      () => streamVersion,
    );
    const ready = version >= 0 && streamReady;
    const isInstalled = useMemo(
      () => (appId: string) => appId === "slides" || appId === "drive" || (version >= 0 && streamed.has(appId)),
      [version],
    );
    return {
      ready,
      isInstalled,
      canInstall: true,
      savingId: null,
      install: async (appId: string) => (pluginInstalls.push(appId), true),
    };
  },
}));

const { render } = await import("ink-testing-library");
const { useDriveActions } = await import("@/components/drive/actions/use-drive-actions");
const { useDriveCreate } = await import("@/components/drive/actions/use-drive-create");
const { useEditorGate, useGatedOpenUrl } = await import("@/components/drive/actions/use-editor-gate");
const { withReducerTimeoutFrom } = await import("@/components/drive/actions/drive-writes");

const FOLDER = uuid(1);
const PDF = uuid(2);
const DOCX = uuid(3);
const STORE_FOLDER = uuid(4);
const PRIYA_FOLDER = uuid(5);
const DOC = uuid(6);
const data = driveData({
  items: [
    makeItem({ id: FOLDER, name: "Receipts", kind: "folder" }),
    makeItem({ id: PDF, name: "menu.pdf", kind: "file" }),
    makeItem({ id: DOCX, name: "Notes.docx", kind: "file", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    makeItem({ id: STORE_FOLDER, name: "Menus", kind: "folder", space: "store" }),
    makeItem({ id: PRIYA_FOLDER, name: "Priya's photos", kind: "folder", ownerMemberId: PRIYA, createdByMemberId: PRIYA }),
    makeItem({ id: uuid(7), name: "Untitled folder", kind: "folder" }),
  ],
  docs: [makeDoc({ id: DOC, title: "Q3 plan" })],
});
const tree = data.tree;
const e = (key: string) => entryOf(tree, key);
const t = translator();
const openUrls: [string, string][] = [];
const went: unknown[] = [];
const url = {
  space: "my", folder: "", member: "", source: "", type: "all", preview: "", query: "", view: "grid", sort: "name",
  go: (patch: unknown) => void went.push(patch), setQuery() {}, setView() {}, clearFilters() {},
};
const loader = { get: async () => null, getMany: async () => [], peek: () => null, invalidate() {} };

const openUrl = (href: string, disposition: string) => void openUrls.push([href, disposition]);

function Probe<T>({ useValue, report }: { useValue: () => T; report(value: T): void }) {
  report(useValue());
  return null;
}
/** Renders a component that calls `useValue` and returns a reader of its latest value. */
function mountHook<T>(useValue: () => T): () => T {
  const box: { current: T | null } = { current: null };
  render(h(Probe<T>, { useValue, report: (value: T) => void (box.current = value) }));
  return () => {
    if (box.current === null) throw new Error("not rendered");
    return box.current;
  };
}
const mount = (opts: { offline?: boolean; section?: DriveSection; timeoutMs?: number } = {}) =>
  mountHook(() =>
    useDriveActions({
      tree, actor: data.actor, ctx: { surface: "manager", section: opts.section ?? "my", offline: opts.offline ?? false, touch: false },
      url: url as never, openUrl, loader: loader as never, organizationId: ORG, members: data.members, timeoutMs: opts.timeoutMs, t, locale: "en",
    }),
  );
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)).then(flush);
const actions = mount();
const ACTING = { actingMemberId: "", organizationId: ORG };
const MY_ROOT = { space: "my" as const, parentId: "", ownerMemberId: ME };
const NO_ANSWER = "Merchiva didn't answer. Check your connection and try again.";

beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  openUrls.length = 0;
  went.length = 0;
  downloadResults.length = 0;
  importFails = false;
  hang = "none";
});

describe("downloads start inside the click", () => {
  test("a blocked single save offers Retry, which saves again from its own click", async () => {
    downloadResults.push("blocked");
    click(() => actions().onAction(e(`item:${PDF}`), "download"));
    expect(named("downloadEntries")).toEqual([{ name: "downloadEntries", args: [[`item:${PDF}`], true] }]);
    await flush();
    const blocked = toasts.find((x) => x.kind === "error");
    expect(blocked?.message).toBe("Your browser blocked the download. Try again.");
    expect(blocked?.opts?.action?.label).toBe("Retry");
    click(() => blocked?.opts?.action?.onClick());
    expect(named("downloadEntries").map((c) => c.args)).toEqual([[[`item:${PDF}`], true], [[`item:${PDF}`], true]]);
  });

  test("a partial run offers the rest one click at a time, straight from each click", async () => {
    const [pdf, docx] = [e(`item:${PDF}`), e(`item:${DOCX}`)];
    downloadResults.push({ kind: "partial", saved: 0, total: 2, remaining: [pdf, docx] }, "downloaded", "downloaded");
    click(() => actions().runBulk([pdf, docx], "download"));
    await flush();
    const first = toasts.at(-1);
    expect(first?.message).toBe("Saved 0 of 2 files. Save the others one at a time.");
    expect(first?.opts?.action?.label).toBe("Save next (2 left)");
    click(() => first?.opts?.action?.onClick());
    await flush();
    const second = toasts.at(-1);
    expect(second?.message).toBe("Saved 1 of 2 files. Save the others one at a time.");
    expect(second?.opts?.action?.label).toBe("Save next (1 left)");
    click(() => second?.opts?.action?.onClick());
    await flush();
    expect(named("downloadEntries").map((c) => c.args)).toEqual([
      [[`item:${PDF}`, `item:${DOCX}`], true],
      [[`item:${PDF}`], true],
      [[`item:${DOCX}`], true],
    ]);
    expect(toasts.filter((x) => x.message.startsWith("Saved"))).toHaveLength(2);
  });

  test("one by one and the native limit say so", async () => {
    downloadResults.push("sequential", "refused");
    click(() => actions().runBulk([e(`item:${PDF}`), e(`item:${DOCX}`)], "download"));
    await flush();
    click(() => actions().runBulk([e(`item:${PDF}`), e(`item:${DOCX}`)], "download"));
    await flush();
    expect(toasts.map((x) => x.message)).toEqual(["Files are downloading one by one.", "Select up to 10 files to save at once."]);
  });
});

describe("writes", () => {
  test("trash names the actor, toasts Undo, and Undo restores; a repeat while running is ignored", async () => {
    const pdf = e(`item:${PDF}`);
    actions().onAction(pdf, "trash");
    actions().onAction(pdf, "trash");
    await flush();
    expect(named("trashDriveEntries").map((c) => c.args[0])).toEqual([{ ...ACTING, itemIds: [PDF], documentIds: [] }]);
    const trashed = toasts.find((x) => x.message === "Moved to trash");
    expect(trashed?.opts?.action?.label).toBe("Undo");
    trashed?.opts?.action?.onClick();
    await flush();
    expect(named("restoreDriveEntries").map((c) => c.args[0])).toEqual([{ ...ACTING, itemIds: [PDF], documentIds: [] }]);
    expect(toasts.at(-1)).toMatchObject({ kind: "success", message: "Restored" });
  });

  test("rename goes through the name dialog; documents through renameDriveDocument", async () => {
    actions().onAction(e(`doc:${DOC}`), "rename");
    await flush();
    expect(actions().name).toMatchObject({ open: true, value: { mode: "rename", initialName: "Q3 plan", kind: "doc" } });
    await actions().submitName("Q4 plan");
    expect(named("renameDriveDocument").map((c) => c.args)).toEqual([[DOC, "Q4 plan", ACTING]]);
  });

  test("New folder proposes a free name and creates it in the target for the actor (in My files, silently)", async () => {
    actions().createFolder(MY_ROOT);
    await flush();
    expect(actions().name.value).toMatchObject({ mode: "newFolder", initialName: "Untitled folder (2)", target: MY_ROOT });
    await actions().submitName("Q3");
    expect(named("createDriveFolder").map((c) => c.args[0])).toEqual([
      { ...ACTING, space: "my", parentId: "", ownerMemberId: ME, name: "Q3", itemId: expect.any(String) },
    ]);
    expect(toasts).toEqual([]);
  });

  test("New folder from Recent lands in My files and says so, with Show", async () => {
    const recent = mount({ section: "recent" });
    recent().createFolder(MY_ROOT);
    await flush();
    await recent().submitName("Q4");
    expect(named("createDriveFolder").map((c) => (c.args[0] as { name: string }).name)).toEqual(["Q4"]);
    expect(toasts).toMatchObject([{ kind: "info", message: "Added to My files", opts: { action: { label: "Show" } } }]);
    toasts[0].opts?.action?.onClick();
    expect(went).toEqual([{ space: "my" }]);
  });

  test("a blocked drop says why; a drop into Store asks first, then moves and says where", async () => {
    const folder = e(`item:${FOLDER}`) as Extract<DriveEntry, { type: "folder" }>;
    expect(actions().drop?.canDrop([folder.key], folderContainer(folder))).toBe(false);
    actions().moveKeys([folder.key], folderContainer(folder));
    expect(toasts.at(-1)).toMatchObject({ kind: "error", message: "A folder can't be moved into itself." });
    actions().moveKeys([`item:${PDF}`], { space: "store", parentId: STORE_FOLDER, ownerMemberId: "" });
    await flush();
    expect(named("moveDriveEntries")).toHaveLength(0);
    expect(actions().spaceChange).toMatchObject({ open: true, value: { changesSpace: "toStore", itemIds: [PDF] } });
    await actions().confirmSpaceChange();
    expect(named("moveDriveEntries").map((c) => c.args[0])).toEqual([
      { ...ACTING, itemIds: [PDF], documentIds: [], space: "store", parentId: STORE_FOLDER, ownerMemberId: "" },
    ]);
    expect(toasts.at(-1)).toMatchObject({ kind: "success", message: "Moved to Menus" });
  });

  test("Move to Store from the menu confirms the space change first", async () => {
    expect(actions().moveFor(e(`item:${PDF}`))).toEqual({ toStore: true, toMy: true });
    actions().onAction(e(`item:${PDF}`), "moveToStore");
    await flush();
    expect(actions().spaceChange.value).toMatchObject({ changesSpace: "toStore", target: { space: "store", parentId: "" } });
  });
});

describe("open as", () => {
  test("fetches the file, imports it next to the original and opens the new document", async () => {
    actions().onAction(e(`item:${DOCX}`), "openAsDoc");
    await flush();
    expect(named("fetchDriveItemBytes").map((c) => c.args)).toEqual([[DOCX]]);
    expect(named("importIntoDrive").map((c) => c.args)).toEqual([
      ["Notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc",
        { organizationId: ORG, space: "my", folderId: "", ownerMemberId: ME, actingMemberId: "" }, DOCX],
    ]);
    expect(openUrls).toEqual([[`/manager/docs/edit?id=${uuid(901)}&new=1`, "current"]]);
    expect(toasts.map((x) => x.kind)).toEqual(["loading", "info", "dismiss"]);
    expect(toasts[1].message).toBe("Some formatting couldn't be kept.");
  });

  test("a failed import shows the importer's own copy", async () => {
    importFails = true;
    actions().onAction(e(`item:${DOCX}`), "openAsSheet");
    await flush();
    expect(toasts.find((x) => x.kind === "error")?.message).toBe("Only .xlsx and .csv files can be opened.");
    expect(openUrls).toEqual([]);
  });
});

describe("a create that gets no answer", () => {
  test("withReducerTimeoutFrom times the reply from start(), plus the step's own bound", async () => {
    const never = () => new Promise<never>(() => {});
    const code = (p: Promise<unknown>) => p.then(() => "resolved", (err: { code?: string }) => err.code ?? "other");
    const unstarted = code(withReducerTimeoutFrom(() => never(), 10));
    const started = code(withReducerTimeoutFrom((start) => (start(), never()), 10));
    const withLead = code(withReducerTimeoutFrom((start) => (start(60), never()), 10));
    const answered = withReducerTimeoutFrom((start) => (start(), Promise.resolve(7)), 10);
    const thrown = code(withReducerTimeoutFrom((): Promise<never> => { throw new Error("sync"); }, 10));
    expect(await answered).toBe(7);
    expect(await started).toBe("network");
    expect(await thrown).toBe("other");
    expect(await Promise.race([withLead, wait(30).then(() => "pending")])).toBe("pending");
    expect(await withLead).toBe("network");
    expect(await Promise.race([unstarted, wait(40).then(() => "pending")])).toBe("pending");
  });

  test("Open as: once its create is sent the wait is bounded, and the loading toast and busy state end; a long parse is not cut", async () => {
    const timed = mount({ timeoutMs: 20 });
    hang = "reply";
    timed().onAction(e(`item:${DOCX}`), "openAsDoc");
    await flush();
    expect(timed().busyKeys.has(`item:${DOCX}`)).toBe(true);
    await wait(60);
    expect(toasts.map((x) => x.kind)).toEqual(["loading", "error", "dismiss"]);
    expect(toasts[1].message).toBe(NO_ANSWER);
    expect(timed().busyKeys.size).toBe(0);
    toasts.length = 0;
    hang = "parse";
    timed().onAction(e(`item:${DOCX}`), "openAsSheet");
    await wait(60);
    expect(toasts.map((x) => x.kind)).toEqual(["loading"]);
    expect(timed().busyKeys.has(`item:${DOCX}`)).toBe(true);
    expect(openUrls).toEqual([]);
  });

  test("New ▸ Sheet stops spinning with the no-answer copy; an answered create opens; an upload from Recent says where", async () => {
    const create = mountHook(() =>
      useDriveCreate({
        tree, organizationId: ORG, actingMemberId: "", actorMemberId: ME, section: "recent", usage: data.drive.usage,
        queue: { enqueue: (files) => files.map((_, i) => `k${i}`) }, openUrl, showMyFiles: () => void went.push({ space: "my" }),
        timeoutMs: 20, t, locale: "en",
      }),
    );
    hang = "reply";
    create().createDocument("sheet", MY_ROOT);
    await flush();
    expect(create().creating).toBe("sheet");
    await wait(60);
    expect(create().creating).toBeNull();
    expect(toasts).toMatchObject([{ kind: "error", message: NO_ANSWER }]);
    hang = "none";
    create().createDocument("slides", MY_ROOT);
    await flush();
    expect(openUrls).toEqual([[documentFileHref({ id: uuid(902), fileType: "slides" }, { isNew: true }), "current"]]);
    toasts.length = 0;
    create().uploadFiles([{ file: new File(["x"], "a.pdf", { type: "application/pdf" }), path: "a.pdf" }], MY_ROOT);
    await flush();
    expect(toasts).toMatchObject([{ kind: "info", message: "Added to My files", opts: { action: { label: "Show" } } }]);
  });
});

describe("a missing editor plugin is asked for first", () => {
  // The page's wiring (drive-home.tsx): one gate in front of the actions, New and the openUrl choke point.
  const page = mountHook(() => {
    const gate = useEditorGate({ surface: "manager" });
    const gatedOpen = useGatedOpenUrl(openUrl, gate.ensureEditor);
    const actions = useDriveActions({
      tree, actor: data.actor, ctx: { surface: "manager", section: "my", offline: false, touch: false },
      url: url as never, openUrl: gatedOpen, loader: loader as never, organizationId: ORG, members: data.members, gate, t, locale: "en",
    });
    const create = useDriveCreate({
      tree, organizationId: ORG, actingMemberId: "", actorMemberId: ME, section: "my", usage: data.drive.usage,
      ensureEditor: gate.ensureEditor, queue: { enqueue: () => [] }, openUrl: gatedOpen, showMyFiles() {}, t, locale: "en",
    });
    return { gate, actions, create };
  });
  /** What the dialog does on Download: install, close, continue. */
  const download = async () => {
    const { dialog } = page().gate;
    await Promise.resolve(pluginInstalls.push(dialog.appId));
    dialog.onOpenChange(false);
    dialog.onInstalled();
    await flush();
  };
  beforeEach(async () => {
    pluginInstalls.length = 0;
    // Each test starts from an org without Docs and Sheets: a fresh render drops what the last test installed.
    restream();
    page().gate.dialog.onOpenChange(false);
    await flush();
  });

  test("a plain click on a Doc prompts instead of following the link; Download continues to the editor", async () => {
    expect(page().gate.isInstalled("doc")).toBe(false);
    expect(page().gate.isInstalled("slides")).toBe(true);
    expect(page().actions.openInPlace(e(`doc:${DOC}`))).toBe(true);
    await flush();
    expect(page().gate.dialog).toMatchObject({ open: true, appId: "docs", mode: "open" });
    expect(openUrls).toEqual([]);
    await download();
    expect(pluginInstalls).toEqual(["docs"]);
    expect(page().gate.dialog.open).toBe(false);
    // The editor URL passes the openUrl gate too, although the page has not seen the new install yet.
    expect(openUrls).toEqual([[`/manager/docs/edit?id=${DOC}`, "current"]]);
  });

  test("menu Open and Open in new tab prompt; Not now opens nothing", async () => {
    page().actions.onAction(e(`doc:${DOC}`), "openNewTab");
    await flush();
    expect(page().gate.dialog).toMatchObject({ open: true, appId: "docs", mode: "open" });
    page().gate.dialog.onOpenChange(false);
    page().actions.onAction(e(`doc:${DOC}`), "open");
    await flush();
    expect(page().gate.dialog.open).toBe(true);
    page().gate.dialog.onOpenChange(false);
    await flush();
    expect(openUrls).toEqual([]);
  });

  test("Open as Sheet fetches nothing and imports nothing before Sheets is installed", async () => {
    page().actions.onAction(e(`item:${DOCX}`), "openAsSheet");
    await flush();
    expect(page().gate.dialog).toMatchObject({ open: true, appId: "sheets", mode: "open" });
    expect(calls).toEqual([]);
    expect(toasts).toEqual([]);
  });

  test("New ▸ Sheet creates nothing until Sheets is installed, then creates and opens it", async () => {
    page().create.createDocument("sheet", MY_ROOT);
    await flush();
    expect(page().gate.dialog).toMatchObject({ open: true, appId: "sheets", mode: "create" });
    expect(named("createDriveDoc")).toEqual([]);
    expect(page().create.creating).toBeNull();
    await download();
    expect(named("createDriveDoc").map((c) => c.args[0])).toEqual(["sheet"]);
    expect(openUrls).toEqual([[documentFileHref({ id: uuid(902), fileType: "sheet" }, { isNew: true }), "current"]]);
  });

  test("New ▸ Slides (installed) creates straight away; a Docs template asks for Docs first", async () => {
    page().create.createDocument("slides", MY_ROOT);
    await flush();
    expect(page().gate.dialog.open).toBe(false);
    expect(named("createDriveDoc").map((c) => c.args[0])).toEqual(["slides"]);
    page().create.createFromTemplate("meetingNotes", MY_ROOT, { storeName: "Corner Cafe", authorName: "Sam" });
    await flush();
    expect(page().gate.dialog).toMatchObject({ open: true, appId: "docs", mode: "create" });
    expect(named("createDriveDocFromTemplate")).toEqual([]);
    await download();
    expect(named("createDriveDocFromTemplate").map((c) => c.args[0])).toEqual(["meetingNotes"]);
    expect(openUrls.at(-1)).toEqual([documentFileHref({ id: uuid(903), fileType: "doc" }, { isNew: true }), "current"]);
  });
});

describe("a missing editor plugin, installed while the create is in flight", () => {
  const page = mountHook(() => {
    const gate = useEditorGate({ surface: "manager" });
    const gatedOpen = useGatedOpenUrl(openUrl, gate.ensureEditor);
    const create = useDriveCreate({
      tree, organizationId: ORG, actingMemberId: "", actorMemberId: ME, section: "my", usage: data.drive.usage,
      ensureEditor: gate.ensureEditor, queue: { enqueue: () => [] }, openUrl: gatedOpen, showMyFiles() {}, t, locale: "en",
    });
    return { gate, create };
  });

  test("the new row re-rendering the page before the create answers does not ask again; the sheet opens", async () => {
    let release = () => {};
    createHold = new Promise<void>((resolve) => (release = resolve));
    try {
      page().create.createDocument("sheet", MY_ROOT);
      await flush();
      const { dialog } = page().gate;
      expect(dialog).toMatchObject({ open: true, appId: "sheets", mode: "create" });
      dialog.onOpenChange(false);
      dialog.onInstalled();
      await flush();
      expect(named("createDriveDoc").map((c) => c.args[0])).toEqual(["sheet"]);
      // The settings row streams in and the page re-renders while createDriveDoc is still waiting.
      streamed.add("sheets");
      restream();
      await flush();
      release();
      await flush();
      expect(page().gate.dialog.open).toBe(false);
      expect(openUrls).toEqual([[documentFileHref({ id: uuid(902), fileType: "sheet" }, { isNew: true }), "current"]]);
    } finally {
      createHold = null;
      streamed.clear();
      restream();
      await flush();
    }
  });
});

describe("an ask made before the install state loads", () => {
  const page = mountHook(() => {
    const gate = useEditorGate({ surface: "manager" });
    const create = useDriveCreate({
      tree, organizationId: ORG, actingMemberId: "", actorMemberId: ME, section: "my", usage: data.drive.usage,
      ensureEditor: gate.ensureEditor, queue: { enqueue: () => [] }, openUrl, showMyFiles() {}, t, locale: "en",
    });
    return { gate, create };
  });

  test("New ▸ Sheet writes nothing until it has loaded, then asks for the missing Sheets", async () => {
    streamReady = false;
    restream();
    await flush();
    try {
      expect(page().gate.isInstalled("sheet")).toBe(true);   // no hint flashes while loading
      page().create.createDocument("sheet", MY_ROOT);
      await flush();
      expect(named("createDriveDoc")).toEqual([]);
      expect(page().gate.dialog.open).toBe(false);
      streamReady = true;
      restream();
      await flush();
      expect(page().gate.dialog).toMatchObject({ open: true, appId: "sheets", mode: "create" });
      expect(named("createDriveDoc")).toEqual([]);
    } finally {
      streamReady = true;
      page().gate.dialog.onOpenChange(false);
      restream();
      await flush();
    }
  });
});

describe("links", () => {
  test("folders open where they live, files preview in place, documents open their editor", () => {
    expect(actions().hrefFor(e(`item:${FOLDER}`))).toBe(`/manager/drive?folder=${FOLDER}`);
    expect(actions().hrefFor(e(`item:${STORE_FOLDER}`))).toBe(`/manager/drive?space=store&folder=${STORE_FOLDER}`);
    expect(actions().hrefFor(e(`item:${PRIYA_FOLDER}`))).toBe(`/manager/drive?space=members&folder=${PRIYA_FOLDER}&member=${PRIYA}`);
    expect(actions().hrefFor(e(`item:${PDF}`))).toBe(`/manager/drive?preview=item%3A${PDF}`);
    expect(actions().hrefFor(e(`doc:${DOC}`))).toBe(`/manager/docs/edit?id=${DOC}`);
    expect(actions().openInPlace(e(`item:${PDF}`))).toBe(true);
    expect(actions().openInPlace(e(`item:${FOLDER}`))).toBe(false);
    expect(went).toEqual([{ preview: `item:${PDF}` }]);
    actions().onAction(e(`item:${FOLDER}`), "open");
    actions().onAction(e(`doc:${DOC}`), "openNewTab");
    expect(went.at(-1)).toEqual({ space: "my", folder: FOLDER });
    expect(openUrls).toEqual([[`/manager/docs/edit?id=${DOC}`, "new-foreground"]]);
  });

  test("offline, nothing accepts a drop", () => {
    const offline = mount({ offline: true });
    expect(offline().drop).toBeNull();
  });
});
