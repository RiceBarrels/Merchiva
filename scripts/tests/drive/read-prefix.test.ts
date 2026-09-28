// components/drive/preview and components/drive/virtual — the pure helpers behind the file previews and "Stored in
// apps": readPrefix (the first bytes of a text, CSV or linked PDF file, read as a stream and cancelled once enough
// arrived), the CSV prefix parser, the preview mode of an entry, the preview sheet's stepping and the body's one
// retry, and which app sources a person may see.
import { afterEach, describe, expect, test } from "bun:test";
import { CSV_PREVIEW_MAX_COLUMNS, csvDelimiterOf, parseCsvPrefix } from "@/components/drive/preview/csv-rows";
import { entryLabel, entryPreviewKind, entryPreviewMode, isPreviewable } from "@/components/drive/preview/preview-mode";
import { arrowStep, attemptAfterError, attemptFor, previewNeighbours, type ArrowKeyEvent } from "@/components/drive/preview/preview-state";
import { ReadPrefixError, readPrefix } from "@/components/drive/preview/read-prefix";
import { visibleVirtualSources, type VirtualSourceGate } from "@/components/drive/virtual/visible-sources";
import type { DriveEntry, FileEntry, VirtualEntry } from "@/components/drive/model/types";
import type { PreviewEnv } from "@/lib/drive/file-kinds";
import type { Permissions } from "@/lib/types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Stub {
  calls: Array<{ url: string; init: RequestInit | undefined }>;
  pulls: number;
  cancelled: boolean;
}

