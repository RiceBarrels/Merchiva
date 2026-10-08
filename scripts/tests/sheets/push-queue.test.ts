// lib/sheets/sync/push-queue.ts (sheets.md §4.4): debounce and max wait, the 1 MiB split, immutable batches and the
// seq stream, commit-then-disconnect-then-retry, offline backoff, and the failures the queue hands to its host.

import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decodeSheetOps } from "@/lib/sheets/codec";
import { SheetOfflineError } from "@/lib/sheets/errors";
import {
  SheetPushQueue, sheetBackoffMs, type SheetPushFailure, type SheetPushHost, type SheetWrite, type SheetWriteContext,
} from "@/lib/sheets/sync/push-queue";
import type { SheetOp } from "@/lib/sheets/types";
import { ManualClock, setCellOp } from "./helpers/fake-model-adapter";

const op = (n: number): SheetOp => setCellOp(n, 0, `v${n}`);
/** ~`bytes` of incompressible text: gzip cannot shrink it, so sizes are predictable. */
const bulky = (n: number, bytes: number): SheetOp => setCellOp(n, 0, randomBytes(Math.ceil(bytes * 0.75)).toString("base64"));

interface Sent { write: SheetWrite; context: SheetWriteContext; at: number }

interface HarnessOptions {
  tuning?: Record<string, number>;
  context?: SheetWriteContext | null;
  /** Called from inside the host callbacks, as the session does (it may enqueue a reset right there). */
  onOversize?: (queue: SheetPushQueue) => void;
  onFailed?: (failure: SheetPushFailure, queue: SheetPushQueue) => void;
}

function harness(o: HarnessOptions = {}) {
  const clock = new ManualClock(1_000_000);
  const sent: Sent[] = [];
  const failures: SheetPushFailure[] = [];
  let oversize = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let context: SheetWriteContext | null = o.context === undefined ? { leaseEpoch: 7n, baseUpdateId: 40n } : o.context;
  /** Each send takes the next reply: undefined = commit, an Error = reject. */
  const replies: Array<Error | undefined> = [];
  const host: SheetPushHost = {
    writeContext: () => context,
    send: async (write, ctx) => {
      sent.push({ write, context: ctx, at: clock.nowMs });
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      const reply = replies.shift();
      await Promise.resolve();
      inFlight--;
      if (reply) throw reply;
    },
    oversize: () => {
      oversize++;
      o.onOversize?.(queue);
    },
    failed: (failure) => {
      failures.push(failure);
      o.onFailed?.(failure, queue);
    },
    changed: () => {},
  };
  const queue: SheetPushQueue = new SheetPushQueue({ host, tuning: o.tuning, now: clock.now, timers: clock.timers, random: () => 0.5 });
  queue.grant(7n, 0n);
  return {
    clock, queue, sent, failures, replies,
    get oversize() { return oversize; },
    get maxInFlight() { return maxInFlight; },
    setContext: (next: SheetWriteContext | null) => { context = next; },
    opsOf: (s: Sent) => (s.write.kind === "ops" ? decodeSheetOps(s.write.payload).ops : []),
  };
}

