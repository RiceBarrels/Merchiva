import { afterEach, beforeEach, expect, test } from "bun:test";
import { cancelScrollRestore, findScrollRoot, scheduleScrollRestore } from "@/lib/browser-shell/scroll";

// Scroll restore against a fake content element: `findScrollRoot` reads
// `document.querySelector("#desktop-content, #mobile-content")` and its `[data-tab-scroll-root]` children.

interface FakeRoot {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  isConnected: boolean;
  getClientRects(): number[];
  matches(selector: string): boolean;
}

function fakeRoot(scrollHeight: number): FakeRoot {
  return {
    scrollTop: 0,
    scrollHeight,
    clientHeight: 800,
    isConnected: true,
    getClientRects: () => [1],
    matches: (selector) => selector === "[data-tab-scroll-root]",
  };
}

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let roots: FakeRoot[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  for (const key of ["window", "document", "requestAnimationFrame", "cancelAnimationFrame"]) saved[key] = globals[key];
  roots = [];
  const content = { isConnected: true, matches: () => false, querySelectorAll: () => roots };
  Object.assign(globals, {
    window: {},
    document: { querySelector: () => content },
    requestAnimationFrame: (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 1),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
});

afterEach(() => {
  cancelScrollRestore();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globals[key];
    else globals[key] = value;
  }
});

test("without reuseRoot the restore waits for a new root (the exiting page keeps its own)", async () => {
  const exiting = fakeRoot(3000);
  roots = [exiting];
  expect(findScrollRoot() as unknown).toBe(exiting);
  scheduleScrollRestore(1200, false);
  await sleep(20);
  expect(exiting.scrollTop).toBe(0);
  const entering = fakeRoot(3000);
  roots = [entering];
  await sleep(20);
  expect(entering.scrollTop).toBe(1200);
  expect(exiting.scrollTop).toBe(0);
});

test("with reuseRoot the current root is restored once it is tall enough (boot: the page mounted with the shell)", async () => {
  const root = fakeRoot(800);
  roots = [root];
  scheduleScrollRestore(1200, true);
  await sleep(20);
  expect(root.scrollTop).toBe(0);
  root.scrollHeight = 2400;
  await sleep(20);
  expect(root.scrollTop).toBe(1200);
});

test("gives up after timeoutMs, and a zero offset only resets a reused root", async () => {
  const root = fakeRoot(800);
  roots = [root];
  scheduleScrollRestore(1200, true, { timeoutMs: 15 });
  await sleep(40);
  root.scrollHeight = 2400;
  await sleep(20);
  expect(root.scrollTop).toBe(0);

  root.scrollTop = 500;
  scheduleScrollRestore(undefined, false);
  expect(root.scrollTop).toBe(500);
  scheduleScrollRestore(0, true);
  expect(root.scrollTop).toBe(0);
});
