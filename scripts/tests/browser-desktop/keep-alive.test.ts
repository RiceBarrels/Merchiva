import { describe, expect, test } from "bun:test";
import { createNavigationGate, type DeferredNavigation } from "@/components/browser-shell/core/tab-navigation";
import {
  DESKTOP_KEEP_ALIVE,
  MOBILE_KEEP_ALIVE,
  initialKeepAlive,
  keepAliveInputOf,
  keepAliveLimit,
  reconcileKeepAlive,
  type KeepAliveInput,
  type KeepAliveState,
} from "@/lib/browser-shell/keep-alive";
import { IDLE_SNAPSHOT, createTab, type IdGen } from "@/lib/browser-shell/model";
import type { TabsSnapshot } from "@/lib/browser-shell/types";

// Per-tab keep-alive bookkeeping (lib/browser-shell/keep-alive.ts): which slot renders the live
// route, when slots are created, adopted, dropped and evicted, and per-tab reloads.

interface World {
  /** Current entry UrlKey of every open tab, in strip order. */
  readonly tabs: Readonly<Record<string, string>>;
  readonly active: string | null;
  readonly requested?: string | null;
  readonly live: string | null;
  readonly nonce?: number;
  readonly limit?: number;
  readonly ready?: boolean;
}

function inputOf(world: World): KeepAliveInput {
  const requestedTabId = world.requested ?? world.active;
  return {
    ready: world.ready ?? true,
    tabIds: Object.keys(world.tabs),
    activeTabId: world.active,
    requestedTabId,
    requestedShowsLive: requestedTabId !== null && world.tabs[requestedTabId] === world.live,
    mountNonce: world.nonce ?? 0,
    liveKey: world.live,
    limit: world.limit ?? DESKTOP_KEEP_ALIVE,
  };
}

/** Reconciles and checks the result is a fixed point (the outlet stores it during render). */
function step(state: KeepAliveState, world: World): KeepAliveState {
  const input = inputOf(world);
  const next = reconcileKeepAlive(state, input);
  expect(reconcileKeepAlive(next, input)).toBe(next);
  return next;
}

function start(world: World): KeepAliveState {
  const input = inputOf(world);
  const state = initialKeepAlive(input);
  expect(reconcileKeepAlive(state, input)).toBe(state);
  return state;
}

/** `key:tab` per slot in DOM order, `*` on the live one. */
function view(state: KeepAliveState): string[] {
  return state.slots.map((slot) => `${slot.key}:${slot.tabId ?? "boot"}${slot.key === state.liveSlot ? "*" : ""}`);
}

function liveTab(state: KeepAliveState): string | null {
  return state.slots.find((slot) => slot.key === state.liveSlot)?.tabId ?? null;
}

describe("keep-alive limits", () => {
  test("desktop keeps more pages alive than the mobile chrome", () => {
    expect(keepAliveLimit("desktop")).toBe(DESKTOP_KEEP_ALIVE);
    expect(keepAliveLimit("mobile")).toBe(MOBILE_KEEP_ALIVE);
    expect(MOBILE_KEEP_ALIVE).toBeLessThan(DESKTOP_KEEP_ALIVE);
  });
});

describe("boot", () => {
  test("before the store binds the page renders in one boot slot, which the first tab adopts (no remount)", () => {
    let state = start({ tabs: {}, active: null, live: "/manager/inventory", ready: false });
    expect(view(state)).toEqual(["s0:boot*"]);
    state = step(state, { tabs: { A: "/manager/inventory" }, active: "A", live: "/manager/inventory" });
    expect(view(state)).toEqual(["s0:A*"]);
  });

  test("a launch restore waiting for its router.replace keeps the boot slot until the route moves", () => {
    let state = start({ tabs: {}, active: null, live: "/manager/new-tab", ready: false });
    state = step(state, { tabs: { A: "/manager/sales" }, active: "A", live: "/manager/new-tab" });
    expect(view(state)).toEqual(["s0:boot*"]);
    state = step(state, { tabs: { A: "/manager/sales" }, active: "A", live: "/manager/sales" });
    expect(view(state)).toEqual(["s0:A*"]);
  });

  test("an outlet mounted under a bound store starts on the rendered tab", () => {
    const state = start({ tabs: { A: "/manager/a", B: "/manager/b" }, active: "B", live: "/manager/b" });
    expect(view(state)).toEqual(["s0:B*"]);
  });
});