/** fetch answers with a body that yields `chunks` (then ends), or forever when `endless`. */
function stubFetch(opts: { chunks?: Uint8Array[]; endless?: number; status?: number; fail?: boolean; headers?: Record<string, string> }): Stub {
  const stub: Stub = { calls: [], pulls: 0, cancelled: false };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    stub.calls.push({ url: String(input), init });
    if (opts.fail) throw new TypeError("Failed to fetch");
    init?.signal?.throwIfAborted();
    const queue = [...(opts.chunks ?? [])];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        stub.pulls += 1;
        if (opts.endless) controller.enqueue(new Uint8Array(opts.endless).fill(0x61));
        else if (queue.length > 0) controller.enqueue(queue.shift()!);
        else controller.close();
      },
      cancel() {
        stub.cancelled = true;
      },
    }, { highWaterMark: 0 });
    return new Response(body, { status: opts.status ?? 200, headers: opts.headers });
  }) as typeof fetch;
  return stub;
}

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe("readPrefix", () => {
  test("stops after maxBytes of an endless body, flags it truncated and cancels the reader", async () => {
    const stub = stubFetch({ endless: 1024 });
    const read = await readPrefix("https://blob.test/a.txt", 10 * 1024 + 5);
    expect(read.bytes.byteLength).toBe(10 * 1024 + 5);
    expect(read.truncated).toBe(true);
    expect(stub.cancelled).toBe(true);
    expect(stub.pulls).toBeLessThanOrEqual(12);
  });

  test("sends a plain GET: no Range header, no credentials", async () => {
    const stub = stubFetch({ chunks: [bytes("hello")] });
    await readPrefix("https://blob.test/a.txt", 100);
    expect(stub.calls).toHaveLength(1);
    const init = stub.calls[0].init;
    expect(new Headers(init?.headers).has("range")).toBe(false);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.credentials).toBe("omit");
  });

  test("a file shorter than maxBytes comes back whole, not truncated", async () => {
    const stub = stubFetch({ chunks: [bytes("a,b\n"), bytes("1,2\n")] });
    const read = await readPrefix("https://blob.test/a.csv", 100);
    expect(text(read.bytes)).toBe("a,b\n1,2\n");
    expect(read.truncated).toBe(false);
    expect(stub.cancelled).toBe(false);
  });

  test("a file of exactly maxBytes is not truncated (only a further byte says the file goes on)", async () => {
    stubFetch({ chunks: [bytes("abcd"), bytes("ef")] });
    const exact = await readPrefix("https://blob.test/a.txt", 6);
    expect({ text: text(exact.bytes), truncated: exact.truncated }).toEqual({ text: "abcdef", truncated: false });

    stubFetch({ chunks: [bytes("abcd"), bytes("ef"), bytes("g")] });
    const longer = await readPrefix("https://blob.test/a.txt", 6);
    expect({ text: text(longer.bytes), truncated: longer.truncated }).toEqual({ text: "abcdef", truncated: true });
  });

  test("cuts inside a chunk", async () => {
    const stub = stubFetch({ chunks: [bytes("abcd"), bytes("efgh"), bytes("ijkl")] });
    const read = await readPrefix("https://blob.test/a.txt", 6);
    expect(text(read.bytes)).toBe("abcdef");
    expect(read.truncated).toBe(true);
    expect(stub.cancelled).toBe(true);
  });

  test("maxBytes 0 reads nothing but still says whether there is more", async () => {
    stubFetch({ chunks: [bytes("x")] });
    const read = await readPrefix("https://blob.test/a.txt", 0);
    expect(read.bytes.byteLength).toBe(0);
    expect(read.truncated).toBe(true);
  });

  test("an HTTP error rejects with its status", async () => {
    stubFetch({ chunks: [bytes("denied")], status: 403 });
    const err = await readPrefix("https://blob.test/a.txt", 100).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReadPrefixError);
    expect((err as ReadPrefixError).status).toBe(403);
  });

  test("a network or CORS failure rejects with status 0", async () => {
    stubFetch({ fail: true });
    const err = await readPrefix("https://blob.test/a.txt", 100).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReadPrefixError);
    expect((err as ReadPrefixError).status).toBe(0);
  });

  test("an aborted signal rejects without fetching", async () => {
    const stub = stubFetch({ chunks: [bytes("x")] });
    const controller = new AbortController();
    controller.abort();
    const err = await readPrefix("https://blob.test/a.txt", 100, controller.signal).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ReadPrefixError);
    expect((err as { name?: string }).name).toBe("AbortError");
    expect(stub.calls).toHaveLength(0);
  });

  test("wholeOnly: a file declaring more than maxBytes is given up before its body is read", async () => {
    const stub = stubFetch({ endless: 1024, headers: { "content-length": String(60 * 1024 * 1024) } });
    const read = await readPrefix("https://utfs.test/f/lesson.pdf", 50 * 1024 * 1024, undefined, { wholeOnly: true });
    expect({ size: read.bytes.byteLength, truncated: read.truncated }).toEqual({ size: 0, truncated: true });
    expect(stub.pulls).toBe(0);
    expect(stub.cancelled).toBe(true);
  });

  test("wholeOnly reads a file that declares no more than maxBytes, or declares nothing usable", async () => {
    stubFetch({ chunks: [bytes("%PDF-1.7")], headers: { "content-length": "8" } });
    const small = await readPrefix("https://utfs.test/f/a.pdf", 8, undefined, { wholeOnly: true });
    expect({ text: text(small.bytes), truncated: small.truncated }).toEqual({ text: "%PDF-1.7", truncated: false });

    stubFetch({ chunks: [bytes("%PDF-1.7")], headers: { "content-length": "not a number" } });
    const odd = await readPrefix("https://utfs.test/f/a.pdf", 100, undefined, { wholeOnly: true });
    expect({ text: text(odd.bytes), truncated: odd.truncated }).toEqual({ text: "%PDF-1.7", truncated: false });

    // A body longer than it declared is still cut at maxBytes.
    stubFetch({ chunks: [bytes("abcd"), bytes("efgh")], headers: { "content-length": "4" } });
    const lying = await readPrefix("https://utfs.test/f/a.pdf", 6, undefined, { wholeOnly: true });
    expect({ text: text(lying.bytes), truncated: lying.truncated }).toEqual({ text: "abcdef", truncated: true });
  });

  test("without wholeOnly a large declared length still gives its prefix (text and CSV previews)", async () => {
    stubFetch({ chunks: [bytes("line 1\nline 2\n")], headers: { "content-length": String(10 * 1024 * 1024) } });
    const read = await readPrefix("https://blob.test/big.log", 6);
    expect({ text: text(read.bytes), truncated: read.truncated }).toEqual({ text: "line 1", truncated: true });
  });

  test("aborting mid-read rejects with the abort, not a read error", async () => {
    const controller = new AbortController();
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes("first"));
          init?.signal?.addEventListener("abort", () => c.error(init.signal?.reason));
        },
      });
      return new Response(body);
    }) as typeof fetch;
    const pending = readPrefix("https://blob.test/a.txt", 1024, controller.signal);
    setTimeout(() => controller.abort(), 5);
    const err = await pending.catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ReadPrefixError);
    expect((err as { name?: string }).name).toBe("AbortError");
  });
});

