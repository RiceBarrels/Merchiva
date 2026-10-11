// Isolated fixture for scripts/tests/store-device/operator-session.test.ts — NOT auto-discovered
// by `bun test`. A PIN or QR log-in on /store leaves the tablet's identity a server-side
// `device_operator_session`, which lets Drive act for that person for up to 12 h. This checks
// when StoreDeviceScreen deletes it through `clearDeviceOperator()`: on every way the operator
// goes away, on the idle lock while nobody is logged in, and never while someone still is.
// It also checks that the screen drops this browser's push subscription (a shared tablet holds
// nobody's) once the connection is up.
//
// StoreDeviceScreen renders through Ink's reconciler (this suite has no DOM). MiniAppSurface is
// mocked to render nothing, so no host element is ever created, while every hook and effect of
// the screen still runs; its children are captured to reach the log-out and unlock handlers.
// Module mocks leak into other files of the same process, so this runs in its own.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { render } from "ink-testing-library";

// ── Controllable fakes ──────────────────────────────────────────────────────

type Operator = { memberId: string; name: string } | null;
interface Member { id: string; displayName: string; role: string }

/** Stands in for the operator the device keeps in localStorage. */
let storedOperator: Operator = null;
const operatorListeners = new Set<() => void>();
/** Store an operator and tell subscribers, as `setCurrentOperator` does. */
function setOperator(op: Operator) {
  storedOperator = op;
  for (const l of operatorListeners) l();
}

let members: Member[] = [];
let membersReady = true;
const memberListeners = new Set<() => void>();
function setMembers(list: Member[], ready = true) {
  members = list;
  membersReady = ready;
  for (const l of memberListeners) l();
}

let clearCalls = 0;
let releaseCalls = 0;
/** Stands in for the SpacetimeDB connection state (`useSpacetimeDB().isActive`). */
let connectionActive = true;
const connectionListeners = new Set<() => void>();
function setConnectionActive(active: boolean) {
  connectionActive = active;
  for (const l of connectionListeners) l();
}
let fireIdle: (() => void) | null = null;
let surfaceChildren: React.ReactNode = null;

const LoggedInScreen = (_: { onLogout: () => void }) => null;
const IdleLock = (_: { active: boolean; onUnlock: () => void }) => null;

mock.module("@/lib/spacetimedb/actions", () => ({
  clearDeviceOperator: () => {
    clearCalls += 1;
    return Promise.resolve();
  },
  registerStoreDevice: () => Promise.resolve(),
}));
mock.module("spacetimedb/react", () => ({
  useSpacetimeDB: () => {
    const isActive = React.useSyncExternalStore(
      (l: () => void) => {
        connectionListeners.add(l);
        return () => connectionListeners.delete(l);
      },
      () => connectionActive,
    );
    return { isActive };
  },
}));
mock.module("@/lib/notifications/push-cleanup", () => ({
  releaseBrowserPush: () => {
    releaseCalls += 1;
    return Promise.resolve();
  },
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({ organizationId: "org-1", currentOrg: { name: "Test store" } }),
}));
mock.module("@/lib/haptics", () => ({ hapticSuccess: () => {} }));
mock.module("@/lib/store-machine-mode", () => ({
  getOrCreateDeviceId: () => "device-1",
  getStoreMachineMode: () => false,
  setStoreMachineMode: () => {},
  useDeviceName: () => ["Front tablet"],
}));
mock.module("@/lib/store-device-lock", () => ({
  useAutolockSeconds: () => [30, () => {}],
  // Same shape as the real hook: state that follows the store only once its
  // change event fires, so a silent write is visible to `getCurrentOperator`
  // before it reaches a render.
  useCurrentOperator: () => {
    const [op, setOp] = React.useState<Operator>(null);
    React.useEffect(() => {
      setOp(storedOperator);
      const handler = () => setOp(storedOperator);
      operatorListeners.add(handler);
      return () => {
        operatorListeners.delete(handler);
      };
    }, []);
    return op;
  },
  getCurrentOperator: () => storedOperator,
  setCurrentOperator: (op: Operator) => setOperator(op),
}));
mock.module("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }));
mock.module("@/components/ui/loaders/geometric", () => ({ Spinner: () => null }));
mock.module("@/components/device", () => ({
  useNow: () => new Date(0),
  fmtStatusClock: () => "",
  useIdleTimer: (opts: { onIdle: () => void }) => {
    fireIdle = opts.onIdle;
    return { dimming: false, reset: () => {} };
  },
  useOnShift: () => ({ ready: true, entries: [], forMember: () => null }),
  IdleLock,
  MiniAppSurface: (props: { children: React.ReactNode }) => {
    surfaceChildren = props.children;
    return null;
  },
}));
mock.module("@/components/store-device/use-org-members", () => ({
  useOrgMembers: () => {
    const list = React.useSyncExternalStore(
      (l: () => void) => {
        memberListeners.add(l);
        return () => memberListeners.delete(l);
      },
      () => members,
    );
    return { members: list, ready: membersReady };
  },
}));
mock.module("@/components/store-device/login-pane", () => ({ LoginPane: () => null }));
mock.module("@/components/store-device/roster-pages", () => ({
  RosterPages: () => null,
  StoreClockCard: () => null,
  useClosingTime: () => null,
}));
mock.module("@/components/store-device/logged-in-screen", () => ({ LoggedInScreen }));
mock.module("@/components/store-device/punch-prompt", () => ({ PunchPrompt: () => null }));
mock.module("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));

const { StoreDeviceScreen } = await import("@/components/store-device/store-device-screen");

// ── Helpers ─────────────────────────────────────────────────────────────────

const ALICE: Member = { id: "m-alice", displayName: "Alice", role: "staff" };
const aliceOperator = { memberId: ALICE.id, name: ALICE.displayName };

/** Let React commit and run passive effects. */
const settle = () => new Promise((r) => setTimeout(r, 20));

/** The props of the first element of `type` among the captured surface children. */
function propsOf<P>(node: React.ReactNode, type: unknown): P | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf<P>(child as React.ReactNode, type);
      if (found) return found;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: P & { children?: React.ReactNode } };
  if (el.type === type && el.props) return el.props;
  return propsOf<P>(el.props?.children, type);
}

