// lib/drive/download.ts: the strategy threshold, download names, the direct
// web path (window opened synchronously inside the gesture, opener cut,
// location replaced; blocked popups; signing failures close the window),
// byte limits, the buffered save (a stale URL is signed again once; only a
// refused fetch sends the tab direct), the external-file fallback (a file past
// the byte cap or the time limit opens outside the app; a blocked window says
// so, and its retry opens at once; only a fetch refused while online keeps
// skipping the fetch after that). fetchLimited is in
// fetch-limited.test.ts. The DOM is a small fake installed per test.

import { afterEach, describe, expect, test } from "bun:test";
import { newDocumentId } from "@/lib/docs/ids";
import type { DriveSignedUrl, DriveUrlRequest } from "@/lib/drive/api";
import { DriveClientError } from "@/lib/drive/errors";
import {
  chooseDownloadStrategy, downloadDriveItem, downloadExternalFile, DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES, driveDownloadName,
  fetchDriveItemBytes, openDriveItem, type DriveDownloadTarget,
} from "@/lib/drive/download";
import type { DriveUrlLoader } from "@/lib/drive/url-loader";

const RLO = String.fromCharCode(0x202e);
const LRM = String.fromCharCode(0x200e);

interface FakeOpened { opener: unknown; replaced: string[]; closed: boolean; location: { replace(url: string): void }; close(): void }
interface FakeAnchor { href: string; download: string; rel: string; style: Record<string, string>; clicked: boolean; click(): void; remove(): void }

const g = globalThis as { window?: unknown; document?: unknown };
const realFetch = globalThis.fetch;

function installDom(opts: { popupBlocked?: boolean } = {}) {
  const openCalls: unknown[][] = [];
  const opened: FakeOpened[] = [];
  const anchors: FakeAnchor[] = [];
  g.window = {
    location: { protocol: "https:", href: "https://app.test/manager/drive" },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    open: (...args: unknown[]) => {
      openCalls.push(args);
      if (opts.popupBlocked) return null;
      const win: FakeOpened = {
        opener: "the app",
        replaced: [],
        closed: false,
        location: { replace: (url: string) => void win.replaced.push(url) },
        close: () => {
          win.closed = true;
        },
      };
      opened.push(win);
      return win;
    },
  };
  g.document = {
    createElement: () => {
      const anchor: FakeAnchor = {
        href: "", download: "", rel: "", style: {}, clicked: false,
        click() {
          anchor.clicked = true;
        },
        remove() {},
      };
      anchors.push(anchor);
      return anchor;
    },
    body: { appendChild() {} },
  };
  return { openCalls, opened, anchors };
}

function setOnline(value: boolean): void {
  Object.defineProperty(globalThis.navigator, "onLine", { value, configurable: true });
}

/** Replaces fetch with one that counts its calls and answers through `respond`, which a test may swap. */
function fakeFetch(respond: () => Response) {
  const net = { calls: 0, respond };
  globalThis.fetch = (async () => {
    net.calls++;
    return net.respond();
  }) as unknown as typeof fetch;
  return net;
}

/** How fetch() rejects when the browser refuses it (no CORS headers) or has no network. */
function refuse(): Response {
  throw new TypeError("Failed to fetch");
}

const MIB = 1024 * 1024;

/** A response body that never ends: 1 MiB per pull, nothing read ahead; `pulls()` counts what was read. */
function endlessBody(): { body: ReadableStream<Uint8Array>; pulls(): number } {
  let pulled = 0;
  const chunk = new Uint8Array(MIB);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(chunk);
    },
  }, { highWaterMark: 0 });
  return { body, pulls: () => pulled };
}

/** How a real fetch fails once its signal aborts, both before the response and while the body is arriving. */
function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

afterEach(() => {
  delete g.window;
  delete g.document;
  delete (globalThis.navigator as { onLine?: boolean }).onLine;
  globalThis.fetch = realFetch;
});

