// Isolated fixture for scripts/tests/drive/home-render.test.ts — NOT auto-discovered by `bun test`. It replaces the
// Drive reducer wrapper and the Sheets / Slides create and import modules with mock.module, so it runs in its own
// process.
//
// Covers lib/drive/editors.ts (CONTRACTS §2.10–§2.11): New ▸ Doc builds the blank Docs state and creates through
// createDriveDocument for the target and actor; Sheets and Slides go through their own modules; "Open as Doc" runs
// the real Docs importer (a .txt) into createDriveDocument; each importer's failure comes back as a DriveEditorError
// with its own copy; the pre-download checks; where components/drive/actions/open-as.ts puts an "Open as" copy; and
// that each create marks when its reducer goes out (beforeCreate), after any parse, so the caller can time the reply.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { DriveDocTarget } from "@/lib/drive/types";
import { driveData, entryOf, makeItem, ME, ORG, PRIYA, translator, uuid } from "./fixture";

// Real classes and checks, loaded before the modules that re-export them are replaced.
const { SpreadsheetReadError, XLSX_READ_TIMEOUT_MS, XLSX_WORKER_READY_MS } = await import("@/lib/sheets/xlsx/client");
const slidesConstants = await import("@/lib/slides/import/constants");
const slidesErrors = await import("@/lib/slides/import/errors");

interface Call { name: string; args: unknown[] }
const calls: Call[] = [];
const named = (name: string) => calls.filter((c) => c.name === name).map((c) => c.args);
let failWith: unknown = null;
function respond<T>(name: string, value: T) {
  return async (...args: unknown[]): Promise<T> => {
    calls.push({ name, args });
    if (failWith) throw failWith;
    return value;
  };
}

// open-as.ts loads drive-writes.ts, which imports every Drive write wrapper; only the create is used here.
const WRITES = [
  "createDriveFolder", "deleteDriveEntriesForever", "moveDriveEntries", "renameDriveDocument", "renameDriveItem", "restoreDriveEntries",
  "toggleDriveStar", "trashDriveEntries",
] as const;
mock.module("@/lib/spacetimedb/actions/drive", () => ({
  ...Object.fromEntries(WRITES.map((name) => [name, respond(name, undefined)])),
  createDriveDocument: respond("createDriveDocument", uuid(100)),
}));
mock.module("@/lib/sheets/create", () => ({ createSheetDocument: respond("createSheetDocument", uuid(101)) }));
mock.module("@/lib/sheets/import", () => ({ importSheetFile: respond("importSheetFile", { documentId: uuid(102), warnings: 2, lossy: [] }) }));
mock.module("@/lib/slides/create", () => ({ createSlidesDocument: respond("createSlidesDocument", uuid(103)) }));
mock.module("@/lib/slides/import", () => ({
  ...slidesConstants,
  ...slidesErrors,
  // Reports its stages as the real one does: the create goes out at "creating", after the parse.
  importSlidesFile: async (file: File, target: unknown, opts: { onProgress?(p: { stage: string }): void }) => {
    opts.onProgress?.({ stage: "parsing" });
    const outcome = await respond("importSlidesFile", { documentId: uuid(104), warnings: 3, report: {} })(file, target, opts);
    opts.onProgress?.({ stage: "creating" });
    return outcome;
  },
}));

const { checkDriveImport, createDriveDoc, DriveEditorError, driveEditorErrorMessage, importIntoDrive } = await import("@/lib/drive/editors");
const { docTargetOf, openAsTargetOf } = await import("@/components/drive/actions/open-as");

const t = translator();
const ctx = { t, locale: "en" };
const FOLDER = uuid(1);
const TARGET: DriveDocTarget = { organizationId: ORG, space: "my", folderId: FOLDER, ownerMemberId: ME, actingMemberId: "op-1" };
const PLACED = { organizationId: ORG, space: "my", folderId: FOLDER, ownerMemberId: ME, actingMemberId: "op-1" };
const MIB = 1024 * 1024;

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  calls.length = 0;
  failWith = null;
});

