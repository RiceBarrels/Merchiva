// Isolated fixture for scripts/tests/store-device/legacy-lock-session.test.ts — NOT auto-discovered
// by `bun test`. The legacy store-machine lock under /manager (components/store-device-lock.tsx)
// unlocks through `resolveDeviceOperator`, which leaves the tablet's identity a server-side
// `device_operator_session` that lets Drive act for that person for up to 12 h. This checks that
// the lock deletes it through `clearDeviceOperator()` whenever it waits for a PIN — after the
// autolock, a log-out, a reload, store mode switched back on, or a PIN answer that came too late —
// and never while an unlock is running or in a surface that is not in store mode.
//
// The lock renders DOM elements and this suite has no DOM. It renders through Ink's reconciler with
// the JSX dev runtime stubbed so every DOM element renders nothing, while every hook and effect of
// the lock still runs. Module mocks leak into other files of the same process, so this runs in its own.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import * as devRuntime from "react/jsx-dev-runtime";
import { render } from "ink-testing-library";

// ── DOM elements render nothing ─────────────────────────────────────────────

const realJsxDEV = devRuntime.jsxDEV;
const NoHost = () => null;
mock.module("react/jsx-dev-runtime", () => ({
  ...devRuntime,
  jsxDEV: (type: unknown, ...rest: unknown[]) =>
    (realJsxDEV as (...args: unknown[]) => unknown)(
      typeof type === "string" && !type.startsWith("ink-") ? NoHost : type,
      ...rest,
    ),
}));

// ── Controllable fakes ──────────────────────────────────────────────────────

/** The lock listens on `window` for activity, keys and the force-lock event. */
const win = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
Object.assign(globalThis, { window: win });

interface Session { organizationId: string; memberId: string; memberName: string; role: string; resolvedAt: object }

/** This tablet's `device_operator_session` rows, as the subscription holds them. */
let sessions: Session[] = [];
const sessionListeners = new Set<() => void>();
function setSessions(rows: Session[]) {
  sessions = rows;
  for (const l of sessionListeners) l();
}
const sessionFor = (memberId: string, memberName: string): Session => ({
  organizationId: "org-1",
  memberId,
  memberName,
  role: "staff",
  resolvedAt: {},
});

/** Store-machine mode as the device keeps it in localStorage. */
let storeMachine = true;
const modeListeners = new Set<() => void>();
function setStoreMachine(on: boolean) {
  storeMachine = on;
  for (const l of modeListeners) l();
}

let autolockSeconds = 0;
let clearCalls = 0;
let resolveCalls = 0;
/** Whether the connection is up. Before it is, every reducer call rejects (`conn()` throws). */
let connected = true;
const operators: unknown[] = [];

/** One round trip. Replies come back in send order, as on one connection, and a reducer's own row
 *  change reaches the cache before its promise settles, as in the SpacetimeDB SDK. */
const LATENCY_MS = 30;
function roundTrip(apply: () => void): Promise<void> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        apply();
        resolve();
      } catch (err) {
        reject(err);
      }
    }, LATENCY_MS),
  );
}
const PINS: Record<string, Session> = { "1234": sessionFor("m-alice", "Alice") };

const TABLES = { orgMember: { name: "org_member" }, deviceOperatorSession: { name: "device_operator_session" } };
mock.module("@/lib/spacetimedb/generated", () => ({ tables: TABLES, reducers: {} }));
mock.module("spacetimedb/react", () => ({
  useTable: (query: unknown) => {
    const rows = React.useSyncExternalStore(
      (l: () => void) => {
        sessionListeners.add(l);
        return () => sessionListeners.delete(l);
      },
      () => sessions,
    );
    return query === TABLES.deviceOperatorSession ? [rows, true] : [[], true];
  },
}));
mock.module("@/lib/spacetimedb/actions", () => ({
  clearDeviceOperator: () => {
    clearCalls += 1;
    if (!connected) return Promise.reject(new Error("not connected"));
    return roundTrip(() => setSessions([]));
  },
  resolveDeviceOperator: (code: string) => {
    resolveCalls += 1;
    if (!connected) return Promise.reject(new Error("not connected"));
    return roundTrip(() => {
      const session = PINS[code];
      if (!session) throw new Error("PIN_NOT_RECOGNIZED");
      setSessions([session]);
    });
  },
  recordPunch: () => Promise.reject(new Error("NEEDS_EXPLICIT_ACTION")),
}));
mock.module("@/lib/context/permissions", () => ({ usePermissions: () => ({ organizationId: "org-1" }) }));
mock.module("@/lib/store-machine-mode", () => ({
  // Same shape as the real hook: off on the first render, then the stored value from an effect.
  useStoreMachineMode: () => {
    const [on, setOn] = React.useState(false);
    React.useEffect(() => {
      setOn(storeMachine);
      const handler = () => setOn(storeMachine);
      modeListeners.add(handler);
      return () => {
        modeListeners.delete(handler);
      };
    }, []);
    return [on, () => {}];
  },
  useDeviceName: () => ["Front tablet"],
}));
mock.module("@/lib/store-device-lock", () => ({
  getAutolockSeconds: () => autolockSeconds,
  setCurrentOperator: (op: unknown) => operators.push(op),
  getCurrentOperator: () => null,
}));
mock.module("@/lib/i18n/context", () => ({ useT: () => (key: string) => key }));
mock.module("@/lib/haptics", () => ({ hapticSuccess: () => {}, hapticMedium: () => {}, hapticLight: () => {} }));
mock.module("@/components/ui/loaders/geometric", () => ({ Spinner: () => null }));