/** A loader that signs every request, or answers with `result` / fails with `error`. */
function fakeLoader(opts: { result?: DriveSignedUrl | null; error?: Error } = {}) {
  const asked: DriveUrlRequest[] = [];
  const invalidated: string[] = [];
  const loader: DriveUrlLoader = {
    async get(req) {
      asked.push(req);
      if (opts.error) throw opts.error;
      if (opts.result !== undefined) return opts.result;
      return { url: `https://blob.test/${req.id}?purpose=${req.purpose}`, expiresAt: Date.now() + 600_000 };
    },
    getMany: (reqs) => Promise.all(reqs.map((req) => loader.get(req))),
    peek: () => null,
    invalidate: (id) => void invalidated.push(id),
  };
  return { loader, asked, invalidated };
}

function item(sizeBytes: number, name = "Q3 report.pdf", mimeType = "application/pdf"): DriveDownloadTarget {
  return { id: newDocumentId(), name, sizeBytes, mimeType };
}

describe("chooseDownloadStrategy", () => {
  test("buffered up to 100 MiB, direct above it (and for nonsense sizes)", () => {
    expect(chooseDownloadStrategy(0)).toBe("buffered");
    expect(chooseDownloadStrategy(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES)).toBe("buffered");
    expect(chooseDownloadStrategy(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES + 1)).toBe("direct");
    expect(chooseDownloadStrategy(Number.NaN)).toBe("direct");
  });
});

describe("driveDownloadName", () => {
  test("keeps Unicode and strips characters file systems refuse", () => {
    expect(driveDownloadName("报告.pdf")).toBe("报告.pdf");
    expect(driveDownloadName("a/b:c.txt")).toBe("abc.txt");
    expect(driveDownloadName('q?"<>|*.csv')).toBe("q.csv");
    expect(driveDownloadName("  Café   menu .JPG")).toBe("Café menu.JPG");
  });

  test("strips bidi controls, so a name cannot pose as another extension", () => {
    expect(driveDownloadName(`invoice${RLO}fdp.exe`)).toBe("invoicefdp.exe");
    expect(driveDownloadName(`photo${LRM}.png`)).toBe("photo.png");
  });

  test("an odd extension stays part of the stem; nothing left → file", () => {
    expect(driveDownloadName("x.t/xt")).toBe("x.txt");
    expect(driveDownloadName("notes.with space")).toBe("notes.with space");
    expect(driveDownloadName("")).toBe("file");
    expect(driveDownloadName("///")).toBe("file");
    expect(driveDownloadName(".env")).toBe(".env");
  });
});

describe("direct downloads on the web", () => {
  test("the window opens synchronously, before the first await; its opener is cut and it goes to a download URL", async () => {
    const dom = installDom();
    const { loader, asked } = fakeLoader();
    const big = item(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES + 1);
    const pending = downloadDriveItem(big, loader);
    expect(dom.openCalls).toEqual([["", "_blank"]]);
    expect(dom.opened[0].opener).toBeNull();
    expect(await pending).toBe("opened");
    expect(asked).toEqual([{ id: big.id, variant: "original", purpose: "download" }]);
    expect(dom.opened[0].replaced).toEqual([`https://blob.test/${big.id}?purpose=download`]);
  });

  test("a blocked popup resolves `blocked` without signing anything", async () => {
    installDom({ popupBlocked: true });
    const { loader, asked } = fakeLoader();
    expect(await downloadDriveItem(item(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES + 1), loader)).toBe("blocked");
    expect(asked).toEqual([]);
  });

  test("when no URL can be signed the window closes again and the call rejects", async () => {
    const dom = installDom();
    const noUrl = await downloadDriveItem(item(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES + 1), fakeLoader({ result: null }).loader).catch((e: unknown) => e);
    expect((noUrl as DriveClientError).code).toBe("not_found");
    expect(dom.opened[0].closed).toBe(true);
    expect(dom.opened[0].replaced).toEqual([]);

    const forbidden = new DriveClientError("forbidden");
    const err = await openDriveItem(item(10), fakeLoader({ error: forbidden }).loader).catch((e: unknown) => e);
    expect(err).toBe(forbidden);
    expect(dom.opened[1].closed).toBe(true);
  });

  test("openDriveItem signs a view URL, and a stream URL for media", async () => {
    const dom = installDom();
    const { loader, asked } = fakeLoader();
    expect(await openDriveItem(item(10), loader)).toBe("opened");
    expect(await openDriveItem(item(10, "clip.mp4", "video/mp4"), loader)).toBe("opened");
    expect(asked.map((r) => r.purpose)).toEqual(["view", "stream"]);
    expect(dom.openCalls).toHaveLength(2);
  });
});

