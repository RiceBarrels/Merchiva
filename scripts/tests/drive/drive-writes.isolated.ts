// Isolated fixture for scripts/tests/drive/drive-writes.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces the reducer wrappers (lib/spacetimedb/actions[/drive]) and the download primitives with
// mock.module, so it must run in its own process.
//
// Covers components/drive/actions/drive-writes.ts (every write names the actor and the store, documents go through
// the Drive entries reducers, 200 ids per call, a timeout is `network`), upload/folder-upload.ts, upload/read-drop.ts
// and download.ts.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { unzipSync } from "fflate";

interface Call { name: string; args: unknown[] }
const calls: Call[] = [];
let failOn: ((name: string, args: unknown[]) => unknown) | null = null;
const hanging = new Set<string>();

function reducer(name: string, value?: (args: unknown[]) => unknown) {
  return (...args: unknown[]) => {
    calls.push({ name, args });
    if (hanging.has(name)) return new Promise(() => {});
    const failure = failOn?.(name, args);
    return failure ? Promise.reject(failure) : Promise.resolve(value?.(args));
  };
}

mock.module("@/lib/spacetimedb/actions/drive", () => ({
  createDriveFolder: reducer("createDriveFolder", (args) => (args[0] as { itemId: string }).itemId),
  renameDriveItem: reducer("renameDriveItem"),
  renameDriveDocument: reducer("renameDriveDocument"),
  moveDriveEntries: reducer("moveDriveEntries"),
  trashDriveEntries: reducer("trashDriveEntries"),
  restoreDriveEntries: reducer("restoreDriveEntries"),
  deleteDriveEntriesForever: reducer("deleteDriveEntriesForever"),
  toggleDriveStar: reducer("toggleDriveStar"),
}));
mock.module("@/lib/spacetimedb/actions", () => ({
  renameDocument: reducer("renameDocument"),
  toggleDocumentStar: reducer("toggleDocumentStar"),
}));

// The download primitives record whether they were called inside the click (`inGesture`, set by click()): on the web
// a window opened after an await is blocked, so every call that may open one has to happen inside it.
const MIB = 1024 * 1024;
const BUFFERED_MAX = 100 * MIB;
let inGesture = false;
function click<T>(run: () => T): T {
  inGesture = true;
  try {
    return run();
  } finally {
    inGesture = false;
  }
}
const singles: string[] = [];
let fetchFails = false;
const fetchFailIds = new Set<string>();
const saveResults: string[] = [];
let saved: { blob: Blob; name: string } | null = null;
const savedNames: string[] = [];
let tauri = false;
mock.module("@/lib/drive/download", () => ({
  DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES: BUFFERED_MAX,
  chooseDownloadStrategy: (size: number) => (size >= 0 && size <= BUFFERED_MAX ? "buffered" : "direct"),
  downloadDriveItem: (item: unknown, loader: unknown) => {
    calls.push({ name: "downloadDriveItem", args: [item, loader, inGesture] });
    return Promise.resolve(singles.shift() ?? "downloaded");
  },
  downloadExternalFile: (url: string, name: string) => {
    calls.push({ name: "downloadExternalFile", args: [url, name, inGesture] });
    return Promise.resolve("downloaded");
  },
  fetchDriveItemBytes: async (item: { id: string }, _loader: unknown, opts: { maxBytes?: number } = {}) => {
    calls.push({ name: "fetchDriveItemBytes", args: [item, opts.maxBytes] });
    if (fetchFails || fetchFailIds.has(item.id)) throw new Error("TypeError: Failed to fetch");
    return new TextEncoder().encode(`bytes of ${item.id}`).buffer;
  },
  driveDownloadName: (name: string) => name || "file",
}));
mock.module("@/lib/docs/download", () => ({
  saveBlob: async (blob: Blob, name: string) => {
    saved = { blob, name };
    savedNames.push(name);
    return saveResults.shift() ?? "downloaded";
  },
}));
mock.module("@/lib/native-shell", () => ({
  isNativeShell: () => tauri,
  getNativeShell: () => null,
  getNativeShellPlatform: () => null,
  useIsNativeShell: () => false,
  useIsNativeShellSync: () => false,
  useNativeWindowState: () => ({ fullscreen: false, maximized: false }),
}));