describe("createDriveDoc", () => {
  test("a Doc: the blank Docs state through createDriveDocument, for the target and the actor", async () => {
    expect(await createDriveDoc("doc", TARGET, ctx)).toBe(uuid(100));
    const [[input]] = named("createDriveDocument") as [[Record<string, unknown>]];
    expect(input).toMatchObject({ ...PLACED, fileType: "doc", title: "", templateId: "blank", html: "<p></p>", plainText: "", wordCount: 0 });
    expect(input.initialState).toBeInstanceOf(Uint8Array);
    expect(input).not.toHaveProperty("visibility");
  });

  test("a Sheet and a Slides file through their own create modules", async () => {
    expect(await createDriveDoc("sheet", TARGET, ctx)).toBe(uuid(101));
    expect(await createDriveDoc("slides", TARGET, ctx)).toBe(uuid(103));
    expect(named("createSheetDocument")).toEqual([[TARGET, { t, locale: "en" }]]);
    expect(named("createSlidesDocument")).toEqual([[TARGET]]);
    expect(named("createDriveDocument")).toEqual([]);
  });
});

describe("importIntoDrive", () => {
  test("Open as Doc: the Docs importer's content, titled from the file", async () => {
    const file = new File(["Till counted twice\n\nSafe locked"], "Closing notes.txt", { type: "text/plain" });
    expect(await importIntoDrive(file, "doc", TARGET, ctx)).toEqual({ documentId: uuid(100), warnings: 0 });
    const [[input]] = named("createDriveDocument") as [[Record<string, unknown>]];
    expect(input).toMatchObject({ ...PLACED, fileType: "doc", title: "Closing notes", templateId: "blank" });
    expect(String(input.plainText)).toContain("Till counted twice");
    expect(input.initialState).toBeInstanceOf(Uint8Array);
  });

  test("Open as Sheet and Slides go through their importers (the deck keeps the Drive file)", async () => {
    const xlsx = new File(["x"], "stock.xlsx");
    const pptx = new File(["x"], "pitch.pptx");
    expect(await importIntoDrive(xlsx, "sheet", TARGET, ctx)).toEqual({ documentId: uuid(102), warnings: 2 });
    expect(await importIntoDrive(pptx, "slides", TARGET, { ...ctx, driveItemId: uuid(9) })).toEqual({ documentId: uuid(104), warnings: 3 });
    expect(named("importSheetFile")).toEqual([[xlsx, TARGET, { t, locale: "en" }]]);
    expect(named("importSlidesFile")).toEqual([[pptx, TARGET, { driveItemId: uuid(9), onProgress: expect.any(Function) }]]);
  });

  test("each importer's failure carries its own copy", async () => {
    const pdf = new File(["x"], "scan.pdf", { type: "application/pdf" });
    const docErr = await rejection(importIntoDrive(pdf, "doc", TARGET, ctx));
    expect(docErr).toBeInstanceOf(DriveEditorError);
    expect(driveEditorErrorMessage(docErr, t)).toBe("This file type isn't supported.");

    failWith = new Error("[drive.quota_exceeded] Storage is full");
    const quota = await rejection(importIntoDrive(new File(["a"], "a.txt", { type: "text/plain" }), "doc", TARGET, ctx));
    expect(driveEditorErrorMessage(quota, t)).toBe("Your store is out of storage space.");

    failWith = new SpreadsheetReadError("too_large");
    const big = new File([new Uint8Array(12 * MIB)], "big.csv", { type: "text/csv" });
    const sheetErr = await rejection(importIntoDrive(big, "sheet", TARGET, ctx));
    expect(driveEditorErrorMessage(sheetErr, t)).toMatch(/^This file is too large \(12(\.\d)? MB\)\. The limit is 10 MB\.$/);

    failWith = new slidesErrors.SlidesImportError("notPptx");
    const slidesErr = await rejection(importIntoDrive(new File(["x"], "deck.key"), "slides", TARGET, ctx));
    expect(driveEditorErrorMessage(slidesErr, t)).toBe("Choose a .pptx file.");
  });

  test("errors that are not the importers' keep their Drive copy or the caller's fallback", () => {
    expect(driveEditorErrorMessage(new Error("[drive.forbidden] no"), t)).toBe("You don't have permission to do that.");
    expect(driveEditorErrorMessage(new Error("boom"), t, "drive.home.errors.createFailed")).toBe("Couldn't create it. Try again.");
  });
});