describe("fetchDriveItemBytes", () => {
  test("refuses a file known to be too large without asking for a URL", async () => {
    const { loader, asked } = fakeLoader();
    const err = await fetchDriveItemBytes(item(2_000), loader, { maxBytes: 1_000 }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("too_large");
    expect(asked).toEqual([]);
  });

  test("stops reading once the body passes maxBytes", async () => {
    let pulled = 0;
    globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(400));
        if (pulled > 50) controller.close();
      },
    }))) as unknown as typeof fetch;
    const err = await fetchDriveItemBytes(item(10), fakeLoader().loader, { maxBytes: 1_000 }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("too_large");
    expect(pulled).toBeLessThan(10);
  });

  test("returns the bytes; an HTTP error is download_failed", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response(new Uint8Array([37, 80, 68, 70, 45]));
    }) as typeof fetch;
    const target = item(5);
    const bytes = await fetchDriveItemBytes(target, fakeLoader().loader);
    expect([...new Uint8Array(bytes)]).toEqual([37, 80, 68, 70, 45]);
    expect(seen).toEqual([`https://blob.test/${target.id}?purpose=view`]);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("no", { status: 403 });
    }) as unknown as typeof fetch;
    const refused = item(5);
    const { loader, asked, invalidated } = fakeLoader();
    const err = await fetchDriveItemBytes(refused, loader).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("download_failed");
    // A 403 may be a stale signature: signed again once, then given up.
    expect(invalidated).toEqual([refused.id]);
    expect(asked.map((r) => r.purpose)).toEqual(["view", "view"]);
    expect(calls).toBe(2);
  });
});