// Files kept by other apps are fetched directly: a host answering without CORS headers rejects ("blocked" in the URL).
let fetchImpl: (url: string) => Promise<Response> = async (url) => {
  if (url.includes("blocked")) throw new TypeError("Failed to fetch");
  return new Response(`bytes of ${url}`);
};
globalThis.fetch = ((input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  calls.push({ name: "fetch", args: [url] });
  return fetchImpl(url);
}) as unknown as typeof fetch;
const defaultFetch = fetchImpl;

const { runDriveWrite, withReducerTimeout, driveWriteErrorKey, DriveWriteTimeoutError } = await import("@/components/drive/actions/drive-writes");
const { uploadFolderTree, folderUploadMessages } = await import("@/components/drive/upload/folder-upload");
const { readDroppedFiles, droppedFromFiles } = await import("@/components/drive/upload/read-drop");
const { downloadEntries } = await import("@/components/drive/download");
const { buildDriveTree } = await import("@/components/drive/model/entries");
const { planFolderUpload } = await import("@/components/drive/model/upload-plan");
const { driveErrorCode } = await import("@/lib/drive/errors");

const DEPS = { actingMemberId: "op-1", organizationId: "org-1" };
const ACTING = { actingMemberId: "op-1", organizationId: "org-1" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ALL = {
  canOpen: true, canDownload: true, canRename: true, canMove: true, canTrash: true, canRestore: true,
  canDeleteForever: true, canShare: true, canStar: true, canAddChildren: true,
};
type Loc = { space: "my" | "store"; ownerMemberId: string; parentId: string };
const MY_ROOT: Loc = { space: "my", ownerMemberId: "m-1", parentId: "" };

function base(id: string, name: string, location: Loc | null, key: string) {
  return {
    key, id, name, createdAt: 0, updatedAt: 0, ownerMemberId: location?.ownerMemberId ?? "", ownerName: null, isMine: true,
    starred: false, trashedAt: null, openedAt: null, location, access: ALL,
  };
}
const folder = (id: string, name: string, location: Loc = MY_ROOT) => ({ ...base(id, name, location, `item:${id}`), type: "folder" as const, item: {} });
const file = (id: string, name: string, location: Loc = MY_ROOT, sizeBytes = 10) => ({
  ...base(id, name, location, `item:${id}`), type: "file" as const, item: {}, fileKind: "text", mimeType: "text/plain", sizeBytes, uploading: null,
});
const doc = (id: string, kind: "doc" | "sheet" | "slides" = "doc") => ({
  ...base(id, "Doc", MY_ROOT, `doc:${id}`), type: kind, doc: {}, docAccess: {}, sharedWithMe: false, hasGrants: false,
});
const virtual = (id: string, url = "https://files.example/logo.png") => ({
  ...base(id, "logo.png", null, `v:chat:${id}`), type: "virtual" as const, source: "chat", url,
  fileKind: "image", mimeType: "image/png", group: "", originRoute: null,
});
const named = (name: string) => calls.filter((c) => c.name === name);
const arg0 = (c: Call) => c.args[0] as Record<string, unknown>;
async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return "(resolved)";
  } catch (err) {
    return driveErrorCode(err);
  }
}

beforeEach(() => {
  calls.length = 0;
  failOn = null;
  hanging.clear();
  singles.length = 0;
  fetchFails = false;
  fetchFailIds.clear();
  saveResults.length = 0;
  saved = null;
  savedNames.length = 0;
  tauri = false;
  inGesture = false;
  fetchImpl = defaultFetch;
});