function logOut() {
  const props = propsOf<{ onLogout: () => void }>(surfaceChildren, LoggedInScreen);
  if (!props) throw new Error("LoggedInScreen is not rendered");
  props.onLogout();
}

function unlock() {
  const props = propsOf<{ active: boolean; onUnlock: () => void }>(surfaceChildren, IdleLock);
  if (!props?.active) throw new Error("the idle lock is not up");
  props.onUnlock();
}

function idle() {
  if (!fireIdle) throw new Error("useIdleTimer was never called");
  fireIdle();
}

let unmountScreen: (() => void) | null = null;

async function mount() {
  unmountScreen = render(<StoreDeviceScreen />).unmount;
  await settle();
}

afterEach(() => {
  // Unmount even when a test failed, so a live screen never answers the next test's resets.
  unmountScreen?.();
  unmountScreen = null;
});

beforeEach(() => {
  clearCalls = 0;
  releaseCalls = 0;
  connectionActive = true;
  fireIdle = null;
  surfaceChildren = null;
  setMembers([ALICE], true);
  setOperator(null);
});

// ── Scenarios ───────────────────────────────────────────────────────────────

describe("StoreDeviceScreen clears the tablet's operator session", () => {
  test("no clear on mount while logged out, nor when an operator logs in", async () => {
    await mount();
    expect(clearCalls).toBe(0);
    setOperator(aliceOperator);
    await settle();
    expect(clearCalls).toBe(0);
    expect(propsOf(surfaceChildren, LoggedInScreen)).not.toBeNull();
  });

  test("no clear on mount with a persisted operator", async () => {
    setOperator(aliceOperator);
    await mount();
    expect(clearCalls).toBe(0);
  });

  test("manual log-out clears once", async () => {
    setOperator(aliceOperator);
    await mount();
    logOut();
    await settle();
    expect(storedOperator).toBeNull();
    expect(clearCalls).toBe(1);
  });

  test("the idle log-out clears once", async () => {
    setOperator(aliceOperator);
    await mount();
    idle();
    await settle();
    expect(storedOperator).toBeNull();
    expect(clearCalls).toBe(1);
  });

  test("the idle lock while nobody is logged in clears once", async () => {
    await mount();
    idle();
    await settle();
    expect(propsOf<{ active: boolean }>(surfaceChildren, IdleLock)?.active).toBe(true);
    expect(clearCalls).toBe(1);
  });

  test("every idle lock clears again after an unlock", async () => {
    await mount();
    idle();
    await settle();
    unlock();
    await settle();
    expect(clearCalls).toBe(1);
    idle();
    await settle();
    expect(clearCalls).toBe(2);
  });

  test("a log-in stored in the same tick as the idle lock keeps its session", async () => {
    await mount();
    // The operator is already in storage, but the screen has not re-rendered yet.
    storedOperator = aliceOperator;
    idle();
    await settle();
    expect(clearCalls).toBe(0);
  });

  test("the idle lock keeps a stored operator whose member list has not loaded", async () => {
    setMembers([], false);
    setOperator(aliceOperator);
    await mount();
    idle();
    await settle();
    expect(storedOperator).not.toBeNull();
    expect(clearCalls).toBe(0);
  });

  test("an operator who is no longer an active member is dropped and cleared once", async () => {
    setOperator({ memberId: "m-gone", name: "Gone" });
    await mount();
    expect(storedOperator).toBeNull();
    expect(clearCalls).toBe(1);
  });

  test("the stale-operator check waits for the member list", async () => {
    setMembers([], false);
    setOperator(aliceOperator);
    await mount();
    expect(clearCalls).toBe(0);
    setMembers([ALICE], true);
    await settle();
    expect(storedOperator).not.toBeNull();
    expect(clearCalls).toBe(0);
  });

  test("an operator cleared elsewhere (another /store tab, leaving store mode) clears once", async () => {
    setOperator(aliceOperator);
    await mount();
    setOperator(null);
    await settle();
    expect(clearCalls).toBe(1);
  });

  test("log in, log out, log in, idle log-out: one clear per log-out", async () => {
    await mount();
    setOperator(aliceOperator);
    await settle();
    logOut();
    await settle();
    setOperator(aliceOperator);
    await settle();
    idle();
    await settle();
    expect(clearCalls).toBe(2);
  });
});

describe("StoreDeviceScreen releases this browser's push subscription", () => {
  test("once on mount with a live connection, logged out or in", async () => {
    await mount();
    expect(releaseCalls).toBe(1);
    setOperator(aliceOperator);
    await settle();
    expect(releaseCalls).toBe(1);
  });

  test("not before the connection is up, then once it is", async () => {
    connectionActive = false;
    await mount();
    expect(releaseCalls).toBe(0);
    setConnectionActive(true);
    await settle();
    expect(releaseCalls).toBe(1);
  });
});
