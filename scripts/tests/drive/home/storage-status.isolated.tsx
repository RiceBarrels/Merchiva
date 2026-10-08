// Isolated fixture for scripts/tests/drive/home-render.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces the token bridge with mock.module, so it runs in its own process.
//
// useDriveStorageStatus (lib/drive/use-drive-storage-status.ts) through a real React renderer (ink): `checking` until
// the tab's storage answer arrives, then what GET /api/drive/status said; a later read (an upload's fresh one)
// reaches every mounted screen; a second screen takes the cached answer with no request and no `checking` frame;
// an unreadable status is `unknown`; an unmounted screen stops listening. While it is `unavailable` a mounted screen
// reads it again once the cached answer runs out, with no visibility change (the TTL timer is captured and fired by
// hand, the clock moved with setSystemTime).

import { expect, mock, setSystemTime, test } from "bun:test";
import { createElement as h } from "react";

mock.module("@/lib/drive/use-drive-token", () => ({ useDriveTokenBridge: () => {} }));

const { render } = await import("ink-testing-library");
const { registerDriveTokenGetter } = await import("@/lib/drive/api");
const { __resetDriveStorageStatusForTests, DRIVE_STORAGE_STATUS_TTL_MS, driveStorageReady } = await import("@/lib/drive/upload");
const { useDriveStorageStatus } = await import("@/lib/drive/use-drive-storage-status");

// The hook's re-read timer, captured so the test fires it; every other interval runs as usual.
const ttlTimers = new Map<ReturnType<typeof setInterval>, () => void>();
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = ((handler: () => void, ms?: number, ...args: unknown[]) => {
  if (ms !== DRIVE_STORAGE_STATUS_TTL_MS) return realSetInterval(handler, ms, ...args);
  const id = realSetInterval(() => {}, 2 ** 30);
  ttlTimers.set(id, handler);
  return id;
}) as typeof setInterval;
globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
  if (id !== undefined) ttlTimers.delete(id);
  realClearInterval(id);
}) as typeof clearInterval;
const fireTtlTimers = () => {
  for (const handler of [...ttlTimers.values()]) handler();
};

let answer: { configured: boolean; paused: boolean } | number = { configured: false, paused: false };
let requests = 0;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  if (!String(input).endsWith("/api/drive/status")) return new Response(null, { status: 404 });
  requests++;
  if (typeof answer === "number") return new Response("down", { status: answer });
  return Response.json({ ...answer, maxFileBytes: 1, multipartThresholdBytes: 1, thumbMaxBytes: 1 });
}) as typeof fetch;
registerDriveTokenGetter(async () => "tok");

function Probe({ seen }: { seen: string[] }) {
  seen.push(useDriveStorageStatus().status);
  return null;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

test("the screens follow the tab's storage answer", async () => {
  __resetDriveStorageStatusForTests();
  const first: string[] = [];
  const view = render(h(Probe, { seen: first }));
  expect(first[0]).toBe("checking");
  await flush();
  expect(first.at(-1)).toBe("unavailable");
  expect(requests).toBe(1);

  // An upload reads the status again (the transport after a refused PUT): the mounted screen follows.
  answer = { configured: true, paused: false };
  expect(await driveStorageReady(true)).toBe(true);
  await flush();
  expect(first.at(-1)).toBe("ready");

  // Another screen takes the cached answer: no request, no `checking` frame.
  const second: string[] = [];
  const other = render(h(Probe, { seen: second }));
  await flush();
  expect(requests).toBe(2);
  expect(second.length).toBeGreaterThan(0);
  expect(second.every((status) => status === "ready")).toBe(true);

  answer = 500;
  expect(await driveStorageReady(true)).toBeNull();
  await flush();
  expect([first.at(-1), second.at(-1)]).toEqual(["unknown", "unknown"]);

  other.unmount();
  view.unmount();
  const frames = [first.length, second.length];
  answer = { configured: false, paused: true };
  expect(await driveStorageReady(true)).toBe(false);
  await flush();
  expect([first.length, second.length]).toEqual(frames);
});

test("while unavailable, a mounted screen reads the status again once the cached answer runs out", async () => {
  __resetDriveStorageStatusForTests();
  requests = 0;
  answer = { configured: false, paused: false };
  const seen: string[] = [];
  const view = render(h(Probe, { seen }));
  try {
    await flush();
    expect(seen.at(-1)).toBe("unavailable");
    expect(requests).toBe(1);
    expect(ttlTimers.size).toBe(1);

    // Storage comes back. Within the minute the cached answer stands: no request.
    answer = { configured: true, paused: false };
    fireTtlTimers();
    await flush();
    expect(requests).toBe(1);
    expect(seen.at(-1)).toBe("unavailable");

    // Once it runs out the timer reads it again, with no visibility change: Upload turns on by itself.
    setSystemTime(new Date(Date.now() + DRIVE_STORAGE_STATUS_TTL_MS + 1));
    fireTtlTimers();
    await flush();
    expect(requests).toBe(2);
    expect(seen.at(-1)).toBe("ready");

    // While it is ready the timer asks for nothing (uploads read it themselves).
    setSystemTime(new Date(Date.now() + 2 * DRIVE_STORAGE_STATUS_TTL_MS + 2));
    fireTtlTimers();
    await flush();
    expect(requests).toBe(2);
  } finally {
    view.unmount();
    setSystemTime();
  }
  // The unmounted screen's timer is gone.
  expect(ttlTimers.size).toBe(0);
});