describe("runDriveWrite", () => {
  test("rename: items through renameDriveItem, documents through renameDriveDocument, both with the actor", async () => {
    expect(await runDriveWrite({ kind: "rename", entry: file(uuid(1), "a.txt"), name: "b.txt" } as never, DEPS)).toEqual({ done: 1, total: 1 });
    await runDriveWrite({ kind: "rename", entry: doc(uuid(2), "sheet"), name: "Budget" } as never, DEPS);
    await runDriveWrite({ kind: "rename", entry: doc(uuid(3)), name: "Notes" } as never, { actingMemberId: "", organizationId: "org-1" });
    expect(calls.map((c) => [c.name, ...c.args])).toEqual([
      ["renameDriveItem", uuid(1), "b.txt", ACTING],
      ["renameDriveDocument", uuid(2), "Budget", ACTING],
      ["renameDriveDocument", uuid(3), "Notes", { actingMemberId: "", organizationId: "org-1" }],
    ]);
    // The Docs reducer takes no acting member: a document rename never goes through it any more.
    expect(named("renameDocument")).toEqual([]);
    expect(await codeOf(runDriveWrite({ kind: "rename", entry: virtual("v1"), name: "x" } as never, DEPS))).toBe("invalid");
  });

  test("star: items with the actor; a document star is refused while acting, sent for the caller otherwise", async () => {
    await runDriveWrite({ kind: "star", entry: folder(uuid(1), "F") } as never, DEPS);
    expect(await codeOf(runDriveWrite({ kind: "star", entry: doc(uuid(2)) } as never, DEPS))).toBe("forbidden");
    await runDriveWrite({ kind: "star", entry: doc(uuid(2)) } as never, { actingMemberId: "", organizationId: "org-1" });
    expect(calls.map((c) => [c.name, ...c.args])).toEqual([["toggleDriveStar", uuid(1), ACTING], ["toggleDocumentStar", uuid(2)]]);
  });

  test("new folder: createDriveFolder with the actor, the target and a My-files owner", async () => {
    const mine = await runDriveWrite({ kind: "newFolder", target: { space: "my", ownerMemberId: "m-1", parentId: uuid(9) }, name: "Q3", itemId: uuid(5) } as never, DEPS);
    const shop = await runDriveWrite({ kind: "newFolder", target: { space: "store", ownerMemberId: "m-1", parentId: "" }, name: "Menus" } as never, DEPS);
    expect(mine).toEqual({ done: 1, total: 1, createdId: uuid(5) });
    expect(named("createDriveFolder").map(arg0)).toEqual([
      { ...ACTING, space: "my", parentId: uuid(9), ownerMemberId: "m-1", name: "Q3", itemId: uuid(5) },
      { ...ACTING, space: "store", parentId: "", ownerMemberId: "", name: "Menus", itemId: shop.createdId },
    ]);
    expect(shop.createdId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("move: one moveDriveEntries per 200 ids, with the plan's target and the actor", async () => {
    const itemIds = Array.from({ length: 250 }, (_, i) => uuid(i));
    const documentIds = [uuid(1000), uuid(1001)];
    const target = { space: "store", ownerMemberId: "", parentId: uuid(7) };
    const plan = { itemIds, documentIds, target, changesSpace: "toStore", affected: { items: 252, documents: 2 }, blocked: null };
    expect(await runDriveWrite({ kind: "move", plan } as never, DEPS)).toEqual({ done: 252, total: 252 });
    const sent = named("moveDriveEntries").map(arg0);
    expect(sent.map((a) => [(a.itemIds as string[]).length, (a.documentIds as string[]).length])).toEqual([[200, 0], [50, 2]]);
    for (const a of sent) expect(a).toMatchObject({ ...ACTING, space: "store", parentId: uuid(7), ownerMemberId: "" });
  });

  test("move: a blocked plan is refused with the module's code; sameLocation does nothing", async () => {
    const plan = (blocked: string) => ({ itemIds: [uuid(1)], documentIds: [], target: { space: "my", ownerMemberId: "m-1", parentId: "" }, changesSpace: null, affected: { items: 1, documents: 0 }, blocked });
    expect(await codeOf(runDriveWrite({ kind: "move", plan: plan("intoDescendant") } as never, DEPS))).toBe("cycle");
    expect(await codeOf(runDriveWrite({ kind: "move", plan: plan("spaceNotAllowed") } as never, DEPS))).toBe("space_mismatch");
    expect(await codeOf(runDriveWrite({ kind: "move", plan: plan("targetTrashed") } as never, DEPS))).toBe("trashed");
    expect(await runDriveWrite({ kind: "move", plan: plan("sameLocation") } as never, DEPS)).toEqual({ done: 0, total: 0 });
    expect(calls).toEqual([]);
  });

  test("trash / restore / delete forever: documents go through the Drive entries reducers, 200 ids per call", async () => {
    const entries = [
      ...Array.from({ length: 300 }, (_, i) => file(uuid(i), `f${i}`)),
      ...Array.from({ length: 150 }, (_, i) => doc(uuid(500 + i), i % 2 ? "sheet" : "doc")),
      virtual("v1"),
      file(uuid(0), "f0"),
    ];
    for (const kind of ["trash", "restore", "deleteForever"] as const) {
      expect(await runDriveWrite({ kind, entries } as never, DEPS)).toEqual({ done: 450, total: 450 });
    }
    const byName = (name: string) => named(name).map(arg0);
    for (const name of ["trashDriveEntries", "restoreDriveEntries", "deleteDriveEntriesForever"]) {
      const sent = byName(name);
      expect(sent.map((a) => [(a.itemIds as string[]).length, (a.documentIds as string[]).length])).toEqual([[200, 0], [100, 100], [0, 50]]);
      for (const a of sent) expect(a).toMatchObject(ACTING);
      expect(sent.flatMap((a) => a.documentIds as string[])).toContain(uuid(649));
    }
    expect(named("renameDocument").length + named("toggleDocumentStar").length).toBe(0);
  });

  test("a failed later batch resolves partial and stops; a failed first batch rejects", async () => {
    const entries = Array.from({ length: 450 }, (_, i) => file(uuid(i), `f${i}`));
    let n = 0;
    const boom = new Error("[drive.forbidden] no");
    failOn = (name) => (name === "trashDriveEntries" && ++n === 2 ? boom : null);
    expect(await runDriveWrite({ kind: "trash", entries } as never, DEPS)).toEqual({ done: 200, total: 450, error: boom });
    expect(named("trashDriveEntries").length).toBe(2);
    failOn = () => boom;
    expect(await codeOf(runDriveWrite({ kind: "restore", entries } as never, DEPS))).toBe("forbidden");
    expect(named("restoreDriveEntries").length).toBe(1);
  });

  test("withReducerTimeout: a network DriveWriteTimeoutError after the limit; normal results pass through", async () => {
    const late = withReducerTimeout(new Promise<never>(() => {}), 20);
    let caught: unknown = null;
    await late.catch((err: unknown) => (caught = err));
    expect(caught).toBeInstanceOf(DriveWriteTimeoutError);
    expect(driveErrorCode(caught)).toBe("network");
    expect(driveWriteErrorKey(caught)).toBe("drive.home.errors.timeout");
    expect(driveWriteErrorKey(new Error("[drive.quota_exceeded] full"))).toBe("drive.errors.quotaExceeded");
    expect(await withReducerTimeout(Promise.resolve(7), 20)).toBe(7);
    expect(await codeOf(withReducerTimeout(Promise.reject(new Error("[drive.trashed] x")), 20))).toBe("trashed");
    // A promise that fails after the timeout must not surface as an unhandled rejection.
    const failsLate = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("late")), 40));
    expect(await codeOf(withReducerTimeout(failsLate, 10))).toBe("network");
    await new Promise((r) => setTimeout(r, 60));
  });

  test("a reducer that never answers times out as network through runDriveWrite", async () => {
    hanging.add("trashDriveEntries");
    expect(await codeOf(runDriveWrite({ kind: "trash", entries: [file(uuid(1), "a")] } as never, { ...DEPS, timeoutMs: 20 }))).toBe("network");
  });
});

