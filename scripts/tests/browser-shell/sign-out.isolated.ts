// Isolated fixture for scripts/tests/browser-shell/sign-out.test.ts — NOT auto-discovered by
// `bun test` (no .test. in the name). It installs a fake browser on globalThis and replaces UI
// modules with mock.module, so it runs in its own process.
//
// Sign-out (lib/auth/context.tsx) wipes localStorage + sessionStorage, then the provider unmounts
// and the tab store tears down on a deferred timer, flushing its snapshot again. These tests pin
// that nothing from the tab store survives once discardShellStateForSignOut has run.

import { expect, mock, test } from "bun:test";

mock.module("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {} }) }));
mock.module("@/components/page-tabs", () => ({ skipNextPageTransition: () => {}, shouldSkipTransition: () => false }));
mock.module("@/lib/browser-shell/browsing-history", () => ({ recordBrowsingVisit: () => {}, updateBrowsingHistoryTitle: () => {} }));

const session = new Map<string, string>();
const local = new Map<string, string>();
const mapStorage = (data: Map<string, string>) => ({
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => {
    data.set(key, String(value));
  },
  removeItem: (key: string) => {
    data.delete(key);
  },
  clear: () => data.clear(),
  key: (index: number) => Array.from(data.keys())[index] ?? null,
  get length() {
    return data.size;
  },
});

const windowEvents = new EventTarget();
const documentEvents = new EventTarget();
const DOC_URL = "http://local/manager/docs/edit?id=11111111-1111-4111-8111-111111111111";
const entries: { url: string; state: unknown }[] = [{ url: DOC_URL, state: { __NA: true } }];
const history = {
  get state() {
    return entries[0].state;
  },
  get length() {
    return 1;
  },
  scrollRestoration: "auto",
  pushState(data: unknown, _unused: string, url?: string) {
    entries[0] = { url: new URL(String(url ?? entries[0].url), entries[0].url).href, state: data };
  },
  replaceState(data: unknown, _unused: string, url?: string) {
    entries[0] = { url: new URL(String(url ?? entries[0].url), entries[0].url).href, state: data };
  },
  go() {},
  back() {},
  forward() {},
};
const location = {
  get href() {
    return entries[0].url;
  },
  get search() {
    return new URL(entries[0].url).search;
  },
  get pathname() {
    return new URL(entries[0].url).pathname;
  },
  reload() {},
};
const sessionStorage = mapStorage(session);
const localStorage = mapStorage(local);
const fakeDocument = {
  visibilityState: "visible",
  activeElement: null,
  documentElement: { dataset: {}, getAttribute: () => null, setAttribute() {}, removeAttribute() {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: documentEvents.addEventListener.bind(documentEvents),
  removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents),
};
Object.assign(globalThis, {
  window: {
    history,
    location,
    sessionStorage,
    localStorage,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerHeight: 800,
  },
  document: fakeDocument,
  location,
  localStorage,
  sessionStorage,
  requestAnimationFrame: (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});

const { tabsStore, __resetTabsStoreForTests } = await import("@/lib/browser-shell/store");
const { discardShellStateForSignOut, installSignOutPurge } = await import("@/lib/browser-shell/sign-out");
const { SHELL_SIGN_OUT_EVENT } = await import("@/lib/browser-shell/shell-dom");

const SECRET = "Q3 layoffs plan (confidential)";
const SCOPE = { userId: "user-1", organizationId: "org-1" };
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 3));
};

/** Signed in on a docs tab whose title is sensitive; returns the provider's release. */
async function signedInWithSecretTab(): Promise<() => void> {
  __resetTabsStoreForTests();
  session.clear();
  local.clear();
  local.set("app_mode", "admin");
  const release = tabsStore.bind({ scope: SCOPE, router: { push() {}, replace() {} } });
  await settle();
  const entry = tabsStore.getState().tabs[0].history.entries[0];
  tabsStore.setPageTitle(entry.key, SECRET);
  await settle();
  return release;
}

/** lib/auth/context.tsx signOut(): localStorage.clear(); sessionStorage.clear(). */
function wipeStorage(): void {
  local.clear();
  session.clear();
}

function shellLeftovers(): string[] {
  return [...session.entries(), ...local.entries()]
    .filter(([key]) => key.startsWith("merchiva_"))
    .map(([key, value]) => `${key}=${value}`);
}

test("deferred teardown after sign-out leaves no tab state behind", async () => {
  const release = await signedInWithSecretTab();
  discardShellStateForSignOut();
  wipeStorage();
  release();
  await settle();
  expect(tabsStore.isReady()).toBe(false);
  expect(shellLeftovers()).toEqual([]);
});

test("pagehide before teardown: the store's unload flush is purged too", async () => {
  const release = await signedInWithSecretTab();
  // While signed in, pagehide persists the tabs (normal behaviour).
  session.clear();
  local.clear();
  windowEvents.dispatchEvent(new Event("pagehide"));
  expect(shellLeftovers().some((row) => row.includes(SECRET))).toBe(true);

  discardShellStateForSignOut();
  wipeStorage();
  windowEvents.dispatchEvent(new Event("pagehide"));
  expect(shellLeftovers()).toEqual([]);
  fakeDocument.visibilityState = "hidden";
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  fakeDocument.visibilityState = "visible";
  expect(shellLeftovers()).toEqual([]);
  release();
  await settle();
  expect(shellLeftovers()).toEqual([]);
});

test("purge listeners are removed once the store has torn down (the next session persists normally)", async () => {
  const release = await signedInWithSecretTab();
  discardShellStateForSignOut();
  wipeStorage();
  release();
  await settle();

  const nextRelease = await signedInWithSecretTab();
  session.clear();
  local.clear();
  windowEvents.dispatchEvent(new Event("pagehide"));
  expect(shellLeftovers().some((row) => row.startsWith("merchiva_tabs:v1:user-1:org-1="))).toBe(true);
  expect(shellLeftovers().some((row) => row.startsWith("merchiva_tabs_last:v1:user-1:org-1="))).toBe(true);
  nextRelease();
  await settle();
});

test("SHELL_SIGN_OUT_EVENT runs the purge through installSignOutPurge", async () => {
  const uninstall = installSignOutPurge();
  const release = await signedInWithSecretTab();
  windowEvents.dispatchEvent(new Event(SHELL_SIGN_OUT_EVENT));
  wipeStorage();
  release();
  await settle();
  expect(shellLeftovers()).toEqual([]);
  uninstall();
});

test("unbound: only browser-shell keys are removed", () => {
  __resetTabsStoreForTests();
  session.clear();
  local.clear();
  session.set("merchiva_tabs:v1:u:o", "{}");
  session.set("merchiva_shell_boot_intent", "{}");
  session.set("merchiva_shell_hist:v1", "{}");
  local.set("merchiva_tabs_last:v1:u:o", "{}");
  local.set("merchiva_history:v1:u:o", "[]");
  local.set("merchiva_bookmarks:v1:u:o", "[]");
  local.set("app_mode", "admin");
  local.set("merchiva_browser_bookmarks_bar", "1");
  discardShellStateForSignOut();
  expect([...session.keys()]).toEqual([]);
  expect([...local.keys()].sort()).toEqual(["app_mode", "merchiva_browser_bookmarks_bar"]);
});
