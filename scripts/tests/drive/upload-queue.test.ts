// lib/drive/upload-queue.ts over a fake transport whose PUTs the test holds
// open: concurrency (two at a time, a multipart file alone), throttled
// progress, cancel, retry (commit first; start over when the row is gone; begin
// again when the failure reserved nothing; no commit request while the store
// is not configured, through the real transport's commit), errors, late SDK
// progress, activeCount / localItemIds, the leave guard, and immutable snapshots.

import { describe, expect, test } from "bun:test";
import { registerDriveTokenGetter } from "@/lib/drive/api";
import { DriveClientError } from "@/lib/drive/errors";
import { DRIVE_MULTIPART_THRESHOLD_BYTES } from "@/lib/drive/rules";
import {
  __resetDriveStorageStatusForTests, createDriveUploadTransport, type DriveUploadTarget, type DriveUploadTransport,
} from "@/lib/drive/upload";
import {
  createDriveUploadQueue, DRIVE_UPLOAD_PROGRESS_INTERVAL_MS, guardDriveUploadsOnLeave, type DriveUploadEntry,
} from "@/lib/drive/upload-queue";

const ORG = "0b6a2c1e-7d4f-4a1b-9c2d-3e4f5a6b7c8d";
const TARGET: DriveUploadTarget = { organizationId: ORG, space: "my", parentId: "", actingMemberId: "" };

