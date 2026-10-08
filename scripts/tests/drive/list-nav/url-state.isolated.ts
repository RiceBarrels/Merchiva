// useDriveUrlState over a fake window and session history (drive-ui §6.3), run in a child process by
// ui.test.ts: it replaces `next/navigation` with `mock.module` and installs a global `window`.
//
// The history fake keeps every entry's state, like the browser: `history.go` lands asynchronously, as a
// popstate does. Nothing here emulates Next's or the browser shell's history patches; both keep custom
// state fields (app-router.js copyNextJsInternalHistoryState, history-bridge.ts withStamp).

import { beforeEach, describe, expect, mock, test } from "bun:test";

interface Entry {
  search: string;
  state: unknown;
}

const PATH = "/manager/drive";
const loc = { pathname: PATH, search: "" };
const stack: Entry[] = [];
let index = 0;
const writes: string[] = [];
const goes: number[] = [];
const events = new EventTarget();
const store = new Map<string, string>();

const searchOf = (url: string) => url.slice(PATH.length);
const copy = (state: unknown) => (state === null || state === undefined ? null : structuredClone(state));

const fakeHistory = {
  get state(): unknown {
    return stack[index]?.state ?? null;
  },
  pushState(state: unknown, _title: string, url: string) {
    stack.splice(index + 1);
    stack.push({ search: searchOf(url), state: copy(state) });
    index = stack.length - 1;
    loc.search = stack[index].search;
    writes.push(`push ${loc.search}`);
  },
  replaceState(state: unknown, _title: string, url: string) {
    stack[index] = { search: searchOf(url), state: copy(state) };
    loc.search = stack[index].search;
    writes.push(`replace ${loc.search}`);
  },
  go(delta: number) {
    goes.push(delta);
    setTimeout(() => {
      index = Math.min(Math.max(index + delta, 0), stack.length - 1);
      loc.search = stack[index].search;
    }, 0);
  },
};

Object.assign(globalThis, {
  window: {
    location: loc,
    history: fakeHistory,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  },
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});