const { StoreDeviceLock } = await import("@/components/store-device-lock");

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Let React commit and run passive effects. */
const settle = () => sleep(20);
/** Enough for every round trip in flight to come back. */
const drain = () => sleep(LATENCY_MS * 3);
const press = (key: string) => win.dispatchEvent(Object.assign(new Event("keydown"), { key }));
const forceLock = () => win.dispatchEvent(new Event("store-device-force-lock"));
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await sleep(1);
  if (!done()) throw new Error("timed out");
}

let unmountLock: (() => void) | null = null;

async function mount() {
  unmountLock = render(<StoreDeviceLock />).unmount;
  await settle();
}

/** Type a PIN, let the handshake finish and dismiss the success screen. */
async function unlockWith(pin: string) {
  for (const key of pin) press(key);
  await drain();
  press("Enter");
  await settle();
}

afterEach(() => {
  // Unmount even when a test failed, so a live lock never answers the next test's resets.
  unmountLock?.();
  unmountLock = null;
});

beforeEach(() => {
  storeMachine = true;
  autolockSeconds = 0;
  clearCalls = 0;
  resolveCalls = 0;
  connected = true;
  operators.length = 0;
  setSessions([]);
});

// ── Scenarios ───────────────────────────────────────────────────────────────

describe("the legacy store-machine lock clears the tablet's operator session", () => {
  test("a PIN unlock keeps the session it wrote", async () => {
    await mount();
    await unlockWith("1234");
    expect(operators).toEqual([{ memberId: "m-alice", name: "Alice" }]);
    expect(clearCalls).toBe(0);
    expect(sessions).toEqual([PINS["1234"]]);
  });

  test("a wrong PIN writes nothing and unlocks nobody", async () => {
    await mount();
    await unlockWith("9999");
    expect(operators).toEqual([]);
    expect(clearCalls).toBe(0);
  });

  test("a session already there when the lock mounts is cleared once", async () => {
    setSessions([sessionFor("m-prev", "Prev")]);
    await mount();
    await drain();
    expect(clearCalls).toBe(1);
    expect(sessions).toEqual([]);
  });

  test("after a reload, a session that arrives once the connection is up is cleared once", async () => {
    // A warm reload mounts the shell from cached auth, before the connection exists.
    connected = false;
    await mount();
    connected = true;
    setSessions([sessionFor("m-prev", "Prev")]);
    await drain();
    expect(sessions).toEqual([]);
    expect(clearCalls).toBe(1);
  });

  test("the autolock clears the session once", async () => {
    await mount();
    autolockSeconds = 0.05;
    await unlockWith("1234");
    expect(clearCalls).toBe(0);
    await sleep(50);
    await drain();
    expect(clearCalls).toBe(1);
    expect(sessions).toEqual([]);
  });

  test("a log-out (force-lock) clears the session once", async () => {
    await mount();
    await unlockWith("1234");
    forceLock();
    await drain();
    expect(clearCalls).toBe(1);
    expect(sessions).toEqual([]);
  });

  test("switching store mode off and on again clears the session once", async () => {
    await mount();
    await unlockWith("1234");
    setStoreMachine(false);
    await settle();
    setStoreMachine(true);
    await drain();
    expect(clearCalls).toBe(1);
    expect(sessions).toEqual([]);
  });

  test("a PIN answer that lands after the keypad gave up is cleared once", async () => {
    await mount();
    for (const key of "1234") press(key);
    await until(() => resolveCalls === 1);
    forceLock(); // before the answer comes back
    await drain();
    expect(operators).toEqual([]);
    expect(clearCalls).toBe(1);
    expect(sessions).toEqual([]);
  });

  test("outside store-machine mode a session is never touched", async () => {
    storeMachine = false;
    setSessions([sessionFor("m-prev", "Prev")]);
    await mount();
    forceLock();
    await drain();
    expect(clearCalls).toBe(0);
    expect(sessions).toEqual([sessionFor("m-prev", "Prev")]);
  });
});

describe("a session left from an earlier unlock never stands in for this PIN", () => {
  test("a leftover row that lands while a wrong PIN is checked unlocks nobody", async () => {
    await mount();
    for (const key of "9999") press(key);
    await until(() => resolveCalls === 1);
    setSessions([sessionFor("m-prev", "Prev")]); // e.g. the subscription lands late after a reload
    await drain();
    await sleep(2300); // longer than the success screen
    expect(operators).toEqual([]);
  }, 10_000);

  test("a leftover row in the cache when a right PIN is typed: the unlock is for the PIN's owner", async () => {
    await mount();
    for (const key of "1234") press(key);
    await until(() => resolveCalls === 1);
    setSessions([sessionFor("m-prev", "Prev")]);
    await drain();
    expect(operators).toEqual([{ memberId: "m-alice", name: "Alice" }]);
  });

  test("a wrong PIN typed before the clear of a leftover row comes back unlocks nobody", async () => {
    setSessions([sessionFor("m-prev", "Prev")]);
    await mount(); // the clear is out; its answer is one round trip away
    for (const key of "9999") press(key);
    await drain();
    await sleep(2300);
    expect(operators).toEqual([]);
  }, 10_000);
});