describe("downloadExternalFile", () => {
  test("only http(s) addresses", async () => {
    const err = await downloadExternalFile("javascript:alert(1)", "x.png").catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("invalid");
  });

  test("saves the fetched bytes under the cleaned name", async () => {
    const dom = installDom();
    globalThis.fetch = (async () => new Response("png-bytes", { headers: { "Content-Type": "image/png" } })) as unknown as typeof fetch;
    expect(await downloadExternalFile("https://files.test/a.png", "Shelf/1.png")).toBe("downloaded");
    expect(dom.anchors[0]).toMatchObject({ download: "Shelf1.png", clicked: true });
  });

  test("a failed fetch (no CORS) opens the address in a new window instead, its opener cut", async () => {
    const dom = installDom();
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await downloadExternalFile("https://files.test/a.png", "a.png")).toBe("opened");
    expect(dom.openCalls).toEqual([["", "_blank"]]);
    expect(dom.opened[0].opener).toBeNull();
    expect(dom.opened[0].replaced).toEqual(["https://files.test/a.png"]);
  });

  test("an HTTP error opens the address too", async () => {
    const dom = installDom();
    globalThis.fetch = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    expect(await downloadExternalFile("https://files.test/gone.png", "gone.png")).toBe("opened");
    expect(dom.opened[0].replaced).toEqual(["https://files.test/gone.png"]);
    expect(dom.anchors).toEqual([]);
  });

  test("keeps the type the host declares; fetched without credentials, and a finished read is never aborted", async () => {
    installDom();
    const inits: (RequestInit | undefined)[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      inits.push(init);
      return new Response("png-bytes", { headers: { "Content-Type": "image/png" } });
    }) as typeof fetch;
    const blobs: Blob[] = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      blobs.push(obj as Blob);
      return "blob:https://app.test/1";
    };
    try {
      expect(await downloadExternalFile("https://files.test/a.png", "a.png", { timeoutMs: 10 })).toBe("downloaded");
    } finally {
      URL.createObjectURL = realCreate;
    }
    expect(blobs[0].type).toBe("image/png");
    expect(await blobs[0].text()).toBe("png-bytes");
    expect(inits[0]).toMatchObject({ credentials: "omit" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(inits[0]?.signal?.aborted).toBe(false);
  });

  test("a body that never ends is read only up to the buffered cap; the address then opens outside the app", async () => {
    const dom = installDom();
    const endless = endlessBody();
    globalThis.fetch = (async () => new Response(endless.body)) as unknown as typeof fetch;
    const url = "https://files.test/endless.mp4";
    expect(await downloadExternalFile(url, "endless.mp4")).toBe("opened");
    expect(endless.pulls()).toBeGreaterThan(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES / MIB);
    expect(endless.pulls()).toBeLessThanOrEqual(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES / MIB + 2);
    expect(dom.opened[0].replaced).toEqual([url]);
    expect(dom.anchors).toEqual([]);
  });

  test("a declared length over the buffered cap opens the address without reading the body", async () => {
    const dom = installDom();
    const endless = endlessBody();
    globalThis.fetch = (async () => new Response(endless.body, {
      headers: { "content-length": String(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES + 1) },
    })) as unknown as typeof fetch;
    const url = "https://files.test/declared.mp4";
    expect(await downloadExternalFile(url, "declared.mp4")).toBe("opened");
    expect(endless.pulls()).toBeLessThanOrEqual(1);
    expect(dom.opened[0].replaced).toEqual([url]);
    expect(dom.anchors).toEqual([]);
  });

  test("a host slower than the time limit is aborted, before or during the body; the address then opens outside the app", async () => {
    const dom = installDom();
    const signals: AbortSignal[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal) signals.push(signal);
      if (String(input).includes("stalled")) {
        return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(abortError())));
      }
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          signal?.addEventListener("abort", () => controller.error(abortError()));
        },
      })));
    }) as typeof fetch;
    expect(await downloadExternalFile("https://files.test/stalled.png", "a.png", { timeoutMs: 20 })).toBe("opened");
    expect(await downloadExternalFile("https://files.test/trickle.png", "b.png", { timeoutMs: 20 })).toBe("opened");
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
    expect(dom.opened.map((win) => win.replaced)).toEqual([["https://files.test/stalled.png"], ["https://files.test/trickle.png"]]);
    expect(dom.anchors).toEqual([]);
  });

  test("a blocked window resolves `blocked`; the retry opens the window at once, without fetching again", async () => {
    installDom({ popupBlocked: true });
    const net = fakeFetch(refuse);
    const url = "https://files.test/blocked.png";
    expect(await downloadExternalFile(url, "blocked.png")).toBe("blocked");
    // A retry that is blocked again still says so.
    expect(await downloadExternalFile(url, "blocked.png")).toBe("blocked");
    expect(net.calls).toBe(1);

    const dom = installDom();
    const retry = downloadExternalFile(url, "blocked.png");
    // Opened synchronously, inside the new click's activation.
    expect(dom.openCalls).toEqual([["", "_blank"]]);
    expect(dom.opened[0].opener).toBeNull();
    expect(dom.opened[0].replaced).toEqual([url]);
    expect(await retry).toBe("opened");
    expect(net.calls).toBe(1);

    // Only that address: another one still tries to save its bytes first.
    net.respond = () => new Response("png-bytes");
    expect(await downloadExternalFile("https://files.test/other.png", "other.png")).toBe("downloaded");
    expect(dom.openCalls).toHaveLength(1);

    // A fetch refused while online will be refused again: later calls for the address keep opening at once.
    const later = downloadExternalFile(url, "blocked.png");
    expect(dom.openCalls).toHaveLength(2);
    expect(await later).toBe("opened");
    expect(net.calls).toBe(2);
  });

  for (const [cause, slug, offline, fail] of [
    ["an HTTP error", "busy", false, () => new Response("unavailable", { status: 503 })],
    ["offline", "offline", true, refuse],
    ["a file over the byte cap", "huge", false, () => new Response(endlessBody().body, { headers: { "content-length": String(DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES + 1) } })],
  ] as const) {
    test(`${cause}: a blocked window is remembered for its retry only; later calls fetch again`, async () => {
      if (offline) setOnline(false);
      installDom({ popupBlocked: true });
      const net = fakeFetch(fail);
      const url = `https://files.test/${slug}.png`;
      expect(await downloadExternalFile(url, "x.png")).toBe("blocked");
      // A retry blocked again keeps the entry, so the next one still opens at once.
      expect(await downloadExternalFile(url, "x.png")).toBe("blocked");

      setOnline(true);
      const dom = installDom();
      const retry = downloadExternalFile(url, "x.png");
      expect(dom.opened[0]?.replaced).toEqual([url]);
      expect(await retry).toBe("opened");
      expect(net.calls).toBe(1);

      // Recovered: the file is saved under its display name again, with no window.
      net.respond = () => new Response("png-bytes");
      expect(await downloadExternalFile(url, "Shelf/1.png")).toBe("downloaded");
      expect(net.calls).toBe(2);
      expect(dom.openCalls).toHaveLength(1);
      expect(dom.anchors[0]).toMatchObject({ download: "Shelf1.png", clicked: true });
    });
  }
});