mock.module("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(loc.search) }));

const { createElement: h } = await import("react");
const { render } = await import("ink-testing-library");
const { PREVIEW_MARK_FIELD, historyModeFor, nextPreviewMark, previewCloseSteps, readPreviewMark, useDriveUrlState } = await import(
  "@/components/drive/use-drive-url-state"
);

type UrlState = ReturnType<typeof useDriveUrlState>;
let current: UrlState | null = null;
function Probe({ report }: { report(state: UrlState): void }) {
  report(useDriveUrlState());
  return null;
}
const probe = () => h(Probe, { report: (state) => void (current = state) });
const view = (): UrlState => {
  if (!current) throw new Error("not rendered");
  return current;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const searches = () => stack.map((entry) => entry.search);
const F = "0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4";
const A = "1a2b3c4d-1111-4222-8333-944455566677";
const B = "2b3c4d5e-1111-4222-8333-944455566677";
const FOLDER = `?folder=${F}`;

function start(search = "", state: unknown = null) {
  stack.splice(0, stack.length, { search, state });
  index = 0;
  loc.search = search;
  writes.length = 0;
  goes.length = 0;
  const app = render(probe());
  return { app, again: () => app.rerender(probe()) };
}

beforeEach(() => {
  store.clear();
});

describe("history mode and preview marks", () => {
  test("push for places, replace for filters and for closing", () => {
    expect(historyModeFor({ folder: F })).toBe("push");
    expect(historyModeFor({ space: "store" })).toBe("push");
    expect(historyModeFor({ member: F })).toBe("push");
    expect(historyModeFor({ preview: `item:${F}` })).toBe("push");
    expect(historyModeFor({ preview: "" })).toBe("replace");
    expect(historyModeFor({ type: "pdf" })).toBe("replace");
    expect(historyModeFor({ sort: "size" })).toBe("replace");
  });

  test("a mark is read only when well formed", () => {
    expect(readPreviewMark({ [PREVIEW_MARK_FIELD]: { depth: 2, base: FOLDER } })).toEqual({ depth: 2, base: FOLDER });
    expect(readPreviewMark(null)).toBeNull();
    expect(readPreviewMark({ [PREVIEW_MARK_FIELD]: { depth: 0, base: "" } })).toBeNull();
    expect(readPreviewMark({ [PREVIEW_MARK_FIELD]: { depth: 1.5, base: "" } })).toBeNull();
    expect(readPreviewMark({ [PREVIEW_MARK_FIELD]: { depth: 1 } })).toBeNull();
    expect(readPreviewMark({ __NA: true })).toBeNull();
  });

  test("only entries that show a preview carry a mark", () => {
    const withA = `${FOLDER}&preview=item%3A${A}`;
    expect(nextPreviewMark(null, FOLDER, withA, "push")).toEqual({ depth: 1, base: FOLDER });
    expect(nextPreviewMark({ depth: 1, base: FOLDER }, withA, `${FOLDER}&preview=item%3A${B}`, "push")).toEqual({ depth: 2, base: FOLDER });
    expect(nextPreviewMark({ depth: 1, base: FOLDER }, withA, `${withA}&sort=size`, "replace")).toEqual({ depth: 1, base: FOLDER });
    expect(nextPreviewMark({ depth: 1, base: FOLDER }, withA, FOLDER, "replace")).toBeNull();
    expect(nextPreviewMark(null, withA, `${FOLDER}&preview=item%3A${B}`, "push")).toBeNull();
    expect(nextPreviewMark(null, FOLDER, `${FOLDER}&type=pdf`, "push")).toBeNull();
  });

  test("closing steps back only onto exactly the search it would write, in any param order", () => {
    const mark = { depth: 2, base: `?type=pdf&folder=${F}` };
    expect(previewCloseSteps(mark, `?folder=${F}&type=pdf`)).toBe(2);
    expect(previewCloseSteps(mark, `?folder=${F}&type=pdf&sort=size`)).toBe(0);
    expect(previewCloseSteps(null, FOLDER)).toBe(0);
  });
});

describe("useDriveUrlState: previews and Back", () => {
  test("closing a preview it opened steps Back, so no duplicate entry is left for Back to land on", async () => {
    const { app, again } = start();
    view().go({ folder: F });
    again();
    view().go({ preview: `item:${A}` });
    again();
    expect(view().preview).toBe(`item:${A}`);
    expect(readPreviewMark(fakeHistory.state)).toEqual({ depth: 1, base: FOLDER });
    view().go({ preview: "" });
    view().go({ preview: "" }); // a second close before the popstate lands is the same close
    expect(goes).toEqual([-1]);
    await settle();
    again();
    expect(view().preview).toBe("");
    expect(index).toBe(1);
    expect(searches()).toEqual(["", FOLDER, `${FOLDER}&preview=item%3A${A}`]);
    expect(stack[index].search).not.toBe(stack[index - 1].search);
    app.unmount();
  });

  test("previews opened one after another close together", async () => {
    const { app, again } = start(FOLDER);
    view().go({ preview: `item:${A}` });
    again();
    view().go({ preview: `item:${B}` });
    again();
    expect(readPreviewMark(fakeHistory.state)).toEqual({ depth: 2, base: FOLDER });
    view().go({ preview: "" });
    expect(goes).toEqual([-2]);
    await settle();
    again();
    expect(index).toBe(0);
    expect(view().preview).toBe("");
    app.unmount();
  });

  test("a preview opened by a deep link (no mark) closes by replacing", () => {
    const { app, again } = start(`${FOLDER}&preview=item%3A${A}`);
    view().go({ preview: "" });
    again();
    expect(goes).toEqual([]);
    expect(searches()).toEqual([FOLDER]);
    expect(view().preview).toBe("");
    app.unmount();
  });

  test("a sort changed while previewing is kept: the close replaces", () => {
    const { app, again } = start(FOLDER);
    view().go({ preview: `item:${A}` });
    again();
    view().go({ sort: "size" });
    again();
    expect(readPreviewMark(fakeHistory.state)).toEqual({ depth: 1, base: FOLDER });
    view().go({ preview: "" });
    again();
    expect(goes).toEqual([]);
    expect(loc.search).toBe(`${FOLDER}&sort=size`);
    expect(writes.at(-1)).toBe(`replace ${FOLDER}&sort=size`);
    app.unmount();
  });

  test("a search typed while previewing is kept: the close replaces", () => {
    const { app, again } = start(FOLDER);
    view().go({ preview: `item:${A}` });
    again();
    view().setQuery("inv");
    again();
    view().go({ preview: "" });
    again();
    expect(goes).toEqual([]);
    expect(loc.search).toBe(`${FOLDER}&q=inv`);
    expect(view().query).toBe("inv");
    app.unmount();
  });
});

describe("useDriveUrlState: search, filters and view", () => {
  test("typing debounces into q; opening a folder pushes and clears q; Back adopts the entry's q", async () => {
    const { app, again } = start();
    expect(view().space).toBe("my");
    expect(view().view).toBe("grid");
    expect(view().sort).toBe("name");
    view().setQuery("inv");
    again();
    expect(view().query).toBe("inv");
    await new Promise((resolve) => setTimeout(resolve, 400));
    again();
    expect(loc.search).toBe("?q=inv");
    expect(writes.at(-1)).toBe("replace ?q=inv");
    // More typing, then a folder before the debounce: the typed text is recorded on the entry being left.
    view().setQuery("invoice");
    again();
    view().go({ folder: F });
    again();
    expect(writes.slice(-2)).toEqual(["replace ?q=invoice", `push ${FOLDER}`]);
    expect(view().folder).toBe(F);
    expect(view().query).toBe("");
    view().go({ type: "pdf" });
    again();
    expect(writes.at(-1)).toBe(`replace ${FOLDER}&type=pdf`);
    // Back (a URL change the hook did not write) adopts that entry's q.
    loc.search = "?q=invoice";
    again();
    expect(view().query).toBe("invoice");
    expect(view().folder).toBe("");
    app.unmount();
  });

  test("the layout is saved per viewer and a URL view is dropped; clearFilters; Trash sorts newest first", () => {
    const { app, again } = start("?view=list");
    expect(view().view).toBe("list");
    view().setView("grid");
    again();
    expect(store.get("drive_view")).toBe("grid");
    expect(loc.search).toBe("");
    expect(view().view).toBe("grid");
    loc.search = "?q=abc&type=image&space=store";
    again();
    view().clearFilters();
    again();
    expect(loc.search).toBe("?space=store");
    expect(view().query).toBe("");
    loc.search = "?space=trash";
    again();
    expect(view().sort).toBe("modified");
    app.unmount();
  });
});