describe("csvDelimiterOf", () => {
  const file = { mimeType: "text/csv", name: "a.csv" };
  test("the most frequent of comma, semicolon and tab in the first record, outside quotes", () => {
    expect(csvDelimiterOf("a,b,c\n1;2", file)).toBe(",");
    expect(csvDelimiterOf("a;b;c\n1,2,3,4,5", file)).toBe(";");
    expect(csvDelimiterOf("a\tb\tc", file)).toBe("\t");
    expect(csvDelimiterOf('"x;y;z",b\n', file)).toBe(",");
    expect(csvDelimiterOf("abc", file)).toBe(",");
    expect(csvDelimiterOf("a;b,c", file)).toBe(",");
  });

  test("a .tsv name or a tab-separated type means tabs", () => {
    expect(csvDelimiterOf("a,b,c", { mimeType: "text/plain", name: "export.TSV" })).toBe("\t");
    expect(csvDelimiterOf("a,b,c", { mimeType: "text/tab-separated-values; charset=utf-8", name: "x" })).toBe("\t");
  });
});

describe("parseCsvPrefix", () => {
  const whole = (csv: string, delimiter: "," | ";" | "\t" = ",") => parseCsvPrefix(csv, { delimiter, complete: true });

  test("quoted fields keep delimiters, doubled quotes and line breaks; CRLF, CR and a BOM are handled", () => {
    const parsed = whole('﻿name,note\r\n"Doe, Jane","said ""hi""\nthen left"\r3,x\n');
    expect(parsed.rows).toEqual([["name", "note"], ["Doe, Jane", 'said "hi"\nthen left'], ["3", "x"]]);
    expect(parsed.moreRows).toBe(false);
    expect(parsed.columns).toBe(2);
  });

  test("a final line without a break still counts; a trailing break adds no row", () => {
    expect(whole("a,b\n1,2").rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(whole("a,b\n1,2\n").rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(whole("a\n\nb\n").rows).toEqual([["a"], [""], ["b"]]);
  });

  test("cells are text: formulas are not evaluated, stray quotes inside a field are literal", () => {
    expect(whole('=1+1,a"b,"c"d\n').rows).toEqual([["=1+1", 'a"b', "cd"]]);
  });

  test("an unclosed quote in a whole file runs to the end", () => {
    expect(whole('a,"b\nc').rows).toEqual([["a", "b\nc"]]);
  });

  test("a prefix drops the record cut off at its end and says more rows exist", () => {
    const parsed = parseCsvPrefix("a,b\n1,2\n3,4", { delimiter: ",", complete: false });
    expect(parsed.rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(parsed.moreRows).toBe(true);
    const boundary = parseCsvPrefix("a,b\n1,2\n", { delimiter: ",", complete: false });
    expect(boundary.rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(boundary.moreRows).toBe(true);
  });

  test("a prefix holding no complete record shows the partial one", () => {
    const parsed = parseCsvPrefix("one very long line", { delimiter: ",", complete: false });
    expect(parsed.rows).toEqual([["one very long line"]]);
    expect(parsed.moreRows).toBe(true);
  });

  test("stops at maxRows (200 by default)", () => {
    const csv = Array.from({ length: 250 }, (_, i) => `r${i},x`).join("\n");
    const parsed = parseCsvPrefix(csv, { delimiter: ",", complete: true });
    expect(parsed.rows).toHaveLength(200);
    expect(parsed.rows[199]).toEqual(["r199", "x"]);
    expect(parsed.moreRows).toBe(true);
    const exact = parseCsvPrefix("a\nb\n", { delimiter: ",", complete: true, maxRows: 2 });
    expect({ rows: exact.rows.length, more: exact.moreRows }).toEqual({ rows: 2, more: false });
  });

  test("caps the columns and says so", () => {
    const wide = Array.from({ length: CSV_PREVIEW_MAX_COLUMNS + 5 }, (_, i) => `c${i}`).join(";");
    const parsed = whole(`${wide}\n1;2\n`, ";");
    expect(parsed.rows[0]).toHaveLength(CSV_PREVIEW_MAX_COLUMNS);
    expect(parsed.moreColumns).toBe(true);
    expect(parsed.columns).toBe(CSV_PREVIEW_MAX_COLUMNS);
    expect(whole("a;b\n", ";").moreColumns).toBe(false);
  });
});

const ACCESS = {
  canOpen: true, canDownload: true, canRename: false, canMove: false, canTrash: false, canRestore: false,
  canDeleteForever: false, canShare: false, canStar: false, canAddChildren: false,
};

function fileEntry(patch: Partial<FileEntry>): FileEntry {
  return {
    key: "item:1", id: "00000000-0000-4000-8000-000000000001", name: "file", createdAt: 1, updatedAt: 1, ownerMemberId: "",
    ownerName: null, isMine: true, starred: false, trashedAt: null, openedAt: null, location: { space: "my", ownerMemberId: "m", parentId: "" },
    access: ACCESS, type: "file", item: {} as FileEntry["item"], fileKind: "other", mimeType: "application/octet-stream", sizeBytes: 1000,
    uploading: null, ...patch,
  } as FileEntry;
}

function virtualEntry(patch: Partial<VirtualEntry>): VirtualEntry {
  return {
    key: "v:tasks:1:1", id: "1:1", name: "Close shop · photo 1", createdAt: 1, updatedAt: 1, ownerMemberId: "", ownerName: null,
    isMine: false, starred: false, trashedAt: null, openedAt: null, location: null, access: ACCESS, type: "virtual", source: "tasks",
    url: "https://utfs.test/f/abc", fileKind: "image", mimeType: "application/octet-stream", group: "", originRoute: "/manager/personnel/roles",
    ...patch,
  } as VirtualEntry;
}

const DESKTOP: PreviewEnv = { capacitor: false, nativeShell: false, appleTouch: false, pdfViewerEnabled: true };
const IPHONE: PreviewEnv = { capacitor: false, nativeShell: false, appleTouch: true, pdfViewerEnabled: undefined };

describe("entry preview modes", () => {
  test("a link keeps its app's declared family when it has no type or extension; a real type still decides", () => {
    expect(entryPreviewKind(virtualEntry({}))).toBe("image");
    expect(entryPreviewKind(virtualEntry({ fileKind: "video" }))).toBe("video");
    expect(entryPreviewKind(virtualEntry({ fileKind: "image", mimeType: "image/heic" }))).toBe("none");
    expect(entryPreviewKind(virtualEntry({ fileKind: "other" }))).toBe("none");
    expect(entryPreviewKind(fileEntry({ fileKind: "image", mimeType: "application/octet-stream", name: "photo" }))).toBe("none");
    expect(entryPreviewKind(fileEntry({ mimeType: "", name: "notes.md" }))).toBe("text");
  });

  test("PDFs frame inline on desktop web only, and never when the caller turns inline PDFs off", () => {
    const pdf = fileEntry({ mimeType: "application/pdf", name: "a.pdf", fileKind: "pdf" });
    expect(entryPreviewMode(pdf, DESKTOP)).toBe("pdf");
    expect(entryPreviewMode(pdf, DESKTOP, { inlinePdf: false })).toBe("pdfExternal");
    expect(entryPreviewMode(pdf, IPHONE)).toBe("pdfExternal");
    expect(entryPreviewMode(fileEntry({ mimeType: "application/pdf", name: "a.pdf", sizeBytes: 60 * 1024 * 1024 }), DESKTOP)).toBe("pdfExternal");
    // A linked PDF has no known size: the device decides, the reader enforces the cap.
    expect(entryPreviewMode(virtualEntry({ mimeType: "application/pdf", name: "lesson.pdf", fileKind: "pdf" }), DESKTOP)).toBe("pdf");
  });

  test("office files offer their editor when uploaded; links to them show no preview", () => {
    const xlsx = { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: "sales.xlsx", fileKind: "spreadsheet" as const };
    expect(entryPreviewMode(fileEntry(xlsx), DESKTOP)).toBe("office");
    expect(entryPreviewMode(virtualEntry(xlsx), DESKTOP)).toBe("none");
    expect(entryPreviewMode(fileEntry({ mimeType: "text/csv", name: "a.csv" }), IPHONE)).toBe("csv");
    expect(entryPreviewMode(fileEntry({ mimeType: "video/mp4", name: "a.mp4" }), IPHONE)).toBe("video");
  });

  test("only files and links step with previous / next; nameless entries read their untitled label", () => {
    const t = (key: string) => `<${key}>`;
    expect(isPreviewable(fileEntry({}))).toBe(true);
    expect(isPreviewable(virtualEntry({}))).toBe(true);
    const doc = { ...fileEntry({}), type: "sheet", name: "" } as unknown as DriveEntry;
    expect(isPreviewable(doc)).toBe(false);
    expect(entryLabel(doc, t)).toBe("<drive.list.untitled.sheet>");
    expect(entryLabel(fileEntry({ name: "  " }), t)).toBe("<drive.list.untitled.file>");
    expect(entryLabel(fileEntry({ name: "a.pdf" }), t)).toBe("a.pdf");
  });
});

describe("preview sheet stepping", () => {
  const photo = (n: number) => fileEntry({ key: `item:${n}`, name: `photo-${n}.jpg`, mimeType: "image/jpeg", fileKind: "image" });
  const folder = { ...fileEntry({ key: "folder:1" }), type: "folder" } as unknown as DriveEntry;
  const doc = { ...fileEntry({ key: "doc:1" }), type: "doc" } as unknown as DriveEntry;
  const link = virtualEntry({ key: "v:tasks:1:1" });
  const listing: DriveEntry[] = [folder, photo(1), doc, photo(2), link];

  test("previous / next step over folders and documents, through files and links, and stop at the ends", () => {
    const around = (entry: DriveEntry) => {
      const { prev, next } = previewNeighbours(entry, listing);
      return [prev?.key ?? null, next?.key ?? null];
    };
    expect(previewNeighbours(photo(1), listing).files.map((e) => e.key)).toEqual(["item:1", "item:2", "v:tasks:1:1"]);
    expect([around(photo(1)), around(photo(2)), around(link)]).toEqual([[null, "item:2"], ["item:1", "v:tasks:1:1"], ["item:2", null]]);
    // An entry that doesn't preview, or isn't in the listing, steps nowhere.
    expect(previewNeighbours(folder, listing)).toEqual({ files: [], prev: null, next: null });
    expect(previewNeighbours(photo(9), listing)).toMatchObject({ prev: null, next: null });
  });

  const key = (k: string, mods: Partial<Omit<ArrowKeyEvent, "key">> = {}): ArrowKeyEvent =>
    ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, ...mods });

  test("Left steps back and Right forward; a right-to-left layout mirrors them", () => {
    expect([arrowStep(key("ArrowLeft"), false), arrowStep(key("ArrowRight"), false)]).toEqual([-1, 1]);
    expect([arrowStep(key("ArrowLeft"), true), arrowStep(key("ArrowRight"), true)]).toEqual([1, -1]);
  });

  test("other keys, modified arrows and arrows already handled don't step", () => {
    for (const k of ["ArrowUp", "ArrowDown", "Enter", " ", "a"]) expect(arrowStep(key(k), false)).toBeNull();
    for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey", "defaultPrevented"] as const) {
      expect(arrowStep(key("ArrowRight", { [mod]: true }), false)).toBeNull();
    }
  });
});

describe("preview body retry", () => {
  test("an uploaded file retries once with a fresh signed URL, then fails", () => {
    const first = attemptAfterError(attemptFor({ key: "item:1", retried: false, failed: false }, "item:1"), true);
    expect(first).toEqual({ attempt: { key: "item:1", retried: true, failed: false }, invalidate: true });
    expect(attemptAfterError(first.attempt, true)).toEqual({ attempt: { key: "item:1", retried: true, failed: true }, invalidate: false });
  });

  test("a link kept by another app has no URL to refresh: it fails at once", () => {
    const link = { key: "v:tasks:1:1", retried: false, failed: false };
    expect(attemptAfterError(link, false)).toEqual({ attempt: { ...link, failed: true }, invalidate: false });
  });

  test("another entry starts over; the same entry keeps its state", () => {
    const failed = { key: "item:1", retried: true, failed: true };
    expect([attemptFor(failed, "item:2"), attemptFor(failed, "item:1")]).toEqual([{ key: "item:2", retried: false, failed: false }, failed]);
  });
});

describe("visible app sources", () => {
  const ALL_APPS = ["tasks", "training", "products"];
  const gate = (patch: Partial<VirtualSourceGate> = {}): string[] =>
    visibleVirtualSources({ can: () => true, installed: ALL_APPS, appsReady: true, onStore: false, ...patch }).map((m) => m.id);
  const without = (...denied: Array<keyof Permissions>) => (section: keyof Permissions) => !denied.includes(section);

  test("everything shows with every permission and every app installed, in source order", () => {
    expect(gate()).toEqual(["chat", "tasks", "inventory", "training", "products", "bugs", "profile"]);
    expect(gate({ installed: new Set(ALL_APPS) })).toEqual(gate());
  });

  test("a source needs view on its app's section (chat: staffing), and chat is never on the store tablet", () => {
    expect(gate({ can: without("staffing") })).not.toContain("chat");
    expect(gate({ can: without("inventory") })).not.toContain("inventory");
    expect(gate({ can: without("products") })).not.toContain("products");
    expect(gate({ can: () => false })).toEqual(["tasks", "training", "bugs", "profile"]);
    // Chat never shows on the shared store tablet, whatever the PIN operator may do.
    expect(gate({ onStore: true })).toEqual(["tasks", "inventory", "training", "products", "bugs", "profile"]);
  });

  test("an app source needs its app installed, and hides until the install state has arrived", () => {
    expect(gate({ installed: [] })).toEqual(["chat", "inventory", "bugs", "profile"]);
    expect(gate({ installed: ["training"] })).toEqual(["chat", "inventory", "training", "bugs", "profile"]);
    expect(gate({ appsReady: false })).toEqual(["chat", "inventory", "bugs", "profile"]);
    // Products needs both its permission and its app.
    expect(gate({ installed: ["products"], can: without("products") })).not.toContain("products");
  });
});