describe("uploadFolderTree", () => {
  const ROOT = uuid(100);
  const HERE: Loc = { space: "my", ownerMemberId: "m-1", parentId: ROOT };
  const target = { space: "my" as const, ownerMemberId: "m-1", parentId: ROOT };
  const tree = () => buildDriveTree([folder(uuid(101), "photos", HERE), file(uuid(102), "C", HERE), file(uuid(103), "notes.txt", HERE)] as never);
  const f = (name: string) => new File([name], name, { type: "text/plain" });
  const plan = () =>
    planFolderUpload([
      { file: f("a.jpg"), path: "Photos/a.jpg" },
      { file: f("b.jpg"), path: "Photos/New/b.jpg" },
      { file: f("c.txt"), path: "C/c.txt" },
      { file: f("notes.txt"), path: "notes.txt" },
      { file: f("x.txt"), path: "../x.txt" },
    ]);
  function fakeQueue() {
    const enqueued: { names: string[]; target: unknown }[] = [];
    let key = 0;
    return {
      enqueued,
      enqueue(sources: { name?: string }[], t: unknown) {
        enqueued.push({ names: sources.map((s) => s.name ?? ""), target: t });
        return sources.map(() => `k${++key}`);
      },
    };
  }

  test("reuses a same-named folder, creates the rest with the actor, and queues files under free names", async () => {
    const queue = fakeQueue();
    const result = await uploadFolderTree(plan(), target, { tree: tree(), queue, ...DEPS });
    const made = named("createDriveFolder").map(arg0);
    expect(made.map((a) => [a.name, a.parentId, a.space, a.ownerMemberId, a.actingMemberId, a.organizationId])).toEqual([
      ["New", uuid(101), "my", "m-1", "op-1", "org-1"],
      ["C (2)", ROOT, "my", "m-1", "op-1", "org-1"],
    ]);
    expect(result.reusedFolderIds).toEqual([uuid(101)]);
    expect(result.createdFolderIds).toEqual(made.map((a) => a.itemId as string));
    const [newId, cId] = result.createdFolderIds;
    const upload = (parentId: string) => ({ organizationId: "org-1", space: "my", parentId, ownerMemberId: "m-1", actingMemberId: "op-1" });
    expect(queue.enqueued).toEqual([
      { names: ["a.jpg"], target: upload(uuid(101)) },
      { names: ["b.jpg"], target: upload(newId) },
      { names: ["c.txt"], target: upload(cId) },
      { names: ["notes (2).txt"], target: upload(ROOT) },
    ]);
    expect(result.queued).toEqual(["k1", "k2", "k3", "k4"]);
    expect(result.failure).toBeNull();
    expect(folderUploadMessages(result, (k) => k)).toEqual(["drive.upload.skippedOne"]);
  });

  test("stops at the first folder that fails: nothing queued, earlier folders kept", async () => {
    const queue = fakeQueue();
    failOn = (name, args) => (name === "createDriveFolder" && (args[0] as { name: string }).name === "C (2)" ? new Error("[drive.forbidden] no") : null);
    const result = await uploadFolderTree(plan(), target, { tree: tree(), queue, ...DEPS });
    expect(result.failure?.dir).toEqual(["C"]);
    expect(result.createdFolderIds.length).toBe(1);
    expect(queue.enqueued).toEqual([]);
    expect(folderUploadMessages(result, (k) => k)).toEqual(["drive.upload.folderFailed drive.errors.forbidden", "drive.upload.skippedOne"]);
  });
});