describe("beforeCreate: when the create reducer goes out", () => {
  const marked = { ...ctx, beforeCreate: (withinMs?: number) => void calls.push({ name: "beforeCreate", args: withinMs === undefined ? [] : [withinMs] }) };
  const order = () => calls.map((c) => (c.name === "beforeCreate" ? `beforeCreate(${c.args.join()})` : c.name));

  test("New ▸ Doc / Sheet / Slides mark it once, right before their create", async () => {
    await createDriveDoc("doc", TARGET, marked);
    await createDriveDoc("sheet", TARGET, marked);
    await createDriveDoc("slides", TARGET, marked);
    expect(order()).toEqual([
      "beforeCreate()", "createDriveDocument", "beforeCreate()", "createSheetDocument", "beforeCreate()", "createSlidesDocument",
    ]);
  });

  test("an import marks it after its parse; a Sheet import up front, with its read's own bound; a failed parse never", async () => {
    await importIntoDrive(new File(["Till counted"], "notes.txt", { type: "text/plain" }), "doc", TARGET, marked);
    await importIntoDrive(new File(["x"], "stock.xlsx"), "sheet", TARGET, marked);
    await importIntoDrive(new File(["x"], "pitch.pptx"), "slides", TARGET, marked);
    expect(order()).toEqual([
      "beforeCreate()", "createDriveDocument",
      `beforeCreate(${XLSX_WORKER_READY_MS + XLSX_READ_TIMEOUT_MS})`, "importSheetFile",
      "importSlidesFile", "beforeCreate()",
    ]);
    calls.length = 0;
    await rejection(importIntoDrive(new File(["x"], "scan.pdf", { type: "application/pdf" }), "doc", TARGET, marked));
    expect(order()).toEqual([]);
  });
});

describe("checkDriveImport (before any byte is fetched)", () => {
  test("each importer's size and type rules", async () => {
    expect(await checkDriveImport("doc", { name: "notes.txt", size: 1024, type: "text/plain" }, ctx)).toBeNull();
    expect(await checkDriveImport("doc", { name: "report", size: 1024, type: "text/markdown" }, ctx)).toBeNull();
    expect(await checkDriveImport("doc", { name: "big.docx", size: 30 * MIB, type: "" }, ctx)).toBe("Files must be smaller than 20 MB.");
    expect(await checkDriveImport("doc", { name: "scan.pdf", size: 10, type: "application/pdf" }, ctx)).toBe("This file type isn't supported.");
    expect(await checkDriveImport("sheet", { name: "stock.xlsx", size: 10, type: "" }, ctx)).toBeNull();
    expect(await checkDriveImport("sheet", { name: "big.csv", size: 11 * MIB, type: "text/csv" }, ctx)).toMatch(/The limit is 10 MB\.$/);
    expect(await checkDriveImport("sheet", { name: "old.xls", size: 10, type: "" }, ctx)).toBe("Only .xlsx and .csv files can be opened.");
    expect(await checkDriveImport("slides", { name: "pitch.pptx", size: 10, type: "" }, ctx)).toBeNull();
    expect(await checkDriveImport("slides", { name: "pitch.pptx", size: 60 * MIB, type: "" }, ctx)).toBe("Files must be smaller than 50 MB.");
    expect(await checkDriveImport("slides", { name: "deck.key", size: 10, type: "" }, ctx)).toBe("Choose a .pptx file.");
  });
});

describe("where an Open as copy goes", () => {
  const RECEIPTS = uuid(20);
  const tree = driveData({
    items: [
      makeItem({ id: RECEIPTS, name: "Receipts", kind: "folder" }),
      makeItem({ id: uuid(21), name: "in-folder.docx", kind: "file", parentId: RECEIPTS }),
      makeItem({ id: uuid(22), name: "store.docx", kind: "file", space: "store" }),
      makeItem({ id: uuid(23), name: "priya.docx", kind: "file", ownerMemberId: PRIYA }),
      makeItem({ id: uuid(24), name: "mine.docx", kind: "file" }),
    ],
  }).tree;
  const file = (n: number) => entryOf(tree, `item:${uuid(n)}`) as Parameters<typeof openAsTargetOf>[0];

  test("next to the original where the person may add files, else their own My files", () => {
    expect(openAsTargetOf(file(21), tree, ME)).toEqual({ space: "my", parentId: RECEIPTS, ownerMemberId: ME });
    expect(openAsTargetOf(file(22), tree, ME)).toEqual({ space: "store", parentId: "", ownerMemberId: "" });
    expect(openAsTargetOf(file(23), tree, ME)).toEqual({ space: "my", parentId: "", ownerMemberId: ME });
    expect(openAsTargetOf(file(24), tree, ME)).toEqual({ space: "my", parentId: "", ownerMemberId: ME });
    expect(docTargetOf({ space: "store", parentId: RECEIPTS, ownerMemberId: ME }, ORG, "op-1")).toEqual({
      organizationId: ORG, space: "store", folderId: RECEIPTS, ownerMemberId: "", actingMemberId: "op-1",
    });
  });
});