describe("SheetPushQueue", () => {
  test("a batch is cut 150 ms after the last op, and at most 1 s after the first one waiting", async () => {
    const h = harness();
    h.queue.add(op(1));
    await h.clock.advance(149);
    expect(h.sent.length).toBe(0);
    await h.clock.advance(1);
    expect(h.sent.map((s) => [s.write.seq, h.opsOf(s).length, s.context.baseUpdateId])).toEqual([[1n, 1, 40n]]);
    // A steady stream: every op restarts the debounce, but the max wait cuts at 1 s.
    const start = h.clock.nowMs;
    for (let i = 0; i < 12; i++) {
      h.queue.add(op(10 + i));
      await h.clock.advance(100);
    }
    expect(h.sent[1].at - start).toBe(1000);
    expect(h.opsOf(h.sent[1]).length).toBe(10);
    await h.clock.advance(1000);
    expect(h.sent.map((s) => s.write.seq)).toEqual([1n, 2n, 3n]);
    expect(h.queue.idle).toBe(true);
    expect(h.queue.lastCommittedSeq).toBe(3n);
  });

  test("the longest prefix under updateMaxBytes goes first; the ops arrive whole and in order", async () => {
    const h = harness({ tuning: { updateMaxBytes: 4000 } });
    for (let i = 0; i < 9; i++) h.queue.add(bulky(i, 1200));
    expect(await h.queue.flush()).toBe(true);
    expect(h.sent.length).toBeGreaterThan(2);
    for (const s of h.sent) expect(s.write.kind === "ops" && s.write.payload.byteLength <= 4000).toBe(true);
    expect(h.sent.flatMap((s) => h.opsOf(s).map((o) => Object.keys((o.params.cellValue as object))[0]))).toEqual(
      ["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(h.sent.map((s) => s.write.seq)).toEqual(h.sent.map((_, i) => BigInt(i + 1)));
  });

  test("a batch is immutable: a retry resends the same seq and bytes; later ops take the next seq", async () => {
    const h = harness();
    h.replies.push(new SheetOfflineError());
    h.queue.add(op(1));
    await h.clock.advance(150);
    expect(h.queue.isOffline).toBe(true);
    h.queue.add(op(2));
    await h.clock.advance(1000); // backoff 1 s (random 0.5 → no jitter)
    expect(h.sent.map((s) => s.write.seq)).toEqual([1n, 1n, 2n]);
    expect(h.sent[1].write).toBe(h.sent[0].write);
    expect(h.opsOf(h.sent[2])).toEqual([op(2)]);
    expect(h.queue.isOffline).toBe(false);
  });

  test("commit, then the socket closes before the reply: after the rebind the lease row's lastSeq drops it", async () => {
    const h = harness();
    h.replies.push(new SheetOfflineError("[sheet.offline] The connection closed before the server answered"));
    h.queue.add(op(1));
    await h.clock.advance(150);
    h.setContext(null); // detached: nothing can go
    h.queue.add(op(2));
    await h.clock.advance(5_000);
    expect(h.sent.length).toBe(1);
    expect(await h.queue.flush()).toBe(false);
    // Re-bound on a new connection: the lease row says seq 1 landed.
    h.setContext({ leaseEpoch: 7n, baseUpdateId: 41n });
    h.queue.grant(7n, 1n);
    expect(await h.queue.flush()).toBe(true);
    expect(h.sent.map((s) => [s.write.seq, h.opsOf(s)])).toEqual([[1n, [op(1)]], [2n, [op(2)]]]);
    expect(h.sent[1].context.baseUpdateId).toBe(41n);
  });

  test("offline: jittered backoff from 1 s to 30 s, nothing dropped", async () => {
    expect([0, 1, 4, 5, 30].map((n) => sheetBackoffMs({ retryBaseMs: 1000, retryMaxMs: 30_000 }, n, () => 0.5)))
      .toEqual([1000, 2000, 16_000, 30_000, 30_000]);
    expect(sheetBackoffMs({ retryBaseMs: 1000, retryMaxMs: 30_000 }, 0, () => 0)).toBe(750);
    expect(sheetBackoffMs({ retryBaseMs: 1000, retryMaxMs: 30_000 }, 0, () => 1)).toBe(1250);
    const h = harness();
    for (let i = 0; i < 6; i++) h.replies.push(new SheetOfflineError());
    h.queue.add(op(1));
    await h.clock.advance(150 + 1000 + 2000 + 4000 + 8000 + 16_000 + 30_000);
    const gaps = h.sent.slice(1).map((s, i) => s.at - h.sent[i].at);
    expect(gaps).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000]);
    expect(h.queue.idle).toBe(true);
    expect(h.sent.every((s) => s.write === h.sent[0].write)).toBe(true);
  });

  test("stale / sequence / lease / access / size halt the queue and go to the host; resume sends again", async () => {
    const cases: Array<[string, SheetPushFailure["kind"], string?]> = [
      ["[sheet.stale] Spreadsheet changed", "diverged", "stale"],
      ["[sheet.sequence] Edits arrived out of order", "diverged", "sequence"],
      ["[sheet.lease] Someone else is editing this spreadsheet", "lease"],
      ["[doc.forbidden] You do not have access", "access", "forbidden"],
      ["[sheet.too_large] Spreadsheet needs compaction", "too_large"],
      ["[sheet.not_sheet] Not a spreadsheet", "fatal"],
    ];
    for (const [message, kind, code] of cases) {
      const h = harness();
      h.replies.push(new Error(message));
      h.queue.add(op(1));
      await h.clock.advance(60_000);
      expect([message, h.failures.map((f) => [f.kind, "code" in f ? f.code : undefined])]).toEqual([message, [[kind, code]]]);
      expect(h.sent.length).toBe(1); // halted: no retry of its own
      expect(h.queue.hasUnsaved).toBe(true);
      h.queue.resume();
      await h.clock.advance(0);
      expect(h.sent.map((s) => s.write.seq)).toEqual([1n, 1n]);
    }
    // Anything unknown is retried (and reported once per attempt).
    const h = harness();
    h.replies.push(new Error("[drive.operator] Sign in again"));
    h.queue.add(op(1));
    await h.clock.advance(1150);
    expect([h.failures.map((f) => f.kind), h.sent.length, h.queue.idle]).toEqual([["transient"], 2, true]);
  });

  test("an op too large for one row takes the oversize path; the reset folds the waiting ops and shares the seq stream", async () => {
    const h = harness({ tuning: { updateMaxBytes: 2000 } });
    h.queue.add(op(1));
    await h.clock.advance(150);
    h.queue.add(bulky(2, 5000));
    h.queue.add(op(3));
    await h.clock.advance(150);
    expect([h.oversize, h.sent.length]).toEqual([1, 1]);
    expect(await h.queue.flush()).toBe(false); // waiting for the host's reset
    const content = { state: new Uint8Array([0x1f, 0x8b, 8]), plainText: "t", cellCount: 3 };
    const done = h.queue.enqueueReset(content, 41n);
    await h.clock.advance(0);
    await done;
    expect(h.sent.map((s) => [s.write.kind, s.write.seq, s.write.opCount])).toEqual([["ops", 1n, 1], ["reset", 2n, 2]]);
    expect(h.queue.idle).toBe(true);
  });

  test("a full log folds the unsent batch into a reset under the same seq; a refused reset leaves the stream", async () => {
    const h = harness();
    h.replies.push(new Error("[sheet.too_large] Spreadsheet needs compaction"));
    h.queue.add(op(1));
    await h.clock.advance(150);
    expect(h.failures.map((f) => f.kind)).toEqual(["too_large"]);
    const content = { state: new Uint8Array([1]), plainText: "", cellCount: 0 };
    h.replies.push(new Error("[sheet.quota] No room"));
    const refused = h.queue.enqueueReset(content, 40n, { replaceWrites: true }).then(() => "ok", (err: Error) => err.message);
    await h.clock.advance(0);
    expect(await refused).toBe("[sheet.quota] No room");
    expect(h.sent.map((s) => [s.write.kind, s.write.seq])).toEqual([["ops", 1n], ["reset", 1n]]);
    expect([h.queue.outstanding.length, h.failures.map((f) => f.kind)]).toEqual([0, ["too_large", "quota"]]);
    h.queue.add(op(2)); // not halted: nothing behind the refused reset waited for it
    await h.clock.advance(150);
    expect([h.sent.at(-1)?.write.kind, h.sent.at(-1)?.write.seq, h.queue.idle]).toEqual(["ops", 1n, true]); // its seq came back
  });

  test("a reset the host queues from inside oversize() or failed() goes out once, one write in flight", async () => {
    const content = { state: new Uint8Array([0x1f, 0x8b, 8]), plainText: "t", cellCount: 3 };
    const resets: Array<Promise<void>> = [];
    const big = harness({ tuning: { updateMaxBytes: 2000 }, onOversize: (q) => void resets.push(q.enqueueReset(content, 41n)) });
    big.queue.add(bulky(1, 5000));
    await big.clock.advance(150);
    await Promise.all(resets);
    expect([big.sent.map((s) => [s.write.kind, s.write.seq, s.write.opCount]), big.maxInFlight, big.queue.idle])
      .toEqual([[["reset", 1n, 1]], 1, true]);
    // A full log: the host folds the refused batch into a reset right in failed(), as the session does.
    const full = harness({
      onFailed: (f, q) => {
        if (f.kind === "too_large" && f.write.kind === "ops") resets.push(q.enqueueReset(content, 40n, { replaceWrites: true }));
      },
    });
    full.replies.push(new Error("[sheet.too_large] Spreadsheet needs compaction"));
    full.queue.add(op(1));
    full.queue.add(op(2));
    await full.clock.advance(150);
    await Promise.all(resets);
    expect(full.sent.map((s) => [s.write.kind, s.write.seq, s.write.opCount])).toEqual([["ops", 1n, 2], ["reset", 1n, 2]]);
    expect([full.maxInFlight, full.queue.idle, full.queue.lastCommittedSeq]).toEqual([1, true, 1n]);
  });

  test("a halt or a backoff is lifted by a (re)bind, not by the same binding seen again", async () => {
    const h = harness();
    h.replies.push(new Error("[sheet.not_sheet] Not a spreadsheet"));
    h.queue.add(op(1));
    await h.clock.advance(150);
    h.queue.grant(7n, 0n, false); // the lease row updated (a heartbeat)
    await h.clock.advance(60_000);
    expect([h.sent.length, h.failures.map((f) => f.kind)]).toEqual([1, ["fatal"]]);
    h.queue.grant(7n, 0n, true); // re-bound (a reconnect, a fencing)
    await h.clock.advance(0);
    expect([h.sent.length, h.queue.idle]).toEqual([2, true]);
    h.replies.push(new Error("[drive.operator] Sign in again"));
    h.queue.add(op(2));
    await h.clock.advance(150);
    h.queue.grant(7n, 1n, false);
    await h.clock.advance(999);
    expect(h.sent.length).toBe(3); // the 1 s backoff holds across row updates
    await h.clock.advance(1);
    expect([h.sent.length, h.queue.idle]).toEqual([4, true]);
  });

  test("no bound lease: nothing is sent and flush says so; discard counts the dropped ops", async () => {
    const h = harness({ context: null });
    h.queue.add(op(1));
    h.queue.add(op(2));
    expect(await h.queue.flush()).toBe(false);
    expect(h.sent.length).toBe(0);
    expect(h.queue.unsavedOps).toBe(2);
    expect(h.queue.discard()).toBe(2);
    expect([h.queue.hasUnsaved, h.queue.idle]).toEqual([false, true]);
  });
});