describe("reading drops and picks", () => {
  const f = (name: string) => new File([name], name);
  const fileEntry = (name: string) => ({ isFile: true, isDirectory: false, name, file: (ok: (file: File) => void) => ok(f(name)) });
  const dirEntry = (name: string, children: unknown[]) => ({
    isFile: false, isDirectory: true, name,
    createReader() {
      let at = 0;
      return {
        readEntries(ok: (batch: unknown[]) => void) {
          const batch = children.slice(at, at + 2);
          at += 2;
          setTimeout(() => ok(batch), 0);
        },
      };
    },
  });

  test("walks dropped folders batch by batch, taking the entries during the drop event", async () => {
    let dispatching = true;
    const item = (entry: unknown) => ({ kind: "file", webkitGetAsEntry: () => (dispatching ? entry : null), getAsFile: () => null });
    const photos = dirEntry("Photos", [fileEntry("a.jpg"), fileEntry("b.jpg"), dirEntry("Sub", [fileEntry("c.jpg")])]);
    const dt = { items: [item(photos), item(fileEntry("notes.txt")), { kind: "string", webkitGetAsEntry: () => null, getAsFile: () => null }], files: [] };
    const pending = readDroppedFiles(dt as never);
    dispatching = false;
    expect((await pending).map((d) => d.path)).toEqual(["Photos/a.jpg", "Photos/b.jpg", "Photos/Sub/c.jpg", "notes.txt"]);
    dispatching = true;
    expect(await codeOf(readDroppedFiles({ items: [item(photos)], files: [] } as never, { maxFiles: 2 }))).toBe("batch_too_large");
  });

  test("without entries it reads dataTransfer.files; too many files is batch_too_large; picks keep relative paths", async () => {
    const dt = { items: [{ kind: "file" }], files: [f("a.txt"), f("b.txt")] };
    expect((await readDroppedFiles(dt as never)).map((d) => d.path)).toEqual(["a.txt", "b.txt"]);
    expect(await codeOf(readDroppedFiles(dt as never, { maxFiles: 1 }))).toBe("batch_too_large");
    const picked = [f("x.pdf"), Object.defineProperty(f("y.pdf"), "webkitRelativePath", { value: "Scans/2026/y.pdf" })];
    expect(droppedFromFiles(picked).map((d) => d.path)).toEqual(["x.pdf", "Scans/2026/y.pdf"]);
  });
});

