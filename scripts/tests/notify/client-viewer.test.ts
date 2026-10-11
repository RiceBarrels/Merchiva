// Shared identity (lib/notifications/viewer.ts): a store tablet is one account
// used by everyone who logs in with a PIN. There nothing alerts, nothing acks a
// push, no preference or push subscription is written, and the dots show only
// when the PIN operator is the tablet's own account. The same holds for /manager
// in store-machine mode unless the account itself is the PIN operator (another
// operator, or nobody: the lock screen is up for anyone at the counter).

import { describe, expect, test } from "bun:test";
import { notificationViewer, type NotificationViewerInput } from "@/lib/notifications/viewer";

const ACCOUNT = "aa".repeat(32);
const STAFF = "bb".repeat(32);

function viewer(over: Partial<NotificationViewerInput>) {
  return notificationViewer({ pathname: "/manager/inventory", appMode: "admin", storeMachine: false, operatorHex: null, accountHex: ACCOUNT, ...over });
}

describe("/store", () => {
  test("a staff operator on the tablet: no dots, no alerts, no push, no sync", () => {
    const v = viewer({ pathname: "/store", appMode: "store", operatorHex: STAFF });
    expect(v).toMatchObject({ surface: "store", shared: true, dotsVisible: false, alerts: false, personalDevice: false });
  });

  test("nobody logged in: still nothing", () => {
    const v = viewer({ pathname: "/store", appMode: "store", operatorHex: null });
    expect(v).toMatchObject({ shared: true, dotsVisible: false, alerts: false, personalDevice: false });
  });

  test("the tablet's own account logged in: dots show, but it stays a shared screen", () => {
    const v = viewer({ pathname: "/store", appMode: "store", operatorHex: ACCOUNT });
    expect(v).toMatchObject({ surface: "store", shared: true, dotsVisible: true, alerts: false, personalDevice: false });
  });

  test("sub-routes count as /store", () => {
    expect(viewer({ pathname: "/store/anything", operatorHex: STAFF }).surface).toBe("store");
  });
});

describe("/manager", () => {
  test("a person's own back office: everything runs", () => {
    expect(viewer({})).toMatchObject({ surface: "manager", shared: false, dotsVisible: true, alerts: true, personalDevice: true });
  });

  test("store-machine mode with another PIN operator is shared", () => {
    const v = viewer({ storeMachine: true, operatorHex: STAFF });
    expect(v).toMatchObject({ shared: true, dotsVisible: false, alerts: false, personalDevice: false });
  });

  test("store-machine mode with nobody punched in (logged out, lock screen up) is shared", () => {
    const v = viewer({ storeMachine: true, operatorHex: null });
    expect(v).toMatchObject({ shared: true, dotsVisible: false, alerts: false, personalDevice: false });
  });

  test("store-machine mode with the account itself alerts it, but never subscribes to push", () => {
    const v = viewer({ storeMachine: true, operatorHex: ACCOUNT });
    expect(v).toMatchObject({ shared: false, dotsVisible: true, alerts: true, personalDevice: false });
  });

  test("a store tablet opening /manager alerts its account but never subscribes to push", () => {
    expect(viewer({ appMode: "store" })).toMatchObject({ shared: false, alerts: true, personalDevice: false });
  });

  test("the setup wizard is not a surface", () => {
    expect(viewer({ pathname: "/manager/setup" })).toMatchObject({ surface: "other", alerts: false });
  });

  test("no identity yet: no dots", () => {
    expect(viewer({ accountHex: null }).dotsVisible).toBe(false);
  });
});

describe("/personal and /choose", () => {
  test("/personal is a person's own phone", () => {
    expect(viewer({ pathname: "/personal", appMode: "personal" })).toMatchObject({
      surface: "personal",
      shared: false,
      dotsVisible: true,
      alerts: true,
      personalDevice: true,
    });
  });

  test("/choose: no alerts; push is offered unless the device is a store tablet", () => {
    expect(viewer({ pathname: "/choose", appMode: null })).toMatchObject({ surface: "other", alerts: false, personalDevice: true });
    expect(viewer({ pathname: "/choose", appMode: "store" }).personalDevice).toBe(false);
  });
});