describe("switching tabs", () => {
  const tabs = { A: "/manager/a", B: "/manager/b" };

  test("the old page stays live until the router shows the new tab; then both stay mounted", () => {
    let state = start({ tabs, active: "A", live: "/manager/a" });
    // activateTab(B): highlight moves, router.push in flight.
    state = step(state, { tabs, active: "A", requested: "B", live: "/manager/a" });
    expect(view(state)).toEqual(["s0:A*"]);
    // Next renders B's route (the transition that will commit the history write).
    state = step(state, { tabs, active: "A", requested: "B", live: "/manager/b" });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
    // The history write committed.
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
  });

  test("switching back reveals the kept slot instead of creating one, and slot order never changes", () => {
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    state = step(state, { tabs, active: "B", requested: "A", live: "/manager/b" });
    expect(liveTab(state)).toBe("B");
    state = step(state, { tabs, active: "B", requested: "A", live: "/manager/a" });
    expect(view(state)).toEqual(["s0:A*", "s1:B"]);
    state = step(state, { tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
  });

  test("a popstate onto another tab keeps the old slot live until Next renders the new route", () => {
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    state = step(state, { tabs, active: "A", live: "/manager/a" });
    // The bridge already moved to B; Next's traverse has not rendered yet.
    state = step(state, { tabs, active: "B", live: "/manager/a" });
    expect(liveTab(state)).toBe("A");
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
  });

  test("a same-URL activation hands the live route to the other tab's own slot", () => {
    const same = { A: "/manager/x", B: "/manager/x" };
    let state = start({ tabs: same, active: "A", live: "/manager/x" });
    state = step(state, { tabs: same, active: "B", live: "/manager/x" });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
    state = step(state, { tabs: same, active: "A", live: "/manager/x" });
    expect(view(state)).toEqual(["s0:A*", "s1:B"]);
  });
});

describe("routes that belong to the rendered tab", () => {
  test("in-tab navigation stays in the tab's slot", () => {
    const tabs = { A: "/manager/a", B: "/manager/b" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    // Link click in A: the new route renders before the bridge records it.
    state = step(state, { tabs, active: "A", live: "/manager/a2" });
    expect(view(state)).toEqual(["s0:A*"]);
    state = step(state, { tabs: { ...tabs, A: "/manager/a2" }, active: "A", live: "/manager/a2" });
    expect(view(state)).toEqual(["s0:A*"]);
  });

  test("a route that is not the requested tab's (a redirect) goes to the rendered tab, like the bridge records it", () => {
    const tabs = { A: "/manager/a", B: "/manager/chat" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "A", requested: "B", live: "/manager/channel" });
    expect(view(state)).toEqual(["s0:A*"]);
  });

  test("a refresh of the live route keeps its slot even after the bridge moved on", () => {
    const tabs = { A: "/manager/a", B: "/manager/b" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/a" });
    expect(liveTab(state)).toBe("A");
  });
});

describe("closing tabs", () => {
  test("a hidden tab's slot is dropped when the tab closes", () => {
    const tabs = { A: "/manager/a", B: "/manager/b" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    state = step(state, { tabs: { B: "/manager/b" }, active: "B", live: "/manager/b" });
    expect(view(state)).toEqual(["s1:B*"]);
  });

  test("the closed live tab keeps its page on screen until the successor's route renders", () => {
    const tabs = { A: "/manager/a", B: "/manager/b" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    // Close B (rendered): DETACHED, A requested, router.push(/manager/a) in flight.
    state = step(state, { tabs: { A: "/manager/a" }, active: null, requested: "A", live: "/manager/b" });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
    state = step(state, { tabs: { A: "/manager/a" }, active: null, requested: "A", live: "/manager/a" });
    expect(view(state)).toEqual(["s0:A*"]);
  });

  test("nothing is dropped or adopted while the store is not bound", () => {
    const tabs = { A: "/manager/a", B: "/manager/b" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    state = step(state, { tabs: {}, active: null, live: "/manager/b", ready: false });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
    state = step(state, { tabs: {}, active: null, live: "/manager/c", ready: false });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
  });
});

describe("eviction", () => {
  test("beyond the limit the least recently shown slot is evicted; the others keep their order", () => {
    const tabs = { A: "/manager/a", B: "/manager/b", C: "/manager/c", D: "/manager/d" };
    const limit = 3;
    let state = start({ tabs, active: "A", live: "/manager/a", limit });
    state = step(state, { tabs, active: "B", live: "/manager/b", limit });
    state = step(state, { tabs, active: "C", live: "/manager/c", limit });
    state = step(state, { tabs, active: "A", live: "/manager/a", limit }); // A is now the most recent
    state = step(state, { tabs, active: "D", live: "/manager/d", limit });
    expect(view(state)).toEqual(["s0:A", "s2:C", "s3:D*"]);
    // B was evicted: showing it again mounts a fresh slot at the end.
    state = step(state, { tabs, active: "B", live: "/manager/b", limit });
    expect(view(state)).toEqual(["s0:A", "s3:D", "s4:B*"]);
  });

  test("the requested tab's slot is not evicted while its activation is in flight", () => {
    const tabs = { A: "/manager/a", B: "/manager/b", C: "/manager/c" };
    const limit = 2;
    let state = start({ tabs, active: "A", live: "/manager/a", limit });
    state = step(state, { tabs, active: "B", live: "/manager/b", limit });
    // Activating A (oldest) while B navigates in place to a route that creates no slot.
    state = step(state, { tabs, active: "B", requested: "A", live: "/manager/b", limit });
    expect(view(state)).toEqual(["s0:A", "s1:B*"]);
    // DETACHED + a route that belongs to C: C needs a slot, A (requested) and C (live) stay.
    state = step(state, { tabs, active: "C", requested: "A", live: "/manager/c", limit });
    expect(view(state)).toEqual(["s0:A", "s2:C*"]);
  });
});

describe("reloads", () => {
  test("a soft reload remounts only the rendered tab's page", () => {
    const tabs = { A: "/manager/a", B: "/manager/b" };
    let state = start({ tabs, active: "A", live: "/manager/a" });
    state = step(state, { tabs, active: "B", live: "/manager/b" });
    state = step(state, { tabs, active: "B", live: "/manager/b", nonce: 1 });
    expect(state.slots.map((slot) => [slot.tabId, slot.reloads])).toEqual([["A", 0], ["B", 1]]);
    // A teardown resets the store's nonce to 0: not a reload.
    state = step(state, { tabs: {}, active: null, live: "/manager/b", nonce: 0, ready: false });
    state = step(state, { tabs, active: "B", live: "/manager/b", nonce: 0 });
    expect(state.slots.map((slot) => [slot.tabId, slot.reloads])).toEqual([["A", 0], ["B", 1]]);
  });
});

describe("keepAliveInputOf", () => {
  function seqIds(): IdGen {
    let n = 0;
    const next = (prefix: string) => `${prefix}_${(++n).toString(36).padStart(10, "0")}`;
    return { tab: () => next("t"), entry: () => next("e"), closed: () => next("c"), stamp: () => next("k") };
  }

  test("matches the requested tab's entry by UrlKey (param order does not matter) and its paywall gate", () => {
    const ids = seqIds();
    const a = createTab("/manager/inventory?b=2&a=1", 1, ids);
    const b = createTab("/manager/sales", 1, ids);
    const snapshot: TabsSnapshot = {
      ...IDLE_SNAPSHOT,
      status: "ready",
      tabs: [a, b],
      activeTabId: a.id,
      requestedTabId: b.id,
      mountNonce: 3,
    };
    expect(keepAliveInputOf(snapshot, "/manager/sales", 8)).toEqual({
      ready: true,
      tabIds: [a.id, b.id],
      activeTabId: a.id,
      requestedTabId: b.id,
      requestedShowsLive: true,
      mountNonce: 3,
      liveKey: "/manager/sales",
      limit: 8,
    });
    const settled = { ...snapshot, requestedTabId: null };
    expect(keepAliveInputOf(settled, "/manager/inventory?a=1&b=2", 8).requestedShowsLive).toBe(true);
    expect(keepAliveInputOf(settled, "/manager/inventory", 8).requestedShowsLive).toBe(false);
    const gated = { ...settled, gate: { tabId: a.id, url: "/manager/subscribe" } };
    expect(keepAliveInputOf(gated, "/manager/subscribe", 8).requestedShowsLive).toBe(true);
    expect(keepAliveInputOf(IDLE_SNAPSHOT, "/manager/sales", 8)).toMatchObject({ ready: false, requestedTabId: null, requestedShowsLive: false });
  });
});

describe("navigation gate (a hidden page's router)", () => {
  function fakeRouter(calls: string[]) {
    return {
      back: () => void calls.push("back"),
      forward: () => void calls.push("forward"),
      prefetch: (href: string) => void calls.push(`prefetch ${href}`),
      refresh: () => void calls.push("refresh"),
      replace: (href: string) => void calls.push(`replace ${href}`),
      push: (href: string) => void calls.push(`push ${href}`),
    };
  }

  test("a shown page navigates; a hidden page's navigation is held (latest wins) until taken", () => {
    const calls: string[] = [];
    const gate = createNavigationGate(true);
    const router = gate.guard(fakeRouter(calls));
    router.push("/manager/a");
    expect(calls).toEqual(["push /manager/a"]);

    gate.setShown(false);
    router.push("/manager/b", { scroll: false });
    router.replace("?saved=1");
    router.refresh();
    router.prefetch("/manager/c");
    expect(calls).toEqual(["push /manager/a", "refresh", "prefetch /manager/c"]);
    const held: DeferredNavigation | null = gate.take();
    expect(held).toEqual({ kind: "replace", href: "?saved=1", options: undefined });
    expect(gate.take()).toBeNull();

    router.back();
    expect(gate.take()).toEqual({ kind: "back" });
    gate.setShown(true);
    router.forward();
    expect(calls.at(-1)).toBe("forward");
    expect(gate.take()).toBeNull();
  });
});