describe("downloadEntries", () => {
  const LOADER = { tag: "loader" };
  const desktop = { capacitor: false, coarsePointer: false };
  const phone = { capacitor: false, coarsePointer: true };
  const deps = (env = desktop, extra = {}) => ({ loader: LOADER as never, env, zipName: "Drive 2026-09-27", ...extra });
  const ids = (list: readonly unknown[]) => list.map((e) => (e as { id: string }).id);
  const windowCalls = () => [...named("downloadDriveItem"), ...named("downloadExternalFile")];
  /** Every call that may open a window happened inside the click (the last arg the mocks record). */
  const allInGesture = () => windowCalls().every((c) => c.args[c.args.length - 1] === true);

  test("one file starts inside the gesture; a file from another app goes through downloadExternalFile", async () => {
    const pending = click(() => downloadEntries([file(uuid(1), "a.pdf", MY_ROOT, 99)] as never, deps()));
    expect(named("downloadDriveItem").map((c) => c.args)).toEqual([[{ id: uuid(1), name: "a.pdf", sizeBytes: 99, mimeType: "text/plain" }, LOADER, true]]);
    expect(await pending).toBe("downloaded");
    expect(await click(() => downloadEntries([virtual("v1")] as never, deps()))).toBe("downloaded");
    expect(named("downloadExternalFile")[0].args).toEqual(["https://files.example/logo.png", "logo.png", true]);
  });

  test("native apps: one by one up to 10, refused above, a blocked window stops the run", async () => {
    const native = { capacitor: true, coarsePointer: true };
    const many = Array.from({ length: 11 }, (_, i) => file(uuid(i), `f${i}`));
    expect(await downloadEntries(many as never, deps(native))).toBe("refused");
    expect(calls).toEqual([]);
    const reasons: string[] = [];
    singles.push("downloaded", "blocked", "downloaded");
    const pending = downloadEntries(many.slice(0, 3) as never, deps(native, { onSequential: (r: string) => reasons.push(r) }));
    expect(named("downloadDriveItem").length).toBe(1);
    expect(await pending).toBe("blocked");
    expect(named("downloadDriveItem").length).toBe(2);
    expect(reasons).toEqual(["native"]);
  });

  test("desktop: several files become one zip with unique names", async () => {
    const pair = [file(uuid(1), "a.txt"), file(uuid(2), "a.txt")];
    const progress: string[] = [];
    expect(await click(() => downloadEntries(pair as never, deps(desktop, { onProgress: (d: number, t: number) => progress.push(`${d}/${t}`) })))).toBe("zipped");
    expect(saved?.name).toBe("Drive 2026-09-27.zip");
    const unzipped = unzipSync(new Uint8Array(await (saved as unknown as { blob: Blob }).blob.arrayBuffer()));
    expect(Object.keys(unzipped).sort()).toEqual(["a (2).txt", "a.txt"]);
    expect(new TextDecoder().decode(unzipped["a (2).txt"])).toBe(`bytes of ${uuid(2)}`);
    expect(progress).toEqual(["1/2", "2/2"]);
    expect(windowCalls()).toEqual([]);
  });

  test("a file named __proto__ is zipped under a free name, not lost to the input object's prototype", async () => {
    const entries = [file(uuid(1), "a.txt"), file(uuid(2), "__proto__"), file(uuid(3), "__proto__ (2)"), file(uuid(4), "constructor")];
    expect(await click(() => downloadEntries(entries as never, deps()))).toBe("zipped");
    const unzipped = unzipSync(new Uint8Array(await (saved as unknown as { blob: Blob }).blob.arrayBuffer()));
    expect(Object.keys(unzipped).sort()).toEqual(["__proto__ (2)", "__proto__ (3)", "a.txt", "constructor"]);
    expect(new TextDecoder().decode(unzipped["__proto__ (2)"])).toBe(`bytes of ${uuid(2)}`);
    expect(new TextDecoder().decode(unzipped["__proto__ (3)"])).toBe(`bytes of ${uuid(3)}`);
  });

  test("web, zip failed: saves only what needs no window; failures and blocked hosts come back as the remaining files", async () => {
    // b's fetch fails (the zip with it); a file from a host without CORS can't be fetched either.
    const entries = [file(uuid(1), "a.txt"), file(uuid(2), "b.txt"), virtual("v1"), virtual("v2", "https://blocked.example/x.png")];
    fetchFailIds.add(uuid(2));
    const reasons: string[] = [];
    const result = await click(() => downloadEntries(entries as never, deps(desktop, { onSequential: (r: string) => reasons.push(r) })));
    expect(reasons).toEqual(["zipFailed"]);
    expect(result).toMatchObject({ kind: "partial", saved: 2, total: 4 });
    expect(ids((result as { remaining: unknown[] }).remaining)).toEqual([uuid(2), "v2"]);
    expect(String((result as { error?: unknown }).error)).toContain("Failed to fetch");
    // No save that could need a window ran after the await; a virtual fallback is never counted as saved.
    expect(windowCalls()).toEqual([]);
    expect(savedNames).toEqual(["a.txt", "logo.png"]);

    // The zip itself could not be saved: every file goes one by one, still without a window.
    calls.length = 0;
    savedNames.length = 0;
    fetchFailIds.clear();
    saveResults.push("unsupported");
    expect(await click(() => downloadEntries(entries.slice(0, 2) as never, deps()))).toBe("sequential");
    expect(windowCalls()).toEqual([]);
    expect(savedNames).toEqual(["Drive 2026-09-27.zip", "a.txt", "b.txt"]);
  });

  test("web, too much to zip: the click's window goes to the first large file; a later large one waits for its own click", async () => {
    const entries = [file(uuid(1), "a.txt", MY_ROOT, 10), file(uuid(2), "big.mov", MY_ROOT, 150 * MIB), file(uuid(3), "c.txt", MY_ROOT, 20), file(uuid(4), "big2.mov", MY_ROOT, 120 * MIB)];
    const reasons: string[] = [];
    const progress: string[] = [];
    const extra = { onSequential: (r: string) => reasons.push(r), onProgress: (d: number, t: number) => progress.push(`${d}/${t}`) };
    const pending = click(() => downloadEntries(entries as never, deps(desktop, extra)));
    expect(ids(named("downloadDriveItem").map((c) => c.args[0]))).toEqual([uuid(2)]);
    const result = await pending;
    expect(result).toEqual({ kind: "partial", saved: 3, total: 4, remaining: [entries[3]] } as never);
    expect(reasons).toEqual(["tooBig"]);
    expect(progress).toEqual(["1/4", "2/4", "3/4", "4/4"]);
    expect(named("downloadDriveItem").length).toBe(1);
    expect(allInGesture()).toBe(true);
    expect(named("fetchDriveItemBytes").map((c) => [(c.args[0] as { id: string }).id, c.args[1]])).toEqual([[uuid(1), BUFFERED_MAX], [uuid(3), BUFFERED_MAX]]);

    // The browser blocks even the first window: the large files wait, the rest are saved; no "blocked" loop.
    calls.length = 0;
    singles.push("blocked");
    const blocked = await click(() => downloadEntries(entries as never, deps()));
    expect(blocked).toMatchObject({ kind: "partial", saved: 2, total: 4 });
    expect(ids((blocked as { remaining: unknown[] }).remaining)).toEqual([uuid(2), uuid(4)]);
    expect(allInGesture()).toBe(true);

    // Only buffered files: the first uploaded file still gets the click, the others need no window.
    calls.length = 0;
    const mid = [file(uuid(5), "x", MY_ROOT, 90 * MIB), virtual("v1"), file(uuid(6), "y", MY_ROOT, 90 * MIB), file(uuid(7), "z", MY_ROOT, 90 * MIB)];
    expect(await click(() => downloadEntries(mid as never, deps()))).toBe("sequential");
    expect(ids(named("downloadDriveItem").map((c) => c.args[0]))).toEqual([uuid(5)]);
    expect(named("downloadExternalFile")).toEqual([]);
    expect(allInGesture()).toBe(true);
  });

  test("a file from another app is refused while it is read, as soon as it passes the zip cap", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(MIB);
    const endless = () =>
      new Response(new ReadableStream<Uint8Array>({ pull: (c) => { pulled++; c.enqueue(chunk); } }, { highWaterMark: 0 }));
    fetchImpl = async (url) => (url.includes("declared") ? new Response(endless().body, { headers: { "content-length": String(10 ** 9) } }) : endless());
    const entries = [file(uuid(1), "a.txt"), virtual("v1", "https://files.example/endless")];
    const result = await click(() => downloadEntries(entries as never, deps(phone)));
    // Zip (cap 50 MiB): stops right after passing it. One by one (buffered cap 100 MiB): the same, at 100 MiB.
    expect(pulled).toBeLessThanOrEqual(50 + 1 + 100 + 1);
    expect(pulled).toBeGreaterThan(100);
    expect(result).toMatchObject({ kind: "partial", saved: 1, total: 2 });
    expect(driveErrorCode((result as { error?: unknown }).error)).toBe("too_large");

    // A declared length over the budget is refused before any byte is read.
    pulled = 0;
    const declared = await click(() => downloadEntries([file(uuid(1), "a.txt"), virtual("v1", "https://files.example/declared")] as never, deps(phone)));
    expect(pulled).toBe(0);
    expect(ids((declared as { remaining: unknown[] }).remaining)).toEqual(["v1"]);
  });

  test("desktop app (Tauri): a failed zip still saves every file one by one, since the system browser needs no click", async () => {
    tauri = true;
    fetchFails = true;
    const reasons: string[] = [];
    const pair = [file(uuid(1), "a.txt"), file(uuid(2), "b.txt", MY_ROOT, 150 * MIB)];
    expect(await click(() => downloadEntries(pair as never, deps(desktop, { onSequential: (r: string) => reasons.push(r) })))).toBe("sequential");
    expect(ids(named("downloadDriveItem").map((c) => c.args[0]))).toEqual([uuid(1), uuid(2)]);
    calls.length = 0;
    const big = [file(uuid(1), "a.txt", MY_ROOT, 150 * MIB), file(uuid(2), "b.txt", MY_ROOT, 150 * MIB)];
    expect(await click(() => downloadEntries(big as never, deps(desktop, { onSequential: (r: string) => reasons.push(r) })))).toBe("sequential");
    expect(ids(named("downloadDriveItem").map((c) => c.args[0]))).toEqual([uuid(1), uuid(2)]);
    expect(reasons).toEqual(["zipFailed", "tooBig"]);
  });
});

test("every Drive reducer call names the actor and the store", async () => {
  const entry = file(uuid(1), "a");
  const plan = { itemIds: [uuid(1)], documentIds: [uuid(2)], target: { space: "my", ownerMemberId: "m-1", parentId: "" }, changesSpace: null, affected: { items: 1, documents: 1 }, blocked: null };
  await runDriveWrite({ kind: "rename", entry, name: "b" } as never, DEPS);
  await runDriveWrite({ kind: "star", entry } as never, DEPS);
  await runDriveWrite({ kind: "move", plan } as never, DEPS);
  for (const kind of ["trash", "restore", "deleteForever"] as const) await runDriveWrite({ kind, entries: [entry, doc(uuid(2))] } as never, DEPS);
  await runDriveWrite({ kind: "newFolder", target: { space: "store", ownerMemberId: "", parentId: "" }, name: "N" } as never, DEPS);
  expect(calls.map((c) => c.name)).toEqual([
    "renameDriveItem", "toggleDriveStar", "moveDriveEntries", "trashDriveEntries", "restoreDriveEntries", "deleteDriveEntriesForever", "createDriveFolder",
  ]);
  for (const call of calls) expect(call.args[call.args.length - 1]).toMatchObject(ACTING);
});