function file(name: string, size = 5): { file: Blob } {
  return { file: { size, name, type: "" } as unknown as Blob };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function abortPromise(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    const fail = () => reject(new DriveClientError("aborted"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}

/** PUTs of names in `held` wait until released; failures are queued per name. */
function fakeTransport() {
  const log: string[] = [];
  const names = new Map<string, string>();
  const held = new Map<string, ReturnType<typeof deferred>>();
  const beginFailures = new Map<string, Error[]>();
  const putFailures = new Map<string, Error[]>();
  const commitFailures = new Map<string, Error[]>();
  const transport: DriveUploadTransport = {
    thumbnail: async () => null,
    async begin(plan) {
      names.set(plan.itemId, plan.name);
      log.push(`begin:${plan.name}`);
      const failure = beginFailures.get(plan.name)?.shift();
      if (failure) throw failure;
    },
    async put(plan, which, body, _type, opts) {
      names.set(plan.itemId, plan.name);
      log.push(`put:${plan.name}`);
      const gate = held.get(plan.name);
      if (gate) await Promise.race([gate.promise, abortPromise(opts.signal)]);
      const failure = putFailures.get(plan.name)?.shift();
      if (failure) throw failure;
      opts.onProgress?.(body.size, body.size);
    },
    async commit(input) {
      const name = names.get(input.itemId) ?? input.itemId;
      log.push(`commit:${name}`);
      const failure = commitFailures.get(name)?.shift();
      if (failure) throw failure;
      return { outcome: "committed", sizeBytes: 5 };
    },
    async abort(itemId) {
      log.push(`abort:${names.get(itemId) ?? itemId}`);
    },
  };
  const hold = (name: string) => {
    const gate = deferred();
    held.set(name, gate);
    return () => {
      held.delete(name);
      gate.resolve();
    };
  };
  return { log, transport, hold, beginFailures, putFailures, commitFailures };
}

async function waitFor(check: () => boolean, ms = 1_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const stateOf = (entries: readonly DriveUploadEntry[], name: string) => entries.find((e) => e.name === name)?.state;
const states = (entries: readonly DriveUploadEntry[]) => Object.fromEntries(entries.map((e) => [e.name, e.state]));

describe("createDriveUploadQueue", () => {
  test("keys are the planned item ids; two files run at a time, the next starts when one finishes", async () => {
    const { transport, hold, log } = fakeTransport();
    const releaseA = hold("a.txt");
    const releaseB = hold("b.txt");
    const queue = createDriveUploadQueue({ transport, now: () => 7 });
    const keys = queue.enqueue([file("a.txt"), file("b.txt"), file("c.txt")], TARGET);
    const snap = queue.getSnapshot();
    expect(keys).toEqual(snap.map((e) => e.itemId));
    expect(snap.every((e) => e.createdAt === 7 && e.target.organizationId === ORG)).toBe(true);
    await waitFor(() => log.includes("put:b.txt"));
    expect(stateOf(queue.getSnapshot(), "c.txt")).toBe("queued");
    expect(log).not.toContain("begin:c.txt");
    releaseA();
    await waitFor(() => stateOf(queue.getSnapshot(), "c.txt") === "done");
    expect(stateOf(queue.getSnapshot(), "b.txt")).toBe("uploading");
    releaseB();
    await waitFor(() => queue.activeCount() === 0);
    expect(states(queue.getSnapshot())).toEqual({ "a.txt": "done", "b.txt": "done", "c.txt": "done" });
  });

  test("a multipart file runs alone, in order", async () => {
    const { transport, hold, log } = fakeTransport();
    const releaseSmall = hold("small.txt");
    const releaseBig = hold("big.mp4");
    const queue = createDriveUploadQueue({ transport });
    queue.enqueue([file("small.txt"), file("big.mp4", DRIVE_MULTIPART_THRESHOLD_BYTES), file("after.txt")], TARGET);
    await waitFor(() => log.includes("put:small.txt"));
    expect(states(queue.getSnapshot())).toEqual({ "small.txt": "uploading", "big.mp4": "queued", "after.txt": "queued" });
    releaseSmall();
    await waitFor(() => log.includes("put:big.mp4"));
    expect(stateOf(queue.getSnapshot(), "after.txt")).toBe("queued");
    releaseBig();
    await waitFor(() => queue.activeCount() === 0);
    expect(log.filter((l) => l.startsWith("begin:"))).toEqual(["begin:small.txt", "begin:big.mp4", "begin:after.txt"]);
  });

  test("progress reaches listeners at most every 100 ms; state changes at once", async () => {
    let emit: ((loaded: number) => void) | null = null;
    const gate = deferred();
    const transport: DriveUploadTransport = {
      thumbnail: async () => null,
      begin: async () => undefined,
      async put(_plan, _which, _body, _type, opts) {
        emit = (loaded) => opts.onProgress?.(loaded, 1000);
        await gate.promise;
      },
      commit: async () => ({ outcome: "committed", sizeBytes: 1000 }),
      abort: async () => undefined,
    };
    const queue = createDriveUploadQueue({ transport });
    let notified = 0;
    queue.subscribe(() => notified++);
    queue.enqueue([file("p.bin", 1000)], TARGET);
    await waitFor(() => emit !== null);
    await waitFor(() => stateOf(queue.getSnapshot(), "p.bin") === "uploading");
    const before = notified;
    for (let i = 1; i <= 50; i++) emit!(i * 20);
    expect(notified).toBe(before);
    expect(queue.getSnapshot()[0].loaded).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, DRIVE_UPLOAD_PROGRESS_INTERVAL_MS + 30));
    expect(notified).toBe(before + 1);
    expect(queue.getSnapshot()[0].loaded).toBe(1000);
    gate.resolve();
    await waitFor(() => stateOf(queue.getSnapshot(), "p.bin") === "done");
  });

  test("cancel: a queued file never begins; a running one aborts its pending row", async () => {
    const { transport, hold, log } = fakeTransport();
    hold("a.txt");
    hold("b.txt");
    const queue = createDriveUploadQueue({ transport, concurrency: 1 });
    const [a, b] = queue.enqueue([file("a.txt"), file("b.txt")], TARGET);
    queue.cancel(b);
    expect(stateOf(queue.getSnapshot(), "b.txt")).toBe("cancelled");
    await waitFor(() => log.includes("put:a.txt"));
    queue.cancel(a);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "cancelled");
    expect(log).toEqual(["begin:a.txt", "put:a.txt", "abort:a.txt"]);
    expect(queue.getSnapshot().every((e) => e.errorCode === null)).toBe(true);
    expect(queue.activeCount()).toBe(0);
  });

  test("a failure keeps the pending row; retry commits first and PUTs only when the bytes are missing", async () => {
    const { transport, log, putFailures, commitFailures } = fakeTransport();
    putFailures.set("a.txt", [new DriveClientError("network")]);
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("a.txt")], TARGET);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
    expect(queue.getSnapshot()[0].errorCode).toBe("network");
    expect(log).toEqual(["begin:a.txt", "put:a.txt"]);

    commitFailures.set("a.txt", [new DriveClientError("not_uploaded")]);
    const itemId = queue.getSnapshot()[0].itemId;
    queue.retry(key);
    expect(stateOf(queue.getSnapshot(), "a.txt")).not.toBe("failed");
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
    expect(log.slice(2)).toEqual(["commit:a.txt", "put:a.txt", "commit:a.txt"]);
    expect(queue.getSnapshot()[0].itemId).toBe(itemId);
  });

  test("retry starts over with new ids when the pending row is gone, releasing the old one", async () => {
    const { transport, log, putFailures, commitFailures } = fakeTransport();
    putFailures.set("a.txt", [new Error("[drive.expired] Upload expired")]);
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("a.txt")], TARGET);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
    expect(queue.getSnapshot()[0].errorCode).toBe("expired");
    const oldItemId = queue.getSnapshot()[0].itemId;
    commitFailures.set("a.txt", [new DriveClientError("not_found")]);
    queue.retry(key);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
    expect(log.slice(2)).toEqual(["commit:a.txt", "abort:a.txt", "begin:a.txt", "put:a.txt", "commit:a.txt"]);
    expect(queue.getSnapshot()[0].itemId).not.toBe(oldItemId);
    expect(queue.getSnapshot()[0].key).toBe(key);
  });

  test("storage off at begin reserves nothing: Retry begins again with the same plan and never commits", async () => {
    const { transport, log, beginFailures, putFailures, commitFailures } = fakeTransport();
    beginFailures.set("a.txt", [new DriveClientError("not_configured"), new DriveClientError("not_configured")]);
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("a.txt")], TARGET);
    const itemId = queue.getSnapshot()[0].itemId;
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
    expect(queue.getSnapshot()[0].errorCode).toBe("not_configured");
    queue.retry(key);
    await waitFor(() => log.length === 2 && stateOf(queue.getSnapshot(), "a.txt") === "failed");
    expect(log).toEqual(["begin:a.txt", "begin:a.txt"]);

    // The store is back but the PUT drops: now a row exists, so the next Retry commits it first.
    putFailures.set("a.txt", [new DriveClientError("network")]);
    queue.retry(key);
    await waitFor(() => queue.getSnapshot()[0].errorCode === "network");
    commitFailures.set("a.txt", [new DriveClientError("not_uploaded")]);
    queue.retry(key);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
    expect(log).toEqual(["begin:a.txt", "begin:a.txt", "begin:a.txt", "put:a.txt", "commit:a.txt", "put:a.txt", "commit:a.txt"]);
    expect(queue.getSnapshot()[0].itemId).toBe(itemId);
  });

  test("a begin that failed without a Drive code may have landed: Retry commits first", async () => {
    const { transport, log, beginFailures } = fakeTransport();
    beginFailures.set("a.txt", [new Error("WebSocket closed")]);
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("a.txt")], TARGET);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
    expect(queue.getSnapshot()[0].errorCode).toBe("generic");
    queue.retry(key);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
    expect(log).toEqual(["begin:a.txt", "commit:a.txt"]);
  });

  test("a resume the commit route answers not_configured keeps its row and commits first on the next Retry", async () => {
    const { transport, log, putFailures, commitFailures } = fakeTransport();
    putFailures.set("a.txt", [new DriveClientError("network")]);
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("a.txt")], TARGET);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
    // The route checks storage before it reads the row, so the answer says nothing about the row begin reserved.
    commitFailures.set("a.txt", [new DriveClientError("not_configured")]);
    queue.retry(key);
    await waitFor(() => queue.getSnapshot()[0].errorCode === "not_configured");
    queue.retry(key);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
    expect(log).toEqual(["begin:a.txt", "put:a.txt", "commit:a.txt", "commit:a.txt"]);
  });

  test("with the real commit, Retry of a reserved upload sends no commit while the store is not configured", async () => {
    // The reported loop: begin went through (the status was unreadable then), the PUT found the store gone, and every
    // Retry POSTed a commit the route had to refuse with 503 not_configured.
    const realFetch = globalThis.fetch;
    const unregister = registerDriveTokenGetter(async () => "tok");
    __resetDriveStorageStatusForTests();
    let configured = false;
    const hits: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/drive/status")) {
        hits.push("status");
        return Response.json({ configured, paused: false, maxFileBytes: 1, multipartThresholdBytes: 1, thumbMaxBytes: 1 });
      }
      hits.push(url.endsWith("/api/drive/commit") ? "commit" : url);
      return configured
        ? Response.json({ outcome: "committed", sizeBytes: 5 })
        : Response.json({ error: "File storage is not configured", code: "not_configured" }, { status: 503 });
    }) as unknown as typeof fetch;
    try {
      const fake = fakeTransport();
      fake.putFailures.set("a.txt", [new DriveClientError("not_configured")]);
      const transport: DriveUploadTransport = { ...fake.transport, commit: createDriveUploadTransport().commit };
      const queue = createDriveUploadQueue({ transport });
      const [key] = queue.enqueue([file("a.txt")], TARGET);
      await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
      for (let i = 0; i < 3; i++) {
        queue.retry(key);
        await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "failed");
        expect(queue.getSnapshot()[0].errorCode).toBe("not_configured");
      }
      expect(hits).toEqual(["status"]);

      // The store is back and the cached answer ran out: the next Retry commits the row begin reserved.
      configured = true;
      __resetDriveStorageStatusForTests();
      queue.retry(key);
      await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
      expect(hits).toEqual(["status", "status", "commit"]);
      expect(fake.log).toEqual(["begin:a.txt", "put:a.txt"]);
    } finally {
      globalThis.fetch = realFetch;
      unregister();
      __resetDriveStorageStatusForTests();
    }
  });

  test("cancelling or clearing a failure releases a row only when one may exist", async () => {
    const { transport, log, beginFailures } = fakeTransport();
    beginFailures.set("off.txt", [new DriveClientError("not_configured")]);
    beginFailures.set("full.txt", [new Error("[drive.quota_exceeded] Storage is full")]);
    beginFailures.set("lost.txt", [new Error("WebSocket closed")]);
    const queue = createDriveUploadQueue({ transport, concurrency: 3 });
    const [off] = queue.enqueue([file("off.txt"), file("full.txt"), file("lost.txt")], TARGET);
    await waitFor(() => queue.activeCount() === 0);
    expect(queue.getSnapshot().map((e) => [e.name, e.state, e.errorCode])).toEqual([
      ["off.txt", "failed", "not_configured"],
      ["full.txt", "failed", "quota_exceeded"],
      ["lost.txt", "failed", "generic"],
    ]);
    queue.cancel(off);
    expect(stateOf(queue.getSnapshot(), "off.txt")).toBe("cancelled");
    queue.clearFinished();
    expect(queue.getSnapshot()).toEqual([]);
    expect(log.filter((l) => l.startsWith("abort:"))).toEqual(["abort:lost.txt"]);
  });

  test("a cancelled file retries with new ids from the start", async () => {
    const { transport, hold, log } = fakeTransport();
    hold("a.txt");
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("a.txt")], TARGET);
    const firstId = queue.getSnapshot()[0].itemId;
    await waitFor(() => log.includes("put:a.txt"));
    queue.cancel(key);
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "cancelled");
    log.length = 0;
    queue.retry(key);
    await waitFor(() => log.includes("put:a.txt"));
    expect(log).toEqual(["begin:a.txt", "put:a.txt"]);
    expect(queue.getSnapshot()[0].itemId).not.toBe(firstId);
    queue.cancel(key);
  });

  test("a file that cannot be uploaded enters as failed with its code and never reaches the transport", () => {
    const { transport, log } = fakeTransport();
    const queue = createDriveUploadQueue({ transport });
    const [key] = queue.enqueue([file("setup.exe"), file("", 3)], TARGET);
    const [blocked, unnamed] = queue.getSnapshot();
    expect(blocked).toMatchObject({ key, itemId: "", name: "setup.exe", sizeBytes: 5, state: "failed", errorCode: "blocked_type" });
    expect(unnamed).toMatchObject({ state: "failed", errorCode: "invalid_name" });
    queue.retry(key);
    expect(queue.getSnapshot()[0]).toMatchObject({ state: "failed", errorCode: "blocked_type" });
    expect(log).toEqual([]);
    expect(queue.activeCount()).toBe(0);
  });

  test("activeCount and localItemIds follow the active entries; localItemIds keeps its identity between changes", async () => {
    const { transport, hold } = fakeTransport();
    const release = hold("a.txt");
    const queue = createDriveUploadQueue({ transport, concurrency: 1 });
    const keys = queue.enqueue([file("a.txt"), file("b.txt"), file("bad.apk")], TARGET);
    expect(queue.activeCount()).toBe(2);
    const ids = queue.localItemIds();
    expect([...ids].sort()).toEqual([keys[0], keys[1]].sort());
    expect(queue.localItemIds()).toBe(ids);
    release();
    await waitFor(() => queue.activeCount() === 0);
    expect(queue.localItemIds().size).toBe(0);
  });

  test("snapshots are frozen and never change after the fact", async () => {
    const { transport, hold } = fakeTransport();
    const release = hold("a.txt");
    const queue = createDriveUploadQueue({ transport });
    queue.enqueue([file("a.txt")], TARGET);
    const early = queue.getSnapshot();
    const earlyEntry = early[0];
    const earlyState = earlyEntry.state;
    expect(Object.isFrozen(early)).toBe(true);
    expect(Object.isFrozen(earlyEntry)).toBe(true);
    expect(queue.getSnapshot()).toBe(early);
    release();
    await waitFor(() => stateOf(queue.getSnapshot(), "a.txt") === "done");
    expect(queue.getSnapshot()).not.toBe(early);
    expect(early[0]).toBe(earlyEntry);
    expect(earlyEntry.state).toBe(earlyState);
  });

  test("progress the SDK delivers after the PUT settled (its throttle timer) never revives a done or failed entry", async () => {
    const late: string[] = [];
    const transport: DriveUploadTransport = {
      thumbnail: async () => null,
      begin: async () => undefined,
      async put(plan, _which, body, _type, opts) {
        opts.onProgress?.(0, body.size);
        // @vercel/blob routes progress through throttleit, whose trailing timer is never cleared.
        setTimeout(() => {
          late.push(plan.name);
          opts.onProgress?.(body.size, body.size);
        }, 20);
        if (plan.name === "bad.txt") throw new DriveClientError("network");
      },
      commit: async () => ({ outcome: "committed", sizeBytes: 5 }),
      abort: async () => undefined,
    };
    const queue = createDriveUploadQueue({ transport });
    const [, bad] = queue.enqueue([file("good.txt"), file("bad.txt")], TARGET);
    await waitFor(() => queue.activeCount() === 0);
    await waitFor(() => late.length === 2);
    await new Promise((resolve) => setTimeout(resolve, DRIVE_UPLOAD_PROGRESS_INTERVAL_MS + 30));
    expect(states(queue.getSnapshot())).toEqual({ "good.txt": "done", "bad.txt": "failed" });
    expect(queue.activeCount()).toBe(0);
    expect(queue.localItemIds().size).toBe(0);
    queue.retry(bad);
    expect(stateOf(queue.getSnapshot(), "bad.txt")).not.toBe("failed");
  });

  test("the leave guard is armed exactly while something is queued or running", async () => {
    const { transport, hold } = fakeTransport();
    const release = hold("a.txt");
    const queue = createDriveUploadQueue({ transport });
    const calls: string[] = [];
    let listener: ((event: BeforeUnloadEvent) => void) | null = null;
    const uninstall = guardDriveUploadsOnLeave(queue, {
      addEventListener: (_type, fn) => {
        calls.push("add");
        listener = fn;
      },
      removeEventListener: (_type, fn) => {
        calls.push(fn === listener ? "remove" : "remove-other");
      },
    });
    expect(calls).toEqual([]);
    queue.enqueue([file("a.txt")], TARGET);
    expect(calls).toEqual(["add"]);
    let prevented = false;
    const event = { preventDefault: () => void (prevented = true), returnValue: undefined as unknown };
    listener!(event as unknown as BeforeUnloadEvent);
    expect(prevented).toBe(true);
    expect(event.returnValue).toBe(true);
    release();
    await waitFor(() => queue.activeCount() === 0);
    expect(calls).toEqual(["add", "remove"]);
    queue.enqueue([file("b.txt")], TARGET);
    await waitFor(() => queue.activeCount() === 0);
    uninstall();
    expect(calls).toEqual(["add", "remove", "add", "remove"]);
  });

  test("clearFinished drops finished entries and releases the pending rows of failed ones", async () => {
    const { transport, log, putFailures } = fakeTransport();
    putFailures.set("b.txt", [new Error("Vercel Blob: The blob service is currently not available. Please try again.")]);
    const queue = createDriveUploadQueue({ transport });
    queue.enqueue([file("a.txt"), file("b.txt")], TARGET);
    await waitFor(() => queue.activeCount() === 0);
    expect(queue.getSnapshot().find((e) => e.name === "b.txt")?.errorCode).toBe("generic");
    let notified = 0;
    queue.subscribe(() => notified++);
    queue.clearFinished();
    expect(queue.getSnapshot()).toEqual([]);
    expect(notified).toBe(1);
    expect(log.at(-1)).toBe("abort:b.txt");
  });
});