// Keep last: a buffered fetch the browser refuses (CORS) makes later downloads in this module go direct.
describe("buffered downloads", () => {
  test("small files are fetched through a view URL and saved under the display name", async () => {
    const dom = installDom();
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response("%PDF-1.7");
    }) as typeof fetch;
    const target = item(8, "报告/Q3.pdf");
    expect(await downloadDriveItem(target, fakeLoader().loader)).toBe("downloaded");
    expect(seen).toEqual([`https://blob.test/${target.id}?purpose=view`]);
    expect(dom.openCalls).toEqual([]);
    expect(dom.anchors[0]).toMatchObject({ download: "报告Q3.pdf", clicked: true });
  });

  test("a stale signed URL (403) is signed again once and the file is still saved under its display name", async () => {
    const dom = installDom();
    const statuses = [403, 200];
    globalThis.fetch = (async () => {
      const status = statuses.shift() ?? 200;
      return status === 200 ? new Response("%PDF-1.7") : new Response("expired", { status });
    }) as unknown as typeof fetch;
    const { loader, asked, invalidated } = fakeLoader();
    const target = item(8, "报告.pdf");
    expect(await downloadDriveItem(target, loader)).toBe("downloaded");
    expect(invalidated).toEqual([target.id]);
    expect(asked.map((r) => r.purpose)).toEqual(["view", "view"]);
    expect(dom.openCalls).toEqual([]);
    expect(dom.anchors[0]).toMatchObject({ download: "报告.pdf", clicked: true });
  });

  test("an HTTP error falls back to a download URL for that file only; later downloads stay buffered", async () => {
    const dom = installDom();
    globalThis.fetch = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const { loader, asked, invalidated } = fakeLoader();
    const missing = item(8);
    expect(await downloadDriveItem(missing, loader)).toBe("opened");
    expect(asked.map((r) => r.purpose)).toEqual(["view", "download"]);
    expect(invalidated).toEqual([]);
    expect(dom.openCalls).toHaveLength(1);

    globalThis.fetch = (async () => new Response("%PDF-1.7")) as unknown as typeof fetch;
    const next = downloadDriveItem(item(8, "报告.pdf"), loader);
    expect(dom.openCalls).toHaveLength(1);
    expect(await next).toBe("downloaded");
    expect(dom.anchors[0]).toMatchObject({ download: "报告.pdf", clicked: true });
  });

  test("when the blob host refuses the fetch, the file opens through a download URL instead", async () => {
    const dom = installDom();
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const { loader, asked } = fakeLoader();
    const target = item(8);
    expect(await downloadDriveItem(target, loader)).toBe("opened");
    expect(asked.map((r) => r.purpose)).toEqual(["view", "download"]);
    expect(dom.opened[0].replaced).toEqual([`https://blob.test/${target.id}?purpose=download`]);

    // The next download goes direct at once, inside the gesture.
    const next = downloadDriveItem(item(8), loader);
    expect(dom.openCalls).toHaveLength(2);
    expect(await next).toBe("opened");
  });
});
