// Isolated fixture for scripts/tests/store-device/qr-login.test.ts — NOT auto-discovered by
// `bun test`. A phone approves the QR on a /store tablet (approveDeviceLogin); the tablet sees the
// row turn "approved", consumes it and logs the member in. Consuming turns the row "consumed"
// before the log-in lands, which once cancelled every QR log-in. This checks useQrLogin: the
// log-in survives that, the QR is replaced the moment it is scanned, a punch-out logs nobody in,
// and nothing happens under the idle lock.
//
// The hook renders through Ink's reconciler (this suite has no DOM) inside a component that
// renders nothing. Module mocks leak into other files of the same process, so this runs in its own.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { render } from "ink-testing-library";

// ── Controllable fakes ──────────────────────────────────────────────────────

interface Row {
  id: { toString(): string };
  organizationId: string;
  deviceId: string;
  nonce: string;
  status: string;
  memberId?: string | null;
  intent?: string | null;
}
interface Callbacks {
  onInsert?: (row: Row) => void;
  onUpdate?: (oldRow: Row, newRow: Row) => void;
}

let callbacks: Callbacks = {};
let issued: string[] = [];
let consumed: string[] = [];
let grants: (string | null)[] = [];
let toasts: string[] = [];
let logins: { memberId: string; pin: string | null }[] = [];

mock.module("spacetimedb/react", () => ({
  useTable: (_query: unknown, cbs: Callbacks) => {
    callbacks = cbs;
    return [[], true];
  },
}));
mock.module("@/lib/spacetimedb/generated", () => ({ tables: { deviceLoginRequest: {} } }));
mock.module("@/lib/spacetimedb/actions", () => ({
  createDeviceLoginRequest: (_deviceId: string, nonce: string) => {
    issued.push(nonce);
    return Promise.resolve();
  },
  consumeDeviceLogin: (id: string) => {
    consumed.push(id);
    return Promise.resolve();
  },
}));
mock.module("@/lib/spacetimedb/actions/pin", () => ({
  rememberOperatorGrant: (id: string | null) => {
    grants.push(id);
  },
}));
mock.module("@/lib/i18n/context", () => ({ useT: () => (key: string) => key }));
mock.module("@/lib/haptics", () => ({ hapticSuccess: () => {} }));
mock.module("@/components/device", () => ({ useNow: () => new Date() }));
mock.module("sonner", () => ({
  toast: Object.assign(() => {}, {
    success: (message: string) => {
      toasts.push(message);
    },
  }),
}));

const { useQrLogin } = await import("@/components/store-device/use-qr-login");

// ── Helpers ─────────────────────────────────────────────────────────────────

const ALICE = {
  id: "m-alice",
  userIdHex: "aa",
  organizationId: "org-1",
  displayName: "Alice",
  role: "staff",
  status: "active",
  permissions: {} as never,
};

let result: ReturnType<typeof useQrLogin> | null = null;

function Harness({ shown }: { shown: boolean }) {
  const qr = useQrLogin({
    organizationId: "org-1",
    deviceId: "device-1",
    members: [ALICE],
    shown,
    issuing: shown,
    onLogin: (member, pin) => logins.push({ memberId: member.id, pin }),
  });
  React.useEffect(() => {
    result = qr;
  });
  return null;
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nonceOnScreen(): string {
  if (!result) throw new Error("the hook never rendered");
  return new URLSearchParams(result.value.split("?")[1]).get("nonce") ?? "";
}

function row(nonce: string, status: string, intent: string | null = null, id = "req-1"): Row {
  return {
    id: { toString: () => id },
    organizationId: "org-1",
    deviceId: "device-1",
    nonce,
    status,
    memberId: status === "pending" ? null : ALICE.id,
    intent,
  };
}

/** The phone's approveDeviceLogin reaching the tablet: pending → approved. */
function approve(nonce: string, intent = "login") {
  callbacks.onUpdate?.(row(nonce, "pending"), row(nonce, "approved", intent));
}

let unmount: (() => void) | null = null;

async function mount(shown = true) {
  unmount = render(<Harness shown={shown} />).unmount;
  await settle();
}

afterEach(() => {
  unmount?.();
  unmount = null;
});

beforeEach(() => {
  callbacks = {};
  issued = [];
  consumed = [];
  grants = [];
  toasts = [];
  logins = [];
  result = null;
});

// ── Scenarios ───────────────────────────────────────────────────────────────

describe("useQrLogin", () => {
  test("an approval logs the member in, though the request turns consumed first", async () => {
    await mount();
    const nonce = nonceOnScreen();
    approve(nonce);
    await settle();
    expect(consumed).toEqual(["req-1"]);
    expect(grants).toEqual(["req-1"]);
    expect(result?.scanOk).toBe("Alice");
    // consumeDeviceLogin lands well before the log-in does.
    callbacks.onUpdate?.(row(nonce, "approved", "login"), row(nonce, "consumed", "login"));
    await sleep(950);
    expect(logins).toEqual([{ memberId: ALICE.id, pin: null }]);
    expect(result?.scanOk).toBeNull();
  });

  test("the QR is replaced the moment it is scanned, and the new one is published", async () => {
    await mount();
    const first = nonceOnScreen();
    expect(issued).toEqual([first]);
    approve(first);
    await settle();
    const second = nonceOnScreen();
    expect(second).not.toBe(first);
    expect(issued).toEqual([first, second]);
  });

  test("each scan is handled once, however its row arrives", async () => {
    await mount();
    const nonce = nonceOnScreen();
    callbacks.onInsert?.(row(nonce, "approved", "login"));
    approve(nonce);
    await settle();
    expect(consumed).toEqual(["req-1"]);
  });

  test("an approval of a QR no longer on screen is ignored", async () => {
    await mount();
    const nonce = nonceOnScreen();
    approve("an-older-nonce");
    await settle();
    expect(consumed).toEqual([]);
    expect(nonceOnScreen()).toBe(nonce);
  });

  test("a punch-out recorded by the phone logs nobody in and leaves no session", async () => {
    await mount();
    const nonce = nonceOnScreen();
    approve(nonce, "punch-out");
    await settle();
    expect(consumed).toEqual([]);
    expect(grants).toEqual([]);
    expect(toasts).toEqual(["personalDevice.punch.punchedOut · Alice"]);
    expect(nonceOnScreen()).not.toBe(nonce);
    await sleep(950);
    expect(logins).toEqual([]);
  });

  test("under the idle lock nothing is consumed and nobody logs in", async () => {
    await mount(false);
    approve(nonceOnScreen());
    await settle();
    expect(consumed).toEqual([]);
    expect(grants).toEqual([]);
    expect(result?.scanOk).toBeNull();
  });
});
